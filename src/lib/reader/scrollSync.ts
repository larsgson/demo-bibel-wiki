/**
 * Proportional, instant, bidirectional scroll sync between two elements —
 * ported from example/interlinear/web-app/src/lib/scrollSync.ts (modeled
 * there on the Flutter Study App's ScrollSyncController), unchanged: it's
 * plain DOM APIs, nothing SvelteKit-specific.
 *
 * - Proportional, not pixel-for-pixel: progress is `scrollTop / (scrollHeight
 *   - clientHeight)`, a 0..1 fraction of the way through each panel's own
 *   (differently sized — Hebrew/Greek wraps differently than the target
 *   language) scrollable range. Cheap to compute on every scroll event, no
 *   per-line geometry lookups needed.
 * - Instant, not animated: the passive panel's scrollTop is set directly
 *   (never `scrollTo({behavior: 'smooth'})`), so there's no tween lag
 *   between the two panels during a drag.
 * - Reentrancy-guarded rather than "active source" tracked: there's no
 *   single gesture API covering mouse wheel + touch drag + keyboard +
 *   scrollbar drag + trackpad inertia uniformly, so instead each panel
 *   guards against reacting to a scroll event *it caused itself*: before
 *   writing to the other panel, set that panel's ignore flag; that panel's
 *   own scroll handler checks (and clears) its flag before deciding whether
 *   to propagate further.
 */

export interface ScrollProgress {
    /** Returns how far scrolled through `el`'s content, from 0 (top) to 1 (bottom). */
    progress(el: HTMLElement): number;
    /** Returns the scrollTop `el` needs to be at `progress` through its content. */
    scrollTopForProgress(el: HTMLElement, progress: number): number;
}

const wholeElementProgress: ScrollProgress = {
    progress(el) {
        const range = el.scrollHeight - el.clientHeight;
        return range <= 0 ? 0 : el.scrollTop / range;
    },
    scrollTopForProgress(el, progress) {
        const range = el.scrollHeight - el.clientHeight;
        return range * progress;
    }
};

/** Ignore writes smaller than this — avoids float-precision jitter causing
 *  spurious back-and-forth scroll events between the two panels. */
const MIN_MEANINGFUL_DELTA_PX = 1;

export function syncScrollPanels(
    panelA: HTMLElement,
    panelB: HTMLElement,
    strategy: ScrollProgress = wholeElementProgress
): () => void {
    let ignoreA = false;
    let ignoreB = false;

    function mirror(source: HTMLElement, target: HTMLElement, clearIgnore: () => boolean) {
        if (clearIgnore()) return;
        const targetTop = strategy.scrollTopForProgress(target, strategy.progress(source));
        if (Math.abs(target.scrollTop - targetTop) < MIN_MEANINGFUL_DELTA_PX) return;
        if (target === panelA) ignoreA = true;
        else ignoreB = true;
        target.scrollTop = targetTop;
    }

    function onScrollA() {
        mirror(panelA, panelB, () => {
            const wasIgnoring = ignoreA;
            ignoreA = false;
            return wasIgnoring;
        });
    }

    function onScrollB() {
        mirror(panelB, panelA, () => {
            const wasIgnoring = ignoreB;
            ignoreB = false;
            return wasIgnoring;
        });
    }

    panelA.addEventListener('scroll', onScrollA, { passive: true });
    panelB.addEventListener('scroll', onScrollB, { passive: true });

    return () => {
        panelA.removeEventListener('scroll', onScrollA);
        panelB.removeEventListener('scroll', onScrollB);
    };
}

/**
 * Verse-anchored bidirectional scroll sync — for two panels whose verse
 * counts for the "same" chapter can differ (a versification difference, or
 * a verse genuinely missing from one source, e.g. IND NT). Pure
 * proportional sync (syncScrollPanels above) drifts permanently once that
 * happens, because "fraction of the way through the whole panel" no longer
 * means the same verse on both sides, and the error compounds for the rest
 * of the chapter.
 *
 * This re-derives alignment fresh on every scroll event instead: find the
 * verse element (`[data-verse="<n>"]`) currently at/just above the top of
 * the panel being scrolled, then scroll the other panel so the SAME verse
 * number sits at that same offset — falling back to the nearest verse
 * number actually present there if that exact one is missing. Self-
 * correcting rather than cumulative: a mismatch only ever throws off the
 * instant it happens, not everything after it.
 */
export function syncScrollPanelsByVerse(panelA: HTMLElement, panelB: HTMLElement): () => void {
    let ignoreA = false;
    let ignoreB = false;

    function findVerseElement(panel: HTMLElement, verse: number): HTMLElement | null {
        const exact = panel.querySelector<HTMLElement>(`[data-verse="${verse}"]`);
        if (exact) return exact;
        let best: HTMLElement | null = null;
        let bestDist = Infinity;
        for (const item of panel.querySelectorAll<HTMLElement>('[data-verse]')) {
            const v = Number(item.dataset.verse);
            if (!Number.isFinite(v)) continue;
            const dist = Math.abs(v - verse);
            if (dist < bestDist) {
                bestDist = dist;
                best = item;
            }
        }
        return best;
    }

    function topAnchor(panel: HTMLElement): { verse: number; offset: number } | null {
        const panelTop = panel.getBoundingClientRect().top;
        let anchor: HTMLElement | null = null;
        for (const item of panel.querySelectorAll<HTMLElement>('[data-verse]')) {
            if (item.getBoundingClientRect().top - panelTop > 0) break;
            anchor = item;
        }
        if (!anchor) anchor = panel.querySelector<HTMLElement>('[data-verse]');
        if (!anchor) return null;
        const verse = Number(anchor.dataset.verse);
        if (!Number.isFinite(verse)) return null;
        return { verse, offset: anchor.getBoundingClientRect().top - panelTop };
    }

    function mirror(source: HTMLElement, target: HTMLElement, clearIgnore: () => boolean) {
        if (clearIgnore()) return;
        const anchor = topAnchor(source);
        if (!anchor) return;
        const targetEl = findVerseElement(target, anchor.verse);
        if (!targetEl) return;
        const targetPanelTop = target.getBoundingClientRect().top;
        const delta = targetEl.getBoundingClientRect().top - targetPanelTop - anchor.offset;
        if (Math.abs(delta) < MIN_MEANINGFUL_DELTA_PX) return;
        if (target === panelA) ignoreA = true;
        else ignoreB = true;
        target.scrollTop += delta;
    }

    function onScrollA() {
        mirror(panelA, panelB, () => {
            const wasIgnoring = ignoreA;
            ignoreA = false;
            return wasIgnoring;
        });
    }

    function onScrollB() {
        mirror(panelB, panelA, () => {
            const wasIgnoring = ignoreB;
            ignoreB = false;
            return wasIgnoring;
        });
    }

    panelA.addEventListener('scroll', onScrollA, { passive: true });
    panelB.addEventListener('scroll', onScrollB, { passive: true });

    return () => {
        panelA.removeEventListener('scroll', onScrollA);
        panelB.removeEventListener('scroll', onScrollB);
    };
}

/** Resets both panels to the top without triggering a sync write (there's
 *  nothing meaningful to sync *from* on a chapter change — both should just
 *  start fresh at the top). Call this when the chapter being displayed
 *  changes, otherwise both panels keep whatever scroll position the
 *  *previous* chapter was left at. */
export function resetScrollPanels(panelA: HTMLElement, panelB: HTMLElement): void {
    panelA.scrollTop = 0;
    panelB.scrollTop = 0;
}

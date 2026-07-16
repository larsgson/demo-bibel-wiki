/** Share (or copy) the current page URL. Used by both left-nav sidebars —
 *  doesn't need any reader-specific state, just the current location, so it
 *  doesn't need to round-trip through Reader.svelte via a window event. */
export async function shareCurrentPage(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    const url = window.location.href;
    try {
        if (navigator.share) {
            await navigator.share({ title: document.title, url });
        } else {
            await navigator.clipboard.writeText(url);
        }
        return true;
    } catch {
        return false;
    }
}

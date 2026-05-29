import type { RenderedChapter } from './sofria';

export type BSBWord = [string, string | null];

export type BSBHeading = {
    id: string;
    b: string;
    c: number;
    before_v: number;
    level: 's1' | 's2' | 'r';
    text: string;
    refs: string[];
};

type ChapterJson = {
    eng: Record<string, BSBWord[]>;
    heb?: Record<string, BSBWord[]>;
    grk?: Record<string, BSBWord[]>;
};

let headingsCache: BSBHeading[] | null = null;
let headingsInflight: Promise<BSBHeading[]> | null = null;

async function loadHeadings(): Promise<BSBHeading[]> {
    if (headingsCache) return headingsCache;
    if (headingsInflight) return headingsInflight;
    headingsInflight = (async () => {
        const res = await fetch('/bsb/headings.jsonl');
        if (!res.ok) return [];
        const text = await res.text();
        const lines = text.split('\n').filter((l) => l.trim());
        const parsed = lines.map((l) => JSON.parse(l) as BSBHeading);
        headingsCache = parsed;
        return parsed;
    })();
    const result = await headingsInflight;
    headingsInflight = null;
    return result;
}

function esc(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export async function fetchAndRenderBSB(
    bookCode: string,
    chapter: number
): Promise<RenderedChapter> {
    const [chapterData, allHeadings] = await Promise.all([
        fetch(`/bsb/chapters/${bookCode}/${bookCode}${chapter}.json`).then(
            (r) => r.json() as Promise<ChapterJson>
        ),
        loadHeadings()
    ]);

    const headings = allHeadings.filter((h) => h.b === bookCode && h.c === chapter);
    const headingsByVerse = new Map<number, BSBHeading[]>();
    for (const h of headings) {
        const list = headingsByVerse.get(h.before_v) ?? [];
        list.push(h);
        headingsByVerse.set(h.before_v, list);
    }

    const eng = chapterData.eng;
    if (!eng) return { html: '<p>No English text available.</p>', footnotes: [], xrefs: [] };

    const verseNums = Object.keys(eng)
        .map((n) => parseInt(n, 10))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);

    const parts: string[] = [];

    for (const vNum of verseNums) {
        const hdgs = headingsByVerse.get(vNum);
        if (hdgs) {
            for (const h of hdgs) {
                if (h.level === 's1') {
                    parts.push(`<h3 class="s">${esc(h.text)}</h3>`);
                } else if (h.level === 's2') {
                    parts.push(`<h4 class="s2">${esc(h.text)}</h4>`);
                } else if (h.level === 'r') {
                    parts.push(`<p class="r">${esc(h.text)}</p>`);
                }
            }
        }

        const words = eng[String(vNum)];
        if (!words) continue;

        const text = words.map(([w]) => w).join('');
        parts.push(
            `<span class="verse-block" data-v="${vNum}">` +
                `<span class="v" data-v="${vNum}">${vNum}</span>` +
                `${esc(text)}` +
                `</span>`
        );
    }

    return {
        html: `<p class="usfm-p">${parts.join('\n')}</p>`,
        footnotes: [],
        xrefs: []
    };
}

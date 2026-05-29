import { describe, expect, it } from 'vitest';
import { renderInlineVideos, type InlineVideo } from './sofria';

function v(overrides: Partial<InlineVideo> & { verse: number; pos?: string | null }): InlineVideo {
    const { verse, pos, ...rest } = overrides;
    return {
        id: 'vid1',
        title: 'Clip',
        kind: 'youtube',
        thumbnailUrl: null,
        placement: { verse, pos: pos ?? null },
        ...rest
    };
}

describe('renderInlineVideos', () => {
    it('returns empty for no videos', () => {
        expect(renderInlineVideos([], 1, 'before')).toBe('');
        expect(renderInlineVideos(undefined, 1, 'after')).toBe('');
    });

    it('skips videos whose verse does not match', () => {
        const out = renderInlineVideos([v({ verse: 2 })], 1, 'after');
        expect(out).toBe('');
    });

    it('defaults to "after" when placement.pos is null or missing', () => {
        expect(renderInlineVideos([v({ verse: 3, pos: null })], 3, 'after')).toContain('data-video-id="vid1"');
        expect(renderInlineVideos([v({ verse: 3, pos: null })], 3, 'before')).toBe('');
    });

    it('defaults to "after" when placement.pos is any non-"before" string', () => {
        expect(renderInlineVideos([v({ verse: 3, pos: 'somethingweird' })], 3, 'after')).toContain('data-video-id');
        expect(renderInlineVideos([v({ verse: 3, pos: 'somethingweird' })], 3, 'before')).toBe('');
    });

    it('honours placement.pos === "before"', () => {
        expect(renderInlineVideos([v({ verse: 3, pos: 'before' })], 3, 'before')).toContain('data-video-id');
        expect(renderInlineVideos([v({ verse: 3, pos: 'before' })], 3, 'after')).toBe('');
    });

    it('emits every matching video, in order', () => {
        const vids = [
            v({ verse: 5, id: 'a' }),
            v({ verse: 5, id: 'b' }),
            v({ verse: 6, id: 'c' }),
            v({ verse: 5, id: 'd' })
        ];
        const out = renderInlineVideos(vids, 5, 'after');
        const ids = [...out.matchAll(/data-video-id="([^"]+)"/g)].map((m) => m[1]);
        expect(ids).toEqual(['a', 'b', 'd']);
    });

    it('emits thumbnail as background-image style when present', () => {
        const out = renderInlineVideos(
            [v({ verse: 1, thumbnailUrl: 'https://example.com/t.jpg' })],
            1,
            'after'
        );
        expect(out).toContain('style="background-image:url(https://example.com/t.jpg)"');
    });

    it('omits style attribute when thumbnailUrl is null', () => {
        const out = renderInlineVideos([v({ verse: 1 })], 1, 'after');
        expect(out).not.toContain('style=');
    });

    it('HTML-escapes id, title, kind, and thumbnail URL', () => {
        const out = renderInlineVideos(
            [
                v({
                    verse: 1,
                    id: 'a"b',
                    title: '<i>hi</i>',
                    kind: 'yt&v',
                    thumbnailUrl: 'https://x/?q=a&b=c'
                })
            ],
            1,
            'after'
        );
        expect(out).toContain('data-video-id="a&quot;b"');
        expect(out).toContain('<span class="reader-video-title">&lt;i&gt;hi&lt;/i&gt;</span>');
        expect(out).toContain('<span class="reader-video-kind">yt&amp;v</span>');
        expect(out).toContain('background-image:url(https://x/?q=a&amp;b=c)');
    });

    it('renders role="button" and tabindex="0" for keyboard/a11y', () => {
        const out = renderInlineVideos([v({ verse: 1 })], 1, 'after');
        expect(out).toContain('role="button"');
        expect(out).toContain('tabindex="0"');
    });
});

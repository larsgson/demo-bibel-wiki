/**
 * Single source of truth for the change-indicator URL. Both the layout
 * header (front-page top bar) and the breadcrumb row (reader page) read
 * from this so the dot is always visible at the top.
 */
export const CHANGE_DOC_URL =
    'https://pankosmia-web.up.railway.app/burrito/ingredient/raw/_local_/_local_/Tst?ipath=content/01.md';

/**
 * SSE endpoint. Same URL as CHANGE_DOC_URL — Pankosmia content-negotiates
 * via `Accept`: a default request returns the file body, an
 * `Accept: text/event-stream` request (which `EventSource` sends
 * automatically) returns the change-notification stream.
 *
 * On every (re)connect the server emits one `event: change` carrying the
 * file's current sha256 in `data.hash`, then a `change` event with a fresh
 * hash on every subsequent file edit, plus `:keepalive` comments roughly
 * every 20 s. See docs/sse-change-notifications.md for the full contract.
 *
 * The 60 s polling cadence is kept as a safety net for stream drops the
 * browser doesn't recover from on its own.
 */
export const CHANGE_DOC_SSE_URL: string | undefined = CHANGE_DOC_URL;

export function onChangeIndicatorClick(): void {
    // Each click forces every open StoryReader to re-fetch + re-parse the
    // edited content so OBS OT-story sections without local verse text pick
    // up the freshly-edited overlay.
    void import('./editedContent').then((m) => m.bumpEditedContent());
}

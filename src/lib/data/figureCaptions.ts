import captionsConfig from '../../../config/figure_captions.json';

/** The renderer's own caption modes (render.js `captions`): 'heuristic' hides
 *  a plain-ASCII caption that shares no word with the chapter's text. */
export type CaptionMode = 'show' | 'hide' | 'heuristic';

type CaptionsConfig = {
    default_mode?: CaptionMode;
    languages?: Record<string, CaptionMode>;
};

const cfg = captionsConfig as CaptionsConfig;

export function captionModeFor(iso: string): CaptionMode {
    return cfg.languages?.[iso] ?? cfg.default_mode ?? 'hide';
}

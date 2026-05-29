import captionsConfig from '../../../config/figure_captions.json';
import type { CaptionMode } from '../reader/sofria';

type CaptionsConfig = {
    default_mode?: CaptionMode;
    languages?: Record<string, CaptionMode>;
};

const cfg = captionsConfig as CaptionsConfig;

export function captionModeFor(iso: string): CaptionMode {
    const mode = cfg.languages?.[iso] ?? cfg.default_mode ?? 'hide';
    return mode;
}

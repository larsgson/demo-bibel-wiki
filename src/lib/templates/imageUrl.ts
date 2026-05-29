import type { ImageConfig } from './types';

/**
 * Resolve a story image filename to its public URL using the template's
 * image config. Two patterns in use:
 *   - OBS:  base_url + filename                          (no path_pattern)
 *   - John: base_url + '/' + medium_pattern (with {filename})
 *   - TGS:  base_url + '/' + path_pattern   (with {book} + {filename})
 *
 * For TGS the {book} token is the first two characters of the filename
 * (e.g. "01" from "01_Ge_01_02_RG.jpg") — this is the documented convention.
 */
export function resolveImageUrl(filename: string, config: ImageConfig | null): string {
    if (!config || !filename) return '';
    const base = config.base_url.replace(/\/$/, '');

    if (config.path_pattern) {
        const book = filename.slice(0, 2);
        const path = config.path_pattern
            .replace('{book}', book)
            .replace('{filename}', filename);
        return `${base}/${path}`;
    }
    if (config.medium_pattern) {
        const path = config.medium_pattern
            .replace('{book}', filename.slice(0, 2))
            .replace('{filename}', filename);
        return `${base}/${path}`;
    }
    return `${base}/${filename}`;
}

export function resolveThumbUrl(filename: string, config: ImageConfig | null): string {
    if (!config || !filename) return '';
    const base = (config.thumbs_url ?? config.base_url).replace(/\/$/, '');

    if (config.thumbs_pattern) {
        const book = filename.slice(0, 2);
        const path = config.thumbs_pattern
            .replace('{book}', book)
            .replace('{filename}', filename);
        return `${base}/${path}`;
    }
    if (config.thumbs_url) {
        return `${base}/${filename}`;
    }
    // Fallback to the medium / full image.
    return resolveImageUrl(filename, config);
}

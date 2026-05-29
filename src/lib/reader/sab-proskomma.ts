/// <reference path="./proskomma.d.ts" />
import { Proskomma } from 'proskomma-core';

/**
 * Proskomma subclass that uses BCP47 language tags as the `lang` selector (instead
 * of the default ISO 639-3), matching the way Scripture App Builder freezes its
 * .pkf archives. Without this, loadSuccinctDocSet rejects the selectors stored
 * inside the pkf.
 *
 * Ported from example/sab-pwa/src/lib/sab-proskomma/index.ts — kept behavior-equivalent,
 * stripped of fields the basic reader doesn't need (customTags, emptyBlocks, filters).
 */
export class SABProskomma extends Proskomma {
    constructor() {
        super();

        // BCP47 language tag regex (https://stackoverflow.com/a/60899733)
        const grandfathered =
            '(' +
            '(en-GB-oed|i-ami|i-bnn|i-default|i-enochian|i-hak|i-klingon|i-lux|i-mingo|i-navajo|i-pwn|i-tao|i-tay|i-tsu|sgn-BE-FR|sgn-BE-NL|sgn-CH-DE)' +
            '|' +
            '(art-lojban|cel-gaulish|no-bok|no-nyn|zh-guoyu|zh-hakka|zh-min|zh-min-nan|zh-xiang)' +
            ')';
        const langtag =
            '((([A-Za-z]{2,3}(-([A-Za-z]{3}(-[A-Za-z]{3}){0,2}))?)|[A-Za-z]{4}|[A-Za-z]{5,8})' +
            '(-([A-Za-z]{4}))?' +
            '(-([A-Za-z]{2}|[0-9]{3}))?' +
            '(-([A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3}))*' +
            '(-([0-9A-WY-Za-wy-z](-[A-Za-z0-9]{2,8})+))*' +
            '(-(x(-[A-Za-z0-9]{1,8})+))?)';

        this.selectors = [
            {
                name: 'lang',
                type: 'string',
                regex: '^(' + grandfathered + '|' + langtag + '|(x(-[A-Za-z0-9]{1,8})+))$'
            },
            {
                name: 'abbr',
                type: 'string',
                regex: '^[A-Za-z0-9 -]+$'
            }
        ];
        this.validateSelectors();
    }
}

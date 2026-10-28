# demo-bibel-wiki

A Bible reading, listening and story PWA for thousands of languages, live at
[demo.bibel.wiki](https://demo.bibel.wiki/).

## Built on bcv-commons

This repo is a good example of what can be built on top of the various repos
under **[bcv-commons](https://github.com/bcv-commons)**, a data commons for
Bible tools keyed on Book, Chapter and Verse. Our working demo is only early
days, and it will quickly become more helpful and show more of bcv-commons'
features as we continue.

What it uses from there:

| bcv-commons repo | What this app takes from it |
|---|---|
| **[bibles](https://github.com/bcv-commons/bibles)** | The discovery layer for all Bible content: which languages and editions exist across DBT, PKF, helloAO and openbible, how they overlap, where the text and audio are, verse timing, book names, language names, OBS media. Published at `cdn.bibel.wiki`; start at its [`doc/README.md`](https://github.com/bcv-commons/bibles/blob/main/doc/README.md). We also vendor its Sofria renderer and verse-text tools (see below). |
| **[bcv-query](https://github.com/bcv-commons/bcv-query)** | The backend for Browse, AI Search (free keyword search, premium Q&A at `/api/ask`), the chunk viewer, concordance and cross-references, and the Hebrew/Greek interlinear in the parallel view. |
| **[lexeme-aligner](https://github.com/bcv-commons/lexeme-aligner)** | Word alignments between translations and the Hebrew/Greek original (Hugging Face datasets `bcv-commons/compact-alignments`, `full-alignments-*`), used to link words in the parallel view. |
| **[audio-sync](https://github.com/bcv-commons/audio-sync)** | Verse timing for Bible and OBS audio, published through bibles' CDN. |
| **[bible-story-builder](https://github.com/bcv-commons/bible-story-builder)** | Where the story templates (OBS, John, TGS…) come from. They're now kept in this repo under `src/lib/templates/content/`. |

Other live apps built on the same commons: [bibel.wiki](https://bibel.wiki/)
(story navigation) and [duo.bibel.wiki](https://duo.bibel.wiki/) (language
training). See the [bcv-commons overview](https://github.com/bcv-commons) for the full set.

## Features

- **Bible reader**: chapter by chapter, for every language with text from any
  source. Audio with verse-synced highlighting, footnotes, cross-references and
  glossary popovers, figures and placement videos, bookmarks, search, and a
  Hebrew/Greek parallel view with word alignment.
- **Bible stories**: OBS, John, TGS and DBS templates with text, pictures and
  verse-synced audio in many languages. OBS and John stories also have a video
  toggle (YouTube, or the Jesus Film Project's Arclight streams for John). Audio
  is the default.
- **Language picker**: search across all known languages, with primary and
  secondary languages.
- **Regions**: landing pages and subdomains per region (`config/regions/*.toml`:
  Mexico, India and its states, Indonesia, Kenya, Tanzania, Zambia, South
  Africa, Mali and more).
- **Browse, AI Search, chunk viewer**: resources from bcv-query.
- **UI levels**: Simple, Standard and Study. Study mode is limited to 10 languages.

## Where the data comes from

The app does not decide on its own which source a language uses. It reads
bibles' catalogs from `cdn.bibel.wiki` (see bibles'
[`doc/sources.md`](https://github.com/bcv-commons/bibles/blob/main/doc/sources.md)):

| Source | What | Key needed |
|---|---|---|
| **PKF** | Scripture Earth's packaged Bibles (text, audio, timing, styles, fonts) at `cdn.bibel.wiki/pkf/` | no |
| **helloAO** | [bible.helloao.org](https://bible.helloao.org/) free Bible API (text, and BSB audio) | no |
| **DBT** | Digital Bible Platform / Bible Brain (text and the widest audio coverage), via `netlify/functions/dbt-proxy.cjs` | `DBT_API_KEY`, server side |
| **openbible** | Biblica's Open Bible, as Sofria chapters on `cdn.bibel.wiki/openbible/` | no |
| **door43** | Open Bible Stories text, pictures and audio (`cdn.bibel.wiki/obs/<iso>/media.json`) | no |
| **Arclight** | Jesus Film Project film streams for John, via `netlify/functions/arclight-proxy.cjs` | optional `ARCLIGHT_API_KEY` |

The bibles files the app reads:

- `catalog/overlap.json`, `catalog/index.json`, `catalog/text.json`, read at
  build time by `scripts/fetch-data.mjs`: which edition and source to use for
  each language and testament.
- `dbt/_app/language-names.json`, `dbt/_app/audio-only.json`, `catalog/langs.json`:
  language names and the language picker.
- `dbt/<iso>/availability.json`, `dbt/<iso>/media.json`, `dbt/_app/media-index.json`:
  per-language editions and audio filesets.
- `dbt/<iso>/timing/<BOOK>.json`: verse timing for DBT audio. Story audio needs it.
- `catalog/<iso[0]>/<iso>/books.json`: vernacular book names.
- `obs/<iso>/media.json`, `catalog/obs-index.json`, `obs-video/<iso>/<story>_timing.json`:
  OBS text, audio, YouTube videos and timing.

Every chapter, whatever its source, becomes one Sofria document and is rendered
by bibles' own renderer into SAB's DOM and stylesheets.

## Vendored code from bibles

`src/lib/sofria/vendor/` holds unmodified copies of bibles'
`tools/sofria-render`, `tools/verse-text` and its helloAO→USJ→Sofria
converter. The pinned commit and checksums are in `VENDOR.json`, and
`vendor-integrity.test.ts` fails if a file is edited. To update or check:

```bash
pnpm sync:sofria            # fetch the latest upstream files
pnpm sync:sofria --check    # verify the vendored copies
```

Our own code imports only `src/lib/sofria/index.ts`, which wraps them.

## Stack

- **Astro**: static site, islands architecture
- **Svelte**: the Bible reader (`src/lib/reader/Reader.svelte`)
- **React**: stories, language picker, browse/search/chunk islands, audio UI
- **nanostores**: shared state (language, audio, video, UI level)
- **Tailwind CSS**: app chrome. Scripture uses SAB's stylesheets.
- **Netlify**: hosting and functions (`dbt-proxy`, `arclight-proxy`)
- **vitest**: tests

## Routing

- ISOs listed in `config/prerender-isos.json` get static pages under `src/pages/[iso]/`.
- Every other ISO is served by the `src/pages/l/` fallback pages through Netlify
  rewrites (and a matching Vite middleware in dev). This scales to thousands of
  languages without build cost.
- Regions are at `/r/<code>/` and on their own subdomains (`netlify.toml`).

## Setup

```bash
pnpm install
cp .env.example .env   # API hosts; see the comments in it
pnpm fetch:data         # catalogs from cdn.bibel.wiki (also runs before every build)
```

Set `PUBLIC_PKF_BASE_URL=https://cdn.bibel.wiki` to read PKF data from the CDN
instead of downloading it. `SKIP_DATA_FETCH=1` skips the fetch.

## Development

```bash
netlify dev             # Astro + Netlify functions at localhost:8888
pnpm dev                # Astro only at localhost:4321 (no DBT or Arclight proxy)
pnpm test               # vitest
```

## Build

```bash
pnpm build              # outputs to dist/
```

## Project structure

```
src/
  pages/             # Astro routes: [iso]/ (pre-rendered), l/ (fallback), r/ (regions)
  components/        # React islands (stories, language picker, browse, search, chunk)
  lib/
    sofria/          # one Sofria pipeline for all text; vendor/ = bibles' code
    reader/          # Svelte reader, parallel view, word alignment
    bw/              # sources, audio, timing, OBS, story video, Arclight
    api/             # bcv-query client
    templates/       # story templates (OBS, John, TGS, DBS, test)
  stores/            # nanostores (language, audio, video, UI level, …)
  layouts/           # BaseLayout with the audio/video UI (focus panel, mini player)
  styles/            # global and feature CSS
config/              # prerender ISOs, regions, licenses, PKF languages
scripts/             # data fetch, PKF language list, Sofria vendor sync
netlify/functions/   # dbt-proxy, arclight-proxy
public/              # static assets, manifest
```

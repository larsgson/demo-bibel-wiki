# demo-bibel-wiki

Scripture reading and Bible story PWA for Mexican indigenous languages + English (BSB).

## Stack

- **Astro** — static site generator with islands architecture
- **React** — stories, browse/search/chunk islands, audio UI
- **Svelte** — Bible reader; renders PKF (Proskomma), helloAO-full, and DBT-sourced text through one component
- **nanostores** — shared state (ISO, API config, audio, search mode)
- **Tailwind CSS** — utility styling
- **Netlify** — hosting, serverless functions (DBT proxy)

## Features

- **Bible Reader** — chapter-by-chapter scripture reading with audio playback, verse-synced timing, glossary, swipe navigation, and a Hebrew/Greek parallel view
- **Bible Stories** — OBS, John, TGS templates with multilingual text, images, and verse-synced audio (adopted from bibel-wiki)
- **Browse** — hierarchical tree navigation of resources (terms, topics, entities, etc.) via backend API
- **AI Search** — free keyword search + premium RAG-powered Q&A with citations
- **Chunk Viewer** — detailed resource view with cross-references

## Data Sources

| Priority | Source | Description |
|----------|--------|-------------|
| 1 | PKF | Proskomma scripture data from Scripture Earth (fetched at build time) |
| 2 | BSB | Berean Standard Bible JSON (English) |
| 3 | Contrib | Local audio/text files |
| 4 | Helloao | Free Bible API (bible.helloao.org) |
| 5 | DBT | Digital Bible Platform via Netlify proxy function |

## Routing

- Pre-rendered ISOs (configured in `config/prerender-isos.json`) get static pages
- All other ISOs are served via `/l/` fallback pages with Netlify rewrites
- Scales to 2000+ languages without build-time cost

## Setup

```bash
pnpm install
cp .env.example .env   # configure API URLs
pnpm fetch:data         # download PKF data from se-regional-data
```

## Development

```bash
netlify dev             # Astro dev server + Netlify functions at localhost:8888
```

Or without Netlify functions:

```bash
pnpm dev                # Astro dev server at localhost:4321
```

## Build

```bash
pnpm build              # outputs to dist/
```

## Project Structure

```
src/
  pages/            # Astro routes
    [iso]/           # pre-rendered ISO pages (Reader, stories, browse, search)
    l/               # fallback pages for non-prerendered ISOs
  components/        # React islands (stories, browse, search, chunk)
  lib/
    reader/          # Svelte Reader (PKF/Proskomma, helloAO-full, DBT-flat) + parallel view
    api/             # Backend API client (search, ask, tree, chunk)
    bw/              # Adopted from bibel-wiki (audio, timing, content sources)
    data/            # Language names, regions, PKF info
    templates/       # Story template content (OBS, John, TGS)
  stores/            # nanostores (iso, api, audio, search, language, chapter)
  layouts/           # BaseLayout with audio UI (focus panel, mini player)
  styles/            # Global + feature CSS
config/              # prerender ISOs, regions, licenses, figure captions
scripts/             # Data fetch script
netlify/functions/   # DBT proxy serverless function
public/              # Static assets, manifest, symlinks to data/
```

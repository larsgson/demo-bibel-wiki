import { atom } from "nanostores"

/**
 * Template-locked subdomains (tgs./dbs./obs./john./test.<domain>) — each
 * serves ONLY its one template's content, in Simple mode, with no way to
 * reach another template or the Bible reader. Modeled directly on
 * region-store.ts's subdomain-detection pattern.
 *
 * Routing itself is handled entirely by Netlify (see netlify.toml's
 * per-subdomain root redirect, to `/l/<Template>/` — force=true since
 * dist/index.html would otherwise win). Deeper paths need no redirect of
 * their own: internal links are always relative + iso-prefixed, e.g.
 * `/eng/TGS/01/01`, which is either a real prerendered static page already
 * (served directly, same as the main domain) or falls through to the
 * existing generic "/:iso/:template/..." redirects, which are host-agnostic
 * and so already cover every subdomain too. This store exists purely so
 * CLIENT-SIDE chrome (sidebars, the UI-level switcher, ...) can detect
 * "we're locked" and suppress itself — the same static HTML is served on
 * both the subdomain and the main domain, so there is no build-time/
 * server-side distinction to key off.
 *
 * Case-insensitive subdomain -> exact on-disk template name (matching
 * src/lib/templates/content/<name>/ casing exactly, since that's what
 * routing/data-loading expects).
 */
export const KNOWN_TEMPLATE_SUBDOMAINS: Record<string, string> = {
  tgs: "TGS",
  dbs: "DBS",
  obs: "OBS",
  john: "John",
  test: "test",
}

export const $lockedTemplate = atom<string | null>(null)

function fromSubdomain(): string | null {
  if (typeof window === "undefined") return null
  const host = window.location.hostname
  if (host === "localhost" || /^[0-9.]+$/.test(host)) return null // dev / IP
  const parts = host.split(".")
  if (parts.length < 3) return null // apex (bibel.wiki) — no template subdomain
  const sub = parts[0].toLowerCase()
  return Object.prototype.hasOwnProperty.call(KNOWN_TEMPLATE_SUBDOMAINS, sub)
    ? KNOWN_TEMPLATE_SUBDOMAINS[sub]
    : null
}

function fromQuery(): string | null {
  if (typeof window === "undefined") return null
  const q = new URLSearchParams(window.location.search).get("templateLock")?.toLowerCase()
  return q && Object.prototype.hasOwnProperty.call(KNOWN_TEMPLATE_SUBDOMAINS, q)
    ? KNOWN_TEMPLATE_SUBDOMAINS[q]
    : null
}

/** Resolve the locked template from explicit URL signals — subdomain
 *  (production) is the real entry point, same as region-store.ts's
 *  `?region=` — a `?templateLock=<sub>` query override lets this be tested
 *  against `localhost` without editing /etc/hosts or deploying a preview;
 *  it has no other purpose and isn't a documented/supported end-user URL. */
export function resolveLockedTemplate(): string | null {
  return fromSubdomain() ?? fromQuery()
}

export function initTemplateLock() {
  if (typeof window === "undefined") return
  const name = resolveLockedTemplate()
  $lockedTemplate.set(name)
  if (typeof document !== "undefined") {
    if (name) document.documentElement.dataset.templateLock = name
    else delete document.documentElement.dataset.templateLock
  }
}

// Resolve once on module load (client only), like region-store.ts.
if (typeof window !== "undefined") initTemplateLock()

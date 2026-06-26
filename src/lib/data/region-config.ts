/**
 * Region configuration loader.
 *
 * Each config/regions/<code>.toml is a top-level region (country-level entry
 * point) and the single source of truth for it — replacing the old monolithic
 * config/regions.conf. Drives the region landing page, the picker's region tier
 * + grouping filters, and (when uncommented) sub-region subdomains.
 *
 * Loaded at build time via import.meta.glob; works in server and client bundles.
 */

import { parse } from "smol-toml"

export type Localized = { en: string; es: string } & Record<string, string>

export interface RegionGroup {
  slug: string
  name: Localized
  languages: string[]
}

export interface RegionGrouping {
  id: string
  /** true → a sub-region SUBDOMAIN (mx.<slug>.bibel.wiki); false → picker filter. */
  navigable: boolean
  name: Localized
  group: RegionGroup[]
}

export interface RegionConfig {
  code: string
  name: Localized
  /** Header/site title for this region. Hidden when unset. */
  title?: Localized
  defaultLanguage: string
  uiLanguage: string
  tradeLanguages: string[]
  featuredLanguages: string[]
  languages: string[]
  grouping: RegionGrouping[]
  landing?: {
    heroImage?: string
    accentColor?: string
    featuredTemplates?: string[]
    headline?: Localized
    subhead?: Localized
  }
  picker?: { tierLabel?: Localized; filterBy?: string }
  study?: { defaultStudyLanguage?: string }
  seo?: { host?: string; hreflang?: string; canonical?: string }
}

const files = import.meta.glob<string>("../../../config/regions/*.toml", {
  query: "?raw",
  import: "default",
  eager: true,
})

export const regionConfigs: RegionConfig[] = Object.values(files)
  .map((raw) => parse(raw) as unknown as RegionConfig)
  .map((rc) => ({
    ...rc,
    tradeLanguages: rc.tradeLanguages ?? [],
    featuredLanguages: rc.featuredLanguages ?? [],
    languages: rc.languages ?? [],
    grouping: rc.grouping ?? [],
  }))
  .sort((a, b) => a.code.localeCompare(b.code))

export const regionConfigByCode = new Map<string, RegionConfig>(
  regionConfigs.map((rc) => [rc.code, rc]),
)

/** Navigable groups (sub-region subdomains) declared in a region — i.e. the
 *  groupings the author uncommented. Each yields a valid <region>.<slug> subdomain. */
export function navigableGroups(code: string): Array<{ groupingId: string; group: RegionGroup }> {
  const rc = regionConfigByCode.get(code)
  if (!rc) return []
  const out: Array<{ groupingId: string; group: RegionGroup }> = []
  for (const g of rc.grouping) {
    if (g.navigable) for (const grp of g.group) out.push({ groupingId: g.id, group: grp })
  }
  return out
}

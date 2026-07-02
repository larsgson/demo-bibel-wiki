import { atom } from "nanostores"
import { branchKey as bKey, type BranchKey, type SearchHit, type Branch } from "../lib/api/types"

// Accumulated answer items per branch, built up across the session from
// search/ask responses. The `verses` branch is intentionally excluded — the
// Bible navigation node renders the static Bible tree, not answer verse items.
export type NavBranches = Partial<Record<BranchKey, SearchHit[]>>

function hitKey(h: SearchHit): string {
  return h.chunk_id ?? (h as any).headline ?? h.title ?? ""
}

function normalizeHit(h: any): SearchHit {
  return {
    chunk_id: h.chunk_id ?? "",
    title: h.title ?? h.headline ?? "",
    kind: h.kind ?? "other",
    passage: h.passage ?? h.anchor ?? null,
    tags: h.tags ?? [],
    excerpt: h.excerpt ?? h.headline ?? "",
    primary_path: h.primary_path ?? h.drill ?? "",
    permalink: h.permalink ?? "",
    score: h.score ?? 0,
    retrievers: h.retrievers ?? [],
  }
}

const STORAGE_KEY = "nav_branches"

export const $navBranches = atom<NavBranches>({})

// Tracks which branch keys received fresh items on the most recent answer, so
// the sidebar can auto-expand + highlight them. Not persisted.
export const $lastUpdatedBranches = atom<BranchKey[]>([])

function load(): NavBranches {
  if (typeof window === "undefined") return {}
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as NavBranches) : {}
  } catch {
    return {}
  }
}

function save(value: NavBranches) {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {}
}

export function initNavBranches() {
  const loaded = load()
  if (Object.keys(loaded).length) $navBranches.set(loaded)
}

// Merge a set of answer branches into the accumulated store, deduping by
// chunk_id and preserving insertion order (existing items first).
export function mergeBranches(branches: Branch[]) {
  const current = $navBranches.get()
  const next: NavBranches = { ...current }
  const updated: BranchKey[] = []

  for (const branch of branches) {
    const key = bKey(branch)
    const raw = branch.items ?? branch.leads ?? []
    if (!raw.length) continue

    const hits = raw.map((h) => normalizeHit(h))
    const existing = next[key] ?? []
    const seen = new Set(existing.map((h) => hitKey(h)))
    const fresh = hits.filter((h) => !seen.has(hitKey(h)))
    if (!fresh.length) continue

    next[key] = [...existing, ...fresh]
    updated.push(key)
  }

  if (updated.length) {
    $navBranches.set(next)
    $lastUpdatedBranches.set(updated)
    save(next)
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("nav-branches-changed"))
    }
  }
}

export function clearNavBranches() {
  $navBranches.set({})
  $lastUpdatedBranches.set([])
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(STORAGE_KEY)
    window.dispatchEvent(new CustomEvent("nav-branches-changed"))
  }
}

// Sync local atom from sessionStorage when another island updates it
export function initNavBranchesListener() {
  if (typeof window === "undefined") return
  window.addEventListener("nav-branches-changed", () => {
    $navBranches.set(load())
  })
}

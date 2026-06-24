import { atom } from "nanostores"
import type { BranchKey, SearchHit, Branch } from "../lib/api/types"

// Accumulated answer items per branch, built up across the session from
// search/ask responses. The `verses` branch is intentionally excluded — the
// Bible navigation node renders the static Bible tree, not answer verse items.
export type NavBranches = Partial<Record<BranchKey, SearchHit[]>>

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
    if (branch.key === "verses") continue // Bible node is static
    if (!branch.items?.length) continue

    const existing = next[branch.key] ?? []
    const seen = new Set(existing.map((h) => h.chunk_id))
    const fresh = branch.items.filter((h) => !seen.has(h.chunk_id))
    if (!fresh.length) continue

    next[branch.key] = [...existing, ...fresh]
    updated.push(branch.key)
  }

  if (updated.length) {
    $navBranches.set(next)
    $lastUpdatedBranches.set(updated)
    save(next)
  }
}

export function clearNavBranches() {
  $navBranches.set({})
  $lastUpdatedBranches.set([])
  if (typeof window !== "undefined") sessionStorage.removeItem(STORAGE_KEY)
}

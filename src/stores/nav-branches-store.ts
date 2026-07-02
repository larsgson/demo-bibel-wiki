import { atom } from "nanostores"
import { branchKey as bKey, type BranchKey, type SearchHit, type Branch } from "../lib/api/types"

export interface QueryEntry {
  query: string
  branches: Partial<Record<BranchKey, SearchHit[]>>
}

export type NavBranches = QueryEntry[]

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

export const $navBranches = atom<NavBranches>([])

export interface LastUpdate {
  queryIndex: number
  branchKeys: BranchKey[]
}

export const $lastUpdatedBranches = atom<LastUpdate | null>(null)

function load(): NavBranches {
  if (typeof window === "undefined") return []
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as NavBranches
    return []
  } catch {
    return []
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
  if (loaded.length) $navBranches.set(loaded)
}

export function mergeBranches(query: string, branches: Branch[]) {
  const current = $navBranches.get()
  const entry: QueryEntry = { query, branches: {} }
  const updated: BranchKey[] = []

  for (const branch of branches) {
    const key = bKey(branch)
    const raw = branch.items ?? branch.leads ?? []
    if (!raw.length) continue
    entry.branches[key] = raw.map((h) => normalizeHit(h))
    updated.push(key)
  }

  if (!updated.length) return

  const next = [...current, entry]
  const queryIndex = next.length - 1
  $navBranches.set(next)
  $lastUpdatedBranches.set({ queryIndex, branchKeys: updated })
  save(next)
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("nav-branches-changed"))
  }
}

export function clearNavBranches() {
  $navBranches.set([])
  $lastUpdatedBranches.set(null)
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(STORAGE_KEY)
    window.dispatchEvent(new CustomEvent("nav-branches-changed"))
  }
}

export function initNavBranchesListener() {
  if (typeof window === "undefined") return
  window.addEventListener("nav-branches-changed", () => {
    $navBranches.set(load())
  })
}

import { atom, computed } from "nanostores"

export const $apiBaseUrl = atom<string>("")
export const $apiPassword = atom<string>("")

export const $apiConfigured = computed($apiBaseUrl, (url) => url.length > 0)

export function initApiConfig() {
  const base = import.meta.env.PUBLIC_API_BASE_URL ?? ""
  $apiBaseUrl.set(base.replace(/\/$/, ""))

  const pw = import.meta.env.PUBLIC_API_PASSWORD ?? ""
  $apiPassword.set(pw)
}

interface ApiFetchOptions extends RequestInit {
  authed?: boolean
  password?: string
}

export async function apiFetch<T>(path: string, init?: ApiFetchOptions): Promise<T> {
  const base = $apiBaseUrl.get()
  if (!base) throw new Error("API base URL is not configured.")

  const isDev = import.meta.env.DEV
  const url = isDev ? path : `${base}${path}`
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init?.headers as Record<string, string>),
  }

  if (init?.authed) {
    const token = init.password ?? $apiPassword.get()
    if (token) headers["x-api-key"] = token
  }

  const { authed, password, ...fetchInit } = init ?? {}
  const res = await fetch(url, { ...fetchInit, headers })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const err: any = new Error(body.detail ?? res.statusText)
    err.status = res.status
    err.detail = body.detail
    throw err
  }

  return res.json()
}

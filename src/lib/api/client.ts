import { $apiBaseUrl, $apiPassword, $apiConfigured, apiFetch } from "../../stores/api-store"

export { apiFetch }

export function isApiConfigured(): boolean {
  return $apiConfigured.get()
}

export function getApiBase(): string {
  return $apiBaseUrl.get()
}

export function getApiPassword(): string {
  return $apiPassword.get()
}

export class ApiNotConfiguredError extends Error {
  detail: string
  constructor() {
    const msg = "API base URL is not configured. Set PUBLIC_API_BASE_URL in your environment."
    super(msg)
    this.detail = msg
    this.name = "ApiNotConfiguredError"
  }
}

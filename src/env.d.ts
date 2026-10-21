/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_API_BASE_URL?: string
  /** Original-language (Hebrew/Greek) interlinear backend, e.g. https://shoresh.qombi.com/interlinear */
  readonly PUBLIC_SHORESH_API_URL?: string
  readonly PUBLIC_PKF_BASE_URL?: string
}

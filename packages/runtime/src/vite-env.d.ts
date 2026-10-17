/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the MCP Worker that serves drafts (/drafts/<id>); see .env. */
  readonly VITE_DRAFTS_URL?: string
}

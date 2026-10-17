import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider'

export interface Env {
  /** Grants, tokens and clients (owned by the OAuth provider). */
  OAUTH_KV: KVNamespace
  /** Lesson drafts, `draft:<id>` → JSON, expiring after 30 days. */
  DRAFTS: KVNamespace
  /** Injected by the OAuth provider into the default handler. */
  OAUTH_PROVIDER: OAuthHelpers
  /** This Worker's public origin, e.g. https://study-atlas-mcp.example.workers.dev (no trailing slash). */
  PUBLIC_URL: string
  /** The published viewer, e.g. https://gillus.github.io/world_visualized/ */
  SITE_URL: string
  /** Comma-separated GitHub logins allowed to sign in. */
  ALLOWED_LOGINS: string
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
}

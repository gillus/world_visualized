// The Study Atlas MCP Worker.
//   /mcp            MCP over streamable HTTP (stateless), behind OAuth
//   /authorize …    sign-in through GitHub (auth.ts); /oauth/* belongs to the provider
//   /drafts/<id>    public: a draft lesson's JSON, for the viewer's ?draft=<id>

import { OAuthProvider } from '@cloudflare/workers-oauth-provider'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker'
import guide from './guide.md'
import type { Env } from './env'
import { handleAuthorize, handleCallback, isAllowed, type AuthProps } from './auth'
import { createServer } from './server'
import { getDraft } from './drafts'
import { remoteSite, type Site } from './site'

// One Site per isolate, so its cache outlives a request.
let site: Site | undefined
const siteFor = (env: Env) => (site ??= remoteSite(env.SITE_URL))

const mcpHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { login } = (ctx as ExecutionContext & { props: AuthProps }).props
    // The allowlist is checked at sign-in too; this catches tokens issued before a login was removed.
    if (!isAllowed(env, login)) return new Response('Forbidden', { status: 403 })
    const server = createServer({
      site: siteFor(env),
      drafts: env.DRAFTS,
      guide,
      user: login,
      jsonSchemaValidator: new CfWorkerJsonSchemaValidator(),
    })
    const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true })
    await server.connect(transport)
    return transport.handleRequest(request)
  },
}

const CORS = { 'Access-Control-Allow-Origin': '*' }

const defaultHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname === '/authorize') return handleAuthorize(request, env)
    if (pathname === '/callback') return handleCallback(request, env)

    const draft = pathname.match(/^\/drafts\/([a-z0-9]+)$/)
    if (draft && request.method === 'GET') {
      const d = await getDraft(env.DRAFTS, draft[1])
      if (!d) return new Response('Draft not found or expired', { status: 404, headers: CORS })
      return Response.json(d.lesson, { headers: { ...CORS, 'Cache-Control': 'no-store' } })
    }
    if (pathname === '/') {
      return new Response(`Study Atlas MCP server.\nAdd ${env.PUBLIC_URL}/mcp as a custom connector in claude.ai.\n`, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }
    return new Response('Not found', { status: 404 })
  },
}

// The provider is built on first use: its resource URL comes from env.
let provider: OAuthProvider<Env> | undefined

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    provider ??= new OAuthProvider<Env>({
      apiRoute: '/mcp',
      apiHandler: mcpHandler,
      defaultHandler,
      authorizeEndpoint: '/authorize',
      tokenEndpoint: '/oauth/token',
      clientRegistrationEndpoint: '/oauth/register',
      clientIdMetadataDocumentEnabled: true,
      resourceMetadata: { resource: `${env.PUBLIC_URL}/mcp`, resource_name: 'Study Atlas' },
    })
    return provider.fetch(request, env, ctx)
  },
} satisfies ExportedHandler<Env>

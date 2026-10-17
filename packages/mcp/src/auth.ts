// Signing in: this Worker is the OAuth server claude.ai talks to, and it
// identifies people through GitHub. Only the GitHub logins in ALLOWED_LOGINS
// get a token. The flow follows the provider's upstream-sign-in recipe:
//   GET  /authorize  consent page (which app is asking, where tokens go)
//   POST /authorize  approved → redirect to GitHub (PKCE, state bound to the browser)
//   GET  /callback   GitHub → exchange the code, read the login, check the allowlist, finish

import {
  AuthorizationError,
  CimdFetchError,
  authorizationErrorRedirect,
  type ConsentDescription,
} from '@cloudflare/workers-oauth-provider'
import type { Env } from './env'

export interface AuthProps {
  /** GitHub login of the signed-in author. */
  login: string
}

const USER_AGENT = 'world-visualized-mcp/0.1 (https://github.com/gillus/world_visualized)'

export function isAllowed(env: Env, login: string): boolean {
  const allowed = env.ALLOWED_LOGINS.split(',').map((l) => l.trim().toLowerCase())
  return allowed.includes(login.toLowerCase())
}

export async function handleAuthorize(request: Request, env: Env): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER
  try {
    if (request.method === 'GET') {
      const authRequest = await oauth.parseAuthRequest(request)
      const details = await oauth.describeConsent(authRequest) // before beginConsent: a failed lookup leaves nothing in KV
      const consent = await oauth.beginConsent(authRequest)
      consent.headers.set('Content-Type', 'text/html; charset=utf-8')
      return new Response(consentPage(details, consent.handle), { headers: consent.headers })
    }
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

    const form = await request.formData()
    const handle = String(form.get('handle') ?? '')
    if (form.get('decision') !== 'approve') {
      const denied = await oauth.denyConsent(request, handle)
      denied.headers.set('Location', denied.redirectTo)
      return new Response(null, { status: 302, headers: denied.headers })
    }
    const approved = await oauth.approveConsent(request, handle)
    const verifier = randomToken()
    const { state, headers } = await oauth.beginUpstream(approved.request, { data: { verifier }, headers: approved.headers })
    const github = new URL('https://github.com/login/oauth/authorize')
    github.search = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      redirect_uri: new URL('/callback', request.url).href,
      state,
      code_challenge: await s256(verifier),
      code_challenge_method: 'S256',
      allow_signup: 'false',
    }).toString()
    headers.set('Location', github.href)
    return new Response(null, { status: 302, headers })
  } catch (err) {
    return authError(err)
  }
}

export async function handleCallback(request: Request, env: Env): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER
  try {
    const { request: original, data, headers } = await oauth.finishUpstream<{ verifier: string }>(request)
    const params = new URL(request.url).searchParams
    const code = params.get('code')
    if (params.get('error') || !code) {
      headers.set('Location', authorizationErrorRedirect(original, 'access_denied'))
      return new Response(null, { status: 302, headers })
    }

    const login = await githubLogin(env, code, data.verifier, new URL('/callback', request.url).href)
    if (!isAllowed(env, login)) {
      headers.set('Location', authorizationErrorRedirect(original, 'access_denied', `GitHub user ${login} is not an author of this atlas`))
      return new Response(null, { status: 302, headers })
    }

    const { redirectTo } = await oauth.completeAuthorization({
      request: original,
      userId: login,
      metadata: { login },
      scope: original.scope,
      props: { login } satisfies AuthProps,
    })
    headers.set('Location', redirectTo)
    return new Response(null, { status: 302, headers })
  } catch (err) {
    return authError(err)
  }
}

/** Exchange GitHub's code (with the PKCE verifier) and return who signed in.
 *  No scopes are requested: the public profile is all we read. */
async function githubLogin(env: Env, code: string, verifier: string, redirectUri: string): Promise<string> {
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
    body: new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  })
  const token = (await tokenRes.json()) as { access_token?: string; error?: string; error_description?: string }
  if (!token.access_token) throw new Error(`GitHub sign-in failed: ${token.error_description ?? token.error ?? tokenRes.status}`)

  const userRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': USER_AGENT },
  })
  if (!userRes.ok) throw new Error(`GitHub user lookup failed: ${userRes.status}`)
  return ((await userRes.json()) as { login: string }).login
}

function authError(err: unknown): Response {
  if (err instanceof AuthorizationError && err.redirectTo) return Response.redirect(err.redirectTo, 302)
  if (err instanceof AuthorizationError || err instanceof CimdFetchError) {
    const message = err instanceof AuthorizationError ? err.description : 'Non è stato possibile verificare questa app.'
    return page('Accesso non riuscito', `<p>${escape(message)}</p><p>Riprova il collegamento da claude.ai.</p>`, 400)
  }
  if (err instanceof Error && err.message.startsWith('GitHub')) return page('Accesso non riuscito', `<p>${escape(err.message)}</p>`, 502)
  throw err
}

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

function consentPage(d: ConsentDescription, handle: string): string {
  const name = escape(d.clientName)
  const origin = d.clientDomain
    ? `Pubblicata da <strong>${escape(d.clientDomain)}</strong>.`
    : 'Si è registrata da sola: il nome non è verificato.'
  const loopback = d.redirectIsLoopback
    ? '<p class="warn"><strong>L’accesso va a un programma su questo computer.</strong> Continua solo se hai appena avviato tu il collegamento.</p>'
    : ''
  return pageHtml(
    `Collegare ${name}?`,
    `<p><strong>${name}</strong> chiede di usare lo Study Atlas a tuo nome: cercare dati e fonti e salvare bozze di lezioni. ${origin}</p>
<p>L’accesso sarà inviato a <strong>${escape(d.redirectHost)}</strong>. Dopo ti chiederemo di entrare con GitHub.</p>
${loopback}
<form method="post">
  <input type="hidden" name="handle" value="${escape(handle)}">
  <button name="decision" value="approve" class="primary">Consenti</button>
  <button name="decision" value="deny">Rifiuta</button>
</form>`,
  )
}

function page(title: string, body: string, status: number): Response {
  return new Response(pageHtml(title, body), {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'" },
  })
}

function pageHtml(title: string, body: string): string {
  return `<!doctype html>
<html lang="it">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Study Atlas</title>
<style>
  body { font: 17px/1.5 system-ui, sans-serif; color: #16263d; background: #f3f6f9; margin: 0; padding: 2rem 1rem; }
  main { max-width: 32rem; margin: 0 auto; background: #fff; border: 1px solid #d5dde6; border-radius: 8px; padding: 1.5rem; }
  h1 { font-size: 1.4rem; margin: 0 0 1rem; }
  .warn { background: #fff4d6; padding: 0.6rem 0.8rem; border-radius: 6px; }
  button { font: inherit; min-height: 2.75rem; padding: 0.4rem 1.2rem; margin-right: 0.5rem; border: 2px solid #0b5fa5; border-radius: 6px; background: #fff; color: #0b5fa5; font-weight: 700; cursor: pointer; }
  button.primary { background: #0b5fa5; color: #fff; }
</style>
<main><h1>${title}</h1>${body}</main>
</html>`
}

function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)))
}

async function s256(verifier: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

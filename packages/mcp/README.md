# Study Atlas MCP server

A Cloudflare Worker that lets Claude (in claude.ai) write lessons: it looks up
map data and Wikipedia sources, validates lessons, and saves drafts that open in
the viewer at `?draft=<id>`. Nothing is published from here yet (M3).

Wrangler needs **Node 22 or newer**. Run the commands below from this folder.

## One-time setup

1. **Sign in to Cloudflare:** `npx wrangler login`.
2. **Create the two KV namespaces** and paste their ids into `wrangler.jsonc`:
   ```sh
   npx wrangler kv namespace create OAUTH_KV
   npx wrangler kv namespace create DRAFTS
   ```
3. **Deploy once** (`npm run deploy`) to learn the Worker's URL,
   `https://study-atlas-mcp.<your-subdomain>.workers.dev`. Put it in
   `wrangler.jsonc` as `PUBLIC_URL`, and in `packages/runtime/.env` as
   `VITE_DRAFTS_URL` so the viewer can open drafts.
4. **Create a GitHub OAuth App** at <https://github.com/settings/applications/new>:
   - Homepage URL: the viewer, `https://gillus.github.io/world_visualized/`
   - Authorization callback URL: `<PUBLIC_URL>/callback`
   - Then generate a client secret.
5. **Store the app's credentials as Worker secrets:**
   ```sh
   npx wrangler secret put GITHUB_CLIENT_ID
   npx wrangler secret put GITHUB_CLIENT_SECRET
   ```
6. **List who may sign in:** `ALLOWED_LOGINS` in `wrangler.jsonc`, as
   comma-separated GitHub logins. Then deploy again.
7. **Connect claude.ai:** Settings → Connectors → *Add custom connector*, URL
   `<PUBLIC_URL>/mcp`. You will be asked to allow the connection and to sign in
   with GitHub.

## Day to day

- `npm run deploy`: publish changes to the Worker (guide, tools).
- `npm run smoke` (from the repo root: `npm run mcp:smoke`): call every tool
  in-process against the local `site/` (run `npm run atlas:data` first).
- `npm run dev`: the Worker at `http://localhost:8787`. Local secrets and the
  `PUBLIC_URL` override go in `.dev.vars` (gitignored):
  ```
  PUBLIC_URL=http://localhost:8787
  GITHUB_CLIENT_ID=…
  GITHUB_CLIENT_SECRET=…
  ```

The Worker reads data from the published site (`SITE_URL`), caching it for five
minutes, so new data and lessons need only a Pages deploy, not a Worker deploy.

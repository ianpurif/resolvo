# Resolvo

A private, multi-tenant company knowledge workspace. Sign in with Google, create a company, connect real sources, and ask an assistant that retrieves and cites only that company's indexed knowledge.

## Run

Node.js 22.16+ and npm are required.

```powershell
npm ci
# Configure .env.local using .env.example. Never overwrite existing credentials.
npm run dev
```

Open [Resolvo](http://localhost:3000). There is no unauthenticated chat, sample workspace, seed data, or fallback response provider.

## Supabase and Google

1. Apply every unapplied file in `supabase/migrations/` in filename order, using Supabase's SQL Editor or a linked `supabase db push`. Do not rerun applied migrations. Existing installations need [personal conversations](supabase/migrations/202610110001_personal_conversations.sql), [grounded hybrid retrieval](supabase/migrations/202610110002_grounded_hybrid_retrieval.sql), [server-only query caching](supabase/migrations/202610110003_server_only_query_cache.sql), and all `20261029` integration migrations, including worker nonce protection. These preserve uploaded records and add conversation ownership, scoped retrieval, passage provenance, owner-only upload changes, private audit events and encrypted connections with durable synchronization. Review the [deployment and recovery procedure](docs/rag-operations.md) and [integration setup](docs/integrations.md#deployment) before applying hosted changes. Development, builds, and browser tests do not apply migrations to the hosted project.
2. Enable Google in Supabase Auth and configure its OAuth client ID and secret. In Google's console, authorize the callback URL displayed by Supabase. Keep the Google client secret in Supabase, never in the application or browser.
3. Set the Supabase Auth Site URL to the application's origin. Allow `http://localhost:3000/auth/callback` for local development and the exact HTTPS production callback for Vercel. Avoid broad wildcard production redirect allowlists.
4. Add the settings below to local and Vercel environments. Restart the application after changing them.
5. Sign in with Google. An account without a workspace is redirected to onboarding, where workspace creation and owner membership happen in one transaction.

| Setting                      | Purpose                                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`               | Supabase project URL                                                                                                          |
| `SUPABASE_PUBLISHABLE_KEY`   | Publishable or legacy anon key for authenticated SSR clients                                                                  |
| `APP_URL`                    | Exact application origin, such as `http://localhost:3000`; HTTPS in production                                                |
| `DEEPSEEK_API_KEY`           | DeepSeek Flash generation and tool calling                                                                                    |
| `VOYAGE_API_KEY`             | Voyage document and query embeddings                                                                                          |
| `SUPABASE_SERVICE_ROLE_KEY`  | Server-only credential for provider budgets, query caching, encrypted integrations and the leased sync bridge; interactive source access uses user JWTs/RLS |
| `INTEGRATION_ENCRYPTION_KEY` | Standard-base64 32-byte key for encrypted third-party credentials; keep a separate protected backup |
| `INTEGRATION_SYNC_SECRET` | Random secret of at least 32 characters for scheduled HTTP sync; optional when running the Node worker |
| `VOYAGE_REQUESTS_PER_MINUTE` | Shared Voyage RPM budget; defaults to `3` for the trial account                                                               |
| `VOYAGE_TOKENS_PER_MINUTE`   | Shared Voyage TPM budget; defaults to `10000` for the trial account                                                           |

All settings are read on the server. The publishable key is not a privileged secret, but the server-started PKCE flow keeps it out of the browser bundle as well. DeepSeek, Voyage, and service-role credentials never reach client components. A service-role key is explicitly rejected as an authentication key.

[Google provider setup](https://supabase.com/docs/guides/auth/social-login/auth-google), [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client).

### Google OAuth callbacks and `redirect_uri_mismatch`

There are two different callbacks in this server-side PKCE flow:

| Configuration                                                                                  | Required value for the current local setup                  |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Google Cloud → Google Auth Platform → Clients → Web application → **Authorized redirect URIs** | `https://eobqdatsbwniqtvbusux.supabase.co/auth/v1/callback` |
| Supabase → Authentication → URL Configuration → **Site URL**                                   | `http://localhost:3000`                                     |
| Supabase → Authentication → URL Configuration → **Redirect URLs**                              | `http://localhost:3000/auth/callback`                       |
| `.env.local` → **APP_URL**                                                                     | `http://localhost:3000`                                     |

Google returns its provider authorization code to Supabase's `/auth/v1/callback`. Supabase then redirects to Resolvo's `/auth/callback`, where the server exchanges the application code using the HttpOnly PKCE verifier cookie and verifies the user before redirecting to the dashboard. Google rejects an unregistered provider callback before Resolvo's callback executes. A `303` from `/auth/google` is the expected handoff, and a `302` from Supabase alone does not prove Google accepted the request.

Run `npm run verify:oauth` to print the **actual** Google client ID and callback sent by the configured Supabase project. In [Google Cloud Clients](https://console.cloud.google.com/auth/clients), select that exact OAuth client, add the callback above under **Authorized redirect URIs**, and save. The URI must match its scheme, host, path and trailing slash exactly; the value above has no trailing slash. In Supabase → Authentication → Sign In / Providers → Google, confirm that the client ID and client secret belong to this same **Web application** client. Keep the secret in Supabase. Editing a different Google client will not fix the active request.

The probe follows Google's public authorization redirects and detects OAuth error pages even when Google responds with HTTP 200. It uses a fresh, isolated PKCE request, does not sign in a user, exchanges no authorization code, and prints no keys, cookies or OAuth state. A successful probe means Google reached its interactive sign-in page; complete consent, sign-in and sign-out in the browser to verify the full session. `npm run verify:setup` separately checks the database/workspace configuration.

For production, set Vercel → Project → Settings → Environment Variables → `APP_URL` to the deployed HTTPS origin, and redeploy. Set Supabase's **Site URL** to that origin and add that origin plus `/auth/callback` to **Redirect URLs** while retaining the local callback if local development is still needed. The Google **Authorized redirect URI** stays the same when local and production use this same Supabase project. If production uses a different Supabase project or Auth custom domain, run the probe against its environment and register the callback it reports in the matching Google client. Do not invent a production hostname or use broad wildcard callbacks.

[Google redirect matching rules](https://developers.google.com/identity/protocols/oauth2/web-server#redirect-uri-mismatch), [Supabase application redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

### Existing data

The tenant migration preserves existing unowned documents, vectors, tickets and conversations under an archived organization with no members. Historical order records and ticket/order associations move to the unexposed `private` schema. Existing files are not moved or deleted and cannot be accessed through the new workspace policies. New companies start empty; historical records are never assigned automatically to whoever signs in first. An operator can export legacy files through trusted Supabase administration and import the appropriate real knowledge into its verified owner's new workspace.

The original migrations remain unchanged as applied history. Sample data, order lookups, industry-specific prompts, preview modes and public APIs have been removed from the running product.

## Company knowledge

Workspace owners can add, edit, re-index and delete knowledge; members can read it, download authorized originals and ask questions. Structured imports preserve field labels and record boundaries. Text retains chunk ordinals, extracted-text offsets and Markdown section labels without adding generated facts.

At `/admin/knowledge`, connect:

- PDF, DOCX, UTF-8 TXT, Markdown, CSV, TSV or JSON files, up to 4 MB; PDFs are limited to 100 pages.
- One public HTML or plain-text web page at a time.
- Manually written knowledge, up to 250,000 readable characters.

The 4 MB document limit is enforced in the browser before transfer, in new-upload and replacement routes, in the indexing RPC, and in the private Storage bucket. Request parsing also counts streamed bytes and reserves 64 KB for the multipart envelope; oversized bodies return HTTP 413 and incomplete/malformed uploads return HTTP 400. This fits under [Vercel's 4.5 MB function payload limit](https://vercel.com/docs/functions/limitations#request-body-size). Raising Next.js's proxy buffer alone does not raise the storage, SQL or hosting limits. Compress or split larger documents before importing them.

PDF extraction uses actual page text, excluding parser-generated page labels. Blank or image-only PDFs return an actionable HTTP 422 before storage or embeddings. Apply OCR outside Resolvo to scanned files. Invalid/password-protected PDFs and damaged DOCX documents return a validation error; extraction failures create no indexed records.

Files and extracted originals remain in private Supabase Storage under `organizations/{organizationId}/documents/{documentId}/{revision}/{filename}`. Website imports fetch visible server-rendered text; they do not execute JavaScript, crawl a site, log in, or receive external credentials. Every redirect and resolved address must be public. DNS results are pinned to the connection, and response size, redirects and time are bounded. DOCX imports validate archive expansion before extraction. Scanned PDFs need OCR before upload; encrypted documents are rejected.

Use **Edit** to replace a file, change a website URL or edit written knowledge. **Save & index** first saves the original and a durable indexing job. Text is split into focused chunks (1,200 characters, 200 overlap), counted with the bundled official Voyage 4 tokenizer, and embedded in batches bounded by the configured token budget. Each completed batch is checkpointed in Supabase. The UI shows completed/total chunks and advances one batch per short authenticated continuation request. Keep Company knowledge open while it indexes; closing the page pauses advancement, and reopening it resumes processing jobs automatically. No external queue, worker, cron service or additional vector store is required.

Use **Re-index** to resume a failed or interrupted job from its saved checkpoint, or fetch a website's latest content when no job is pending. A pending replacement's original is retained separately from the active original. The previous successful index stays searchable until all new chunks are ready; a single transaction then replaces the vectors and active revision, after which the retired original is removed. Replayed checkpoints do not duplicate chunks. A stable `Idempotency-Key` UUID on each new-source POST prevents uncertain save responses from creating duplicate sources; keep the same key when retrying the same save. Identical successfully indexed knowledge reuses its existing index. There are at most two processing jobs per workspace, with expiring leases preventing competing tabs from processing the same batch.

Downloads go through an authenticated route that verifies the document's organization and Storage path. The application never returns public or signed bearer links to company files.

Voyage `voyage-4-lite` generates float vectors with **1,024 dimensions**, using `document` for ingestion and `query` for retrieval. The current trial account is limited to 3 requests/minute and 10K tokens/minute. Document and query requests share a sliding-window budget in the existing PostgreSQL database, including across server instances. Actual provider usage reconciles reserved tokens. Batches leave capacity for queries; cached queries require no provider request. Temporary 429s honor `Retry-After`, apply exponential backoff with jitter, and save the next retry time instead of holding a route open for a minute. Network/5xx failures use bounded backoff. Six consecutive failures pause the batch with an actionable error; Re-index resets retries and keeps completed chunks. Invalid credentials and exhausted credits pause promptly. Uncached queries have a bounded wait and report provider failures rather than inventing answers.

Adding a payment method is **optional for correctness**, but the trial limits make large documents take several minutes. In the [Voyage dashboard](https://dashboard.voyageai.com/), select the organization that owns the API key, then **Billing** to add a payment method and **Rate Limits** to confirm `voyage-4-lite` limits. Also check the key's project's **Rate Limits** if customized. Set `VOYAGE_REQUESTS_PER_MINUTE` and `VOYAGE_TOKENS_PER_MINUTE` no higher than the lower applicable organization/project limits, leave headroom if other applications share the organization, and restart the app. [Voyage documents account tiers and retry guidance here](https://docs.voyageai.com/docs/rate-limits). These defaults work without a billing change.

## Connected platforms

The **Integrations** dashboard supports 20 adapters: Google Drive, OneDrive/SharePoint, Dropbox, Box, Gmail, Outlook Mail, GitHub, GitLab, Notion, Confluence, Slack, Jira, Asana, Airtable, HubSpot, Zendesk Help Center, Supabase/PostgREST, websites, custom REST APIs and MCP resource servers. Select individual sources or folders; manage private/workspace access, sync interval, indexed content and progress; disconnect to remove credentials and active indexed copies. There is no account-count or provider-count cap.

Connected content enters the existing extraction, chunking, embedding and retrieval pipeline. Versions and content hashes avoid unchanged embeddings, resumable jobs publish revisions atomically, and completed traversals remove deleted sources. Chat can filter by platform or source and links citations to originals. Connections are private by default; owners may explicitly share selected content with the workspace.

Configure encryption and provider authentication using the [integration deployment guide and capability matrix](docs/integrations.md). Automatic synchronization while the dashboard is closed requires `npm run integrations:worker` or authenticated scheduled calls to `/api/integrations/worker`. Signed webhooks can request an earlier refresh. REST/MCP provide extensibility for compatible APIs; native database sockets and unimplemented provider-specific features are explicitly documented. Local tests verify implementation behavior, not live provider consent or deployment readiness.

## Architecture and isolation

```mermaid
flowchart TD
  User[Google-authenticated member] --> App[Next.js server and protected routes]
  App --> Auth[Supabase Auth and server-resolved membership]
  App --> Ingest[Bounded extraction and LangChain splitting]
  Ingest --> Voyage[Voyage voyage-4-lite]
  Voyage --> SQL[Supabase PostgreSQL and pgvector]
  App --> RAG[Tenant-filtered retrieval]
  RAG --> SQL
  RAG --> Agent[LangGraph and DeepSeek Flash]
  Agent --> Stream[Streamed answer and verified source citations]
  Agent --> Tickets[Tenant-scoped ticket creation]
```

Each tenant-owned record has `organization_id`: memberships, sources, documents, chunks, conversations, messages, tickets, request ledgers and query-embedding caches. Membership is resolved from a server-verified Google user; browser tenant IDs are rejected. One account has one workspace membership, and an organization can have multiple members. Workspace membership provisioning beyond initial owner onboarding is an operator-controlled database operation; there is no public self-enrollment or role-changing API.

Interactive knowledge database and Storage clients carry the signed-in user's session, so RLS applies to source operations. Policies resolve `auth.uid() → organization_members → organization_id`. Composite foreign keys prevent linking another tenant's document, checkpoint or conversation. The membership helper has a fixed search path, no user-supplied identity parameters and a Google-provider check. Anonymous roles have no app-table or RPC grants. Storage includes restrictive tenant and connector boundaries so older broad policies cannot override isolation. Server-only clients access provider-budget RPCs, derived query vectors, encrypted connection credentials and the leased integration sync bridge. The bridge validates connection membership, generation and lease before calling the shared indexing pipeline; retrieval continues to use the user's JWT. Authenticated browsers cannot read/write the query cache or connector credentials, and cannot alter connector copies directly.

The similarity-search function filters `organization_id` inside PostgreSQL **before** cosine ranking and joins only the document's active index revision. It does not retrieve globally and filter afterward. Verified query embeddings are cached per organization and model for seven days, bounded to 512 entries per workspace. The authenticated server organization controls cache scope; existing client-written vectors are excluded. Answers are not cached; every request searches the current indexed data.

Protected pages include `/dashboard`, `/admin/*`, `/support` and onboarding. APIs independently validate authentication, membership, resource ownership, strict input schemas and mutation origins. Proxy refreshes sessions and denies unauthenticated requests. Authentication uses HttpOnly, SameSite cookies and PKCE; production cookies are Secure. Sign-out revokes refresh sessions globally and clears local auth cookies and browser storage. Existing access tokens on other devices remain subject to Supabase's normal JWT lifetime; use a short access-token lifetime appropriate to the deployment.

### Assistant and speed

The assistant combines tenant-scoped vector and full text rankings using reciprocal rank fusion. Short follow-ups use the active user context; independent topics start fresh. Factual questions use focused passages and bounded neighboring context, comparisons reserve distinct sources, and summaries sample source sections with an explicit partial-coverage flag. Context is limited to 6 factual, 8 comparison or 12 summary passages. Most answers use one DeepSeek Flash call; a consented ticket uses the `agent → tools → agent` loop. SSE status arrives immediately, followed by drafts whose citations pass structural checks. Reasoning, tool payloads and internal citation markers are not streamed to the browser.

Retrieved text is untrusted evidence. Unknown facts require uncertainty; conflicting sources must be distinguished. Citation IDs identify selected passages and revisions, with visible numbers beside claims and full excerpts in source chips. Unknown IDs reject the response; missing citation placement permits one bounded JSON repair with explicit source IDs before rejection. These checks validate provenance and placement; semantic support requires source-backed evaluation. The only action tool records a ticket for the current company's team and is registered only with explicit consent. Ticket writes are idempotent per workspace and request. Chat RPCs serialize turns, replay completed requests and allow safe retries. Workspace requests are bounded to 30 new turns per minute.

Dashboard metrics come from exact database counts. Lists show up to 100 recent records; the sidebar loads personal conversations in pages of 30, grouped by the user's local calendar date. Opened chats show their latest 200 messages. Messages remain persisted in PostgreSQL, and the agent uses bounded recent context. Empty workspaces show empty states rather than fabricated data. Conversations retain their original source excerpts as historical records even when source documents change.

Conversation history is private to its authenticated creator within their company. Restrictive RLS policies protect conversations, messages, and request replays even from other members of the same company; sources and tickets remain company resources. Composite foreign keys also prevent linking another user's request to a message. Rename and confirmed delete use a transaction with the same lock as chat creation. Active answers block deletion, and deleting a chat cascades to its messages and request records. Separate private rate events preserve the shared 30-turn rolling minute limit after deletion; they store no message text or user identity, deny direct app-role access, and prune expired events on the next request in that workspace.

## Interface

`/` is the public landing page. `/login` uses the supplied Resolvo logo and a [Google-branded button](https://developers.google.com/identity/branding-guidelines) with the existing server-side PKCE flow. `/dashboard`, `/support`, and `/admin/*` share a collapsible sidebar with paginated history, search, conversation actions, company knowledge, tickets, and account settings.

The assistant streams Markdown with copyable code blocks and saved source excerpts. Interrupted turns retain their request ID for safe retries, including after reopening. Auto-scroll follows new output while the reader stays near the bottom and pauses when they scroll upward. Sonner provides compact notifications for sign-in, source operations, conversation actions, and failures. Motion respects reduced-motion preferences.

The visual identity pairs ink-blue workspace navigation and calm working surfaces with editorial typography, stitched details, and an original woven textile artwork on public/authentication pages. The [artwork and generation prompt](public/art/README.md) are documented alongside the optimized local WebP. The [micro1 site](https://www.micro1.ai/) informed the use of editorial scale and atmospheric composition; Resolvo uses its own artwork and layouts. The supplied Resolvo logo is preserved. Google Sans, Manrope, and Instrument Serif are self-hosted with their [Google Sans license](public/fonts/OFL-google-sans.txt), [Manrope license](public/fonts/OFL-manrope.txt), and [Instrument Serif license](public/fonts/OFL-instrument-serif.txt). The Google G comes from Google's branding assets. Builds do not depend on remote font downloads. The marketing conversation is explicitly illustrative; application screens use authenticated workspace data.

## Verification

The [RAG implementation report](docs/rag-report.md) records before/after results on 72 frozen questions across 13 isolated corpora, six supplemental paraphrase pairs, source-backed review of 336 response observations, security/recovery tests, latency/cost regressions and deployment gates. The [evaluation and operations procedure](docs/rag-operations.md) distinguishes offline checks, paid evaluation, embedding replay, repeated retrieval and hosted verification. Run `npm run eval:rag -- --splits=development --output=offline-development` for local extraction/indexing/retrieval checks; offline vectors do not measure semantic or answer accuracy. Paid evaluation requires separate explicit spending/data approval.

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run start
```

For the isolated desktop/mobile browser journey:

```powershell
npx playwright install chromium
npm run test:browser
```

This suite copies the application into a temporary ignored directory, uses the actual migrations in local PGlite PostgreSQL, and supplies local Supabase Auth, private Storage, integration-provider, Voyage, and DeepSeek transports. It exercises the real SSR session code, routes, retrieval, agent, persistence, confirmation dialogs, Markdown/copy/source interactions, failure recovery, responsive navigation, and logout. The integration journey covers connection/OAuth, selection, scheduled sync, unchanged-content costs, updates/deletions, private/shared access, filtered citations and disconnect. Use `npm run test:browser -- --integrations` for that focused scope. The suite copies no `.env.local`, uses fixture credentials, makes no paid provider calls, and removes the temporary application afterward. Evidence and screenshots are saved under `.local/verification/`. These checks verify local behavior; they do not verify real Google consent, hosted RLS, or provider answer quality.

With real credentials in `.env.local`, run `npm run verify:setup` to check Google Auth, the workspace/checkpoint/cache schema, anonymous API denial and private bucket configuration. Its schema and bucket checks are read-only. The server service key is required at runtime for shared provider-budget RPCs and trusted query caching. Run `npm run verify:providers` only with paid API approval to generate real Voyage document/query vectors and receive a real DeepSeek Flash stream; this uses small provider requests without saving any company data and follows the same shared rate budget.

Tests execute the actual migrations in local PGlite PostgreSQL with pgvector and Supabase-compatible Auth/Storage schemas. They check two tenants, anonymous and non-Google access, cross-tenant reads/writes, scoped similarity search, private paths even with an older broad Storage policy, restricted table grants, composite foreign keys, request replay, expiring indexing leases, checkpoint recovery and atomic replacement. Embedding policy tests use the bundled tokenizer on large English, Unicode and code inputs and verify token budgets, exponential delays, provider retry hints and non-retryable errors without mocked HTTP or timers. Real PDF and DOCX fixtures exercise extraction and archive limits. Other existing transport/agent tests explicitly mock HTTP for isolated auth and streaming regressions. Local tests do not substitute for hosted Supabase, Voyage, Google session or DeepSeek verification.

Before deployment, apply the migration to the actual project; complete Google sign-in and sign-out in a browser; create two real company memberships and verify cross-company API and Storage denial; import real documents; test a cited answer, update and re-index that source, and confirm the new answer. Verify provider permissions and production rate limits. No external SQL migrations are applied merely by building or starting Next.js.

## Vercel

Deploy as a Next.js project on Node 22. Set the exact production `APP_URL` and environment variables, authorize the exact callback URL in Supabase Auth, and use HTTPS. Chat has a 120-second maximum route duration. Index continuation/recovery routes have a 60-second maximum; individual Voyage calls abort after 25 seconds and delayed work resumes in a later request. Choose a hosting plan supporting those durations. The official tokenizer asset is included through Next.js file tracing. Backups, database migrations, membership administration and provider account limits belong to the deployment's operational setup.

The application implements access controls and private storage; regulated deployments still require their own provider agreements, data retention requirements and legal review. No compliance certification is claimed.

## Dependencies

The lockfile includes the compatible Handlebars 4.7.10 security patch. `npm audit --omit=dev` still reports three moderate advisories in Mammoth's `argparse` / `sprintf-js` dependency chain. Resolvo uses Mammoth's library extraction API; its CLI entry point imports `argparse`. A forced historical Mammoth downgrade has not been applied.

DeepSeek Flash remains centralized in `lib/ai/model.ts`. The existing bounded Voyage transport implements LangChain's embeddings interface; search and atomic indexing use tenant-scoped SQL RPCs. Unused MongoDB/community vector wrappers were removed. Supabase PostgreSQL and pgvector remain the vector store. LangChain's core, text splitters and LangGraph remain for their active interfaces and consented ticket workflow. DeepSeek requires `@langchain/openai` transitively for API compatibility; there are no OpenAI embedding calls or credentials. `.npmrc` skips unrelated optional integration peers with conflicting dependencies.

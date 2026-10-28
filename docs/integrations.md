# Third-party integrations

Open **Integrations** in the sidebar (`/admin/integrations`). Connect an account, open its card, select files, folders, messages or records, then choose **Save selection & sync**. A selected folder includes readable descendants and future additions. Account lists, source browsers and indexed-content lists paginate; there is no application-wide provider or account count limit.

The catalog contains 20 working adapters. REST and MCP cover compatible services outside the named catalog. They do not automatically understand every provider's API: configure its mapping or install a connector implementing the small interface below. There are no placeholder connection cards.

## Supported data and authentication

| Connector | Indexed data | Authentication and setup |
| --- | --- | --- |
| Google Drive | Files, folders, shared drives, Google Docs/Slides text; Sheets/Drawings exported to PDF | OAuth or access token with `drive.readonly`; Google service account JSON supported. Share sources with the service account and optionally specify a shared drive ID. |
| OneDrive & SharePoint | Drive folders, PDF, DOCX and readable text/code files | Microsoft OAuth or Graph bearer token with `Files.Read.All`; SharePoint access also needs applicable site permissions. Enter a site ID to browse its drives. |
| Dropbox | Folders and readable files accessible to the app | OAuth or access token; `files.metadata.read`, `files.content.read`. App-folder access and full-Dropbox access follow the app's configuration. |
| Box | Folders and readable files | OAuth with read access, or access token. Configure the Box app's read scopes. |
| Gmail | Label selections and individual message bodies, including text/HTML MIME alternatives | Google OAuth or access token with `gmail.readonly`. Optional Gmail search query narrows label contents. Email attachments are excluded. |
| Outlook Mail | Folders, nested folders and message bodies | Microsoft OAuth or token with `Mail.Read`. Optional mailbox ID requires permissions to that mailbox. Attachments are excluded; immutable message IDs avoid duplicate copies after folder moves. |
| GitHub | Repository directories, documentation and source files | OAuth or fine-grained token with repository Contents read and metadata access. OAuth app `repo` scope is broader than read-only; the connector only reads. Symlinks/submodules are excluded. GitHub's contents API limits a directory to 1,000 entries; an incomplete listing fails visibly. |
| GitLab | Member projects, repository directories, documentation and source files | Personal token with `read_api`, or custom OAuth. Public HTTPS self-managed origins are supported. Optional branch/tag defaults to HEAD. Symlinks/submodules are excluded. |
| Notion | Pages shared with the integration, nested blocks, lists and tables | Internal integration token with read-content access. It does not independently enumerate every unshared database or workspace object. |
| Confluence | Cloud pages and their storage-format text, optionally one space | Email + API token (Basic), or bearer token for the configured endpoint. Enter the Atlassian site origin. |
| Slack | Public/private channels available to the account, messages and thread replies | User token with `channels:read`, `groups:read`, `channels:history`, `groups:history`; workspace URL supplies original links. Provider rate limits can make large histories slow. Files, DMs and archived-channel discovery are not included. |
| Jira | Issues in a configured Cloud project: summary, description, status and labels | Email + API token (Basic), or compatible bearer token; project key and Atlassian origin required. Comments/attachments are excluded. |
| Asana | Tasks, descriptions, completion and due dates in a project | Personal access token with access to the configured project ID. |
| Airtable | A base/table's records and field values | Personal access token with `data.records:read` for that base. Optional title field. |
| HubSpot | Contacts, companies, deals or tickets and selected properties | Private app token with corresponding CRM read scopes; account ID and object type. Separate connections can select different object types. |
| Zendesk | Accessible Help Center articles | `email/token` + API token (Basic), OAuth bearer token, or public access. This adapter does not import support tickets. |
| Supabase / PostgREST | Rows in a configured table, with field names preserved | Project API key; use a key whose RLS/grants expose only intended rows. Unique non-null primary key required for keyset pagination. Optional original-record URL template. |
| Websites | Selected public HTML/plain-text URLs | Public access. Refreshes server-rendered text; no JavaScript execution, login or site crawling. |
| Custom REST API | Paginated JSON collections and detail records, optionally folders | OAuth 2.0 authorization code, bearer/API key, Basic or public access; field and URL templates described below. |
| MCP server | Listed text resources | Public HTTPS Streamable HTTP endpoint; bearer token, OAuth or public access. Supports resource pagination and JSON/SSE responses. No tools or remote code are executed. |

Google Workspace is covered by Drive and Gmail; Microsoft 365 by OneDrive/SharePoint and Outlook Mail. Discord, Teams, Trello, Linear, Salesforce and other APIs can be connected through a compatible REST/MCP gateway or a new adapter. They do not have native adapters in this release. PostgreSQL/MySQL are supported through a deliberately scoped HTTPS API or MCP resource server, **not native database sockets or arbitrary SQL execution**. Supabase has a dedicated PostgREST adapter. Network endpoints must be public; exposing a private database directly is not required.

## Deployment

1. Back up the database and apply every unapplied migration in filename order. This feature adds `202610290001_integrations.sql` through `202610290006_integration_write_boundaries.sql`. They add tables, leased sync/OAuth/webhook functions, restricted file/vector policies and filtered retrieval without rewriting uploaded documents. Building the app does not run migrations.
2. Set `INTEGRATION_ENCRYPTION_KEY` to a securely generated, standard-base64 32-byte key. Store it in the server secret manager and retain a protected backup separate from the database. All application and worker instances must use the same key. Losing or replacing it makes existing credentials unreadable; reconnect accounts or perform a controlled decrypt/re-encrypt migration before rotation. Never publish this key or use a `NEXT_PUBLIC_` variable.
3. Retain the existing Supabase service key, Voyage settings and DeepSeek configuration. Source reads and retrieval still use the member's JWT/RLS. The worker uses the server key through narrowly scoped, service-only SQL functions that validate connection membership, generation and lease.
4. For one-click OAuth, set the relevant `INTEGRATION_<GOOGLE|MICROSOFT|GITHUB|DROPBOX|BOX>_CLIENT_ID` and `_CLIENT_SECRET`. Google credentials serve Drive and Gmail; Microsoft credentials serve files and mail. Enable the relevant APIs and obtain provider consent/verification where required by the provider. Configure exactly **`APP_URL/api/integrations/oauth/callback`** in each integration OAuth app. This callback is separate from the existing Google/Supabase login callback. Production uses HTTPS.
5. Start a worker or schedule its HTTP endpoint. Without that, synchronization advances only while an account panel is open or a user triggers a sync. The dashboard states this requirement.
6. Run `npm run verify:setup` with deployment configuration for read-only schema checks, then connect real test accounts and verify scopes, consent, download permissions, source changes, deletion and revocation against those providers before rollout.

The dashboard accepts custom OAuth app settings when a provider app is not configured on the server. The authorization-code flow binds random state to the current user, organization and HttpOnly cookie; uses S256 PKCE; expires after ten minutes; and consumes state once. Token exchange and refresh happen on the server. Refresh leases serialize rotating refresh tokens. Static access tokens do not automatically refresh: use OAuth for unattended long-lived access. Service-account JWT exchange is implemented for Google Drive. Other provider-specific service accounts can be exposed through their supported API tokens or a new adapter.

### Background synchronization

For a supervised Node process on a host with the repository, dependencies and `.env.local`:

```powershell
npm run integrations:worker
```

The worker repeatedly claims one unit of work, respects saved retry times and exits gracefully on SIGINT/SIGTERM. `npm run integrations:worker -- --once` performs one unit for an external job runner. On hosts that inject environment variables, invoke `node --conditions=react-server --import tsx scripts/integration-worker.ts` without the env-file flag.

On Windows, `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/install-integration-worker.ps1 -StartNow` installs and starts the hidden `ResolvoIntegrationWorker` task for the current user. It starts again at that user's logon, restarts failed runs, and writes logs under `.local/worker/`. The machine must remain awake and the user logged on; use a server worker or scheduled HTTP calls for availability independent of this workstation. The task reads the existing protected `.env.local` and contains no secrets in its command line.

For a scheduled HTTP invocation, set a random `INTEGRATION_SYNC_SECRET` of at least 32 characters and call:

```http
POST /api/integrations/worker
Authorization: Bearer <INTEGRATION_SYNC_SECRET>
```

GET is also supported for schedulers. Invoke about once per minute. Use a scheduler that stores the Authorization header securely; do not place secrets in URLs. The route processes up to 40 steps with a 45-second loop deadline; an in-flight step can take longer, so the hosting function must support the declared 120-second duration. Parallel worker instances are safe because database leases serialize each connection. Existing uploaded-document indexing remains on its original continuation flow.

Connections poll every 15 minutes to 24 hours (default one hour). Traversals and per-page cursors are durable. Overlapping folder/file selections deduplicate source IDs. Provider revisions avoid repeated downloads when supported; normalized content hashes avoid repeated storage, chunking and embedding. APIs without useful versions are read and hashed. This release polls selected scopes; it does not claim provider-specific delta feeds or zero metadata traffic.

Indexing reuses the existing splitter, official tokenizer, Voyage budget and checkpoint RPCs. Only changed text is embedded. Completed batches survive interruptions; publication atomically swaps the active revision. The final batch revalidates the provider source, restarting if it changed while waiting. Missing files are removed; a completed traversal sweeps disappeared descendants. Incomplete listings never trigger a deletion sweep. Unreadable/oversized individual sources receive visible errors while other files continue. Six transient failures pause a task until **Sync now** resets retries. Authentication failures require reconnecting the account.

### Optional webhooks

Provide a signing secret of at least 32 characters when connecting, then configure the endpoint shown in the account panel:

```text
APP_URL/api/integrations/webhooks/CONNECTION_ID
```

GitHub's native `X-Hub-Signature-256: sha256=<hex HMAC>` is verified against the exact raw body. Other providers need a trusted relay that verifies the provider's own signature and forwards this envelope:

```text
X-Resolvo-Timestamp: <Unix seconds>
X-Resolvo-Signature: sha256=<HMAC-SHA256(secret, timestamp + "." + rawBody)>
```

Timestamps must be within five minutes. Events are deduplicated for seven days, payloads are bounded to 256 KB, and webhooks only schedule an authenticated provider re-fetch. They never supply indexed content. Provider subscriptions are not automatically created; Google Pub/Sub, Graph subscription validation and Slack event verification are not interchangeable with this envelope. Keep polling enabled as recovery. A worker must still run to process events.

## Custom REST mapping

Example of a compatible source API response (the application contains no fixture fallback):

```json
{"items":[{"id":"policy-1","name":"Policy","text":"Actual policy text from your service","url":"https://company.example/policy-1","updated_at":"revision-2"}],"next":"cursor-2"}
```

Configure the API origin, list template `/documents?parent={parent}&cursor={cursor}`, detail template `/documents/{id}`, items field `items`, and next-cursor field `next`. Default fields are `id`, `name`, `text`, `url`, `updated_at`, and `kind`. A kind of `folder` or `container` makes an entry browsable and recursively selectable. The detail endpoint returns the record itself. Use dotted paths for nested fields, or `$` for a root array/complete JSON content. Cursor, parent and ID substitutions are URL-encoded; exhausted pagination must return no cursor. APIs with offset arithmetic, GraphQL, request signing or different response structures need a small adapter or gateway.

API keys can use `Authorization`, `api-key`, `apikey`, `PRIVATE-TOKEN`, or an `X-...` header. The default Authorization scheme is `Bearer`; select the scheme the provider supports. Credentials belong in the encrypted authentication fields, never query strings/config URLs. Pagination stays on the API origin. Credentialed redirects are rejected; Box and Microsoft downloads explicitly strip the token before following provider-issued download URLs.

For MCP, provide a Streamable HTTP endpoint implementing `initialize`, `resources/list`, and `resources/read` with text resources. Supported protocol versions are `2025-03-26`, `2025-06-18` and `2025-11-25`; the client negotiates a session and sends initialization acknowledgement. Local stdio servers, legacy SSE-only endpoints, binary resources and servers exposing only tools need an HTTPS resource adapter. OAuth is configured explicitly; dynamic client registration/discovery is not implemented. Non-HTTP resource IDs can use an original-source URL template with `{id}` to produce clickable citations.

## Isolation and source permissions

Every connection belongs to its creator within a server-resolved organization. Other members cannot manage it or read its credentials. Connected content defaults to **Only me**, including for workspace owners. Only an owner may explicitly share selected content with workspace members. Sharing creates workspace knowledge from that owner's authorized account; it is not a synchronization of each provider's entire user/group ACL graph. Use private connections when provider permissions differ between members.

Credentials, refresh tokens, OAuth app secrets, service-account keys and webhook secrets are AES-256-GCM encrypted with tenant/connection identity as authenticated data. Credentials/state/work queues are inaccessible to browser roles. Restrictive RLS applies independently to documents, chunks, pending jobs/vectors and private Storage paths. Browsers cannot alter connector copies through old upload APIs. Membership removal cascades the connection. Retrieval checks organization, visibility, connection status and source-access freshness before ranking; selected source/platform filters further restrict those results.

Successful source reads grant a 24-hour retrieval freshness window, renewed by synchronization. Revocation is observed at the next successful poll; a 401/403 hides the connection immediately, and a 404 removes the affected source. If workers remain unavailable, copies expire from retrieval rather than remaining readable indefinitely. This is bounded polling freshness, not instantaneous remote-ACL propagation. Source deletion removes the affected vectors; explicit disconnect removes all active copies and credentials transactionally. Queued file deletion survives interruption and rechecks references before physical removal. Existing personal conversation excerpts remain historical records and are disclosed as such in the UI.

**All knowledge sources** in chat opens platform/source filters. Empty filters search uploads and all connected knowledge the user can access. Platform and source selections combine as an intersection. Filters are persisted with each request so retries use the same scope. Citations retain passage/revision provenance and link to the provider's original HTTP(S) URL when supplied; a generic database record without a URL needs a configured link template.

All connector network requests use bounded time/size limits, validate and pin public DNS addresses, reject private/reserved endpoints and unsafe schemes, and never execute imported content. The existing 4 MB transport/import limit, 100-page PDF limit, 20–250,000 readable character limit and chunk/token budgets apply. OCR, encrypted files and unsupported binary formats require conversion first. Very large Notion pages or APIs requiring more than one task's bounded request budget fail visibly rather than silently truncating.

## Adding a provider

Implement `Connector` from `lib/integrations/types.ts`, then register it in `lib/integrations/registry.ts`. A provider supplies its catalog/auth/config metadata and two methods:

```ts
list(context, parent?, cursor?): Promise<{ items: RemoteItem[]; cursor?: string }>;
read(context, id, previousVersion?): Promise<{ name: string; url?: string; version?: string; text?: string }>;
```

IDs must be stable within an account. Return `text: undefined` only after verifying the same remote revision is still accessible. Enumerate every page; do not hide incomplete listings as success. Use `context.request` for guarded HTTP, `ConnectorError` for HTTP/rate-limit failures, and `sourceUrl` for citation URLs. `collectionConnector` reduces common JSON-record adapters to paths, pagination and record rendering. Never accept tenant IDs or decrypt credentials in provider code. The existing UI, SQL lease queue, incremental index, filtering and citations need no restructuring for another adapter.

Add injected-transport contract tests for pagination, extraction, unchanged versions, permission failures and URL safety. Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and the relevant browser scope before committing.

## Verification boundary

`npm run test:browser` runs the complete isolated app journey. `npm run test:browser -- --integrations` runs the integration-specific journey: API-key connect, source selection, worker authentication, indexing, filtered chat/citation, unchanged and changed-content costs, deletion, private/shared access, OAuth state/replay, disconnect and responsive UI. Evidence is written under `.local/verification/`. These use actual application routes and migrations against local PostgreSQL-compatible PGlite, with explicitly substituted provider/Auth/Storage/model transports only in the temporary test copy.

Contract tests cover all 20 adapters; SQL tests cover leases, publication/restart, RLS, write restrictions and disconnect. These checks establish local implementation behavior. Real provider OAuth consent, app approval, organization permissions, API availability and production scheduling require deployment verification with real accounts. No live third-party account, hosted migration or paid provider call was used to produce this implementation.

Primary API references: [Drive](https://developers.google.com/workspace/drive/api/reference/rest/v3/files), [Gmail](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list), [Graph files](https://learn.microsoft.com/en-us/graph/api/driveitem-list-children), [Outlook](https://learn.microsoft.com/en-us/graph/api/mailfolder-list-messages), [GitHub](https://docs.github.com/en/rest/repos/contents), [GitLab](https://docs.gitlab.com/api/repository_files/), [Notion](https://developers.notion.com/reference/retrieve-a-block), [Slack](https://docs.slack.dev/reference/methods/conversations.history/), [MCP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports).

# Integration deployment verification — 29 October 2026

Production is live at **https://resolvo-ai.vercel.app**, built from `codex/universal-integrations`. The linked Supabase database now records all 14 repository migrations. The six initial integration migrations and the later `202610290007_worker_nonce.sql` protection were applied with `npx supabase db push --linked --yes` after verification. Existing business-record counts and content fingerprints were unchanged after deployment and cloud verification.

## Migration history repair

These seven versions already existed in the live database and were marked applied only after comparison with a fresh local reconstruction:

| Version | Verified feature |
| --- | --- |
| `202610040001` | Initial app tables, ticket sequence and retained legacy orders |
| `202610050001` | Voyage vector dimensions and search |
| `202610050002` | Workspaces, tenant policies, composite keys and private legacy records |
| `202610090001` | Resumable jobs, vectors and shared provider budget |
| `202610110001` | Personal conversations and protected request accounting |
| `202610110002` | Hybrid retrieval, provenance, owner policies and knowledge audit |
| `202610110003` | Server-only verified query cache |

The comparison matched 21 tables/sequences, 139 columns, 54 indexes, 62 policies, 25 function definitions and their grants, 89 constraints, one trigger, 110 table grants, and the document bucket settings. PostgreSQL 18's separately cataloged NOT NULL constraints were compared through column nullability against PostgreSQL 17. No unverified migration was marked applied. The older vector migration, which deletes derived chunks when originally run, was not replayed.

## Protected backups

Local backup directory: `.local/deployment-20261028T180428Z/`.

- Schema, data/COPY and role dumps include public/private, Auth, Storage metadata and migration history.
- All nine Storage objects were downloaded separately, totaling 2,671,316 bytes.
- Backup and object SHA-256 manifests are saved alongside the dumps.
- The directory and `.env.local` have access restricted to the current Windows user, SYSTEM and administrators.
- Generated integration encryption/worker secrets have a protected local backup. No values or customer records were committed.

## Completed runtime verification

- `npm run verify:setup`: all hosted Auth, schema, anonymous-denial, storage, encryption and worker-secret checks passed.
- All 95 automated tests passed; typecheck and targeted lint passed. Vercel's production build completed successfully.
- All six focused integration browser checks passed, covering account/OAuth lifecycle, source selection, incremental sync costs, filtered citations, private/shared access, disconnect and mobile layout.
- `npm run verify:providers`: real Voyage document/query vectors and a real DeepSeek stream passed.
- With the Windows worker disabled and stopped, Supabase Cron invoked Vercel, which fetched a private verification connection's public IANA example-domains page, extracted its text, embedded it with Voyage, and published its index through the hosted leased worker/checkpoint pipeline. The verification script only polled for publication; it did not run a local sync step.
- The actual RAG retriever queried hosted PostgreSQL under an existing real owner's authenticated role in read-only operator transactions, with platform/document filters. LangGraph/DeepSeek streamed an answer with a verified original-source citation. This did not exercise an interactive Google browser session.
- The temporary connection, encrypted credentials, indexed content, original file and verification query cache entry were removed after the probe. Existing business records were preserved.
- Supabase job `resolvo-integration-sync` is active on `* * * * *`, with successful cron runs and HTTP 200 responses. The former Windows task `ResolvoIntegrationWorker` is disabled and its child processes were stopped.
- Live signed worker requests returned HTTP 200; replayed, expired and anonymous requests returned HTTP 401. The scheduler uses single-use signatures because managed HTTP queue grants can expose headers to database roles. The reusable signing credential was rotated and is stored in Vault and Vercel; it never enters that queue.
- Public pages returned HTTP 200, protected integrations pages redirected to login, private APIs denied anonymous access, and the real Google sign-in start returned a production callback with a Secure/HttpOnly PKCE cookie.

Detailed private audit, backup manifests and live RAG evidence remain in the protected backup directory. Browser fixtures use separate local credentials and data; they do not access this database. The focused browser suite now probes `/login` directly and disables its disposable compiler cache to reduce startup/disk requirements.

## Production environment and remaining account setup

Ten required production environment variables are configured in Vercel, including the existing provider/Supabase settings, the connection encryption key, the rotated worker signing secret and `APP_URL=https://resolvo-ai.vercel.app`. The existing Preview scopes of the eight previously shared variables were preserved. The connection encryption key was retained so saved credentials remain decryptable. Deployment used the pushed Git reference and reached READY, with the production domain assigned to the new build. No Vercel plan upgrade or separate scheduling service was required.

Integration-specific OAuth client IDs/secrets are unavailable for Google, Microsoft, GitHub, Dropbox and Box. Existing Supabase Google sign-in is enabled and was preserved. Register integration apps, configure the exact production `/api/integrations/oauth/callback`, and provide their credentials to enable one-click provider consent. Token-based providers likewise require the user's actual provider token when connecting an account.

Production synchronization runs in Supabase and Vercel while this workstation is off. The job respects configured account intervals and calls the worker only when work is due. The existing Vercel Git production-branch setting remains `main`; this release was explicitly deployed from `codex/universal-integrations`.

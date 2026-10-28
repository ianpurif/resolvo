# Integration deployment verification — 29 October 2026

The linked Supabase database now records all 13 repository migrations. The six integration migrations were applied with `npx supabase db push --linked --yes` after backup and verification of the existing schema. Existing business-record counts and content fingerprints were unchanged after deployment.

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
- All 93 automated tests passed; typecheck and lint passed.
- All six focused integration browser checks passed, covering account/OAuth lifecycle, source selection, incremental sync costs, filtered citations, private/shared access, disconnect and mobile layout.
- `npm run verify:providers`: real Voyage document/query vectors and a real DeepSeek stream passed.
- A private, temporary public-website connection fetched the IANA example-domains page, extracted its text, embedded it with Voyage, and published its index through the hosted leased worker/checkpoint pipeline.
- The actual RAG retriever queried hosted PostgreSQL under an existing real owner's authenticated role in read-only operator transactions, with platform/document filters. LangGraph/DeepSeek streamed an answer with a verified original-source citation. This did not exercise an interactive Google browser session.
- The temporary connection, encrypted credentials, indexed content, original file and verification query cache entry were removed after the probe. Existing business records were preserved.
- The hidden Windows task `ResolvoIntegrationWorker` is running. A startup incompatibility between top-level await and the configured TS runtime was fixed and verified against the linked database.

Detailed private audit, backup manifests and live RAG evidence remain in the protected backup directory. Browser fixtures use separate local credentials and data; they do not access this database. The focused browser suite now probes `/login` directly and disables its disposable compiler cache to reduce startup/disk requirements.

## Remaining external setup

Vercel CLI reports logged out, there is no local Vercel project link, and the GitHub repository has no available deployment secrets or variables. Production Vercel environment updates/redeployment could not be performed. The local `APP_URL` remains `http://localhost:3000`; existing production settings were not guessed or overwritten.

Integration-specific OAuth client IDs/secrets are unavailable for Google, Microsoft, GitHub, Dropbox and Box. Existing Supabase Google sign-in is enabled and was preserved. Register integration apps, configure the exact production `/api/integrations/oauth/callback`, and provide their credentials to enable one-click provider consent. Token-based providers likewise require the user's actual provider token when connecting an account.

The local worker runs while this Windows user is logged on and the workstation is awake. Production synchronization independent of this workstation requires the encryption key and service/provider environment on an always-on worker, or an authenticated schedule for `/api/integrations/worker`. The application implements both options.

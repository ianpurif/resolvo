# Resolvo operations and evaluation

## Deploying this change

1. Test in an isolated staging Supabase project with Google accounts representing an owner, a member and a separate company. Review the additive SQL migration before applying it. Applying a hosted migration is a production modification and needs operator approval.
2. Ensure database **and private Storage objects** have separately recoverable backups. [Supabase database backups do not include Storage objects](https://supabase.com/docs/guides/platform/backups). Define recovery time/point targets and perform an isolated restore drill; this change has not verified a production restore.
3. Apply all unapplied migrations in filename order, including personal conversations, `202610110002_grounded_hybrid_retrieval.sql` and `202610110003_server_only_query_cache.sql`. The search migration builds a generated text-search column and GIN index; allow a maintenance window appropriate to table size. The cache migration revokes browser access and marks existing client-written vectors unverified. These migrations never automatically reassign, delete or re-embed customer sources. Check completion before deploying the new application.
4. Run `npm run verify:setup` for read-only schema/bucket and anonymous-denial probes. These checks do not prove owner/member RLS or actual Google browser sessions. Run the staging adversarial/browser checks with real JWTs before rollout.
5. Re-index legacy sources deliberately to populate reliable ordinals, offsets and section metadata. Existing content remains searchable. Replacements publish atomically; an interrupted update retains the prior revision. A same-text save rebuilds a legacy index once, then preserves version 2 indexes unchanged.
6. Knowledge modifications are owner-only, including direct database and Storage writes. Members retain read/chat/download access. Review this role change with existing workspaces. Source retrieval and document mutation use user JWTs; the server service key is limited in application code to provider-budget RPCs and the derived query-vector cache.
7. Roll out the application after schema validation. Keep a rollback build compatible with the server-only cache grants. An older build that reads the cache through a user JWT needs this security fix or caching disabled before it can serve queries; do not restore browser cache writes. Additive search columns/RPCs may remain. Do not roll back by deleting sources or replaying old migrations. Monitor errors, grounding rejection, provider limits and latency.

## Boundaries and recovery

- Document indexing is checkpointed in PostgreSQL. Authenticated owner continuation requests advance one batch. Closing the knowledge page pauses processing; reopening resumes. No unattended worker or cron was introduced. If unattended completion is required, design a separately authorized worker with scoped capabilities and measure its need first.
- Leases expire after 60 seconds; stale or null leases cannot publish a batch. Retryable failures preserve progress, respect provider cooldown, and stop after the existing six-failure limit. Re-index resumes a failed job. The application does not increase provider allowances.
- Original files remain in a private tenant path. A failed file-cleanup operation is logged; it can leave orphaned originals. Periodically reconcile Storage objects against active documents/jobs using an approved operator workflow. Deletion in the application is not a claim of erasure from backups or provider systems.
- Query vectors are tenant-scoped and cached for seven days with a 512-entry bound on verified entries. Cache access is server-only: organization IDs come from authenticated server context, and reads require `server_verified=true`. Existing client-written vectors are ignored. The versioned key includes query, model, input type and dimensions; vectors are validated. Expired rows are pruned on trusted writes. Evidence/answers are retrieved anew, so content revisions/deletion cannot reuse cached passages.
- Transient embedding outages permit lexical search over the same authorized corpus. Credential/configuration faults remain explicit. Reduced semantic coverage is recorded as `degraded`; empty keyword results are a retrieval limitation, not proof that the entire knowledge base lacks the fact. Monitor this state and retry when semantic search recovers.
- Exact vector search ranks only a materialized tenant subset. Its work grows with that tenant's corpus. GIN accelerates lexical candidates. Use measured tenant sizes/query plans to decide whether partitioning, a tenant-specific ANN index or an external service is warranted. Local PostgreSQL/WASM timings are not hosted capacity claims.
- Chat JSON is bounded before parsing; uploads count actual streamed bytes. Files remain limited to 4 MB, 250,000 extracted characters, 500 chunks, and 100 PDF pages. Scanned PDFs require OCR. CSV/TSV use explicit row/column bounds; JSON has depth/value bounds.

## Diagnostics and data protection

Passage offsets refer to normalized extracted text and use JavaScript UTF-16 character positions. They are not original file byte offsets or PDF page numbers. Original source bytes are retained separately.

`rag.retrieval` records mode, follow-up resolution, cache/degraded status, candidate/passages/document counts, context characters, coverage and duration. `rag.generation` records latency, time to the first cited draft, usage tokens when the provider supplies them, and citation count. `rag.grounding_rejected` records a categorical reason. These events omit queries, content, excerpts, credentials and company names. `private.knowledge_audit_events` records document creation/publication/deletion with actor/document/revision identifiers; application roles cannot read or change it. Operators must define audit retention/access and alert destinations.

Citation checks validate provenance and placement. They cannot prove that a model claim is semantically entailed. An uncited substantive claim permits one conditional repair using JSON paragraphs with explicit source IDs. The server validates the shape, every ID and the rendered citations; an invalid ID or a second failure stops the response. Repair calls have no tools. Drafts are emitted only after structural validation, and diagnostics record repair count and combined token usage. [DeepSeek's JSON mode](https://api-docs.deepseek.com/guides/json_mode/) constrains output format, not factual correctness. Prompts treat uploaded content as untrusted and side-effect tools are absent without explicit consent, but these controls do not certify injection immunity. Maintain adversarial provider evaluations and independently inspect actual excerpts.

Determine relevant jurisdictions, lawful processing purposes, notices, retention, deletion/export rights, access reviews, processor agreements, cross-border transfers and incident response before accepting regulated data. For Philippine personal data, the [National Privacy Commission's security guidance](https://privacy.gov.ph/data-security/) describes controller/processor security and transfer accountability. Organization isolation tests alone do not verify those organizational/legal requirements. No healthcare, finance, GDPR or Philippine legal-compliance certification is claimed.

## Reproducing evaluation

```powershell
npm test
npm run typecheck
npm run lint -- --max-warnings=0
npm run build
npm run test:browser
npm run eval:rag -- --splits=development --output=offline-development
# After implementation is fixed, evaluate acceptance/regression and then holdout:
npm run eval:rag -- --splits=acceptance,regression --output=offline-acceptance-regression
npm run eval:rag -- --splits=holdout --output=offline-holdout
```

`tests/evaluation/freeze.json` binds the original source and four dataset files by SHA-256. Do not regenerate acceptance/holdout to remove failures. The generator refuses to overwrite the freeze. Synthetic names, measurements, policies and adversarial text belong only to tests. The app imports no evaluation facts or answer keys.

Offline evaluation runs real extraction, durable indexing RPCs, RLS, search SQL and evidence selection in an isolated PostgreSQL/WASM database. Its deterministic hash-token vectors are explicitly **nonsemantic**, and generation is **not run**. Exact source spans establish retrieval coverage; MRR uses the first supporting selected passage. These scores do not measure real model answer correctness.

With separate, explicit spending/data approval, run:

```powershell
npm run eval:rag:live -- --approve-external-data --approved-budget-usd=1 --splits=development,acceptance,regression,holdout --repeats=2 --output=live-frozen
```

This sends only frozen evaluation sources/questions to Voyage/DeepSeek and keeps database/storage/rate accounting local. It never uses the hosted Supabase project. The budget reserves an upper bound using official peak token prices, includes retries, and blocks additional provider requests at the cap. The shared ledger is `.local/rag-evaluation/approved-provider-budget.json`; its exclusive lock prevents concurrent runs from multiplying the allowance. Reported token usage settles reservations at conservative peak/cache-miss prices. Unknown or interrupted requests retain their maximum reservation. Do not treat the example command as spending authorization. Query embeddings are batched and reused for both algorithms; the baseline preserves the original four-result/0.35-threshold/two-user-query/prompt behavior. Both algorithms use the same indexed content, so this comparison isolates retrieval/selection/generation changes rather than provider or corpus differences. Retrieval timings use prewarmed vectors and exclude cold embedding requests.

Each run stores and checks a hash of production RAG/auth code, the lockfile and migrations. Do not edit implementation while a run is executing. A final holdout must be evaluated only after implementation is fixed and must not inform later tuning. The first holdout had unseen generated content/values, with known templates. Its review is preserved in `initial-source-review.json`; after the independently derived cache/outage security fix, the same holdout is regression data. No holdout outcome informed ranking or nonempty-evidence prompts. Separately authored questions and human review remain necessary for stronger evidence.

To repeat generation without paying for identical embeddings, copy an earlier run's `embedding-cache.json` to a new output directory and add `--cached-embeddings-only` to an explicitly authorized live command. A cache miss stops before making a Voyage request. This replay uses actual provider vectors and fresh generation, but bypasses simulated provider cooldown; its indexing durations are **not** provider indexing throughput. Original non-replay indexing timings remain in the original run.

Add `--retrieval-only --repeats=1` to that cached live command to run three actual retrieval samples per variant/question with generation disabled. The final `retrieval-consistency` run records identical evidence hashes for 144 cases (432 retrieval samples) and zero provider requests. This checks repeated retrieval on a fixed index; it does not establish deterministic tie ordering across fresh imports or concurrent writes.

The separate `paraphrase-freeze.json` binds six equivalent-wording pairs in `paraphrase.json`, using existing development sources/keys. It was frozen after production code was fixed and was not used for tuning. It is supplemental consistency verification, not an independently unseen knowledge base. Run it under explicit provider approval with `--freeze=paraphrase-freeze.json --splits=paraphrase --repeats=2 --output=live-paraphrases-new`; original acceptance/holdout files and their freeze remain unchanged. The generator `scripts/freeze-rag-paraphrases.ts` refuses to overwrite its files. Primary benchmark totals exclude these correlated pairs.

Artifacts under `.local/rag-evaluation/<output>/` contain original fixture bytes/hashes, extracted/indexing counts, candidate passages, selected evidence, timings, raw answers, provider usage and screening metrics. Answer-alias screening is not factual or citation verification: review every substantive answer against the cited source text, including conditions, units, relationships, conflicts and arithmetic. Record reviewer identity/method, errors and uncertainty. Repeated answers allow consistency assessment. Add independently authored semantic paraphrase cases in a new frozen evaluation version rather than editing acceptance after seeing results.

`node --import tsx scripts/prepare-rag-review.ts RUN-NAME` produces source spans, final answers and actual displayed citations; it assigns no correctness scores. The checked-in [source review](evaluation/source-review.json) binds 336 final response observations by SHA-256, records individual judgments and verifies 127 byte-identical prior answer/evidence projections. All changed responses and supplemental responses were freshly inspected. `node --import tsx scripts/summarize-rag-review.ts` verifies those artifacts and projections and regenerates [metrics](evaluation/results.json). It separates primary totals, supplemental pairs, rejected generations, false refusals and unsupported secondary claims. New outputs require a fresh review; changing artifact hashes to reuse judgments is invalid. See the [implementation report](rag-report.md) for results and release gates.

The novella regression has a newly frozen 20-question source-backed key. The earlier 15/20 result and original question list were not supplied and cannot be treated as a reproduced baseline. The final real-provider run reached 18/20 on both repetitions of the new key; this does not verify the absent original question list.

CI runs local tests/build/browser/offline evaluation with pinned GitHub actions and read-only repository permissions. CI has no provider credentials and cannot certify live quality. The workflow has been added locally; a green hosted CI run is not claimed until it actually runs.

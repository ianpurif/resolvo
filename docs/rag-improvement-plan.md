# Resolvo RAG engineering plan — 2026-10-11

Scope: incremental changes in the existing application. Preserve unrelated local changes, authenticated persistence, provider models and resumable indexing. No hosted mutations or chargeable API requests without explicit approval.

## Verified starting point

- `lib/rag/retriever.ts` requests four vector results, rejects cosine scores below 0.35, truncates queries to 1,500 characters and citation excerpts to 600 characters. No lexical search or evidence coverage measurement exists.
- `lib/ai/graph.ts` concatenates the last two user messages for every request, including independent topic changes. Retrieval does not use an explicit conversational reference boundary.
- `lib/ai/citations.ts` strips citation markers without preserving their association with claims. A map keyed by document ID overwrites passages from the same document. Unknown IDs disappear silently; valid IDs alone do not establish semantic support.
- Published chunks lack an ordinal and source offsets; retrieving neighboring context or sampling a long source in order is unreliable.
- SQL already resolves Google membership, applies tenant RLS, preserves the active revision during replacement, and uses composite foreign keys. Existing local tests cover these controls, checkpoint/retry recovery, storage boundaries, CSRF and personal conversations.
- Indexing advances through authenticated continuation requests. Progress survives reloads; closing the knowledge page pauses advancement. This is durable storage, not an unattended worker.
- The existing tests use local PostgreSQL/WASM and mocked providers. They are useful engineering evidence, not measurements of real semantic retrieval or generated factual accuracy. The earlier 20-question novella evaluation and its answer key are absent from the checkout.

## Priorities and decisions

1. Freeze evaluation sources/questions/keys before changing retrieval. Keep development, novella regression, acceptance and generated holdout separate. Run the original algorithm and the new algorithm against identical inputs. Keep provider evaluation explicitly gated and local to the evaluation database.
2. Add native PostgreSQL full text search and reciprocal rank fusion with pgvector. Filter authorized active revisions inside SQL before ranking. Use a bounded exact vector search within the tenant to avoid global approximate-index filtering reducing recall. Keep the old RPC for compatibility and baseline measurement.
3. Resolve short references using recent user context without an LLM rewrite. Retrieve each turn anew. Use evidence diversity for comparisons, neighboring passages for split facts, and bounded, ordered source coverage for summaries. Disclose incomplete summary coverage.
4. Retain the existing chunk size and overlap. Add deterministic ordinal/offset/Markdown-section metadata. Preserve original source bytes and never invent contextual facts. Add bounded structured-file parsing if tests justify it.
5. Cite passage IDs and revisions, retain full selected excerpts, preserve visible citation numbers, and reject structurally ungrounded model outputs. This validates citation provenance/placement; semantic entailment still requires source-backed evaluation.
6. Restrict knowledge modification to workspace owners in routes and restrictive database/storage policies. Members retain authorized read/chat access. Register side-effect tools only on consented turns. Add bounded input/cancellation and content-free operational diagnostics.
7. Run local SQL, unit, adversarial, interruption, browser, type, lint and build checks. Measure retrieval latency and indexing throughput. Publish reproducible artifacts and clearly distinguish surrogate/local evidence from real provider results.

The final security audit reproduced an additional within-organization cache-poisoning path: an authenticated member could overwrite another user's query vector through `cache_query_embedding` or the table grants. The server-only cache migration revokes browser access, ignores prior unverified entries, and scopes trusted writes/reads using authenticated server context. Its regression test reproduces the overwrite on the previous schema, applies the new migration, then checks owner/member/anonymous denials and trusted cache isolation/expiry/capacity. This fix came from an authorization probe after the first holdout evaluation; holdout results were not used to change ranking or prompts. Empty lexical fallback during an embedding outage now explicitly requests a retry instead of asserting missing knowledge.

## Alternatives deferred

No new search service, queue, knowledge graph, model, LLM router, or paid reranker. No larger default embeddings/context merely to improve one fixture. Reassess these only after measured failures on independent cases. Keep LangGraph for the existing consented ticket workflow; remove provider/vector wrappers only where their methods are entirely bypassed by the application transport.

## Research

- [Supabase hybrid search](https://supabase.com/docs/guides/ai/hybrid-search): full text search plus vector ranking, combined with RRF.
- [Supabase RAG permissions](https://supabase.com/docs/guides/ai/rag-with-permissions): authorization applied in the database.
- [pgvector](https://github.com/pgvector/pgvector): exact versus approximate search and filtering/recall tradeoffs.
- [PostgreSQL text search](https://www.postgresql.org/docs/current/textsearch-controls.html): parsers, dictionaries, query construction and ranking.
- [Voyage embeddings](https://docs.voyageai.com/docs/embeddings): separate document/query input types and bounded inputs.
- [OWASP RAG security](https://cheatsheetseries.owasp.org/cheatsheets/RAG_Security_Cheat_Sheet.html): authorization and untrusted retrieval content; prompts alone cannot prove injection immunity.
- Installed Next.js guides read before code edits: `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and `01-app/02-guides/data-security.md`. Authenticated route handlers remain dynamic, server-only and private/no-store.

## Acceptance gates

Real provider answer quality, the original novella 18/20 requirement, unseen holdout generation, remote concurrent PostgreSQL behavior, deployment, backups/restore and data protection obligations remain separate release gates. Local surrogate vectors or deterministic model fixtures cannot satisfy these gates. Cost and timing must be derived from recorded usage; no accuracy/compliance claims without evidence.

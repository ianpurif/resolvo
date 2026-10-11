import { authConfiguration } from "../lib/config";
import { MAX_FILE_SIZE } from "../lib/knowledge-limits";
async function main() {
  const config = authConfiguration();
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  let failed = false;
  function report(name: string, ok: boolean, note?: string) {
    console.log(
      (ok ? "PASS" : "FAIL") + " " + name + (note ? ": " + note : ""),
    );
    if (!ok) failed = true;
  }
  const headers = { apikey: config.key };
  const settings = await fetch(config.url + "/auth/v1/settings", { headers });
  const providers = await settings.json();
  report("Supabase Auth connection", settings.ok);
  report("Google provider enabled", providers.external?.google === true);
  const tables = [
    "organizations",
    "organization_members",
    "documents",
    "document_chunks",
    "conversations",
    "messages",
    "tickets",
    "data_sources",
    "chat_requests",
    "query_embeddings",
    "document_index_jobs",
    "document_index_vectors",
  ];
  for (const table of tables) {
    const denied = await fetch(
      config.url + "/rest/v1/" + table + "?select=*&limit=0",
      { headers },
    );
    report(
      "Anonymous access denied: " + table,
      [401, 403].includes(denied.status),
      denied.status === 404 ? "Apply the tenant migration" : undefined,
    );
    if (service) {
      const inspected = await fetch(
        config.url +
          "/rest/v1/" +
          table +
          "?select=" +
          (table === "organizations" ? "id" : "organization_id") +
          "&limit=0",
        { headers: { apikey: service, Authorization: "Bearer " + service } },
      );
      report(
        "Workspace schema: " + table,
        inspected.ok,
        inspected.ok
          ? undefined
          : "Apply every unapplied file in supabase/migrations/ in filename order",
      );
    }
  }
  const deniedRpc = await fetch(
    config.url + "/rest/v1/rpc/match_document_chunks",
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        query_embedding: Array(1024).fill(0.1),
        match_count: 4,
        filter: {},
      }),
    },
  );
  report("Anonymous vector RPC denied", [401, 403].includes(deniedRpc.status));
  const deniedCache = await fetch(config.url + "/rest/v1/rpc/store_query_embedding", {
    method: "POST", headers: { ...headers, "Content-Type": "application/json" },
    // Invalid organization and vector also guarantee no mutation on a bad grant.
    body: JSON.stringify({ p_organization_id: "00000000-0000-0000-0000-000000000000", p_hash: "0".repeat(64), p_embedding: Array(1024).fill(0) }),
  });
  report("Anonymous trusted-cache RPC denied", [401, 403].includes(deniedCache.status), deniedCache.status === 404 ? "Apply 202610110003_server_only_query_cache.sql" : undefined);
  for (const [name, params] of [
    ["search_knowledge", { p_query_text: "verification", p_query_embedding: null, p_match_count: 1 }],
    ["knowledge_passage_context", { p_passage_ids: [] }],
    ["knowledge_overview", { p_document_ids: [], p_count: 1 }],
  ] as const) {
    const denied = await fetch(config.url + "/rest/v1/rpc/" + name, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(params) });
    report("Anonymous retrieval RPC denied: " + name, [401, 403].includes(denied.status),
      denied.status === 404 ? "Apply 202610110002_grounded_hybrid_retrieval.sql" : undefined);
  }
  const deniedBudget = await fetch(
    config.url + "/rest/v1/rpc/reserve_voyage_request",
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ p_tokens: 1, p_rpm: 3, p_tpm: 10000 }),
    },
  );
  report(
    "Anonymous provider-budget RPC denied",
    [401, 403].includes(deniedBudget.status),
  );
  if (service) {
    const cacheSchema = await fetch(config.url + "/rest/v1/query_embeddings?select=server_verified&limit=0", { headers: { apikey: service, Authorization: "Bearer " + service } });
    report("Server-verified query-cache schema", cacheSchema.ok, cacheSchema.ok ? undefined : "Apply 202610110003_server_only_query_cache.sql");
    for (const [table, select] of [["documents", "index_policy_version"], ["document_chunks", "chunk_index,start_offset,end_offset,section,search_tsv"]]) {
      const inspected = await fetch(config.url + `/rest/v1/${table}?select=${select}&limit=0`, { headers: { apikey: service, Authorization: "Bearer " + service } });
      report("Passage provenance schema: " + table, inspected.ok, inspected.ok ? undefined : "Apply 202610110002_grounded_hybrid_retrieval.sql");
    }
    const progress = await fetch(
      config.url +
        "/rest/v1/documents?select=index_total,index_completed,index_next_attempt_at&limit=0",
      {
        headers: { apikey: service, Authorization: "Bearer " + service },
      },
    );
    report(
      "Resumable indexing schema",
      progress.ok,
      progress.ok ? undefined : "Apply 202610090001_resumable_indexing.sql",
    );
    const response = await fetch(
      config.url + "/storage/v1/bucket/support-documents",
      { headers: { apikey: service, Authorization: "Bearer " + service } },
    );
    const bucket = await response.json();
    report("Document bucket private", response.ok && bucket.public === false);
    report(
      "Document bucket size limit (4 MB)",
      Number(bucket.file_size_limit) === MAX_FILE_SIZE,
    );
    report(
      "PDF and text storage enabled",
      ["application/pdf", "text/plain", "text/markdown"].every(
        (type) => bucket.allowed_mime_types?.includes(type) === true,
      ),
    );
    report(
      "DOCX storage enabled",
      bucket.allowed_mime_types?.includes(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ) === true,
    );
    report("Structured storage enabled", ["text/csv", "text/tab-separated-values", "application/json"].every((type) => bucket.allowed_mime_types?.includes(type) === true));
  } else
    console.log(
      "SKIP Operational schema and bucket checks: no optional service key.",
    );
  console.log(
    "Complete Google sign-in, onboarding, and sign-out in a browser to verify an actual user session.",
  );
  if (failed) process.exitCode = 1;
}
main().catch((error) => {
  console.error(
    "Setup verification failed (" +
      (error instanceof Error ? error.name : "unknown") +
      "). Check local configuration and provider availability.",
  );
  process.exitCode = 1;
});

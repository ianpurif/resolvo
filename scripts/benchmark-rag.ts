import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tenantDatabase, asUser } from "../tests/helpers/database";
import { ragImplementationHash } from "./rag-version";

function percentile(values: number[], p: number) { return [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1]; }
async function main() {
  const args = process.argv.slice(2);
  const targets = (args.find((arg) => arg.startsWith("--counts="))?.slice(9) ?? "500,2500,10000").split(",").map(Number);
  assert.ok(targets.length && targets.every((value, i) => Number.isInteger(value) && value >= 500 && value <= 10000 && value % 500 === 0 && (i === 0 || value > targets[i - 1])));
  const explain = args.includes("--explain");
  await mkdir(resolve(".local/rag-evaluation"), { recursive: true });
  const db = await tenantDatabase();
  const id = randomUUID(), vector = JSON.stringify([1, ...Array(1023).fill(0)]), measurements = [];
  try {
    await db.query("insert into auth.users(id) values($1)", [id]);
    await asUser(db, id);
    const org = (await db.query<{ id: string }>("select create_workspace('Synthetic benchmark','Other') as id")).rows[0].id;
    let count = 0;
    for (const target of targets) {
      const ingestionStart = performance.now();
      while (count < target) {
        const doc = randomUUID(), revision = randomUUID();
        const source = (await db.query<{ id: string }>("insert into data_sources(organization_id,name,kind) values($1,$2,'manual') returning id", [org, `Benchmark manual ${count / 500}`])).rows[0].id;
        await db.query("insert into documents(id,organization_id,data_source_id,name,file_path,mime_type,size_bytes,status,chunk_count,active_revision,index_policy_version) values($1,$2,$3,'Benchmark manual',$4,'text/plain',100,'ready',500,$5,2)", [doc, org, source, `organizations/${org}/documents/${doc}/${revision}/knowledge.txt`, revision]);
        await db.query("insert into document_chunks(organization_id,content,embedding,metadata,index_revision,chunk_index) select $1::uuid,'Inventory capacity record '||n||'. A responsible custodian records all container movements.',$2::extensions.vector(1024),jsonb_build_object('documentId',$3::text,'organizationId',($1::uuid)::text,'title','Benchmark manual'),$4,n from generate_series(0,499) n", [org, vector, doc, revision]);
        count += 500;
      }
      const insertMs = performance.now() - ingestionStart;
      await db.exec("analyze public.document_chunks;analyze public.documents");
      for (const [method, sql, parameters] of [
        ["legacy-vector", "select * from match_document_chunks($1,4,'{}')", [vector]],
        ["hybrid-exact-tenant", "select * from search_knowledge('inventory capacity',$1,24)", [vector]],
        ["lexical", "select * from search_knowledge('inventory capacity',null,24)", []],
      ] as const) {
        await db.query(sql, [...parameters]);
        if (explain) {
          let explainedSql: string = sql;
          let explainedParameters: unknown[] = [...parameters];
          if (method !== "legacy-vector") {
            const body = (await db.query<{ prosrc: string }>("select prosrc from pg_proc where proname='search_knowledge'")).rows[0].prosrc;
            explainedSql = body.replace(/p_query_text/g, "$1").replace(/p_query_embedding/g, "$2").replace(/p_match_count/g, "$3");
            explainedParameters = ["inventory capacity", method === "lexical" ? null : vector, 24];
            await db.exec("set search_path=public,extensions");
          }
          const plan = await db.query("explain (analyze,buffers,format json) " + explainedSql, explainedParameters);
          await writeFile(resolve(".local/rag-evaluation", `plan-${target}-${method}.json`), JSON.stringify(plan.rows, null, 2));
        }
        const timings: number[] = [];
        const memoryBefore = process.memoryUsage().rss;
        const cpuBefore = process.cpuUsage();
        for (let i = 0; i < 10; i++) {
          const start = performance.now(), result = await db.query(sql, [...parameters]);
          timings.push(performance.now() - start);
          assert.ok(result.rows.length <= (method === "legacy-vector" ? 4 : 24));
        }
        measurements.push({ chunks: target, method, samples: 10, p50Ms: percentile(timings, 0.5), p95Ms: percentile(timings, 0.95),
          cpuMicroseconds: process.cpuUsage(cpuBefore), rssBefore: memoryBefore, rssAfter: process.memoryUsage().rss,
          syntheticInsertMs: insertMs, insertionIsProviderThroughput: false });
      }
    }
    const output = resolve(".local/rag-evaluation/database-benchmark.json");
    await mkdir(resolve(".local/rag-evaluation"), { recursive: true });
    const report = { completedAt: new Date().toISOString(), implementationHash: await ragImplementationHash(), node: process.version,
      database: "Local PostgreSQL/WASM/PGlite; 1024-dimensional controlled vectors and synthetic text", measurements,
      limitations: "Warm local SQL timings only. Includes no HTTP, provider, multi-process concurrency, production data distribution or hosted resource limits. Peak RSS includes the WASM database and is not attributable solely to retrieval." };
    await writeFile(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ output, ...report }));
  } finally { await db.close(); }
}
void main().catch((error) => { console.error("Benchmark failed:", error instanceof Error ? error.message : "Unknown failure"); process.exitCode = 1; });

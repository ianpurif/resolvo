import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, createHash } from "node:crypto";
import { tenantDatabase, asUser } from "./helpers/database";
import { splitKnowledge } from "../lib/rag/chunks";

const vector = JSON.stringify([1, ...Array(1023).fill(0)]);
async function publish(db: Awaited<ReturnType<typeof tenantDatabase>>, org: string, name: string, text: string, embedding = vector) {
  const id = randomUUID(), revision = randomUUID(), path = `organizations/${org}/documents/${id}/${revision}/knowledge.txt`;
  const chunks = await splitKnowledge(text);
  await db.query("select start_document_index_job($1,$2,$3,'file',null,$4,'text/plain',$5,false,$6,$7)", [id, revision, name, path, text.length, createHash("sha256").update(text).digest("hex"), JSON.stringify(chunks.map((chunk) => ({ ...chunk, token_count: 20 })))]);
  const lease = randomUUID();
  await db.query("select claim_document_index_batch($1,$2)", [id, lease]);
  await db.query("select checkpoint_document_index_batch($1,$2,0,$3)", [id, lease, JSON.stringify(chunks.map(() => JSON.parse(embedding)))]);
  return { id, revision, path };
}

test("hybrid SQL recovers exact low-vector evidence and scopes semantic, lexical, neighbor and overview access", async () => {
  const db = await tenantDatabase();
  try {
    const a = randomUUID(), b = randomUUID(), member = randomUUID();
    await db.query("insert into auth.users(id,email) values($1,'a@fixture.invalid'),($2,'b@fixture.invalid'),($3,'member@fixture.invalid')", [a, b, member]);
    await asUser(db, a);
    const orgA = (await db.query<{ id: string }>("select create_workspace('Synthetic operations A','Other') as id")).rows[0].id;
    const low = JSON.stringify([0.1, Math.sqrt(0.99), ...Array(1022).fill(0)]);
    const docA = await publish(db, orgA, "Credential procedure", "Credential rotation requires the security owner. The organization A key expires after 37 days.", low);
    await publish(db, orgA, "Unrelated visitor parking", "Visitor parking is available beside the reception area. Coffee is served at noon.");
    const before = (await db.query<{ content: string; similarity: number }>("select * from match_document_chunks($1,4,'{}')", [vector])).rows.filter((r) => r.similarity >= 0.35);
    assert.equal(before.some((r) => r.content.includes("37 days")), false, "Reproduces original fixed-threshold false refusal");
    const after = (await db.query<{ id: string; content: string; document_id: string; organization_id: string }>("select * from search_knowledge('credential rotation key expires',$1,24)", [vector])).rows;
    assert.equal(after[0].document_id, docA.id);
    assert.ok(after[0].content.includes("37 days"));
    const passageA = after[0].id;
    await asUser(db, b);
    const orgB = (await db.query<{ id: string }>("select create_workspace('Synthetic operations B','Other') as id")).rows[0].id;
    await publish(db, orgB, "Credential procedure", "Credential rotation requires the finance owner. The organization B key expires after 91 days.");
    for (const embedding of [vector, null]) {
      const found = (await db.query<{ organization_id: string; content: string }>("select * from search_knowledge('credential rotation key expires',$1,24)", [embedding])).rows;
      assert.ok(found.length);
      assert.ok(found.every((r) => r.organization_id === orgB && !r.content.includes("37 days")));
    }
    assert.equal((await db.query("select * from knowledge_passage_context($1)", [`{${passageA}}`])).rows.length, 0);
    assert.equal((await db.query("select * from knowledge_overview($1,12)", [`{${docA.id}}`])).rows.length, 0);
    await asUser(db, a);
    await db.exec("reset role");
    await db.query("insert into organization_members(organization_id,user_id,role) values($1,$2,'member')", [orgA, member]);
    await asUser(db, member);
    assert.equal((await db.query("select * from search_knowledge('credential',null,24)")).rows.length, 1);
    await assert.rejects(db.query("insert into data_sources(organization_id,name,kind) values($1,'Poisoned','manual')", [orgA]), /row-level security/);
    assert.equal((await db.query("delete from documents where id=$1 returning id", [docA.id])).rows.length, 0);
    assert.equal((await db.query("update document_chunks set content='Forged policy' where document_id=$1 returning id", [docA.id])).rows.length, 0);
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('support-documents',$1)", [docA.path]), /row-level security/);
    await assert.rejects(db.query("select * from private.knowledge_audit_events"), /permission denied/);
    await db.exec("reset role;set role anon");
    for (const sql of ["select * from search_knowledge('credential',null,24)", "select * from knowledge_overview(null,12)", "select * from knowledge_passage_context('{}')"]) await assert.rejects(db.query(sql), /permission denied/);
  } finally { await db.close(); }
});

test("published metadata comes from verified columns; stale revisions and expired checkpoint leases stay unavailable", async () => {
  const db = await tenantDatabase();
  try {
    const user = randomUUID();
    await db.query("insert into auth.users(id) values($1)", [user]);
    await asUser(db, user);
    const org = (await db.query<{ id: string }>("select create_workspace('Synthetic reliability','Other') as id")).rows[0].id;
    const original = await publish(db, org, "Approved operating limit", "The approved operating limit is 14 units. Only the operations lead may approve an exception.");
    await db.query("update document_chunks set metadata=metadata||$1 where document_id=$2", [JSON.stringify({ organizationId: randomUUID(), title: "Forged title" }), original.id]);
    const hit = (await db.query<{ title: string; organization_id: string; start_offset: number }>("select * from search_knowledge('operating limit',null,4)")).rows[0];
    assert.equal(hit.title, "Approved operating limit");
    assert.equal(hit.organization_id, org);
    assert.equal(hit.start_offset, 0);
    const revision = randomUUID(), lease = randomUUID();
    const replacement = "The approved operating limit is 19 units.";
    await db.query("select start_document_index_job($1,$2,'Approved operating limit','file',null,$3,'text/plain',100,true,$4,$5)", [original.id, revision, `organizations/${org}/documents/${original.id}/${revision}/knowledge.txt`, "f".repeat(64), JSON.stringify((await splitKnowledge(replacement)).map((chunk) => ({ ...chunk, token_count: 20 })))]);
    await assert.rejects(db.query("select checkpoint_document_index_batch($1,null,0,$2)", [original.id, `[${vector}]`]), /conflict/);
    await db.query("select claim_document_index_batch($1,$2)", [original.id, lease]);
    await db.query("update document_index_jobs set lease_until=now()-interval '1 second' where document_id=$1", [original.id]);
    await assert.rejects(db.query("select checkpoint_document_index_batch($1,$2,0,$3)", [original.id, lease, `[${vector}]`]), /conflict/);
    const active = (await db.query<{ content: string }>("select * from search_knowledge('operating limit',null,24)")).rows;
    assert.ok(active.every((r) => r.content.includes("14 units")));
    const nextLease = randomUUID();
    await db.query("select claim_document_index_batch($1,$2)", [original.id, nextLease]);
    await db.query("select checkpoint_document_index_batch($1,$2,0,$3)", [original.id, nextLease, `[${vector}]`]);
    await db.query("select checkpoint_document_index_batch($1,$2,0,$3)", [original.id, nextLease, `[${vector}]`]);
    const published = (await db.query<{ content: string; index_revision: string }>("select * from search_knowledge('operating limit',null,24)")).rows;
    assert.equal(published.length, 1);
    assert.equal(published[0].index_revision, revision);
    assert.equal(published[0].content, replacement);
    await db.exec("reset role");
    const audit = (await db.query<{ action: string }>("select action from private.knowledge_audit_events order by id")).rows;
    assert.deepEqual(audit.map((r) => r.action), ["created", "published", "published"]);
  } finally { await db.close(); }
});

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { tenantDatabase, asUser } from "./helpers/database";

test("connector tables deny browser credential/queue access and enforce creator and tenant boundaries", async () => {
  const db = await tenantDatabase();
  try {
    const owner = randomUUID(), member = randomUUID(), outside = randomUUID(), connection = randomUUID();
    await db.query("insert into auth.users(id) values($1),($2),($3)", [owner, member, outside]);
    await asUser(db, owner);
    const org = (await db.query<{ id: string }>("select create_workspace('Integration tests','Other') id")).rows[0].id;
    await db.exec("reset role");
    await db.query("insert into organization_members(organization_id,user_id,role) values($1,$2,'member')", [org, member]);
    await db.query("insert into integration_connections(id,organization_id,created_by,provider,name) values($1,$2,$3,'custom-api','Private API')", [connection, org, owner]);
    await db.query("insert into integration_credentials(connection_id,ciphertext) values($1,'encrypted')", [connection]);
    await asUser(db, owner);
    assert.equal((await db.query("select * from integration_connections")).rows.length, 1);
    await assert.rejects(db.query("select * from integration_credentials"), /permission denied/);
    await assert.rejects(db.query("select * from integration_tasks"), /permission denied/);
    await assert.rejects(db.query("update integration_connections set visibility='workspace'"), /permission denied/);
    await asUser(db, member);
    assert.equal((await db.query("select * from integration_connections")).rows.length, 0);
    assert.equal((await db.query<{ allowed: boolean }>("select private.can_read_integration($1) allowed", [connection])).rows[0].allowed, false);
    await db.exec("reset role");
    await db.query("update integration_connections set visibility='workspace' where id=$1", [connection]);
    await asUser(db, member);
    assert.equal((await db.query<{ allowed: boolean }>("select private.can_read_integration($1) allowed", [connection])).rows[0].allowed, true);
    await asUser(db, outside);
    await db.query("select create_workspace('Another company','Other')");
    assert.equal((await db.query<{ allowed: boolean }>("select private.can_read_integration($1) allowed", [connection])).rows[0].allowed, false);
    await db.exec("reset role; set role anon");
    await assert.rejects(db.query("select * from integration_connections"), /permission denied/);
  } finally { await db.close(); }
});

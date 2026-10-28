import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { tenantDatabase } from "./helpers/database";

test("hosted scheduler avoids idle/overlapping work and keeps signing headers inaccessible to browser roles", async () => {
  const db = await tenantDatabase();
  try {
    // Extension transports are local fixtures. The dispatcher and permission SQL
    // below are the exact hosted operator setup, executed against PostgreSQL.
    await db.exec(`create schema net; create schema vault; create schema cron;
      grant usage on schema net to public;
      create table net.http_request_queue(id bigint generated always as identity primary key,url text,headers jsonb);
      create table net._http_response(id bigint primary key,status_code integer,timed_out boolean,error_msg text);
      grant select on net.http_request_queue,net._http_response to public;
      create table vault.decrypted_secrets(name text primary key,decrypted_secret text);
      create table cron.job(jobid bigint,jobname text,active boolean,schedule text);
      create table cron.job_run_details(runid bigint,jobid bigint,status text,start_time timestamptz,end_time timestamptz);
      create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$
        insert into net.http_request_queue(url,headers) values(url,headers) returning id;
      $$;
      insert into vault.decrypted_secrets values('resolvo_integration_worker_url','https://app.example/api/integrations/worker'),
        ('resolvo_integration_worker_secret','a-fixture-signing-secret-of-at-least-32-characters');`);
    const setup = (await readFile("supabase/operations/integration-scheduler.sql", "utf8"))
      .replace(/^create extension if not exists .*;\r?\n/gm, "");
    await db.exec(setup);
    assert.equal((await db.query<{ id: number | null }>("select private.dispatch_integration_sync() as id")).rows[0].id, null);
    const first = (await db.query<{ id: number }>("select private.dispatch_integration_sync(true) as id")).rows[0].id;
    assert.ok(first);
    assert.equal((await db.query<{ id: number | null }>("select private.dispatch_integration_sync(true) as id")).rows[0].id, null);
    assert.equal((await db.query("select * from net.http_request_queue")).rows.length, 1);
    await db.query("insert into net._http_response values($1,200,false,null)", [first]);
    assert.ok((await db.query<{ id: number }>("select private.dispatch_integration_sync(true) as id")).rows[0].id);
    await db.exec("set role authenticated");
    await assert.rejects(db.query("select * from net.http_request_queue"), /permission denied/);
    await assert.rejects(db.query("select private.dispatch_integration_sync(true)"), /permission denied/);
    await assert.rejects(db.query("select integration_scheduler_status()"), /permission denied/);
    await db.exec("reset role;set role service_role");
    const status = (await db.query<{ result: { active: boolean; lastHttp: { status: number } } }>("select integration_scheduler_status() as result")).rows[0].result;
    assert.equal(status.active, false);
    assert.equal(status.lastHttp.status, 200);
  } finally { await db.close(); }
});

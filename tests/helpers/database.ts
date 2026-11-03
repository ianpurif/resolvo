import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { readFile, readdir } from "node:fs/promises";

export async function tenantDatabase(throughMigration?: string) {
  const db = new PGlite({ extensions: { vector } });
  await db.exec(
    [
      "create schema extensions;create schema storage;create schema auth;",
      "create role anon;create role authenticated;create role service_role bypassrls;",
      "alter default privileges in schema public grant all on tables to anon,authenticated,service_role;",
      "alter default privileges in schema public grant all on functions to anon,authenticated,service_role;",
      "create table auth.users(id uuid primary key,email text);",
      "create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;",
      "create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;",
      "grant usage on schema auth to authenticated,anon,service_role;",
      "grant execute on function auth.uid(),auth.jwt() to authenticated,anon,service_role;",
      "create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
      "create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);",
      "alter table storage.objects enable row level security;grant usage on schema storage to authenticated;",
      "grant select,insert,update,delete on storage.objects to authenticated;",
      "grant usage on schema storage to service_role;grant select,insert,update,delete on storage.objects to service_role;",
    ].join("\n"),
  );
  for (const file of (await readdir("supabase/migrations"))
    .filter((name) => name.endsWith(".sql") && (!throughMigration || name <= throughMigration))
    .sort())
    await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
  return db;
}
export async function asUser(db: PGlite, id: string, provider = "google") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: id,
      role: "authenticated",
      app_metadata: { provider },
    }),
  ]);
  await db.exec("set role authenticated");
}

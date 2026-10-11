import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomUUID } from "node:crypto";
import { tenantDatabase, asUser } from "../helpers/database";

// Test-only Supabase and provider transports. The app's SSR auth, routes, SQL,
// RLS, retrieval, agent, storage and SSE code run against isolated local data.
export async function startFixtureBackend(port: number, appOrigin: string) {
  const db = await tenantDatabase();
  const owner: string = randomUUID(),
    colleague: string = randomUUID(),
    outsider: string = randomUUID();
  await db.query(
    "insert into auth.users(id,email) values($1,'owner@fixture.invalid'),($2,'member@fixture.invalid'),($3,'outside@fixture.invalid')",
    [owner, colleague, outsider],
  );
  await asUser(db, owner);
  const org = (
    await db.query<{ id: string }>(
      "select create_workspace('Browser verification','Other') as id",
    )
  ).rows[0].id;
  await db.exec("reset role");
  await db.query(
    "insert into organization_members(organization_id,user_id,role) values($1,$2,'member')",
    [org, colleague],
  );
  await asUser(db, outsider);
  await db.query("select create_workspace('Other company','Other')");
  await db.exec("reset role");
  const users = new Map(
    [owner, colleague, outsider].map((id) => [
      id,
      {
        id,
        aud: "authenticated",
        role: "authenticated",
        email:
          id === owner ? "owner@fixture.invalid" : "member@fixture.invalid",
        app_metadata: { provider: "google", providers: ["google"] },
        user_metadata: {},
        created_at: new Date().toISOString(),
      },
    ]),
  );
  function token(id: string) {
    return [
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
        "base64url",
      ),
      Buffer.from(
        JSON.stringify({
          sub: id,
          exp: Math.floor(Date.now() / 1000) + 3600,
          aud: "authenticated",
          role: "authenticated",
          app_metadata: { provider: "google" },
        }),
      ).toString("base64url"),
        Buffer.from("fixture-signature").toString("base64url"),
    ].join(".");
  }
  const files = new Map<string, { bytes: Buffer; type: string }>();
  const modelCalls: Array<{
    messages: Array<{ role: string; content: string }>;
  }> = [];
  const tables = new Set([
    "organization_members",
    "organizations",
    "documents",
    "data_sources",
    "conversations",
    "messages",
    "chat_requests",
    "document_chunks",
    "query_embeddings",
    "tickets",
    "document_index_jobs",
  ]);
  let queue = Promise.resolve();
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const result = queue.then(fn, fn);
    queue = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  function json(
    response: ServerResponse,
    value: unknown,
    status = 200,
    headers: Record<string, string> = {},
  ) {
    response.writeHead(status, {
      "Content-Type": "application/json",
      ...headers,
    });
    response.end(JSON.stringify(value));
  }
  async function read(request: IncomingMessage) {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
  function identity(request: IncomingMessage) {
    try {
      return JSON.parse(
        Buffer.from(
          (request.headers.authorization ?? "").split(".")[1],
          "base64url",
        ).toString(),
      ).sub as string;
    } catch {
      return null;
    }
  }
  async function handle(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url!, "http://127.0.0.1:" + port);
    const bytes = await read(request);
    const body =
      bytes.length &&
      !request.headers["content-type"]?.startsWith("multipart/") &&
      request.headers["content-type"]?.includes("json")
        ? JSON.parse(bytes.toString())
        : {};
    const uid = identity(request);
    if (url.pathname === "/auth/v1/authorize") {
      response.writeHead(302, {
        Location: appOrigin + "/auth/callback?code=local-pkce-fixture",
      });
      response.end();
      return;
    }
    if (url.pathname === "/auth/v1/token") {
      json(response, {
        access_token: token(owner),
        refresh_token: "fixture-refresh",
        expires_in: 3600,
        token_type: "bearer",
        user: users.get(owner),
      });
      return;
    }
    if (url.pathname === "/auth/v1/user") {
      json(
        response,
        uid && users.has(uid)
          ? users.get(uid)
          : { message: "Not authenticated" },
        uid && users.has(uid) ? 200 : 401,
      );
      return;
    }
    if (url.pathname === "/auth/v1/logout") {
      response.writeHead(204);
      response.end();
      return;
    }
    if (url.pathname === "/deepseek/chat/completions") {
      modelCalls.push(body);
      if (
        body.messages.at(-1)?.content.includes("simulate failure") ||
        body.messages.at(-1)?.content.includes("slow response")
      ) {
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            body.messages.at(-1).content.includes("slow response") ? 2000 : 10,
          ),
        );
        json(
          response,
          { error: { message: "Fixture provider unavailable" } },
          503,
        );
        return;
      }
      const sourceId = /"passageId":"([0-9a-f-]{36})"/.exec(
        body.messages[0].content,
      )?.[1];
      const answer =
        `The documented review process has **two steps**: [[source:${sourceId}]]\n\n1. Submit the change. [[source:${sourceId}]]\n2. A department manager reviews it. [[source:${sourceId}]]\n\n\`\`\`typescript\nconst status = 'review';\n\`\`\`\n\n[[source:${sourceId}]]`;
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      for (let offset = 0; offset < answer.length; offset += 30) {
        if (response.destroyed) return;
        response.write(
          "data: " +
            JSON.stringify({
              id: "fixture-model",
              object: "chat.completion.chunk",
              created: 0,
              model: "deepseek-flash",
              choices: [
                {
                  index: 0,
                  delta: { content: answer.slice(offset, offset + 30) },
                  finish_reason: null,
                },
              ],
            }) +
            "\n\n",
        );
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      response.end(
        "data: " +
          JSON.stringify({
            id: "fixture-model",
            object: "chat.completion.chunk",
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          }) +
          "\n\ndata: [DONE]\n\n",
      );
      return;
    }
    if (url.pathname === "/voyage/embeddings") {
      json(response, {
        data: body.input.map((_: unknown, index: number) => ({
          index,
          embedding: [1, ...Array(1023).fill(0)],
        })),
        usage: { total_tokens: 30 },
        model: "voyage-4-lite",
      });
      return;
    }
    await serial(async () => {
      await db.exec("reset role");
      if (request.headers.apikey === "fixture-service-key")
        await db.exec("set role service_role");
      else if (uid && users.has(uid)) await asUser(db, uid);
      else {
        await db.query("select set_config('request.jwt.claims','{}',false)");
        await db.exec("set role anon");
      }
      if (url.pathname.startsWith("/rest/v1/rpc/")) {
        const name = url.pathname.split("/").at(-1)!;
        if (!/^[a-z_]+$/.test(name)) throw new Error("Unknown fixture RPC");
        const entries = Object.entries(body);
        const parameters = entries.map(([key, value]) =>
          Array.isArray(value) && /^(?:p_passage_ids|p_document_ids)$/.test(key)
            ? `{${value.join(",")}}`
            : typeof value === "object" && value !== null ? JSON.stringify(value) : value);
        if (entries.some(([key]) => !/^[a-z_]+$/.test(key)))
          throw new Error("Unknown fixture parameter");
        const isSet = ["match_document_chunks", "search_knowledge", "knowledge_passage_context", "knowledge_overview"].includes(name);
        const result = await db.query<{ data: unknown }>(
          (isSet ? "select * from public." : "select public.") +
            name +
            "(" +
            entries
              .map(([key], index) => key + " => $" + (index + 1))
              .join(",") +
            (isSet ? ")" : ") as data"),
          parameters,
        );
        if (isSet)
          json(response, result.rows);
        else json(response, result.rows[0]?.data ?? null);
        return;
      }
      if (url.pathname.startsWith("/storage/v1/object/")) {
        const path = decodeURIComponent(
          url.pathname.replace(
            /^\/storage\/v1\/object\/(?:authenticated\/)?support-documents\/?/,
            "",
          ),
        );
        if (request.method === "POST") {
          let data = bytes;
          if (request.headers["content-type"]?.startsWith("multipart/")) {
            const form = await new Request("http://fixture", {
              method: "POST",
              headers: { "Content-Type": request.headers["content-type"] },
              body: new Blob([new Uint8Array(bytes)]),
            }).formData();
            const file = [...form.values()].find(
              (value) => value instanceof File,
            ) as File;
            data = Buffer.from(await file.arrayBuffer());
          }
          await db.query(
            "insert into storage.objects(bucket_id,name) values('support-documents',$1)",
            [path],
          );
          files.set(path, { bytes: data, type: "text/plain" });
          json(response, { Key: "support-documents/" + path });
          return;
        }
        if (request.method === "DELETE") {
          for (const prefix of body.prefixes ?? []) {
            const result = await db.query(
              "delete from storage.objects where bucket_id='support-documents' and name=$1 returning name",
              [prefix],
            );
            if (result.rows.length) files.delete(prefix);
          }
          json(response, []);
          return;
        }
        const permitted = await db.query(
          "select * from storage.objects where bucket_id='support-documents' and name=$1",
          [path],
        );
        if (!permitted.rows.length || !files.has(path)) {
          json(response, { message: "Not found" }, 404);
          return;
        }
        const file = files.get(path)!;
        response.writeHead(200, { "Content-Type": file.type });
        response.end(file.bytes);
        return;
      }
      const table = url.pathname.replace("/rest/v1/", "");
      if (!tables.has(table)) {
        json(
          response,
          { message: "Unknown fixture endpoint", code: "fixture" },
          404,
        );
        return;
      }
      const values: unknown[] = [];
      const conditions: string[] = [];
      for (const [key, filter] of url.searchParams) {
        if (["select", "order", "limit", "offset"].includes(key)) continue;
        if (!/^[a-z_]+$/.test(key))
          throw new Error("Unsupported fixture filter");
        const operator = filter.slice(0, filter.indexOf("."));
        if (operator === "in") {
          const items = filter.slice(3).replace(/^\(|\)$/g, "").split(",");
          const parameters = items.map((item) => { values.push(item.replace(/^"|"$/g, "")); return "$" + values.length; });
          conditions.push('"' + key + '" in (' + parameters.join(",") + ')');
          continue;
        }
        const operators: Record<string, string> = {
          eq: "=",
          neq: "<>",
          gt: ">",
          gte: ">=",
          lt: "<",
          lte: "<=",
        };
        if (!operators[operator])
          throw new Error("Unsupported fixture operator");
        values.push(filter.slice(filter.indexOf(".") + 1));
        conditions.push(
          '"' + key + '"' + operators[operator] + "$" + values.length,
        );
      }
      const where = conditions.length
        ? " where " + conditions.join(" and ")
        : "";
      const select = url.searchParams.get("select") ?? "*";
      let rows: Record<string, unknown>[];
      let count = 0;
      if (request.method === "GET" || request.method === "HEAD") {
        count = Number(
          (
            await db.query<{ count: number }>(
              "select count(*) as count from public." + table + where,
              values,
            )
          ).rows[0].count,
        );
        const order = url.searchParams.get("order");
        const sort = order
          ? " order by " +
            order
              .split(",")
              .map((field) => {
                const [column, direction] = field.split(".");
                if (!/^[a-z_]+$/.test(column))
                  throw new Error("Unsupported order");
                return (
                  '"' + column + '" ' + (direction === "desc" ? "desc" : "asc")
                );
              })
              .join(",")
          : "";
        const limit = Math.min(
            500,
            Number(url.searchParams.get("limit") ?? 500),
          ),
          offset = Number(url.searchParams.get("offset") ?? 0);
        rows = (
          await db.query<Record<string, unknown>>(
            "select * from public." +
              table +
              where +
              sort +
              " limit " +
              limit +
              " offset " +
              offset,
            values,
          )
        ).rows;
        if (
          table === "organization_members" &&
          select.includes("organizations")
        ) {
          for (const row of rows)
            row.organizations = (
              await db.query(
                "select id,name,industry,created_at from organizations where id=$1",
                [row.organization_id],
              )
            ).rows[0];
        } else if (select !== "*") {
          rows = rows.map((row) =>
            Object.fromEntries(select.split(",").map((key) => [key, row[key]])),
          );
        }
      } else if (request.method === "PATCH") {
        const entries = Object.entries(body);
        if (entries.some(([key]) => !/^[a-z_]+$/.test(key)))
          throw new Error("Unsupported fixture update");
        const changes = entries.map(([key, value]) => {
          values.push(value);
          return key + "=$" + values.length;
        });
        rows = (
          await db.query<Record<string, unknown>>(
            "update public." +
              table +
              " set " +
              changes.join(",") +
              where +
              " returning *",
            values,
          )
        ).rows;
      } else if (request.method === "DELETE")
        rows = (
          await db.query<Record<string, unknown>>(
            "delete from public." + table + where + " returning *",
            values,
          )
        ).rows;
      else {
        throw new Error("Unsupported fixture method");
      }
      const singular = String(request.headers.accept).includes(
        "vnd.pgrst.object",
      );
      if (singular && rows.length !== 1) {
        json(
          response,
          {
            code: "PGRST116",
            details: "The result contains " + rows.length + " rows",
            message: "No row",
          },
          406,
        );
        return;
      }
      json(response, singular ? rows[0] : rows, 200, {
        "Content-Range": "0-" + Math.max(0, rows.length - 1) + "/" + count,
      });
    });
  }
  const server = createServer((request, response) => {
    void handle(request, response).catch((error) => {
      console.error("[fixture]", request.url?.split("?")[0], error.message);
      json(
        response,
        { message: error.message, code: error.code ?? "fixture" },
        400,
      );
    });
  });
  await new Promise<void>((resolve) =>
    server.listen(port, "127.0.0.1", resolve),
  );
  return {
    origin: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    db,
    owner,
    colleague,
    outsider,
    org,
    modelCalls,
    token,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await db.close();
    },
  };
}

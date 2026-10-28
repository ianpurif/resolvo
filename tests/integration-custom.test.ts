import assert from "node:assert/strict";
import test from "node:test";
import { customApi, field } from "@/lib/integrations/providers/custom";
import { mcp } from "@/lib/integrations/providers/mcp";
import type { ConnectorContext } from "@/lib/integrations/types";
test("custom REST mapping supports pagination and nested fields without executable expressions", async () => {
  const ctx: ConnectorContext = { config: { baseUrl: "https://api.example.com", listPath: "/list?cursor={cursor}", readPath: "/documents/{id}", itemsPath: "data.rows", nextPath: "next", textPath: "body.text" }, credential: {},
    request: async (url) => ({ status: 200, headers: {}, bytes: Buffer.from(JSON.stringify(url.includes("/list") ? { data: { rows: [{ id: 42, name: "Policy" }] }, next: "second" } : { name: "Policy", body: { text: "The actual provider content for this policy." } })) }) };
  assert.equal((await customApi.list(ctx)).cursor, "second");
  assert.match((await customApi.read(ctx, "42")).text!, /actual provider/);
  assert.throws(() => field({}, "__proto__.password"), /Invalid/);
});
test("MCP negotiates a session, handles SSE and only reads explicitly selected resources", async () => {
  const methods: string[] = [];
  const ctx: ConnectorContext = { config: { endpoint: "https://mcp.example.com" }, credential: { token: "secret" }, request: async (_url, options) => {
    const body = JSON.parse(options!.body!); methods.push(body.method);
    if (body.method !== "initialize") assert.equal(options!.headers!["Mcp-Session-Id"], "session");
    const result = body.method === "initialize" ? { protocolVersion: "2025-06-18", capabilities: { resources: {} } }
      : body.method === "resources/list" ? { resources: [{ uri: "db://policies/1", name: "Policy" }], nextCursor: "next" }
        : { contents: [{ text: "Policy is available from this MCP server." }] };
    return { status: 200, headers: { "mcp-session-id": "session", "content-type": "text/event-stream" }, bytes: Buffer.from(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: body.id, result })}\n\n`) };
  } };
  assert.equal((await mcp.list(ctx)).items[0].id, "db://policies/1");
  assert.match((await mcp.read(ctx, "db://policies/1")).text!, /MCP server/);
  assert.deepEqual(methods, ["initialize", "notifications/initialized", "resources/list", "resources/read"]);
});

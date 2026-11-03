import assert from "node:assert/strict";
import test from "node:test";
import { jira } from "@/lib/integrations/providers/jira";
import type { ConnectorContext } from "@/lib/integrations/types";
test("Jira uses enhanced search pagination and extracts Atlassian document text", async () => {
  const issue = { id: "1", key: "OPS-1", fields: { summary: "Change policy", description: { content: [{ content: [{ text: "Approval is required for releases." }] }] }, updated: "v1" } };
  const ctx: ConnectorContext = { config: { baseUrl: "https://company.atlassian.net", project: "OPS" }, credential: { username: "owner@example.com", password: "test-token" }, request: async (url) => ({ status: 200, headers: {}, bytes: Buffer.from(JSON.stringify(url.includes("/search/jql") ? { issues: [issue], nextPageToken: "next" } : issue)) }) };
  assert.equal((await jira.list(ctx)).cursor, "next");
  assert.match((await jira.read(ctx, "1")).text!, /Approval is required/);
});

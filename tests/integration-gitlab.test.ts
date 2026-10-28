import assert from "node:assert/strict";
import test from "node:test";
import { gitlab } from "@/lib/integrations/providers/gitlab";
import type { ConnectorContext, ConnectorResponse } from "@/lib/integrations/types";
test("GitLab paginates trees, excludes symlinks, and skips unchanged raw downloads", async () => {
  let downloads = 0;
  const ctx: ConnectorContext = { config: {}, credential: { token: "fixture" }, request: async (url, options): Promise<ConnectorResponse> => {
    assert.equal(options?.headers?.["PRIVATE-TOKEN"], "fixture");
    if (options?.method === "HEAD") return { status: 200, headers: { "x-gitlab-content-sha256": "v1" }, bytes: Buffer.alloc(0) };
    if (url.includes("/raw?")) { downloads++; return { status: 200, headers: {}, bytes: Buffer.from("Managers review every submitted change.") }; }
    const data = url.includes("/repository/tree") ? [{ id: "blob", name: "README.md", path: "README.md", type: "blob", mode: "100644" }, { id: "link", name: "secret.txt", path: "secret.txt", type: "blob", mode: "120000" }] : { web_url: "https://gitlab.com/team/project", default_branch: "main" };
    return { status: 200, headers: { link: '<https://gitlab.com/api/v4/projects/1/repository/tree?page_token=next>; rel="next"' }, bytes: Buffer.from(JSON.stringify(data)) };
  } };
  const page = await gitlab.list(ctx, "1|"); assert.equal(page.items.length, 1); assert.ok(page.cursor);
  assert.match((await gitlab.read(ctx, "1|README.md")).text!, /Managers/);
  assert.equal((await gitlab.read(ctx, "1|README.md", "v1")).text, undefined); assert.equal(downloads, 1);
  await assert.rejects(gitlab.list(ctx, "1|", "https://attacker.invalid/"), /outside/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { github } from "@/lib/integrations/providers/github";
import type { ConnectorContext } from "@/lib/integrations/types";
test("GitHub traverses files without following symlinks or executing code", async () => {
  const ctx: ConnectorContext = { config: {}, credential: { token: "read-only" }, request: async (url) => ({ status: 200, headers: {}, bytes: Buffer.from(JSON.stringify(url.includes("README.md")
    ? { type: "file", name: "README.md", path: "README.md", sha: "abc" }
    : [{ type: "file", name: "README.md", path: "README.md", sha: "abc" }, { type: "symlink", name: "secret.txt", path: "secret.txt", sha: "def" }])) }) };
  assert.equal((await github.list(ctx, "owner/repo|")).items.length, 1);
  assert.equal((await github.read(ctx, "owner/repo|README.md", "abc")).text, undefined);
  await assert.rejects(github.list(ctx, undefined, "https://attacker.example"), /outside/);
});

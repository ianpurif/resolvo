import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { evaluationPdf } from "../tests/helpers/evaluation-files";

const pdfRoutes = [
  "knowledge",
  "knowledge/[id]",
  "knowledge/[id]/reindex",
  "integrations/[id]/sync",
  "integrations/worker",
];

async function verify() {
  const root = process.cwd();
  const traces = await Promise.all(pdfRoutes.map(async (route) => {
    const manifest = resolve(root, `.next/server/app/api/${route}/route.js.nft.json`);
    const { files } = JSON.parse(await readFile(manifest, "utf8")) as { files: string[] };
    return new Set(files.map((file) => relative(root, resolve(dirname(manifest), file)))
      .filter((file) => /^node_modules[/\\](?:pdf-parse|pdfjs-dist|@napi-rs[/\\]canvas[^/\\]*)[/\\]/.test(file)));
  }));

  // Run outside the checkout so Node cannot fall back to its full node_modules.
  const base = await realpath(tmpdir());
  const runtime = await mkdtemp(join(base, "resolvo-pdf-bundle-"));
  assert.equal(dirname(runtime), base);
  try {
    for (const file of traces[0]) {
      const destination = join(runtime, file);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(join(root, file), destination);
    }
    const fact = "The fixture warehouse opens at seven in the morning.";
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import assert from 'node:assert/strict';
      import { PDFParse } from 'pdf-parse';
      const parser = new PDFParse({ data: Buffer.from(${JSON.stringify(evaluationPdf(fact).toString("base64"))}, 'base64') });
      try {
        const result = await parser.getText();
        assert.ok(result.pages.some((page) => page.text.includes(${JSON.stringify(fact)})));
      } finally { await parser.destroy(); }
    `], { cwd: runtime, env: { ...process.env, NODE_PATH: "" }, encoding: "utf8", timeout: 30_000 });
    assert.equal(child.status, 0, child.error?.message ?? child.stderr);

    const runtimeFiles = [...traces[0]].filter((file) =>
      file.startsWith(`node_modules${sep}@napi-rs${sep}canvas`) ||
      file.endsWith(`${sep}pdf.worker.mjs`),
    );
    for (const [index, route] of pdfRoutes.entries())
      for (const file of runtimeFiles)
        assert.ok(traces[index].has(file), `/api/${route} is missing ${file}`);
    console.log(`Verified real PDF extraction from traced files and runtime coverage for ${pdfRoutes.length} routes.`);
  } finally {
    await rm(runtime, { recursive: true, force: true });
  }
}

void verify().catch((error) => { console.error(error); process.exitCode = 1; });

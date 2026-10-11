import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EvaluationBudget } from "../scripts/evaluation-budget";

test("provider evaluation enforces one approval across runs, retries and uncertain usage", async () => {
  const directory = await mkdtemp(join(tmpdir(), "resolvo-budget-"));
  const path = join(directory, "budget.json");
  const first = await EvaluationBudget.acquire(path, 1, "development");
  await assert.rejects(EvaluationBudget.acquire(path, 1, "concurrent"), /EEXIST/);
  const completed = await first.reserve("deepseek-flash", 0.4);
  await first.settle(completed, 1000, 1000); // $0.0015 peak usage.
  await first.reserve("voyage-4-lite", 0.8); // Interrupted transport retains its bound.
  await first.close();
  const second = await EvaluationBudget.acquire(path, 1, "holdout");
  assert.equal(second.totalUpperUsd, 0.8015);
  await assert.rejects(second.reserve("deepseek-flash", 0.2), /spending cap/);
  await second.reserve("deepseek-flash", 0.1);
  assert.equal(second.totalUpperUsd, 0.9015);
  await second.close();
  const ledger = JSON.parse(await readFile(path, "utf8"));
  assert.equal(ledger.requests.length, 3);
  assert.equal(ledger.requests[1].settledAt, undefined);
});

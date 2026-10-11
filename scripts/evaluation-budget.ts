import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, writeFile, unlink } from "node:fs/promises";
import { dirname } from "node:path";

type Provider = "voyage-4-lite" | "deepseek-flash";
type Reservation = { id: string; run: string; provider: Provider; reservedUsd: number; costUpperUsd: number;
  createdAt: string; settledAt?: string; inputTokens?: number; outputTokens?: number };

// One ledger covers every run under the same human approval. Requests reserve
// the maximum cost before transport, including retries. Unknown/aborted usage
// retains its reservation. Successful provider usage may lower that bound.
export class EvaluationBudget {
  private entries: Reservation[] = [];
  private writes: Promise<void> = Promise.resolve();
  private constructor(private path: string, private cap: number, private run: string) {}
  static async acquire(path: string, cap: number, run: string) {
    assert.ok(Number.isFinite(cap) && cap > 0);
    await mkdir(dirname(path), { recursive: true });
    const lock = await open(path + ".lock", "wx");
    const budget = new EvaluationBudget(path, cap, run);
    try {
      const stored = await readFile(path, "utf8").catch((error) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (stored) {
        const value = JSON.parse(stored);
        assert.equal(value.approvedCapUsd, cap, "Use the existing total approval cap");
        assert.ok(Array.isArray(value.requests) && value.requests.every((entry: Reservation) => Number.isFinite(entry.costUpperUsd) && entry.costUpperUsd >= 0));
        budget.entries = value.requests;
      }
      await budget.persist();
      await lock.close();
      return budget;
    } catch (error) {
      await lock.close();
      await unlink(path + ".lock");
      throw error;
    }
  }
  get totalUpperUsd() { return this.entries.reduce((n, entry) => n + entry.costUpperUsd, 0); }
  async reserve(provider: Provider, upper: number) {
    await this.writes;
    assert.ok(Number.isFinite(upper) && upper >= 0);
    if (this.totalUpperUsd + upper > this.cap) throw new Error("Approved total evaluation spending cap reached");
    const entry: Reservation = { id: randomUUID(), run: this.run, provider, reservedUsd: upper, costUpperUsd: upper, createdAt: new Date().toISOString() };
    this.entries.push(entry);
    await this.persist();
    return entry.id;
  }
  async settle(id: string, inputTokens: number, outputTokens = 0) {
    if (![inputTokens, outputTokens].every((n) => Number.isSafeInteger(n) && n >= 0)) return;
    const entry = this.entries.find((item) => item.id === id);
    assert.ok(entry);
    const actualUpper = entry.provider === "voyage-4-lite" ? inputTokens * 0.02 / 1_000_000
      : (inputTokens * 0.3 + outputTokens * 1.2) / 1_000_000;
    // Peak cache-miss prices; no credit or off-peak assumptions. Retain the
    // larger value if provider usage unexpectedly exceeds the reservation.
    entry.costUpperUsd = actualUpper;
    entry.inputTokens = inputTokens; entry.outputTokens = outputTokens; entry.settledAt = new Date().toISOString();
    await this.persist();
  }
  private persist() {
    this.writes = this.writes.then(() => writeFile(this.path, JSON.stringify({ approvedCapUsd: this.cap,
      totalCostUpperUsd: this.totalUpperUsd, pricing: "Official 2026-10-11 peak cache-miss token prices; not an invoice", requests: this.entries }, null, 2)));
    return this.writes;
  }
  async close() { await this.writes; await unlink(this.path + ".lock"); }
}

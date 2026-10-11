import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

export async function ragImplementationHash() {
  const files = ["package-lock.json", "lib/auth-context.ts", "lib/ai/model.ts", "lib/ai/graph.ts", "lib/ai/grounding.ts", "lib/ai/citations.ts", "lib/ai/tools/create-ticket.ts",
    ...(await readdir("lib/rag")).filter((f) => f.endsWith(".ts")).map((f) => "lib/rag/" + f),
    ...(await readdir("supabase/migrations")).filter((f) => f.endsWith(".sql")).map((f) => "supabase/migrations/" + f)].sort();
  const hash = createHash("sha256");
  for (const path of files) hash.update(path).update(await readFile(path));
  return hash.digest("hex");
}

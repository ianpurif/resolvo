import {
  embeddings,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSION,
} from "../lib/rag/embeddings";
import { supportModel, SUPPORT_MODEL } from "../lib/ai/model";
import { HumanMessage } from "@langchain/core/messages";
import { requireAIConfiguration } from "../lib/config";
async function main() {
  requireAIConfiguration();
  // Small real provider probes. No customer data is sent and nothing is stored.
  const [document] = await embeddings("document").embedDocuments([
    "Knowledge connection verification: project changes require manager review.",
  ]);
  const query = await embeddings("query").embedQuery(
    "Who reviews project changes?",
  );
  if (
    document.length !== EMBEDDING_DIMENSION ||
    query.length !== EMBEDDING_DIMENSION ||
    ![...document, ...query].every(Number.isFinite)
  )
    throw new Error("Invalid embedding dimensions");
  console.log(
    "PASS " +
      EMBEDDING_MODEL +
      ": real document and query vectors, " +
      EMBEDDING_DIMENSION +
      " dimensions",
  );
  const started = Date.now();
  let firstToken = 0,
    characters = 0;
  for await (const chunk of await supportModel().stream(
    [new HumanMessage("Reply with the words Connection verified.")],
    { signal: AbortSignal.timeout(45000) },
  )) {
    if (chunk.text && !firstToken) firstToken = Date.now() - started;
    characters += chunk.text.length;
  }
  if (!characters) throw new Error("Empty chat provider response");
  console.log(
    "PASS " +
      SUPPORT_MODEL +
      ": real streamed response; first content in " +
      firstToken +
      " ms",
  );
}
main().catch((error) => {
  console.error(
    "Provider verification failed (" +
      (error instanceof Error ? error.name : "unknown") +
      (error && typeof error === "object" && "status" in error
        ? ", HTTP " + error.status
        : "") +
      "). Check provider keys, billing and request limits.",
  );
  process.exitCode = 1;
});

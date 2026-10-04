import "server-only";
import { VoyageEmbeddings } from "@langchain/mongodb";
import { AppError } from "@/lib/config";

export const EMBEDDING_MODEL = "voyage-4-lite";
export const EMBEDDING_DIMENSION = 1024;

export function embeddings(inputType: "document" | "query") {
  if (!process.env.VOYAGE_API_KEY?.trim()) throw new AppError("Connect Voyage AI embeddings to index and search knowledge.", 503);
  return new VoyageEmbeddings({
    apiKey: process.env.VOYAGE_API_KEY,
    modelName: EMBEDDING_MODEL,
    outputDimension: EMBEDDING_DIMENSION,
    outputDtype: "float",
    inputType,
    truncation: false,
    batchSize: 32,
    maxConcurrency: 2,
    maxRetries: 1,
  });
}

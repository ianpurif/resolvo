import "server-only";
import { ZodError } from "zod";
import { apiError } from "@/lib/api";
import { AppError } from "@/lib/config";

export function logKnowledgeFailure(stage: string, error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? error.code : undefined;
  console.error("[knowledge] Request failed", {
    stage,
    type: error instanceof Error ? error.name : "UnknownError",
    code: typeof code === "string" && /^[A-Z0-9_]{2,48}$/.test(code) ? code : undefined,
  });
}

const nextStep = {
  save: "The server couldn't confirm the save. Retry without changing the source. If it fails again, contact your workspace administrator.",
  continue: "Indexing couldn't advance. Open Knowledge again to retry from saved progress.",
  reindex: "Indexing couldn't restart. Check the source's status and try Re-index again.",
};

export function knowledgeApiError(error: unknown, operation: keyof typeof nextStep) {
  if (error instanceof AppError || error instanceof ZodError)
    return apiError(error);
  logKnowledgeFailure(operation, error);
  return apiError(new AppError(nextStep[operation], 500));
}

import { NextResponse } from "next/server";
import { requireSameOrigin } from "@/lib/api";
import { AppError } from "@/lib/config";
import { requireTenant } from "@/lib/auth";
import { requireKnowledgeOwner } from "@/lib/auth-context";
import { ingestPrepared } from "@/lib/rag/ingest";
import { readKnowledgeSource } from "@/lib/rag/read-source";
import { knowledgeApiError } from "@/lib/rag/knowledge-errors";
import { z } from "zod";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const context = await requireTenant();
    requireKnowledgeOwner(context);
    const requestId = z.uuid().safeParse(request.headers.get("Idempotency-Key"));
    if (!requestId.success)
      throw new AppError("Reload Knowledge to start a new save, then try again.", 400);
    const prepared = await readKnowledgeSource(request);
    const document = await ingestPrepared(
      context,
      prepared,
      undefined,
      requestId.data,
    );
    return NextResponse.json(
      { document },
      { status: document.status === "processing" ? 202 : 201 },
    );
  } catch (error) {
    return knowledgeApiError(error, "save");
  }
}

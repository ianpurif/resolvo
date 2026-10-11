import { NextResponse } from "next/server";
import { apiError, requireSameOrigin } from "@/lib/api";
import { requireTenant } from "@/lib/auth";
import { requireKnowledgeOwner } from "@/lib/auth-context";
import { ingestPrepared } from "@/lib/rag/ingest";
import { readKnowledgeSource } from "@/lib/rag/read-source";
import { z } from "zod";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const context = await requireTenant();
    requireKnowledgeOwner(context);
    const prepared = await readKnowledgeSource(request);
    const requestId = z.uuid().parse(request.headers.get("Idempotency-Key"));
    const document = await ingestPrepared(
      context,
      prepared,
      undefined,
      requestId,
    );
    return NextResponse.json(
      { document },
      { status: document.status === "processing" ? 202 : 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}

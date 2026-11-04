import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSameOrigin } from "@/lib/api";
import { requireTenant } from "@/lib/auth";
import { continueIndexing } from "@/lib/rag/index-jobs";
import { knowledgeApiError } from "@/lib/rag/knowledge-errors";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    requireSameOrigin(request);
    const context = await requireTenant();
    const document = await continueIndexing(
      context,
      z.uuid().parse((await params).id),
    );
    return NextResponse.json(
      { document },
      { status: document.status === "processing" ? 202 : 200 },
    );
  } catch (error) {
    return knowledgeApiError(error, "continue");
  }
}

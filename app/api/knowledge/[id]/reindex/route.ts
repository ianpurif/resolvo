import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenant } from "@/lib/auth";
import { apiError, requireSameOrigin } from "@/lib/api";
import { loadDocument, reindexDocument } from "@/lib/rag/ingest";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    requireSameOrigin(request);
    const context = await requireTenant();
    const document = await loadDocument(
      context,
      z.uuid().parse((await params).id),
    );
    const result = await reindexDocument(context, document);
    return NextResponse.json(
      { document: result },
      { status: result.status === "processing" ? 202 : 200 },
    );
  } catch (error) {
    return apiError(error);
  }
}

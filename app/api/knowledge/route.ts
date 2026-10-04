import { NextResponse } from "next/server";
import { apiError, requireSameOrigin } from "@/lib/api";
import { AppError } from "@/lib/config";
import { ingestDocument } from "@/lib/rag/ingest";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("Choose a document to upload.", 400);
    const document = await ingestDocument(file);
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) { return apiError(error); }
}

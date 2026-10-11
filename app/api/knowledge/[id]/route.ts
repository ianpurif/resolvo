import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenant } from "@/lib/auth";
import { apiError, requireSameOrigin } from "@/lib/api";
import { AppError } from "@/lib/config";
import { checkDatabaseError } from "@/lib/supabase/server";
import {
  loadDocument,
  assertTenantFile,
  ingestPrepared,
} from "@/lib/rag/ingest";
import { readKnowledgeSource } from "@/lib/rag/read-source";
import { pendingIndex } from "@/lib/rag/index-jobs";
export const runtime = "nodejs";
export const maxDuration = 120;
type Params = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, { params }: Params) {
  try {
    requireSameOrigin(request);
    const context = await requireTenant();
    const document = await loadDocument(
      context,
      z.uuid().parse((await params).id),
    );
    const prepared = await readKnowledgeSource(request);
    const result = await ingestPrepared(context, prepared, document);
    return NextResponse.json(
      { document: result },
      { status: result.status === "processing" ? 202 : 200 },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function DELETE(request: Request, { params }: Params) {
  try {
    requireSameOrigin(request);
    const context = await requireTenant();
    const document = await loadDocument(
      context,
      z.uuid().parse((await params).id),
    );
    assertTenantFile(context, document.file_path);
    const pending = await pendingIndex(context, document.id);
    // A durable job may outlive a browser tab. Only an active batch lease
    // blocks removal; the source deletion also cascades its checkpoints.
    if (pending?.lease_until && Date.parse(pending.lease_until) > Date.now())
      throw new AppError(
        "An index update is running. Wait for it to finish before deleting.",
        409,
      );
    // Removing the source cascades to its document and vectors in one DB transaction.
    const removed = await context.db
      .from("data_sources")
      .delete()
      .eq("organization_id", context.organization.id)
      .eq("id", document.data_source_id);
    checkDatabaseError(removed.error, "delete this knowledge source");
    const file = await context.db.storage
      .from("support-documents")
      .remove(
        Array.from(
          new Set([
            document.file_path,
            ...(pending ? [pending.file_path] : []),
          ]),
        ),
      );
    if (file.error)
      console.error("[knowledge] Deleted source file cleanup failed");
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return apiError(error);
  }
}

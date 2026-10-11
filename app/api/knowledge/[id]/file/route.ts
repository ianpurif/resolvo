import { z } from "zod";
import { requireTenant } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { AppError } from "@/lib/config";
import { checkDatabaseError } from "@/lib/supabase/server";
import { loadDocument, assertTenantFile } from "@/lib/rag/ingest";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireTenant();
    const document = await loadDocument(
      context,
      z.uuid().parse((await params).id),
    );
    assertTenantFile(context, document.file_path);
    const original = await context.db.storage
      .from("support-documents")
      .download(document.file_path);
    checkDatabaseError(original.error, "download this private file");
    if (!original.data) throw new AppError("File not found.", 404);
    const filename = document.file_path.split("/").at(-1)!;
    return new Response(original.data, {
      headers: {
        "Content-Type": document.mime_type,
        "Content-Disposition":
          "attachment; filename*=UTF-8''" + encodeURIComponent(filename),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

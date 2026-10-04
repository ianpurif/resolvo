import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSameOrigin } from "@/lib/api";
import { AppError } from "@/lib/config";
import { database, checkDatabaseError } from "@/lib/supabase/server";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const id = z.uuid().parse((await params).id);
    const db = database();
    const found = await db.from("documents").select("*").eq("id", id).maybeSingle();
    checkDatabaseError(found.error, "find this document");
    if (!found.data) throw new AppError("This document could not be found.", 404);
    if (found.data.status === "processing" && Date.now() - Date.parse(found.data.created_at) < 300000) throw new AppError("This document is still indexing. Try again shortly.", 409);
    const removed = await db.storage.from("support-documents").remove([found.data.file_path]);
    checkDatabaseError(removed.error, "delete the stored file");
    const deleted = await db.from("documents").delete().eq("id", id);
    checkDatabaseError(deleted.error, "delete this document");
    return NextResponse.json({ deleted: true });
  } catch (error) { return apiError(error); }
}

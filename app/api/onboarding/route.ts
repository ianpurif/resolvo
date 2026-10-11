import { NextResponse } from "next/server";
import { requireIdentity } from "@/lib/auth";
import { workspaceSchema } from "@/lib/validations";
import { apiError, requireSameOrigin } from "@/lib/api";
import { checkDatabaseError } from "@/lib/supabase/server";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const { db } = await requireIdentity();
    const input = workspaceSchema.parse(await request.json());
    const result = await db.rpc("create_workspace", {
      p_name: input.name,
      p_industry: input.industry,
    });
    checkDatabaseError(result.error, "create your company workspace");
    return NextResponse.json({ created: true });
  } catch (error) {
    return apiError(error);
  }
}

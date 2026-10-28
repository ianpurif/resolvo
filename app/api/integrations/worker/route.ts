import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireWorker } from "@/lib/integrations/worker-auth";
import { cleanIntegrationFiles, syncOne } from "@/lib/integrations/sync";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function GET(request: Request) {
  try {
    requireWorker(request); const started = Date.now(); let steps = 0;
    await cleanIntegrationFiles();
    while (Date.now() - started < 45_000 && steps < 40) { if (!await syncOne()) break; steps++; }
    return NextResponse.json({ steps });
  } catch (error) { return apiError(error); }
}
export const POST = GET;

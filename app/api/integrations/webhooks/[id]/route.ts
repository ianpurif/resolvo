import { createHash } from "node:crypto";
import { z } from "zod";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { AppError } from "@/lib/config";
import { integrationDatabase, integrationError } from "@/lib/integrations/database";
import { unseal } from "@/lib/integrations/credentials";
import { verifyWebhook } from "@/lib/integrations/webhook";
import type { Credential } from "@/lib/integrations/types";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = z.uuid().parse((await params).id), db = integrationDatabase();
    if (!request.body) throw new AppError("Empty webhook body.", 400);
    const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
      if (size > 262144) { await reader.cancel(); throw new AppError("Webhook body is too large.", 413); } chunks.push(value); } } finally { reader.releaseLock(); }
    const body = Buffer.concat(chunks).toString("utf8");
    const connection = await db.from("integration_connections").select("organization_id,provider,status").eq("id", id).maybeSingle(); integrationError(connection.error);
    if (!connection.data || connection.data.status === "disconnected") throw new AppError("Webhook not found.", 404);
    const saved = await db.from("integration_credentials").select("ciphertext").eq("connection_id", id).maybeSingle(); integrationError(saved.error);
    if (!saved.data) throw new AppError("Webhook not found.", 404);
    const credential = unseal<Credential>(saved.data.ciphertext, `${connection.data.organization_id}/${id}`);
    if (!credential.webhookSecret) throw new AppError("Webhooks are not enabled for this account.", 404);
    verifyWebhook(body, request.headers, credential.webhookSecret, connection.data.provider);
    const result = await db.rpc("wake_integration", { p_connection: id, p_event: createHash("sha256").update(body).update(request.headers.get("x-resolvo-timestamp") ?? request.headers.get("x-github-delivery") ?? "").digest("hex") });
    integrationError(result.error);
    return NextResponse.json({ accepted: true }, { status: 202 });
  } catch (error) { return apiError(error); }
}

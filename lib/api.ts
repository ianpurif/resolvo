import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./config";

export function apiError(error: unknown) {
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return NextResponse.json({ error: "Check the submitted information and try again." }, { status: 400 });
  }
  if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("[api] Request failed", error instanceof Error ? error.name : "UnknownError");
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  // Next.js can use an internal hostname in Request.url behind its server/proxy.
  // The HTTP Host remains the public authority that the browser requested.
  const host = request.headers.get("host") ?? new URL(request.url).host;
  let originHost: string;
  try { originHost = new URL(origin).host; }
  catch { throw new AppError("This request is not allowed.", 403); }
  if (originHost !== host) throw new AppError("This request is not allowed.", 403);
}

import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, authConfiguration } from "./config";

export function apiError(error: unknown) {
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return NextResponse.json(
      { error: "Check the submitted information and try again." },
      { status: 400 },
    );
  }
  if (error instanceof AppError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  console.error(
    "[api] Request failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return NextResponse.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 },
  );
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== authConfiguration().origin)
    throw new AppError("This request is not allowed.", 403);
}

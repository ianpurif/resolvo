export function friendlyError(error: unknown, fallback: string) {
  if (error instanceof TypeError || error instanceof SyntaxError)
    return fallback;
  return error instanceof Error && error.message ? error.message : fallback;
}

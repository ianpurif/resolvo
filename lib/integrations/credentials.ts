import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AppError } from "@/lib/config";

function key() {
  const value = process.env.INTEGRATION_ENCRYPTION_KEY?.trim() ?? "";
  const bytes = Buffer.from(value, "base64");
  if (bytes.length !== 32 || bytes.toString("base64") !== value)
    throw new AppError("Configure INTEGRATION_ENCRYPTION_KEY with a base64-encoded 32-byte key.", 503);
  return bytes;
}
export function encryptionReady() {
  try { key(); return true; } catch { return false; }
}
export function seal(value: unknown, scope: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(scope));
  const bytes = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), bytes.toString("base64url")].join(".");
}
export function unseal<T>(value: string, scope: string): T {
  const secret = key();
  try {
    const [version, iv, tag, data, extra] = value.split(".");
    if (version !== "v1" || extra || !data) throw new Error();
    const cipher = createDecipheriv("aes-256-gcm", secret, Buffer.from(iv, "base64url"));
    cipher.setAAD(Buffer.from(scope));
    cipher.setAuthTag(Buffer.from(tag, "base64url"));
    return JSON.parse(Buffer.concat([cipher.update(Buffer.from(data, "base64url")), cipher.final()]).toString("utf8")) as T;
  } catch { throw new AppError("The saved integration credential could not be decrypted. Check the encryption key or reconnect.", 503); }
}

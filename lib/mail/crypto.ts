import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// What the server keeps sealed: a person's Microsoft refresh token (work.mail_token) and the sign-in's state cookie.
// AES-256-GCM under MAIL_TOKEN_KEY (32 bytes, base64; Secret Manager): "v1." + base64url(iv | tag | ciphertext). A
// stolen database alone opens nothing; a changed byte fails to open.

const VERSION = "v1.";

function keyOf(raw: string | undefined) {
  const key = Buffer.from(raw?.trim() ?? "", "base64");
  if (key.length !== 32) throw new Error("MAIL_TOKEN_KEY must be 32 bytes, base64-encoded.");
  return key;
}

export function sealWith(rawKey: string | undefined, text: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyOf(rawKey), iv);
  const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return VERSION + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function openWith(rawKey: string | undefined, sealed: string) {
  if (!sealed.startsWith(VERSION)) throw new Error("Unknown sealed value.");
  const raw = Buffer.from(sealed.slice(VERSION.length), "base64url");
  if (raw.length < 28) throw new Error("Sealed value too short.");
  const decipher = createDecipheriv("aes-256-gcm", keyOf(rawKey), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

export const seal = (text: string) => sealWith(process.env.MAIL_TOKEN_KEY, text);
export const open = (sealed: string) => openWith(process.env.MAIL_TOKEN_KEY, sealed);

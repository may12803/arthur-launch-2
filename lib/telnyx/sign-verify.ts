/**
 * sign-verify.ts — Telnyx Ed25519 webhook signature verification.
 * Validates the Telnyx-Signature-Ed25519 header against TELNYX_PUBLIC_KEY.
 * Fails closed: if TELNYX_PUBLIC_KEY is missing → rejects every request.
 *
 * Header format (Telnyx standard):
 *   Telnyx-Signature-Ed25519: <base64-signature>
 *   Telnyx-Timestamp: <unix-seconds>
 *
 * Signed payload = timestamp + "|" + raw body string.
 */

import { createVerify, verify as cryptoVerify } from "crypto";

const ENV_KEY = "TELNYX_PUBLIC_KEY";

/**
 * Returns the raw public key string from env, or null.
 * Exported so tests can stub around it.
 */
export function getTelnyxPublicKey(): string | null {
  return process.env[ENV_KEY] ?? null;
}

/**
 * Verify a Telnyx webhook request.
 *
 * @param rawBody    The raw request body string (before JSON.parse).
 * @param signature  Value of the `Telnyx-Signature-Ed25519` header.
 * @param timestamp  Value of the `Telnyx-Timestamp` header.
 * @returns true if valid, false if invalid or key is missing.
 */
export function verifyTelnyxSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null
): boolean {
  const pubKey = getTelnyxPublicKey();

  // Fail closed: no key → reject everything
  if (!pubKey) {
    console.warn("[telnyx/sign-verify] TELNYX_PUBLIC_KEY not set — rejecting request");
    return false;
  }

  if (!signature || !timestamp) {
    return false;
  }

  // Reject requests with timestamp older than 5 minutes (replay protection)
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
    return false;
  }

  try {
    // Telnyx signs: timestamp + "|" + body (EdDSA — no digest, pure Ed25519)
    const signedPayload = Buffer.from(`${timestamp}|${rawBody}`, "utf8");
    const sigBuffer     = Buffer.from(signature, "base64");

    // Public key may arrive as bare base64 (DER/SPKI) or already PEM
    const pemKey =
      pubKey.includes("BEGIN")
        ? pubKey
        : `-----BEGIN PUBLIC KEY-----\n${pubKey
            .match(/.{1,64}/g)!
            .join("\n")}\n-----END PUBLIC KEY-----`;

    // Use the one-shot crypto.verify (null algorithm = pure EdDSA, works Node 15+)
    return cryptoVerify(null, signedPayload, pemKey, sigBuffer);
  } catch (err) {
    console.error("[telnyx/sign-verify] verification error:", err);
    return false;
  }
}

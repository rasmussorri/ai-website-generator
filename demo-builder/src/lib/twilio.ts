/**
 * Minimal Twilio integration via the REST API — no SDK dependency.
 *
 * `sendSms` runs in DRY-RUN unless all three Twilio env vars are present, so
 * nothing is ever sent until the user explicitly wires up credentials.
 * `validateTwilioSignature` implements Twilio's HMAC-SHA1 scheme so the public
 * inbound webhook can reject forged requests.
 */

import crypto from "crypto";

export type SendMode = "live" | "dry-run";

export interface SendResult {
  sid: string;
  mode: SendMode;
}

const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM = process.env.TWILIO_FROM;

/** True when real credentials are configured and a send would go live. */
export function isLiveSms(): boolean {
  return Boolean(SID && TOKEN && FROM);
}

export async function sendSms({ to, body }: { to: string; body: string }): Promise<SendResult> {
  if (!isLiveSms()) {
    // Dry run: log what would have been sent, return a synthetic SID.
    console.log(`[sms dry-run] → ${to}: ${body}`);
    return { sid: `DRYRUN-${Date.now()}`, mode: "dry-run" };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`;
  const form = new URLSearchParams({ To: to, From: FROM!, Body: body });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${SID}:${TOKEN}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Twilio send failed (${res.status}): ${detail}`);
  }

  const json = (await res.json()) as { sid?: string };
  return { sid: json.sid ?? "unknown", mode: "live" };
}

/**
 * Validate an inbound Twilio webhook request.
 * Twilio signs (full URL + each POST param appended as key+value, sorted by key)
 * with HMAC-SHA1 keyed by the auth token, base64-encoded.
 * See: https://www.twilio.com/docs/usage/security#validating-requests
 */
export function validateTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null
): boolean {
  if (!TOKEN) return false; // can't validate without the token
  if (!signature) return false;

  const data =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");

  const expected = crypto.createHmac("sha1", TOKEN).update(Buffer.from(data, "utf-8")).digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

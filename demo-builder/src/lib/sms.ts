/**
 * SMS outreach helpers: phone normalisation, the Finnish draft template,
 * STOP-keyword detection, and the legal-basis string recorded on every send.
 *
 * No AI here by design — the message is a deterministic template so the
 * compliance log can prove exactly what was (or would be) sent.
 */

import { BRAND, fillTemplate } from "./brand";

/** Finnish Act on Electronic Communication Services — authorisation-by-role exemption. */
export const LEGAL_BASIS =
  "authorisation by role — CEO of company with <10 employees (Finnish Act on Electronic Communication Services, role-based contact exemption)";

/** Inbound reply words (any language/case) that mean "stop texting me". */
export const STOP_KEYWORDS = ["stop", "lopeta", "peruuta", "poista", "unsubscribe"];

export function isStopMessage(body: string | null | undefined): boolean {
  if (!body) return false;
  const first = body.trim().toLowerCase().split(/\s+/)[0] ?? "";
  return STOP_KEYWORDS.includes(first);
}

/**
 * Normalise a Finnish phone number to E.164 (+358…), or return null if it
 * cannot be interpreted as a valid Finnish mobile/landline number.
 * Accepts forms like "040 123 4567", "+358 40 1234567", "358401234567".
 */
export function normalizeFinnishPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Keep digits and a single leading +.
  let s = raw.trim().replace(/[\s\-()./]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2); // 00358… → +358…
  if (s.startsWith("+")) {
    const digits = s.slice(1).replace(/\D/g, "");
    if (digits.startsWith("358") && digits.length >= 11 && digits.length <= 13) {
      return "+" + digits;
    }
    return null;
  }
  const digits = s.replace(/\D/g, "");
  if (digits.startsWith("358") && digits.length >= 11 && digits.length <= 13) {
    return "+" + digits;
  }
  // Domestic form: leading 0, e.g. 0401234567 → +358401234567
  if (digits.startsWith("0") && digits.length >= 9 && digits.length <= 11) {
    return "+358" + digits.slice(1);
  }
  return null;
}

export interface DraftLead {
  company_name: string;
  ceo_name?: string | null;
  demo_url?: string | null;
}

/** The Finnish outreach message (SMS_TEMPLATE, see brand.ts). Only the company and demo URL vary. */
export function buildSmsDraft(lead: DraftLead): string {
  return fillTemplate(BRAND.smsTemplate, { company: lead.company_name, url: lead.demo_url ?? "" });
}

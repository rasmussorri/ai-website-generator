import { BRAND, fillTemplate } from "./brand";

/** Name signing the email — EMAIL_SENDER_NAME kept for existing setups. */
export const EMAIL_SENDER = process.env.EMAIL_SENDER_NAME?.trim() || BRAND.senderName;

export function buildEmailSubject(companyName: string): string {
  return fillTemplate(BRAND.emailSubjectTemplate, { company: companyName, url: "" });
}

/** Plain-text body (EMAIL_BODY_TEMPLATE) — also shown as the preview in the review queue. */
export function buildEmailText(companyName: string, demoUrl: string): string {
  return fillTemplate(BRAND.emailBodyTemplate, { company: companyName, url: demoUrl });
}

/**
 * Builds a plain HTML email that looks like it was sent by a real person —
 * no logo, no banners, no unsubscribe footer block, no CTA buttons.
 */

export function buildEmailHtml(
  companyName: string,
  demoUrl: string,
  gifUrl: string,
  senderName = EMAIL_SENDER
): string {
  const escaped = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // Escape the copy, then turn the demo URL into a link and newlines into <br>.
  const link = `<a href="${escaped(demoUrl)}" style="color:#222222;">${escaped(demoUrl)}</a>`;
  let body = escaped(buildEmailText(companyName, demoUrl));
  if (demoUrl) body = body.split(escaped(demoUrl)).join(link);
  body = body.replace(/\n/g, "<br>\n");

  return `<!DOCTYPE html>
<html lang="fi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <p style="color:#222222;font-size:16px;line-height:1.6;margin:0 0 24px 0;">
      ${body}
    </p>
    <img
      src="${escaped(gifUrl)}"
      alt="Demo preview"
      width="600"
      style="display:block;width:100%;max-width:600px;height:auto;border:none;margin:0 0 24px 0;"
    >
    <p style="color:#222222;font-size:16px;line-height:1.6;margin:0;">
      ${escaped(senderName)}<br>
      <span style="color:#666666;">${escaped(BRAND.agencyWebsite)}</span>
    </p>
  </div>
</body>
</html>`;
}

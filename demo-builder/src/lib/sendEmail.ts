import { Resend } from "resend";
import { buildEmailHtml, buildEmailSubject } from "./emailTemplate";

export async function sendOutreachEmail(
  to: string,
  companyName: string,
  demoUrl: string,
  gifUrl: string
): Promise<{ id: string }> {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM is not set in .env.local");
  const subject = buildEmailSubject(companyName);
  const html = buildEmailHtml(companyName, demoUrl, gifUrl);

  const { data, error } = await resend.emails.send({ from, to, subject, html });
  if (error || !data) {
    throw new Error(error?.message ?? "Resend returned no data");
  }
  return { id: data.id };
}

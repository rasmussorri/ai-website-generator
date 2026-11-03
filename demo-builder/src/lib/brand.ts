/** Configurable branding. Defaults describe a fictional example studio.
 * Templates accept {yritys} (company), {linkki} (URL), and literal \n.
 * Server-only: the demo page passes banner copy to client components as props.
 */
function env(key: string, fallback: string): string {
  const value = process.env[key]?.trim();
  return value ? value.replace(/\\n/g, "\n") : fallback;
}

export const BRAND = {
  senderName: env("SENDER_NAME", "Demo Author"),
  agencyName: env("AGENCY_NAME", "Example Studio"),
  agencyWebsite: env("AGENCY_WEBSITE", "studio.example"),
  smsTemplate: env("SMS_TEMPLATE", "Hei! Tässä esimerkkisivusto yritykselle {yritys}: {linkki}\n-Demo Author, Example Studio"),
  emailSubjectTemplate: env("EMAIL_SUBJECT_TEMPLATE", "{yritys} — esimerkkisivusto"),
  emailBodyTemplate: env("EMAIL_BODY_TEMPLATE", "Hei! Tässä esimerkki yrityksen {yritys} verkkosivustosta:\n{linkki}\nVastaa viestiin, jos haluat keskustella lisää."),
  bannerLabel: env("DEMO_BANNER_LABEL", "Esimerkkisivusto"),
  bannerText: env("DEMO_BANNER_TEXT", "Tämä sivusto havainnollistaa verkkosivujen uudistusta. Example Studio on kuvitteellinen esimerkki."),
};

export function fillTemplate(template: string, vars: { company: string; url: string }): string {
  return template.replaceAll("{yritys}", vars.company).replaceAll("{linkki}", vars.url);
}

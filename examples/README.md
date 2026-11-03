# Fictional examples

Every record here is synthetic. Reserved `.example` domains are placeholders, and phone numbers are blank. No record identifies a customer or a real outreach recipient.

- `sample-leads.csv`: import columns `company_name,ceo_name,url,phone,email,city,industry`. The dashboard asks for a batch name before importing. These URLs are not live scraping targets.
- `demo-content.json`: a complete generated-content object matching `demo-builder/src/data/lead-type.ts`. It can be stored in a test lead's `content` JSONB column, with `has_demo_built = true` and `demo_slug = northstar-workshop`, to preview the renderer in your own test database.
- `portfolio-leads.json`: synthetic database-row fixtures used only by the screenshot/verification harness. They include inbox, built-demo, and funnel states. Timestamps and workflow counts are illustrative.

Original SVG artwork is under `demo-builder/public/images/examples/`. No signature assets are included. The fixture harness is development tooling; it does not add an offline application mode.

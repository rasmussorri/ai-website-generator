# Setup

Use your own database, API keys, sending accounts, and deployment. The repository contains no usable credentials or customer records.

## 1. Local environment

Install Node.js 24 and npm. From the repository root:

```bash
nvm use
cd demo-builder
npm ci
cp .env.example .env.local
```

Puppeteer's install downloads a compatible Chrome. The application uses loopback port 3000 by default. The optional macOS launcher (`npm run setup:app`) creates `Demo Builder.app` on your Desktop; it is not needed to run the app.

## 2. Supabase

Create a new Supabase project and set these values in `demo-builder/.env.local`:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Your project's API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public project key, retained for configuration compatibility |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side database and storage access |
| `SUPABASE_DB_URL` | PostgreSQL connection URI for migrations |

The current server routes use the service-role client. Do not expose that key in browser code or any `NEXT_PUBLIC_` variable. The application does not depend on anonymous table access; configure database access policies for your own project accordingly.

Use a session-capable database connection URI from your project's connection panel, then run:

```bash
npm run migrate
npm run migrate status
```

Migrations create the leads, outreach, suppression, audit, and conversation tables, open-tracking function, and public `lead-images` storage bucket. The runner records applied filenames. The remaining sequence skips `0008`–`0010`, which were private deployment data rewrites; those gaps are intentional.

## 3. AI and branding

Set `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or both. Anthropic takes precedence for text generation and analysis when both are set. Logo/hero vision selection uses OpenAI when available and falls back to scraper heuristics otherwise. The separate signature-generation script also needs OpenAI; signatures are not part of the normal generation pipeline.

Set `SENDER_NAME`, `AGENCY_NAME`, `AGENCY_WEBSITE`, and `OUTREACH_REVIEWER_ID` to your own values. The defaults describe a fictional studio. Copy templates accept `{yritys}` (company name), `{linkki}` (demo URL), and literal `\n` line breaks. The complete variable list is in `.env.example`.

Start the dashboard:

```bash
npm run dev
```

Visit [localhost:3000/dashboard](http://localhost:3000/dashboard). Use a website you control for your first real analysis/generation test. The example CSV can demonstrate import, but its `.example` URLs do not resolve. A generated site is available at its slug on the same local server until public deployment is configured.

## 4. Optional public demo pages on Vercel

Create a **new** Vercel project and set its root directory to `demo-builder`. Deploy through your own GitHub integration or the Vercel CLI. Do not reuse another installation's linked deployment metadata.

Configure these production environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; retain `NEXT_PUBLIC_SUPABASE_ANON_KEY` if using the example configuration.
- `REVALIDATE_SECRET` and `CRON_SECRET`, using separate long random values. Use the same revalidation value locally.
- `DEMO_BANNER_LABEL` and `DEMO_BANNER_TEXT` for the public banner.
- For inbound SMS: `TWILIO_AUTH_TOKEN`, and an AI key if automatic reply classification is desired.

Set local `NEXT_PUBLIC_DEMO_BASE_URL` to your deployment's HTTPS URL before generating shared demos. Local development can use `http://localhost:3000`. A saved `demo_url` belongs to the installation that created it.

On Vercel, middleware returns 404 for `/`, `/dashboard*`, and administrative `/api/*` routes. Its public exceptions are:

| Endpoint | Purpose / gate |
| --- | --- |
| `/api/revalidate` | Cache invalidation; requires `REVALIDATE_SECRET` |
| `/api/sms/inbound` | Twilio webhook; validates signatures when the auth token is configured |
| `/api/track-open` | Browser open beacon, with staff-preview and crawler filtering |
| `/api/cron/cleanup-demos` | Daily cleanup; requires bearer `CRON_SECRET` |

These restrictions are specific to the supplied Vercel configuration. Other hosting environments need equivalent access controls. No hosted dashboard or user-authentication system is supplied.

## 5. Optional email and SMS

**Email:** configure a Resend account, a verified sending domain, `RESEND_API_KEY`, and `EMAIL_FROM`. Set `BLOB_READ_WRITE_TOKEN` for the Vercel Blob store used by scrolling GIF previews. `EMAIL_SENDER_NAME` optionally overrides the signature name. Loading the email queue can capture and upload missing preview GIFs. Approving a card sends the email; missing sending configuration returns an error.

**SMS:** leave `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM` blank for dry-run sending. Set all three for live sending. Configure Twilio's inbound webhook as `https://<your-domain>/api/sms/inbound`; `TWILIO_WEBHOOK_URL` can override the canonical URL used for signature verification. STOP replies populate the suppression list. Review queues require explicit approval and preserve audit records; operators remain responsible for their own outreach configuration and practices.

Use your own contact details for integration tests. Never include contact lists, credentials, or generated customer assets in commits.

## 6. Updates and checks

```bash
git pull --ff-only
cd demo-builder  # omit if already in this directory
npm ci
npm run migrate
npm run lint
npm run typecheck
npm run build
```

Redeploy your own public installation after code or production configuration changes. The app does not run Git, install packages, or deploy itself through a dashboard endpoint.

# Verification

Validated on 3 November 2026 with Node.js 24 and the committed dependency lockfile.

## Checks

- Clean `npm ci`, ESLint, Next.js route type generation, TypeScript, and production build.
- Fixture-backed browser/API checks: dashboard loading and search, fictional demo rendering, mobile width, absence of empty phone links, email queue preview, missing-email-configuration behavior, and unknown-slug 404.
- Deployment restrictions: dashboard and administrative APIs return 404 with `VERCEL=1`; public demo pages remain accessible. Revalidation and cleanup require their configured secrets. Invalid inbound SMS signatures are rejected. The public tracking beacon reaches the fixture RPC.
- Nine retained migrations applied through the actual migration runner to disposable PostgreSQL 18 with a minimal `storage.buckets` schema. A second run applied none. Checks covered bucket creation, uncontacted-lead tracking suppression, email/SMS contact tracking, and reclaimed-demo tracking suppression.
- Publication files and fresh Git history scanned with Gitleaks and exact-match/private-identifier checks. Build output, customer directories, and environment files are excluded from publication.
- Screenshots inspected visually; every example record and image is fictional.

## Reproduce the UI checks

```bash
cd demo-builder
npm ci
npm run lint
npm run typecheck
npm run verify:portfolio
```

The final command builds and starts the real app against a loopback fixture backend on ports 4317/4318, performs browser checks with Puppeteer, refreshes the screenshots and animated example preview, then stops both servers. It explicitly supplies synthetic values for the environment keys and does not use live service credentials. It is development tooling, not an offline product mode. Run `npm run build` with your own configuration again before a real deployment.

The fixture backend implements only the REST queries needed by these checks. It does not replace integration testing against a real Supabase project. The PostgreSQL migration check used a minimal storage-schema fixture rather than Supabase's complete storage service.

No live AI requests, customer scraping, cloud storage uploads, email delivery, SMS delivery, or production deployment are part of these checks. Those integrations require the operator's own accounts and test data.

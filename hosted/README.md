# Private phone build

This is the hosted backend for the next owner-only iPhone test. The working local Node/SQLite app remains unchanged. No local database records or authentication credentials are copied into this build.

## Access and scope

The existing private Site is `appgprj_6af8a4da678881919b1f44a159ed213f`. Reuse that identity; do not create another Site. Its audience must stay owner-only. Sites dispatch supplies the authenticated ChatGPT user ID. Missing identity is rejected before any API or data access. This Worker must not be deployed naked on a public Workers URL, where client-supplied identity headers would not be trustworthy.

Inside that boundary, the owner chooses fictional player, coach, applicant, or admin test personas. A Secure/HttpOnly preference cookie remembers the chosen persona for up to 30 days. It is not an authentication credential: the platform's identity and owner-private access gate remain mandatory on every request. Switching personas is deliberate sandbox functionality. This is not real multi-user marketplace authentication or an invitation system.

Each authenticated owner has an isolated sandbox keyed only by the trusted server identity, never by request JSON or a browser-selected owner ID. Test records persist across devices signed into that same ChatGPT account. The online test starts with fresh fictional data. Use test information only.

## Shared storage

- D1 binding `DB`: one small aggregate per authenticated owner, with a revision compare-and-swap on every mutation. This serializes competing bookings and prevents lost message updates across devices. Conflicts are retried up to eight times; exhausted retries produce a recoverable 409 response.
- R2 binding `BUCKET`: owner-prefixed PNG/JPEG/WebP profile photos. Private photo responses are never cached. Images are capped at 5 MB and checked for matching magic bytes.
- The aggregate is capped at 750 KB, appropriate for a private usability test. A public service needs normalized records, pagination, managed real-user identity, operational controls, and payment/safeguarding integrations. Do not treat this sandbox layout as a production marketplace schema.

The schema-only migration is `migrations/0000_phone_sandboxes.sql`. It must be applied by the hosting workflow before this Worker is published. Request handlers seed data but never create tables. Seed records are fictional and separate for each owner.

## Build and verify

```sh
npm test
npm run build:hosted
```

The build emits `hosted/output/` with a Worker module graph, embedded static assets, the existing Site identity, D1/R2 bindings, and the migration. The public app's familiar UI is reused, but its signup screen becomes an explicit test-persona selector. It uses no API keys, third-party CDNs, new npm dependencies, email/password database, or separate hosted OAuth/session stack.

The original `npm run build`, `npm start`, demo accounts, and local data files are unaffected. `hosted/output` is ignored by Git and can be regenerated.

## Publishing status and resume procedure

On this attempt the hosting source hostname still returned `ENOTFOUND` in the restricted execution environment. Publishing has not succeeded, and no live URL has been verified. The project is still private and unpublished. No billing account, public access, tunnel, or firewall change has been introduced to work around that restriction.

When the supported source connection works:

1. Read the existing Site's current access and get a fresh source write credential.
2. Open its existing source checkout through the official source workflow helper. Keep the existing project ID and owner-only audience.
3. Copy the authored hosted backend, shared validation, public assets, and build command into that checkout. Copy the schema migration into the supported `drizzle/` directory; keep schema history immutable after it is applied.
4. Preserve the manifest identity and set `d1` to `DB`, `r2` to `BUCKET`; omit `static` because this is a Worker deployment.
5. Run the tests and hosted build. Package and push that exact source using the helper, then privately deploy the verified saved version. A build output alone is not evidence of publication.
6. Verify the returned HTTPS URL, then test on real Chrome for iPhone: platform sign-in, each test role, booking, messages, calendar export, photo uploads, reopening after closing Chrome, and Home Screen installation where supported.

## Verification limits

The automated hosted tests execute the Worker handler directly with Web Requests and a SQLite-backed D1 test adapter. They verify owner isolation, missing-identity denial, role enforcement, approval/resubmission, booking, messaging, calendar output, secure persona cookies, CSRF rejection, concurrent updates, and competing confirmations. They do not verify real D1/R2 provisioning, platform header injection, Chrome/iOS behavior, or live HTTPS publication.

# AthleteConnect

A mobile-first coaching app built with vanilla JavaScript, a Node.js HTTP server, and SQLite. No npm dependencies, API keys, Firebase account, or subscription are required to run this version locally. Node 22.13 or newer is required; this version uses Node's built-in `node:sqlite` module, which prints an experimental warning on Node 22.

## Start on Windows

Double-click **Start-AthleteConnect.cmd**. It starts a separate fictional demo database and opens http://127.0.0.1:4173 after the server is ready. Keep the console window open. Press Ctrl+C to stop it. Double-click **Open-in-VSCode.cmd** to open this folder in VS Code, or choose **File → Open Folder** and select this directory.

In VS Code, press F5 and choose **AthleteConnect: demo**. To start manually:

```sh
npm run demo
```

All fictional demo accounts use the password `TrainTogether!2026`:

| Account | Email | Purpose |
| --- | --- | --- |
| Player | player@example.test | Browse, filter, request, cancel, message |
| Approved coach | coach@example.test | Open times, accept requests, add Meet links |
| Admin | admin@example.test | Review coach applications and player profiles |
| Applicant | applicant@example.test | Pending application / resubmission |

Coach profiles are fictional examples, not real people or verified credentials. Sign out and sign in as another role to test both sides. The server remembers demo changes between restarts. If the dates become old, coaches can publish new slots. The demo never modifies the empty app database.

## Try the end-to-end flow

1. Sign in as the player. Open a coach profile, choose a time, and request it.
2. Open Messages and write a message about the session.
3. Sign out; sign in as `coach@example.test`. Accept the request under Sessions.
4. Open Messages and reply. For an accepted virtual session, choose Add Meet link. Create a meeting in Google Meet and paste its real link into the session.
5. Sign back in as the player. The confirmed session has the same Meet link and an Add to calendar download. Calendar exports are UTC `.ics` files, suitable for import into Apple Calendar and other calendar apps.
6. Sign in as the admin to approve the pending application. An unapproved coach cannot publish times. Edits to approved public credentials require another review.

Messages and session changes poll every four seconds while the corresponding page is visible. The browser keeps unsent message drafts during transient network failures. This version does not send emails or mobile notifications.

## Start an empty app

```sh
npm run build
npm start
```

Open http://127.0.0.1:4173. Create separate player and coach accounts. An account role comes from the server; there is no client-side admin signup. To create the first administrator, register a dedicated account without bookings, then run:

```sh
npm run admin -- your-registered-email@example.com
```

Sign out and back in. This command requires filesystem access to the server database. It cannot be invoked by a browser user. Do not promote an existing player or coach with booking history.

Empty app records are in `data/athleteconnect.sqlite`; demo records are in `data/demo.sqlite`. Database files, authentication sessions, images, and local environment files are excluded from Git and build output. Back up the data directory separately with access restricted to the server administrator. Never commit or upload it to a public repository.

## What works

- Email/password signup and login, hashed passwords, expiring HttpOnly sessions, sign-out, server-enforced roles.
- Player setup, adult/minor validation, declared guardian consent and contact details, private profiles, optional photos.
- Coach applications, admin approval/rejection with reason, public profile filtering, and automatic re-review after public credential changes.
- Concrete dated availability in the coach's local timezone; all clients store UTC and display their own timezone.
- Duration-based quotes, requests, atomic acceptance with overlap protection for both coach and player, decline, cancellation, completion after the end time.
- Server-created session IDs and prices; the browser cannot substitute a cheaper quote or another participant.
- Session conversations readable only by their two participants; administrators do not have message access.
- Manual Google Meet links, strict link validation, calendar export, and projected/completed session value.
- Responsive phone navigation, standalone web manifest, generated iPhone icons, and a service worker that never caches private API responses or photos.
- PNG/JPEG/WebP profile photos with ownership checks, magic-byte validation, and a 5 MB limit.

## Current boundaries

This is a working local development app, not a launched marketplace. Email ownership verification, password recovery, Google OAuth, automatic Calendar/Meet provisioning, automated notifications, online checkout, coach payouts, video calling, and verified safeguarding operations are not enabled. No automatic invitation or payment is implied by a confirmed booking.

The user asked to prioritize a free build and allowed alternatives to Firebase. The original HTML/Firebase source was unavailable; the GitHub repository contained a small Flask demo. This implementation is a new Node app, with the legacy Flask files retained in the remote branch. `npm start` is the new entry point; `app.py` is not used.

Specific dated slots intentionally replace a recurring weekly template in this first release, avoiding ambiguous cross-timezone and daylight-saving conversions. Adjacent slots are allowed; overlapping slots are rejected. Multiple players may request one slot, but only one can be confirmed. Acceptance declines conflicting pending requests. Cancelling a confirmed booking makes the future slot requestable again; completed and cancelled session history remains. A slot with history cannot be deleted.

The app records session quotes and completed-session value. These figures are not collected earnings. A public youth service requires verified parental consent, age-appropriate privacy practices, screening, reporting/moderation processes, and appropriate operations beyond a checkbox. Use test information for now. This app does not claim those processes are implemented.

## iPhone plan

The private hosted adapter is now implemented under `hosted/`; run `npm run build:hosted`. It uses platform-protected owner sign-in, separate fictional test roles, shared D1 storage, and private R2 photo storage. The local app and its records remain separate. See [the hosted implementation notes](hosted/README.md) for access boundaries, migration instructions, and publication status. This does not mean a phone URL is live: the supported hosting source connection is still blocked by hostname resolution in the execution environment.

The UI is designed for touch screens from 320px upward, including safe-area padding, a fixed bottom navigation, large touch targets, 16px form controls, and responsive layouts. Browser visual QA and physical iPhone testing remain required.

An iPhone cannot reach this computer through its own `localhost` address. The next delivery step is an HTTPS hosted address pointing to the shared backend. On that address, open Safari → Share → Add to Home Screen → Open as Web App (where offered). The installed app still needs the server for accounts, sessions, and messages. Offline support is limited to the public app shell; bookings are never queued offline.

This web app can later be wrapped for native distribution. There is no App Store build or release in this version. The default development server listens only on loopback; it does not expose private data to your network. Do not expose this development server publicly or add a tunnel as a substitute for a hosted deployment review.

## Production path without locking into Firebase

`server/index.js` contains the HTTP boundary and authorization; `server/database.js` owns persistence; `src/domain.js` holds shared validation; the frontend calls relative `/api` routes. A hosted backend must preserve that API contract. SQLite requires a persistent writable disk and one server process; it must not be placed on ephemeral or static-only hosting. Other viable implementations can replace database access with a hosted SQL service and serve the same API.

Before launch: choose and verify a genuinely suitable free hosting tier; configure an HTTPS origin and Secure cookies; replace email/password with a managed sign-in and recovery flow if desired; provision production data separately; verify backups and monitoring; add payment provider/webhook workflows if collecting payments; finish guardian verification and moderation; test real iPhone Safari and Home Screen login. Firebase is optional, not a prerequisite. Firebase Storage and deployed Functions require a billing-enabled plan, so they are not part of this strictly local zero-cost build.

There are no secrets in the frontend. Future OAuth credentials, payment secrets, or meeting-provider tokens belong only in the server's secret configuration. Do not reuse demo credentials in production.

## Commands and verification

```sh
npm test
npm run build
npm run demo
# or, without fictional data:
npm start
```

`npm test` runs validation and the complete API workflow against isolated in-memory SQLite databases. The API tests invoke the real HTTP request listener in process rather than opening a TCP connection, so they run in restricted execution environments. They verify role escalation prevention, private conversation access, minor flags, authoritative pricing, overlap rejection, approval gates, malicious Meet URLs, photo validation, logout, and CSRF rejection. They do not replace browser or device tests.

`npm run build` checks JavaScript syntax, generates PNG icons, checks the web manifest's icon references, and creates a standalone Node distribution in `dist/`. Run `node dist/server/index.js` to use the build with its own `dist/data` directory. There is no bundler or build-time dependency installation. Shared modules use browser-resolvable ES-module URLs rather than bare npm imports.

`HOST`, `PORT`, `DATABASE_PATH`, and `SECURE_COOKIES` are optional environment settings; see `.env.example`. Node does not load that file automatically. If configuring it, run `node --env-file=.env server/index.js`. Keep `SECURE_COOKIES=0` only for localhost HTTP development. Use `SECURE_COOKIES=1` for hosted HTTPS.

## Project map

| Files | Responsibility | Verify |
| --- | --- | --- |
| `package.json`, scripts, `.vscode/` | Zero-dependency run/build/debug | Build and F5 |
| `public/index.html`, `public/app.js`, `public/styles/main.css` | All player, coach, admin screens | Demo role walkthrough |
| `server/index.js`, `server/database.js` | Accounts, authorization, records, transactions | API tests |
| `src/domain.js` | Profiles, minor consent, slots, pricing, calendar validation | Domain tests |
| `public/manifest.webmanifest`, `public/sw.js`, icons | Home Screen and offline shell | HTTPS phone test after hosting |
| `tests/` | Isolated validation and cross-account regression tests | `npm test` |

## Environment verification for this build

- Node 22.13.1 and npm 10.9.2 were available.
- The build and in-process API/domain tests were run; final results are recorded in the delivery message.
- The execution environment blocked desktop VS Code launch and browser access to its loopback preview server. A browser render, mobile layout screenshots, and physical-device checks have not been claimed as passing.
- Nothing was deployed, no billing service was enabled, no production accounts were created, and no messages or invitations were sent to real people.

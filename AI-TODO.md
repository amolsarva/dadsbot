# AI-TODO — Beta Readiness Backlog

Instructions for an AI agent working on this repo. Read `AGENTS.md` first for repo
conventions, then this file for what to actually do and in what order.

This list came from a full code + running-app review of `d8308c8` (7 Sep 2026). Every
item was reproduced against a local production build driven in a real browser, not
inferred from reading. Long-horizon product ideas live in `ToDoLater.txt`; this file is
only what stands between the app and a safe closed beta.

**Status: not beta ready.** Do not invite a real family until every P0 below is checked.

---

## Rules for agents working this list

1. **Work top-down.** The list is ordered by what unblocks the next thing, not by effort.
   P0-1 and P0-2 gate everything else.
2. **Verify before you claim.** Every task has a "Done when" block with a command or an
   observable outcome. Run it. Paste the real output in the PR. Do not mark a task
   complete because the code looks right.
3. **`npm run ci-check && npm test` must pass before every push.** Four type errors
   reached `main` because nothing enforced this. See P0-6.
4. **Never widen a task.** If you find something new, add it to this file under
   "Found while working" rather than fixing it in an unrelated PR.
5. **Do not delete user data to make a test pass.** This is a memory-preservation
   product. Sessions, transcripts, audio and primers are irreplaceable.
6. **Do not commit secrets.** `.gitignore` already covers `*token*`, `*secret*`, `.env*`,
   `keys.txt`. Check `git diff --staged` before committing.
7. **Do not add a new AI provider, hosting target, or framework** to close any item here.
   Every task below is solvable with what is already in `package.json`.

---

## P0 — Ship blockers

Each of these can end the product. None is more than a day of work.

### P0-1 · Stop publishing every API key to the public internet

`app/api/diagnostics/env/route.ts` enumerates `Object.keys(process.env)` and returns each
one's **raw value**. Curated keys are unmasked (`value: rawValue ?? null`, ~line 565);
unknown keys are swept up wholesale (`value: env[key] ?? null`, ~line 673). No auth, no
redaction. A local run returned 166 variables in plaintext. In production this exposes
`SUPABASE_SERVICE_ROLE_KEY` (bypasses every RLS policy in `docs/conversation-turns-rls.md`),
`GOOGLE_API_KEY`, `OPENAI_API_KEY`, `SENDGRID_API_KEY`.

**Confirmed exploited in production on 7 Sep 2026.** A `curl` against
`dadsbot.vercel.app` returned 73 variables with live values, including
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `GOOGLE_API_KEY`, `OPENAI_API_KEY`,
`SENDGRID_API_KEY`, `VERCEL_DEPLOYMENT_KEY` and `AWS_LAMBDA_METADATA_TOKEN`. The endpoint
had been reachable since the Mar 24 deploy.

- [x] **Rotated 7 Sep 2026** by the account owner: `SUPABASE_SERVICE_ROLE_KEY`,
      `SUPABASE_ANON_KEY`, `GOOGLE_API_KEY`, `OPENAI_API_KEY`, `SENDGRID_API_KEY`.
      Confirmed live on production the same day — see verification below.
- [ ] **A human should still review access logs** for the exposure window (Mar 24 – 7 Sep):
      Supabase → Logs → API, plus OpenAI and Google usage dashboards. Not yet done;
      lower urgency now that the keys are rotated and the leak is closed.
- [x] Replace every `value:` field with presence/shape only. Done in `lib/redact-env.ts`:
      curated keys render as `set (N chars)`, so a truncated paste is still diagnosable
      without disclosure.
- [x] Stop emitting values for keys outside the curated set. `describeUnknownValue` reports
      `set` / `''` / `null` and never the literal.
- [x] The HTML branch reads the same `outcome.value`, so it is covered by the same change.
- [x] Verified against a running server: 179 variables returned, zero raw secrets in the
      body. Regression test in `tests/redact-env.test.ts`.
- [ ] Audit sibling routes for the same leak: `app/api/diagnostics/{route,storage,supabase,session,smoke,hypotheses}.ts`.

**Verified closed on production, 7 Sep 2026:**

```
total: 179 (approx; varies by deploy)
ok     GOOGLE_API_KEY
ok     OPENAI_API_KEY
ok     RESEND_API_KEY
ok     SENDGRID_API_KEY
ok     SUPABASE_ANON_KEY
ok     SUPABASE_SERVICE_ROLE_KEY
ok     VERCEL_DEPLOYMENT_KEY
```

**P0-1 is closed.** Only the access-log review above remains, and it's a should-do, not a
blocker — the exposure window is shut and the keys behind it are rotated.

### P0-2 · Put a door on the app

There is no `middleware.ts`, no session cookie, no auth library, and no check on any
route. A "user account" is a lowercased string in the URL and in `localStorage`
(`lib/user-scope.ts`). `GET /api/users` lists every handle that exists;
`GET /api/history?handle=X` then returns that person's transcripts, summaries and audio
URLs. Two requests from a stranger to someone's family history.

**Implemented, on `claude/beta-auth-gate` (not yet merged).** Design note for whoever
reviews or continues this: the original sketch above proposed binding the session cookie
to one handle. That was dropped after reading `app/page.tsx`'s account switcher — one
browser freely switches between handles and creates new ones client-side
(`availableHandles.map(...)`, `"New user…"`), which is clearly an in-app convenience for
one household sharing a device, not a privilege boundary. Binding the cookie to a single
handle would have broken that. Implemented instead as **one shared gate in front of the
whole app**, with two invite codes:

- [x] `middleware.ts` gates `/`, `/u/:path*`, `/history`, `/settings`, `/diagnostics`,
      `/session/:path*` and all of `/api/:path*` except `/api/auth/*` and `/api/health`.
- [x] `lib/auth.ts` issues a signed (`HMAC-SHA256`, constant-time compare), `httpOnly`,
      `secure`, `sameSite=lax` cookie via `AUTH_SECRET`. No new dependency — Node's
      `crypto.createHmac`/`timingSafeEqual`.
- [x] Two codes, two roles: `BETA_ACCESS_CODE` → `guest` (family, all handles),
      `BETA_OPERATOR_CODE` → `operator`. `GET /api/users` now requires `operator`
      specifically (`OPERATOR_ONLY_PATHS` in `middleware.ts`) — a storyteller's session
      cannot enumerate handles.
- [x] `app/login/page.tsx` + `app/api/auth/{login,logout}/route.ts`. Login has a basic
      per-IP rate limit (20 attempts / 10 min) since brute-forcing the invite code is the
      risk this feature itself introduces; it's in-memory and per-instance, a deterrent
      not a guarantee — fine for a closed beta, revisit if that changes.
- [x] Fails closed: a missing `AUTH_SECRET` makes `verifySessionToken` return null for
      everyone rather than skipping the check.
- [ ] **Not yet done:** an automated test exercising the middleware end-to-end (401 with
      no cookie, 200 with a valid one, 403 for guest on `/api/users`). Manual `curl`
      verification only so far — see below.
- [ ] **Not yet done:** `AUTH_SECRET`, `BETA_ACCESS_CODE`, `BETA_OPERATOR_CODE` need to be
      set in Vercel before this deploys, or every route 401s/redirects for everyone,
      including the family. Coordinate the rollout — don't merge this the same way P0-1
      was merged straight to `main` without a heads-up.

**Done when:** with no cookie, `curl -i "$APP/api/history?handle=anything"` returns 401 and
`curl -i "$APP/api/users"` returns 401. With a `guest` cookie, `/api/users` returns 403;
with an `operator` cookie it returns 200. Manually verified locally with `AUTH_SECRET`,
`BETA_ACCESS_CODE`, `BETA_OPERATOR_CODE` set — command and output recorded in the PR.

### P0-3 · Make destructive operations impossible to trigger by accident

- [ ] `app/api/history/route.ts` — `DELETE` with no `handle` calls `clearAllSessions()`,
      wiping **every user's** sessions. Require an explicit handle; delete the global
      branch entirely. `clearAllSessions` should only be reachable from a script, not HTTP.
- [ ] `app/api/blob/[...path]/route.ts` — `GET`, `PUT` and `DELETE` accept arbitrary
      storage paths with no auth. Anyone can read any family's audio, overwrite a memory
      primer under `memory/primers/`, or delete the archive object by object. Put it behind
      the P0-2 middleware and scope the path to the caller's handle, or replace it with
      signed expiring URLs issued per artifact.
- [ ] `app/history/history-view.tsx:318` — `handleClearAll` fires with no confirmation.
      Add a type-the-handle-to-confirm dialog.
- [ ] Make deletion soft: add `deleted_at` to `public.sessions` in
      `docs/supabase-schema.sql`, filter it out of reads, and keep blobs for 30 days.

**Done when:** `curl -X DELETE "$APP/api/history"` (no handle, valid cookie) returns 400
and deletes nothing. A deleted session is absent from `/api/history` but still present in
the table with `deleted_at` set.

### P0-4 · Fix audio capture — long answers are the product and they currently fail

Three independent ceilings, all of which bite exactly when someone tells a good long story.

- [ ] **Body size.** Audio is base64'd into a JSON field (`app/page.tsx:1453`, and the whole
      session recording at `app/page.tsx:1159-1170` → `/api/save-session-audio`). Vercel caps
      a serverless request body at 4.5 MB and base64 adds 33%. A long interview loses its
      master recording at finalize. Upload directly to Supabase Storage from the browser with
      a signed URL; send the app only the object key.
- [ ] **iOS container mismatch.** `lib/session-recorder.ts:11` negotiates only
      `audio/webm` and `audio/ogg` — no `audio/mp4`, which is what Safari records. Then
      `app/page.tsx:1453` hardcodes `format: 'webm'` regardless of what the recorder chose,
      so Gemini receives mp4 bytes labelled webm. Add `audio/mp4` to `SUPPORTED_MIME_TYPES`
      and pass `recording.mimeType` through instead of the literal.
- [ ] **Function timeout.** No route exports `maxDuration`, so every one runs on the
      platform default. Transcribing a two-minute answer with the primer and digest
      prepended will not reliably finish. Set `maxDuration` explicitly on
      `app/api/ask-audio/route.ts`, `app/api/session/[id]/{intro,turn,finalize}/route.ts`
      and `app/api/finalize-session/route.ts`.
- [ ] **No timeout on the upstream call.** The Gemini `fetch` in `ask-audio` has no
      `AbortController`; a slow upstream hangs until the platform kills the function. Add
      one with a budget below `maxDuration`, and fall back to the existing fallback copy.

**Done when:** a real 20-minute interview recorded **on a physical iPhone** completes,
every turn transcribes, and the session audio artifact exists in storage afterwards. Do
not close this item on a desktop Chrome test.

### P0-5 · Stop burning money on every page view

- [ ] `ServiceStatusGrid` is rendered twice on the Interview tab — `components/tabs/chat-tab.tsx:26`
      and `app/page.tsx:2553`. Delete one. (The duplicate is visible in the UI as two
      SERVICES panels.)
- [ ] The grid pings `/api/diagnostics/google` and `/api/diagnostics/openai` on mount, both
      of which make **real billable model calls**. That is four paid inferences per home
      page view. Replace with a cached server-side check that does not invoke a model, or
      move the grid to `/diagnostics` where an operator asks for it deliberately.
- [ ] `app/api/tts/route.ts` accepts `z.string().min(1)` with no maximum and no auth —
      unbounded OpenAI billing from a single caller. Add `.max(2000)` and put it behind P0-2.
- [ ] There is no rate limiting anywhere in the app. Add a simple per-handle limit on
      `ask-audio`, `tts` and `upload`.

**Done when:** loading `/` fires zero requests to any paid provider (check the network
panel and provider dashboards), and one SERVICES panel renders.

### P0-6 · Make CI the gatekeeper

Four type errors were committed and left on `main` — a missing `useMemo` import, a type
predicate that doesn't narrow, a `null` where `undefined` was needed, a `string` that
should have been a union. They are fixed. The reason they got there is not.

`com.amol.dadsbot-auto-push` commits and pushes whatever is on disk every 60 seconds (see
`AUTO-GIT-INSTRUCTIONS-FOR-AMOL.md`), and `.github/workflows` never runs `ci-check`.

- [ ] Add a workflow running `npm run ci-check && npm test` on every push and PR. Make it a
      required status check on `main`.
- [ ] Teach `/usr/local/bin/push_dadsbot_if_dirty.sh` to run `npm run ci-check` and refuse
      to push on failure. A dirty working tree is better than a broken `main`.
- [ ] Make the tests hermetic. 12 of 30 fail on a clean checkout because they read live
      `SUPABASE_*` env vars — and the failing suite is `tests/data.test.ts`, the
      memory-continuity tests covering the product's central promise. Inject a fake store
      instead of reaching for `process.env`.

**Done when:** `rm -rf node_modules && npm install && npm run ci-check && npm test` passes
from a clean clone with **no env vars set**.

---

## P1 — Fix before the beta widens past a handful of people

### P1-1 · Make the app usable on a phone

The sidebar layout added in `3566a4a` was never made responsive, and mobile is the primary
device for this product. At 390px: the right-hand column overflows the viewport and is
clipped, "Start a conversation to see your story progress across different life topics"
wraps to one word per line, the account chip overlaps the message above it, and the page
scrolls sideways.

- [ ] Collapse `.home-sidebar` / `.home-content` to a single column below ~700px in
      `app/globals.css`. No horizontal page scroll at 320px.
- [ ] The Start control is the primary action for a 75-year-old and is currently
      low-contrast grey text inside a 1px outline. Make it the highest-contrast, largest
      element on the page. Target 4.5:1 minimum, 44px+ touch target.
- [ ] Verify every page at 390×844 and 320×568 before closing.

### P1-2 · Write errors for the storyteller, not the developer

The home screen currently greets a misconfigured deploy with: *"🚫 Startup blocked.
Session initialization failed — diagnostics required. Reason: Session start failed:
TypeError: fetch failed | Table: sessions | Step: list:failure | Set
SUPABASE_SESSIONS_TABLE to the correct Supabase table…"*

- [ ] Every user-facing error gets one plain sentence and one action. Technical detail goes
      to the log and `/diagnostics`, never the hero.
- [ ] Strip `[diagnostic]` console logging from client bundles in production. It currently
      prints env summaries and internal hypotheses to every visitor's browser console.
- [ ] `app/settings/page.tsx` throws when `NEXT_PUBLIC_DEFAULT_NOTIFY_EMAIL` is unset,
      white-screening the route with "Application error: a client-side exception has
      occurred". Add an error boundary and a sensible default.
- [ ] The footer shows "missing — commit message unavailable" to end users. Hide it when
      metadata is absent.

### P1-3 · Separate the operator surface from the consumer surface

The History page shows "History Fixer / Run fixer", "Database Metrics", a raw "Failed to
verify Supabase bucket dadsbot: fetch failed", and "Clear all history". None of these
belong in front of a family.

- [ ] Move the fixer, metrics and storage errors to `/diagnostics`.
- [ ] Gate `/diagnostics`, `/api/diagnostics/*`, `/api/debug/*`, `/api/maintenance` and
      `/api/history/fixer` behind an operator check.
- [ ] `/api/health` returns full stack traces. Make it return `{ok, status}` only and move
      the detail behind the operator gate.

### P1-4 · Prove you cannot lose a story

- [ ] Nightly export of transcripts, manifests and audio to a second location.
- [ ] One rehearsed restore, documented in `docs/`. Untested backups are not backups.
- [ ] Alert when a finalize fails, rather than only logging it.

### P1-5 · Dependencies

- [ ] `npm audit` reports 35 advisories, 2 critical. `next@14.2.5` is a year old and
      carries a cache-poisoning advisory. Upgrade Next and re-run the full E2E path;
      treat this as its own PR.
- [ ] `@sendgrid/mail@7` pulls a vulnerable `axios`. Either upgrade or drop SendGrid —
      `resend` is already a dependency and only one mailer is needed.

---

## P2 — Known to break as soon as more than one family uses this

### P2-1 · Full-corpus in-memory hydration

`lib/data.ts:445` (`hydrateSessionsFromDatabase`) loads **every session for every user**
into a `Map` on `globalThis`. On serverless that runs per cold instance, so cold starts get
slower as the corpus grows, the cache is inconsistent between concurrent instances, and one
process holds every user's transcripts in memory at once. Works for a single-user demo.

- [ ] Scope hydration to the requesting handle, or query per request and cache narrowly.

### P2-2 · Turn integrity in `ask-audio`

`app/api/ask-audio/route.ts` has two paths that corrupt or silently drop a turn:

- [ ] On an unstructured provider response it returns `reply: txt` **and**
      `transcript: txt` — writing the assistant's text into the user's transcript field and
      corrupting the permanent record. Keep the transcript empty rather than wrong.
- [ ] On exception it returns `ok: true` with an empty transcript, so the UI advances and
      the user's turn is lost with no error shown. Return a failure the client can retry.
- [ ] `GOOGLE_API_KEY` is passed as a URL query parameter, so it lands in any upstream
      access log. Send it as the `x-goog-api-key` header instead.

---

## Found while working

Add anything discovered mid-task here rather than expanding a PR. Include file:line and
how you reproduced it.

- _(nothing yet)_

---

## Verification cheat sheet

```bash
npm install
npm run ci-check          # lint + type-check + build — must pass before every push
npm test                  # vitest; must pass with no env vars set (see P0-6)
npm run test:ui           # playwright

# Drive the real app rather than trusting a read:
npm run build && npx next start
# then check /, /history, /settings, /diagnostics, /u/<handle> at 1280x900 and 390x844,
# with the browser console open. Console errors are findings.
```

## What is already good — do not refactor these away

- The system prompt in `app/api/ask-audio/route.ts` is a real interviewing philosophy:
  follow the thread, connect to earlier details, ask concrete answerable questions, match
  emotional tone. It is the most valuable asset in the repo.
- The fallback copy system (`docs/fallback-texts.md` → `lib/fallback-texts.ts`) degrades a
  provider outage into a slightly generic but still warm question instead of an error.
- The per-handle memory primer — re-analysing all sessions into a staged biography after
  each finalize — is the differentiating feature.
- Module boundaries and naming are clean and maintainable.

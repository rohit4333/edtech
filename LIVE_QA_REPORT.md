# Mathify live QA — post-refactor verification

Scope: branch `feat/student-rtc-control-perfection`, baseline `6141357`. Evidence was collected against the real Express API on `127.0.0.1:4000`, the live Supabase project through service-role SQL, and the installed provider SDKs. No mock provider was used in the live checks. No token, API key, secret or raw credential is reproduced here.

## Result

**68/68 live phase checks passed with zero secret values in any HTTP response.** A follow-up security-hardening pass closed seven audit findings (private recordings, recording lifecycle, quota and rate-limit abuse, reset-link origins, and provider attribution) and was re-verified live. The remaining gaps are credential-gated external integrations; each fails closed with an honest error rather than a fabricated success.

## Automated regression suite

- `DATABASE_MODE=mock npm test` → `EXIT=0`, 49 suites including `liveReadiness: 90+ assertions passed`, `alternateAiProviders: 18 assertions passed`, `livekitWebhooks: 26 assertions passed`, `reminderTimezone: 19 assertions passed`, `recordingAccess: 48 assertions passed`, `livekitEgress: fail-closed assertions passed`, `securityHardening: origin, limiter and private-path assertions passed`, `mcpServer: 55 checks`.
- Evidence: `C:/Users/rohit/AppData/Local/Temp/opencode/mathify-test-final8.log` (earlier passes: `mathify-test-final4.log`, `mathify-test-final6.log`, `mathify-test-final7.log`).
- Syntax check: 16 changed JavaScript/module files after the hardening pass, 0 failures.
- `git diff --check`: exit 0 (CRLF normalisation warnings only).
- `npm ci --dry-run --ignore-scripts`: root and server both exit 0. `npm audit --omit=dev --prefix server`: `found 0 vulnerabilities`. Lockfiles contain `freelm` at the root and `livekit-server-sdk`, `freelm`, `resend` in `server/`; `nodemailer` is absent from both. Root and root-lock engines now declare `node >=20` to match `freelm`.

## Live HTTP evidence

| Check | Evidence |
| --- | --- |
| API health | HTTP 200, `database=supabase`, `supabaseConfigured=true`, `realtime=supabase` |
| Trainer and student network gates | HTTP 200, both `ok=true`; 40/25 Mbps and 35/20 Mbps measurements recorded server-side |
| `/api/livekit/token` POST and GET | HTTP 200; `wss://` URL; three-part JWT verified against the server secret; `roomJoin=true`, granted room `mathify-ses_math_001`, `canPublish=true`, `canSubscribe=true` |
| `/api/get-token` alias | Same signed grant and server-derived room |
| Browser room mismatch | HTTP 403, exact code `ROOM_MISMATCH` |
| Founder observer gate | Refused without the opt-in; policy reports `founderObserverRequiresOptIn=true` |
| AI provider chain | `/api/ai/test-ping` HTTP 200, `mode=live`, `requiredSuccesses=2`, `successes=2`; Gemini `PONG`, Groq `PONG`, Cloudflare `EMPTY_RESPONSE`. No provider key appears in the response. |
| AI ping authorization (hardening pass) | Anonymous HTTP 401, trainer HTTP 403, founder HTTP 200 — the quota-spending probe is founder-only |
| Provider attribution (hardening pass) | `/api/generate-feedback` HTTP 200 with a real `provider` value; the chain reports the stage that actually answered, not always `freelm` |
| Trainer chat | HTTP 200, `source=ai`; reply ends with exactly one `Is there anything else I can help you with, or would you like me to connect you with the admin?` |
| Student chat | HTTP 200, `source=ai`, no final answer or option disclosed |
| Unsafe student question | HTTP 200 and the exact safety line `I'm just an AI study buddy, but please tell your parents or your Mathify trainer about this right away!` |
| LiveKit Egress start | HTTP 503, exact code `RECORDING_NOT_CONFIGURED` while storage is absent |
| Egress stop unknown recording | HTTP 404, exact code `RECORDING_NOT_FOUND` |
| Student/non-authenticated Egress controls | HTTP 403 `FORBIDDEN` / HTTP 401 `UNAUTHORIZED` |
| Private recordings (hardening pass) | Student dashboard HTTP 200 with `available` flag and no permanent URL; `permanentUrlPublished=false`; anonymous recording-link HTTP 401; student recording-link HTTP 404 `RECORDING_NOT_READY` |
| Quiz reveal boundary | Student session payload has no `answerIndex`, `answerKey`, `explanation`, `trainerInstructions` or `misconception_watch` |
| Self-practice | 10 questions per batch, topic cap 80, ramps 1.00 → 1.15 (+15%), no answer keys; persisted for one student only |
| Policy contract | Mastery gate 80; Level 1/2/3 bands start 0/40/80; payout ₹300–₹400; committed 100%, unutilised 30%, 12-hour slot cap; 48-hour fine notice; 38-day pack expiry; 24–48-hour reschedule window |
| Role isolation | Trainer/student dashboards mutually refused; trainer/student refused people admin; RM can use the people desk but is refused founder settings/audit; founder can use people desk |
| Password reset | Unknown address returns `requested=true`, `delivered=false`, no development token; invalid address HTTP 422; reset links built from a validated https (or local http) origin, never an allowlist string with commas |
| Booking request | HTTP 201, stored with `email=false`, `slack=false`; no delivery is claimed |
| Razorpay order | HTTP 503 because keys are absent; no order is claimed |
| Signed WhatsApp webhook | Refused (400/401/403) without a valid signature |
| Static surface | `/`, pricing, terms, privacy, refund and contact pages served with the required nav, footer links, TPFF wording and LinkedIn URL; `server/.env` is not public |

Evidence files: `C:/Users/rohit/AppData/Local/Temp/opencode/mathify-live-qa-final3.log`, `mathify-live-qa-final2.log`, `mathify-chat-live4.log`, `mathify-phases-qa-final3.log`, `mathify-phases-qa.log.json` (68 checks, zero leaks), `mathify-egress-live3.log`, `mathify-ai-ping-final.json`. Earlier pass: `mathify-live-qa-final.log`, `mathify-chat-live.log`, `mathify-phases-qa-final.log`, `mathify-egress-live.log`.

## Hardening pass — audit findings closed

1. **Private recordings.** Egress object keys now begin with the session id (`<sessionId>/...`), matching the storage RLS `can_read_recording` contract; the old operator prefix is nested after it. No permanent public URL is stored or serialized. Browsers receive short-lived signed links only through `GET /api/recordings/:sessionId/url`, after session-membership authorization, via `recordingAccessService.js`. Verified live: no permanent URL on the dashboard, 401 anonymous / 404 not-ready on the link route.
2. **Recording lifecycle.** The trainer stops an active Egress on leave, tab hide and session end; `stopSessionRecording` reconciles rows that LiveKit reports as already stopped/completed so a row cannot stay stuck at `status:recording` and block restarts.
3. **Crash-safe start.** The recording row is reserved before LiveKit is contacted; a failed start writes `status:failed` and publishes `recording.failed`, so no successful egress is left untracked.
4. **Quota and rate-limit abuse.** `/api/ai/test-ping` is founder-only (anonymous 401, trainer 403). `rateLimit.js` keys on `req.ip` and never on client-supplied `x-forwarded-for`; Express trusts forwarding headers only when `TRUST_PROXY` is explicitly set to a hop count.
5. **Reset-link origins.** `config.resetOrigin()` validates a single absolute origin; production accepts only https, local http only for localhost, wildcard and allowlist strings never become links. Added `securityHardening.test.js`.
6. **Node engine.** Root `package.json` and `package-lock.json` declare `node >=20`, matching `freelm@^0.5.2`.
7. **Provider attribution.** `cloudflareAiService.js` reports the stage that actually answered through `providerOut`; `freeLmService.js` returns that provider instead of always `freelm`.

## Supabase service-role SQL evidence

- All 37 `public` tables have row-level security enabled.
- 91 policies reference `auth.jwt()->'app_metadata'`; zero policies reference `user_metadata` or `raw_user_meta_data`.
- No `anon` or `authenticated` table grants exist on the audit/storage tables checked (`mathify_records`, `mathify_session_events`, payment/payments, doubt/support logs, `recordings`, escalations, incidents).
- Live QA practice batches: 4 rows, 2 topics, one student id, 10 questions each, ramps 1.00 and 1.15.
- Live verification created recording rows while probing Egress; the successful start/stop demo egress aborted without a file and is not presented as a watchable recording.
- Earlier two-sided record: `ses_math_001` has `trainer_ok=true`, `student_ok=true`, 40 Mbps and 35 Mbps download measurements.

## Deployment evidence and explicit gaps

- `wrangler@3 deploy --dry-run --outdir ...` succeeded: **153.09 KiB / 39.64 KiB gzip**, with `nodejs_compat`, the `[ai]` binding and bundled `freelm`.
- Live Worker deploy was attempted with the existing Cloudflare token and failed: **`No access to the specified resource`** on the Workers Scripts deployment endpoint. The deployed Worker therefore remains unchanged until a token with Workers Scripts edit permission is supplied. The local/Express path uses the same chain and is live-verified.
- LiveKit Egress storage is now configured in `server/.env` (verified by key name only). `LIVEKIT_URL` is a `wss://` client URL; the server now normalizes it to HTTPS before calling the LiveKit API. Recording start/stop reached LiveKit Cloud and returned a real egress id; the demo egress then aborted because the test room had no participant, so no class recording file is claimed yet.
- `RESEND_API_KEY` and `RESEND_FROM` are unset. Email delivery is not claimed; password reset uses the clearly labelled non-production fallback only outside production.
- Razorpay and Twilio credentials are unset; those integrations return explicit blocked errors.

## Preservation checks

TPFF wording `PATENT HOLDER • multiple RESEARCH PAPERS PUBLISHED`, the founder LinkedIn URL, the seven nav items, the five footer policy pages, `§§0–14` with `§1.5`, `§1.6` and `§14 COMPLETENESS COVERAGE ATTESTATION`, the quiz and Level 1/2/3 rules, and the two exact bot lines remain unchanged.

## Class reminders, timezone and LiveKit webhooks

- New automated coverage: `livekitWebhooks.test.js` (26 assertions), `reminderTimezone.test.js` (19 assertions) and `recordingAccess.test.js` (48 assertions). `DATABASE_MODE=mock npm test` now runs **49 suites** with `EXIT=0`.
- Signed webhook proof: the simulator posts a real HS256 JWT with a `sha256` body checksum to `POST /api/webhooks/livekit`. Valid events are accepted, tampered and unsigned events are refused with `401 INVALID_SIGNATURE`, replayed `event.id` values are deduplicated, unknown rooms are ignored, and participant identity/role is rechecked against the session before a presence event is written.
- Webhook presence feeds the verified trainer join state used by the T-2-minute “join now to avoid penalty” warning. A founder observer is never counted as a participant. Egress events update the session’s recording status without a browser-supplied room or egress id.
- Local simulator command: `npm run webhook:test -- --scenario full`. Temporary LiveKit Cloud URL shape: `https://<tunnel-or-domain>/api/webhooks/livekit`. The `wss://` LiveKit media URL is never used as a webhook URL.
- Timezone proof: one absolute UTC instant is stored; India and Saudi viewers render different local times in their own registered IANA zone. Registration rejects invalid zones with `INVALID_TIMEZONE`, and the browser picker uses `Intl.supportedValuesOf('timeZone')` with a fallback list.
- Parent in-app proof: `GET /api/parent/reminders` is parent-only, reloads `childId` from the database, never exposes another student’s class, and builds join links only from the validated server origin. With Resend unset, join email still returns the exact `EMAIL_NOT_CONFIGURED` reason; no delivery is claimed.
- `.github/workflows/ci.yml` reminder cron now uses `RESEND_API_KEY`, `RESEND_FROM`, `APP_ORIGIN`, `ADMIN_EMAIL`, `MATHIFY_TIMEZONE` and `REMINDER_RUN_ONCE`; the old `NODEMAILER_*` variables were removed.
- Safe credential entry: `npm run egress:setup` launches `server/scripts/setup-livekit-egress-env.ps1`, which prompts for S3/R2 settings with hidden access keys and writes quoted values into `server/.env` without printing them. `LIVEKIT_CATALOGUE_URL` and `LIVEKIT_WAREHOUSE_NAME` are stored only for reference; Mathify does not consume them.
- Temporary public development tunnel: `https://respondents-estimates-assess-hindu.trycloudflare.com` → `http://127.0.0.1:4000`. LiveKit dashboard webhook URL: `https://respondents-estimates-assess-hindu.trycloudflare.com/api/webhooks/livekit`. This URL is temporary and changes when the quick tunnel is restarted.
- Live public webhook probe: tunneled `/api/health` HTTP 200 with `database=supabase`; unsigned POST to `/api/webhooks/livekit` HTTP 401; locally signed LiveKit-style POST through the same public URL HTTP 200 with `role=trainer`, `kind=agora_join`, mapped to `ses_math_001`. No secret or raw payload was printed.
- Recording access is role-scoped but available to every operating role: founder and relationship manager may review any class; trainer, student and parent are limited to their own 1:1 session. `GET /api/recordings` lists available recordings; `GET /api/recordings/:sessionId/url` mints a short-lived S3 SigV4 GET link (10 minutes default, 1 hour cap). No permanent URL, bucket name in a browser payload, or secret key is returned.
- Live role probe: founder, RM, trainer, student and parent each received HTTP 200 signed links with `secret_absent=true`; an unrelated student received HTTP 403 `FORBIDDEN`; an anonymous request received HTTP 401. Links were SigV4-signed with `X-Amz-Signature` and a 600-second expiry.
- Presign verification: a temporary canary object was PUT to the private R2 bucket, downloaded through `recordingAccessService.signedUrl()` (HTTP 200, exact body match) and DELETEd (HTTP 204). This proves the signature, path and expiry contract; it is not presented as a class recording.
- Verified `egress_ended` webhooks with `fileResults` write the object key, mark the recording `stopped`, and expose it through the role-scoped link endpoint. An aborted egress with no file is marked `failed` and never becomes watchable.
- A real class recording file still requires a participant in the LiveKit room for the full egress duration. The demo room was empty, so LiveKit aborted the egress and no MP4 is claimed.

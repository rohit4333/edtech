# Mathify live QA — post-refactor verification

Scope: branch `feat/student-rtc-control-perfection`, baseline `6141357`. Evidence was collected against the real Express API on `127.0.0.1:4000`, the live Supabase project through service-role SQL, and the installed provider SDKs. No mock provider was used in the live checks. No token, API key, secret or raw credential is reproduced here.

## Result

**68/68 live phase checks passed with zero secret values in any HTTP response.** The remaining gaps are credential-gated external integrations; each fails closed with an honest error rather than a fabricated success.

## Automated regression suite

- `DATABASE_MODE=mock npm test` → `EXIT=0`, 45 suites including `liveReadiness: 90 assertions passed`, `alternateAiProviders: 18 assertions passed`, `livekitEgress: fail-closed assertions passed`, `mcpServer: 55 checks`.
- Evidence: `C:/Users/rohit/AppData/Local/Temp/opencode/mathify-test-final4.log`.
- Syntax check: 18 changed JavaScript/module files, 0 failures.
- `git diff --check`: exit 0 (CRLF normalisation warnings only).
- `npm ci --dry-run --ignore-scripts`: root and server both exit 0. `npm audit --omit=dev --prefix server`: `found 0 vulnerabilities`. Lockfiles contain `freelm` at the root and `livekit-server-sdk`, `freelm`, `resend` in `server/`; `nodemailer` is absent from both.

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
| Trainer chat | HTTP 200, `source=ai`; reply ends with exactly one `Is there anything else I can help you with, or would you like me to connect you with the admin?` |
| Student chat | HTTP 200, `source=ai`, no final answer or option disclosed |
| Unsafe student question | HTTP 200 and the exact safety line `I'm just an AI study buddy, but please tell your parents or your Mathify trainer about this right away!` |
| LiveKit Egress start | HTTP 503, exact code `RECORDING_NOT_CONFIGURED` while storage is absent |
| Egress stop unknown recording | HTTP 404, exact code `RECORDING_NOT_FOUND` |
| Student/non-authenticated Egress controls | HTTP 403 `FORBIDDEN` / HTTP 401 `UNAUTHORIZED` |
| Quiz reveal boundary | Student session payload has no `answerIndex`, `answerKey`, `explanation`, `trainerInstructions` or `misconception_watch` |
| Self-practice | 10 questions per batch, topic cap 80, ramps 1.00 → 1.15 (+15%), no answer keys; persisted for one student only |
| Policy contract | Mastery gate 80; Level 1/2/3 bands start 0/40/80; payout ₹300–₹400; committed 100%, unutilised 30%, 12-hour slot cap; 48-hour fine notice; 38-day pack expiry; 24–48-hour reschedule window |
| Role isolation | Trainer/student dashboards mutually refused; trainer/student refused people admin; RM can use the people desk but is refused founder settings/audit; founder can use people desk |
| Password reset | Unknown address returns `requested=true`, `delivered=false`, no development token; invalid address HTTP 422 |
| Booking request | HTTP 201, stored with `email=false`, `slack=false`; no delivery is claimed |
| Razorpay order | HTTP 503 because keys are absent; no order is claimed |
| Signed WhatsApp webhook | Refused (400/401/403) without a valid signature |
| Static surface | `/`, pricing, terms, privacy, refund and contact pages served with the required nav, footer links, TPFF wording and LinkedIn URL; `server/.env` is not public |

Evidence files: `C:/Users/rohit/AppData/Local/Temp/opencode/mathify-live-qa-final.log`, `mathify-chat-live.log`, `mathify-phases-qa-final.log`, `mathify-phases-qa.log.json` (68 checks, zero leaks), `mathify-egress-live.log`, `mathify-ai-ping-final.json`.

## Supabase service-role SQL evidence

- All 37 `public` tables have row-level security enabled.
- 91 policies reference `auth.jwt()->'app_metadata'`; zero policies reference `user_metadata` or `raw_user_meta_data`.
- No `anon` or `authenticated` table grants exist on the audit/storage tables checked (`mathify_records`, `mathify_session_events`, payment/payments, doubt/support logs, `recordings`, escalations, incidents).
- Live QA practice batches: 4 rows, 2 topics, one student id, 10 questions each, ramps 1.00 and 1.15.
- `recordings` row count is 0; no fake recording URL is asserted.
- Earlier two-sided record: `ses_math_001` has `trainer_ok=true`, `student_ok=true`, 40 Mbps and 35 Mbps download measurements.

## Deployment evidence and explicit gaps

- `wrangler@3 deploy --dry-run --outdir ...` succeeded: **153.09 KiB / 39.64 KiB gzip**, with `nodejs_compat`, the `[ai]` binding and bundled `freelm`.
- Live Worker deploy was attempted with the existing Cloudflare token and failed: **`No access to the specified resource`** on the Workers Scripts deployment endpoint. The deployed Worker therefore remains unchanged until a token with Workers Scripts edit permission is supplied. The local/Express path uses the same chain and is live-verified.
- `LIVEKIT_EGRESS_BUCKET`, `LIVEKIT_EGRESS_ACCESS_KEY`, `LIVEKIT_EGRESS_SECRET_KEY` and `LIVEKIT_EGRESS_REGION` are unset. Recording routes and trainer buttons fail closed honestly; no recording is claimed.
- `RESEND_API_KEY` and `RESEND_FROM` are unset. Email delivery is not claimed; password reset uses the clearly labelled non-production fallback only outside production.
- Razorpay and Twilio credentials are unset; those integrations return explicit blocked errors.

## Preservation checks

TPFF wording `PATENT HOLDER • multiple RESEARCH PAPERS PUBLISHED`, the founder LinkedIn URL, the seven nav items, the five footer policy pages, `§§0–14` with `§1.5`, `§1.6` and `§14 COMPLETENESS COVERAGE ATTESTATION`, the quiz and Level 1/2/3 rules, and the two exact bot lines remain unchanged.

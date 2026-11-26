# TPFF BLOCKERS — v4.0 external/infra failure register

**Date:** 26 November 2026  
**Version:** v4.0.0 [U+2026-11-26]  
**Rule:** U3 `BLOCKED_EXTERNAL` — do not halt, do not fake success, log exact status/payload, mark the feature `BLOCKED_EXTERNAL` in the canonical file. [ev: TPFF v4.0 update prompt U3, 2026-11-26]

No external provider was contacted by this v4.0 audit pass. Every row below is carried from prior recorded evidence; exact HTTP payloads are quoted only where the prior report recorded them. [ev: TEST_REPORT.md:19-25,242-253; HOWEVER_LOG.md:12,25,28-29, 2026-11-26] VERIFIED.

| ID | Provider / feature | Status | Exact evidence payload or condition | Impact | Owner | Tag | Source |
|---|---|---|---|---|---|---|---|
| B-01 | Cloudflare Workers AI vision — `@cf/llava-hf/llava-v1.6b-34b` | BLOCKED_EXTERNAL | HTTP `400` `No route for that URI` — not available on this account | Requested LLaVA live image chat cannot succeed; configured fallback path is triggered correctly | Student image-chat owner | VERIFIED | [src: TEST_REPORT.md:19]; [src: HOWEVER_LOG.md:12] |
| B-02 | Cloudflare Workers AI vision fallback — `@cf/meta/llama-3.2-11b-vision-instruct` | BLOCKED_EXTERNAL | HTTP `403` `Model Agreement` — one-time Meta license `agree` was not submitted on the user's behalf | No live image chat until the founder explicitly accepts the Meta model agreement | Student image-chat owner | VERIFIED | [src: TEST_REPORT.md:20]; [src: HOWEVER_LOG.md:12] |
| B-03 | Razorpay live payments | BLOCKED_EXTERNAL | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` present but empty; no order, capture or payment made | Exactly-once webhook crediting is code-level and local-test verified only; no live charge proof | Payments/Policy owner | VERIFIED | [src: TEST_REPORT.md:23,243]; [src: server/.env.example:55-58] |
| B-04 | Twilio WhatsApp send | BLOCKED_EXTERNAL | Twilio credentials absent/empty; no message sent | Webhook logic, handoff pause/resume and founder notification are local-test verified; no live SMS proof | Platform/Integrations owner | VERIFIED | [src: TEST_REPORT.md:24,243]; [src: server/.env.example:39-46] |
| B-05 | Supabase live service-role and migration apply | BLOCKED_EXTERNAL | `SUPABASE_URL` / `SUPABASE_SECRET_KEY` unavailable; `DATABASE_URL` + `MATHIFY_MIGRATE_CONFIRM=apply` not set; no live call or apply occurred | Seven SQL files remain review-only; live RLS/policy state and audit writes unverified | Platform/DB operator | VERIFIED | [src: TEST_REPORT.md:6,243]; [src: server/migrations/README.md:28-36]; [ev: node server/migrate.js --dry-run, 2026-11-26] |
| B-06 | Deployed Cloudflare Worker browser chat + Agora live join/webhook | BLOCKED_EXTERNAL | No deployed Worker E2E browser chat; Agora Join not clicked because it would load remote SDK and request camera/microphone; no Agora webhook proof | Text provider call and local token generation passed separately; deployed/browser/live-media behavior remains UNKNOWN | Platform/Integrations owner | VERIFIED | [src: TEST_REPORT.md:21,36,242,244]; [src: HOWEVER_LOG.md:28] |

## Multi-agent audit defects (not `BLOCKED_EXTERNAL`)

These are in-repo defects found by the 10-role audit. They are not external provider failures; they are tracked separately from the six `BLOCKED_EXTERNAL` rows. [ev: E2E_TEST_LOG.md §3–4, 2026-11-26] VERIFIED.

| ID | Severity | Defect | Status | Owner |
|---|---|---|---|---|
| A-01 | HIGH | Founder observer receives a Publisher RTC token and the client publishes local tracks; legacy `GET /api/agora/token` bypasses the explicit observer gate | FIXED — 36 suites pass | Bug Fixer |
| A-02 | HIGH | Live `addSessions` read-modify-write loses one of two concurrent distinct-payment credits | FIXED — atomic pack claim + bounded balance CAS; 33 sessions / two packs under concurrent distinct payments | Bug Fixer |
| A-03 | HIGH | Transient failure after order CAS permanently loses credit and returns false `ALREADY_CREDITED` | FIXED — conditional `uncreditOrderIfCredited` compensation before payment release; replay body unchanged | Bug Fixer |
| A-04 | HIGH | Recording webhook does not await live `db.updateSession` and crashes on the returned Promise | FIXED — async handler awaits write and publish; 400/401/404/503 contracts preserved | Bug Fixer |
| A-05 | MED | Global `/api/realtime/log` exposes unscrubbed cross-session events; live mode serializes a Promise as `{}` | FIXED — single trainer/founder route now awaits reads, filters to caller sessions and scrubs forbidden keys | Bug Fixer |
| A-06 | MED | Session event bridge does not await the async live adapter | FIXED — `await realtime.forSession` before allowlist/scrub | Bug Fixer |
| A-07 | MED | WhatsApp `MessageSid` dedupe is check-then-write, allowing duplicate generations and handoffs | FIXED — `claimWhatsappMessage` atomic live/mock claim; one generation and one escalation per SID | Bug Fixer |
| A-08 | MED | Escalation IDs collide within the same millisecond | FIXED — `sup_` + `crypto.randomUUID()` | Bug Fixer |
| A-09 | LOW | Migration README omits `0008_payment_idempotency.sql` | FIXED — v3.1 docs reconciliation lists 0007 and 0008 as review-only | Docs agent |

## Non-provider gaps (not `BLOCKED_EXTERNAL`)

| ID | Gap | Status | Exact condition | Tag | Source |
|---|---|---|---|---|---|
| G-01 | PR data | UNKNOWN | `gh pr list --state all --repo rohit4333/edtech` failed with `gh auth login` / `GH_EXIT=4` | UNKNOWN | [src: TEST_REPORT.md:243-253]; [ev: gh pr list, 2026-11-26] |
| G-02 | PDF pages 5–17 verbatim policy text | UNKNOWN | Pages were not OCR’d; verbatim policy numbers cannot be quoted | UNKNOWN | [src: TEST_REPORT.md:253]; [src: HOWEVER_LOG.md:29] |
| G-03 | Credential rotation | OPEN | Exposed Cloudflare API token, Supabase secret key and Agora Primary Certificate still require rotation | VERIFIED | [src: TEST_REPORT.md:249]; [src: HOWEVER_LOG.md:14] |

## Stale-completion protection

Subagent drafts are merged only after verifying `git status` and re-running the inventory. A subagent report whose changes are already present in the working tree is treated as stale and is not re-applied. [ev: U4 stale subagent protection, 2026-11-26] VERIFIED.

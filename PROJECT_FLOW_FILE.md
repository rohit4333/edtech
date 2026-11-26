# TOTAL PROJECT FLOW FILE (TPFF) — Mathify Learning OS

## 0. COVER

| Field | Value | Tag | Source |
|---|---|---|---|
| Project | Mathify Learning OS — dashboard website + Express API + Cloudflare Worker | VERIFIED | `[src: package.json:1-5]`, `[src: README.md:1-3]` |
| Branch inspected | `feat/student-rtc-control-permission` | VERIFIED | `[ev: git branch --show-current; git status --short --branch, 2026-11-26]` |
| Commit | `3b9d597766358356d0d2bd9b555cf7a3614de205` (`3b9d597`) — “docs(tpff): v3.0.0 — apply founder rules and complete validated TPFF” | VERIFIED | `[ev: git rev-parse HEAD; git log -1 --format='%h %ad %s' --date=iso-strict, 2026-11-26]` |
| Working tree | Dirty by design: evidence base is `3b9d597`; [U~2026-11-26] v4.0.0 final pre-commit inventory is 206 tracked files and 41/32/9 (`git status --porcelain=v1 --untracked-files=all` = 41 paths: 32 modified tracked + 9 untracked, including `E2E_TEST_LOG.md` and `TPFF_BLOCKERS.md`). Earlier 25/18/7 and 28/19/9 snapshots are preserved in §11 H-25 and are superseded for current state; after this v4.0.0 documentation commit the 9 untracked paths become tracked, but the final commit hash is unknown at authoring time. | VERIFIED | `[ev: git rev-parse HEAD; git ls-files; user-supplied v4.0.0 final pre-commit inventory, 2026-11-26]`; `[src: E2E_TEST_LOG.md:70-82]`; `[src: TPFF_BLOCKERS.md:1-7]` |
| Environment inspected | Local workspace `C:\Users\rohit\OneDrive\Documents\Default Project`; Node runtime `v22.14.0` used for commands; CI pins Node `20`; server package requires Node `>=20` | VERIFIED | `[env: workspace path]`, `[src: .github/workflows/ci.yml:17-22]`, `[src: server/package.json:15-17]` |
| Date of evidence | 2026-11-26 (IST) | VERIFIED | `[ev: Get-Date -Format o, 2026-11-26]` |
| Author | OpenCode assisted (Principal Systems Archivist / Technical Writer / Security Reviewer / QA Lead roles combined) | VERIFIED | `[src: attached TPFF v2.0 specification:8-11]` |
| TPFF version | v4.0.0 [U+2026-11-26] | VERIFIED | `[ev: TPFF_UPDATE_REPORT.md §U0 and §U10, 2026-11-26]` |
| Previous version | v3.1.0, reconciled against `3b9d597766358356d0d2bd9b555cf7a3614de205` [U~2026-11-26] | VERIFIED | `[src: PROJECT_FLOW_FILE.md §1.5 v3.1.0 row]`; `[src: TPFF_UPDATE_REPORT.md §U9, 2026-11-26]` |
| Current commit | Evidence baseline `3b9d597766358356d0d2bd9b555cf7a3614de205` (`3b9d597`); [U~2026-11-26] v4.0.0 final commit hash is `UNKNOWN_AT_AUTHORING_TIME` and must not be invented | VERIFIED | `[ev: git rev-parse HEAD; git log -1 --format='%h %ad %s' --date=iso-strict, 2026-11-26]`; `[src: E2E_TEST_LOG.md:5]` |
| Update mode | PATCH [U~2026-11-26] | VERIFIED | `[ev: TPFF_UPDATE_REPORT.md §U0 and §U10, 2026-11-26]` |
| Update reason | Fold the 10-role multi-agent E2E audit, all fixed A-01…A-09 defects, final 36/36 validation, syntax/dry-run/diff checks and the final 41/32/9 pre-commit inventory into v4.0.0 append-only history [U+2026-11-26] | VERIFIED | `[src: E2E_TEST_LOG.md:14-29,38-53,70-82]`; `[src: TPFF_BLOCKERS.md:18-32]`; `[ev: user-supplied v4.0.0 final pre-commit inventory, 2026-11-26]` |
| Update report | `TPFF_UPDATE_REPORT.md` §U10; question ledger `TPFF_QUESTION_LEDGER.md` §Q5 [U+2026-11-26] | VERIFIED | `[src: TPFF_UPDATE_REPORT.md:§U10]`; `[src: TPFF_QUESTION_LEDGER.md:§Q5]` |
| Generation method | Assisted: four evidence-only subagents + direct read-only commands; no repository files were edited during evidence collection | VERIFIED | `[ev: subagent reports ses_de8cf077effeLcC0iB0umhNqxK, ses_de8cf4243ffeAqVVEoLTiBEX5g, ses_de8cf67daffeKzd1Q5q5K6a0gP, ses_de8ceddd3ffeMomSL7mEkuranZ, 2026-11-26]` |
| Primary deliverable | `PROJECT_FLOW_FILE.md` | VERIFIED | `[src: attached TPFF v2.0 specification:318-323]` |
| Sidecars | `PROJECT_FLOW_INDEX.json`, `KNOWN_UNKNOWNS.md`, `HOWEVER_LOG.md` | VERIFIED | `[src: attached TPFF v2.0 specification:325-332]` |
| Export recipes | `pandoc PROJECT_FLOW_FILE.md -o PROJECT_FLOW_FILE.pdf --toc`; `pandoc PROJECT_FLOW_FILE.md -o PROJECT_FLOW_FILE.docx --toc` | VERIFIED | `[src: attached TPFF v2.0 specification:339-342]` |

**Mandatory opening gate (replayed).**

- VERIFIED — **A. Inputs received:** attached TPFF v2.0 specification (20,555 bytes, `text/plain`), full repo tree via `git ls-files` (206 paths in the v3.1.0 evidence snapshot), all `package.json`/lockfiles/build configs, `server/.env.example` (names only; 45 declared names including `MCP_FOUNDER_TOKEN`), `server/db/schema.sql` + 7 ordered review-only SQL files (`0001`, `0002`, `0003`, `0004`, `0006`, `0007`, `0008`), all router files, all frontend entry surfaces, 36 test files and 36 registered suites, the v3.1.0 full-suite result, CI/Docker/Railway/Render/Worker manifests, git history/branches/remotes, READMEs and prior reports, env-var names only. `[src: attached TPFF v2.0 specification:67-82]`, `[ev: git ls-files; Get-ChildItem -Recurse -Force -Filter '.env*'; npm.cmd test --prefix server; npm.cmd run migrate --silent --prefix server; git status --short, 2026-11-26]`
- VERIFIED — **B. Inputs missing:** live Supabase/Razorpay/Twilio/Agora/Cloudflare deployment state, applied migration state, PR data (`gh` unauthenticated), OCR text for PDF pages 5–17, and credential rotation evidence. Exact closing commands are in §10. `[ev: gh pr list --state all --limit 20 (exit 4, gh not authenticated); supabase --version (not installed); npm.cmd run migrate --silent (dry run only), 2026-11-26]`, `[src: TEST_REPORT.md:243-253]`
- VERIFIED — **C. Access check:** `[CAN PROCEED]` — sufficient repo and command evidence exists for a grounded TPFF; gaps are first-class unknowns rather than invented facts. `[src: attached TPFF v2.0 specification:365-369]`
- VERIFIED — **D. Plan:** evidence was collected in parallel across roles/surfaces, data/state/env, tests/timeline/gaps, and integrations/docs; this file then assembles §0–§13 from cited evidence. Thin sections are live-provider proofs, PR state, OCR policy text, and deployed configuration, all tagged UNKNOWN in §10. `[ev: four evidence subagent reports plus three drafting subagents, 2026-11-26]`

---

## 1. HOW TO READ THIS FILE

- VERIFIED — Every factual row or claim carries exactly one tag: **VERIFIED** (source cited), **INFERRED** (reasoning shown explicitly), or **UNKNOWN** (gap registered in §10). Citations use `[src: path:line]` for files and `[ev: command or output reference, date]` for command evidence. Contradictions are not resolved silently; they are recorded in §11. `[src: attached TPFF v2.0 specification:32-60]`
- VERIFIED — Business truth is strictly 1-on-1: live teaching is “strictly 1-on-1; there are no group classes”; the founder’s privacy boundary is preserved verbatim as `check whether no personal details of trainer or kid visible to each other apart from name only.... as data,,.. no mobile number, no sical media link, nothing, just face / voice/ name/ trainer/wacom activity.. that's it..`; “Max 3 kids” appears only as future chapter-plan language. `[src: README.md:3]`, `[src: PROJECT_GUIDE.md:15,34-36,85,228]`
- VERIFIED — The seven-item public nav is `index.html`, `pricing.html`, `terms.html`, `privacy.html`, `refund.html`, `contact.html`, `contact.html` (Book Demo); the five policy/footer links are required on seven surfaces; dashboard rails use five destinations on trainer/student and six on founder after the Announcements section was added. `[src: server/tests/navContract.test.js:20-36,84-93,128-145]`, `[src: founder/index.html:24-31]`

---

### 1.1 FOUNDER VERBATIM RULES (preserved exactly)

- VERIFIED — V1: `check whether no personal details of trainer or kid visible to each other apart from name only.... as data,,.. no mobile number, no sical media link, nothing, just face / voice/ name/ trainer/wacom activity.. that's it..` `[ev: founder rule supplied verbatim by user, 2026-11-26]`; `[src: PROJECT_GUIDE.md:36]`
- VERIFIED — V2: `personal details should be editable by trainer expcet name and dob or whatever in his kyc documents.. rest he can change... or edit...` `[ev: founder rule supplied verbatim by user, 2026-11-26]`
- VERIFIED — V3: `adhaar and pan and other documnet shoukd be image upload as well as text for card no. input fileds...` `[ev: founder rule supplied verbatim by user, 2026-11-26]`
- VERIFIED — V4: `and accordingly his calendar get booked..` `[ev: founder rule supplied verbatim by user, 2026-11-26]`
- VERIFIED — V5: `exactly 50 min..` `[ev: founder rule supplied verbatim by user, 2026-11-26]`
- VERIFIED — V6: `if yrainer is in session and it took him to like 55 min.. then he will be awarded but as for teacher dashbaord talk the link will be changed.. for next session...` `[ev: founder rule supplied verbatim by user, 2026-11-26]`
- VERIFIED — V7: `i can see everything is in one window, use nav bar feature and adjust everything accordingly... dont make it look like too crowded and all that...` `[ev: founder rule supplied verbatim by user, 2026-11-26]`
- VERIFIED — V8: `new announcements cam be send by fouder. let the founder has power that whether the annaouncment is for trainers only kids only both or individual any of them..` `[ev: founder rule supplied verbatim by user, 2026-11-26]`
- VERIFIED — V9: `the landing page of mathify.com shoudl be graphics heavy and optimised at the same time.. full of animations.. looks like a professional high class standard aesthetic website.. for parents.. as this is the first impresssion for parents...and booking the demo should feel like smoothest drive of thier lifes.....` `[ev: landing request supplied verbatim by user, 2026-11-26]`

---


## 1.5 UPDATE HISTORY (append-only)

| Version | Date | Commit | Mode | Summary |
|---|---|---|---|---|
| v2.0 | 2026-11-26 | `f36321c830f4aa6a9282f7341034841dbfa3194e` | REGEN/CAN PROCEED | Full §§0–13 assembled from evidence-backed drafts; sidecars emitted; landing page rebuilt and verified |
| v3.0.0 | 2026-11-26 | `f36321c830f4aa6a9282f7341034841dbfa3194e` | PATCH | Nine founder rules promoted to first-class axes; update history and question ledger added; landing founder credentials and LinkedIn profile recorded |
| v3.1.0 | 2026-11-26 | `3b9d597766358356d0d2bd9b555cf7a3614de205` | PATCH | Evidence reconciliation: 206 tracked files, 36 suites, 7 review-only SQL files, 59 env names, unified Workers AI strings, read-only founder MCP tools, WhatsApp parent support, student hint lock, async middleware, exactly-once Razorpay credits and Agora ambiguity handling [U+2026-11-26] |
| v4.0.0 | 2026-11-26 | `UNKNOWN_AT_AUTHORING_TIME` (evidence baseline `3b9d597`) | PATCH | Fold in the 10-role E2E audit, A-01…A-09 all FIXED, final 36/36 validation, 136-file syntax sweep, 7-file migration dry run, diff check and the 41/32/9 final pre-commit inventory [U+2026-11-26] |

[VERIFIED] Update mode declared once: **PATCH**. Reason: the section structure remains valid; only the cover, §1, cross-section rule rows and appendices are patched. No prior row was deleted. `[ev: TPFF_UPDATE_REPORT.md §U0–U2, 2026-11-26]`

[VERIFIED] [U+2026-11-26] v3.1.0 is an append-only reconciliation against evidence HEAD `3b9d597` and does not replace the v3.0.0 row above; R1–R9 in §1.1 and §1.6 remain verbatim and are carried forward unchanged. `[ev: git rev-parse HEAD; TPFF_UPDATE_REPORT.md §U9, 2026-11-26]`

[VERIFIED] [U+2026-11-26] v4.0.0 is an append-only PATCH against the same evidence baseline `3b9d597`; the v2.0, v3.0.0 and v3.1.0 rows above are preserved. It adds the 10-role audit trail (`E2E_TEST_LOG.md`), the external/gap register (`TPFF_BLOCKERS.md`), the final validation evidence and the 41/32/9 pre-commit inventory without adding U/H rows or inventing a final commit hash. A-09 was already fixed by the v3.1.0 pass and is recorded, not re-applied. `[src: E2E_TEST_LOG.md:14-29,38-82]`; `[src: TPFF_BLOCKERS.md:18-32]`; `[ev: TPFF_UPDATE_REPORT.md §U10, 2026-11-26]`

---

## 1.6 NEW RULES APPLIED FROM v3.0.0 AND CARRIED INTO v3.1.0 AND v4.0.0

[U~2026-11-26] The nine rules below are the NEW RULES supplied for the v3.0.0 update, restated verbatim and carried unchanged into v3.1.0 and v4.0.0. Each is a first-class interrogation axis: the affected sections carry rule-ID rows and a cross-reference marker immediately after their headings. All nine rules were already present as preserved verbatim rules in v2.0 §1.1; v3.0.0 promoted them from preserved text to applied axes, v3.1.0 preserved the exact rule text while reconciling the evidence snapshot, and v4.0.0 carries them forward while folding in the multi-agent audit. [ev: user-selected NEW RULES R1–R9, 2026-11-26]; `[src: PROJECT_FLOW_FILE.md:§1.1]`; `[ev: TPFF_UPDATE_REPORT.md §U9,§U10, 2026-11-26]`

| Rule | Verbatim NEW RULE | Sections touched | New rows produced (rule ID) | Tag | Source |
|---|---|---|---|---|---|
| R1 | `check whether no personal details of trainer or kid visible to each other apart from name only.... as data,,.. no mobile number, no sical media link, nothing, just face / voice/ name/ trainer/wacom activity.. that's it..` | §2, §4, §5, §6, §7, §8, §9, §11 | R1-A name-only classroom DTO; R1-B student serializer stripping; R1-C realtime payload ban | VERIFIED | `[ev: founder rule R1, 2026-11-26]`; `[src: server/tests/studentSerializer.test.js]`; `[src: server/tests/privacyBoundary.test.js]` |
| R2 | `personal details should be editable by trainer expcet name and dob or whatever in his kyc documents.. rest he can change... or edit...` | §4, §6, §7, §8, §11 | R2-A locked KYC fields; R2-B trainer-editable `personal`/`bank`; R2-C founder correction audit | VERIFIED | `[ev: founder rule R2, 2026-11-26]`; `[src: server/services/trainerOnboardingService.js]`; `[src: server/tests/trainerOnboarding.test.js]` |
| R3 | `adhaar and pan and other documnet shoukd be image upload as well as text for card no. input fileds...` | §5, §6, §7, §9, §10 | R3-A base64 JSON upload route; R3-B 6mb route / 4MB file cap; R3-C private `trainer-kyc` bucket | VERIFIED | `[ev: founder rule R3, 2026-11-26]`; `[src: server/services/trainerDocumentService.js]`; `[src: server/migrations/0006_trainer_onboarding_batches.sql]` |
| R4 | `and accordingly his calendar get booked..` | §5, §6, §7, §8 | R4-A batch allotment writes trainer calendar; R4-B unique RTC channel per booked session | VERIFIED | `[ev: founder rule R4, 2026-11-26]`; `[src: server/services/batchService.js]`; `[src: server/tests/concurrency.test.js]` |
| R5 | `exactly 50 min..` | §4, §6, §7, §8, §12 | R5-A 50 teaching minutes; R5-B 55-minute attendance window; R5-C active-link roll at 50 | VERIFIED | `[ev: founder rule R5, 2026-11-26]`; `[src: server/config/policy.json]`; `[src: server/services/sessionTimingService.js]` |
| R6 | `if yrainer is in session and it took him to like 55 min.. then he will be awarded but as for teacher dashbaord talk the link will be changed.. for next session...` | §4, §6, §7, §8, §11 | R6-A award at 55 with dashboard link changed for next session; R6-B stretch ₹5/full minute 50–55 | VERIFIED | `[ev: founder rule R6, 2026-11-26]`; `[src: server/config/policy.json]`; `[src: server/services/payoutService.js]` |
| R7 | `i can see everything is in one window, use nav bar feature and adjust everything accordingly... dont make it look like too crowded and all that...` | §5, §8, §11 | R7-A five/six-destination dashboard rails; R7-B single-window view switching | VERIFIED | `[ev: founder rule R7, 2026-11-26]`; `[src: server/tests/navContract.test.js]`; `[src: trainer/index.html:142-176]` |
| R8 | `new announcements cam be send by fouder. let the founder has power that whether the annaouncment is for trainers only kids only both or individual any of them..` | §4, §5, §6, §7, §8, §11 | R8-A founder-only authoring; R8-B audience targeting trainer/student/both/individual; R8-C read receipts | VERIFIED | `[ev: founder rule R8, 2026-11-26]`; `[src: server/routes/announcements.js]`; `[src: server/tests/announcements.test.js]` |
| R9 | `the landing page of mathify.com shoudl be graphics heavy and optimised at the same time.. full of animations.. looks like a professional high class standard aesthetic website.. for parents.. as this is the first impresssion for parents...and booking the demo should feel like smoothest drive of thier lifes.....` | §5, §8, §9, §11, §13 | R9-A animation-rich landing assets; R9-B two-step booking with draft recovery; R9-C real `POST /api/contact` | VERIFIED | `[ev: landing request R9, 2026-11-26]`; `[src: landing.css]`; `[src: landing.js]`; `[src: server/routes/contact.js]` |

---

## 2. EXECUTIVE MAP

[VERIFIED] [U+2026-11-26] NEW RULES R1–R9 apply to this section; see §1.6 and `TPFF_UPDATE_REPORT.md` §U3.

| # | Claim | Tag | Source |
|---:|---|---|---|
| 1 | VERIFIED — Mathify is a same-origin vanilla HTML/JS/CSS dashboard suite plus an Express API (`/api`) and an optional Cloudflare Worker for AI chat. Default storage is an in-memory mock; live storage is a service-role Supabase adapter. | VERIFIED | `[src: README.md:9-35]`, `[src: server/app.js:50-104]`, `[src: server/db/index.js:1-12,479-506]` |
| 2 | VERIFIED — Human roles actually present in code are `founder`, `trainer`, `student`, `parent`; `kid` is wording/alias, `guest`/`moderator` are absent, and `admin`/`support` are namespace/capability labels, not roles. | VERIFIED | `[src: server/db/schema.sql:39]`, `[src: server/db/mock.js:20-63]`, `[ev: role token/literal searches, 2026-11-26]` |
| 3 | VERIFIED — 114 router route definitions are present at line start across `server/routes/*.js`; app-level `get/post/use` lines are counted separately (32) and reconciled against actual handlers in §13.e. A reviewed static allowlist covers 11 root files and 10 directory prefixes, including `login.html` and `login/`; the founder MCP server is a separate stdio process with exactly three read-only tools [U+2026-11-26]. | VERIFIED | `[ev: Select-String '^router\.(get|post|put|patch|delete)\(' server/routes/*.js; Select-String '^app\.(get|post|use)\(' server/app.js, 2026-11-26]`, `[src: server/app.js:110-149]`, `[src: server/mcp-server.js:28-54,438-440]` |
| 4 | VERIFIED — 32 canonical tables, 7 ordered review-only SQL files (`0001`, `0002`, `0003`, `0004`, `0006`, `0007`, `0008`), service-only `mathify_records`/`mathify_session_events` stores, strict answer-key column revokes, student-view hint removal and payment-idempotency guards define the data boundary. Parent chat and announcements intentionally use service-only records with no SQL migration [U+2026-11-26]. | VERIFIED | `[src: server/db/schema.sql:23-1424,629-645]`, `[src: server/migrations/0007_student_hint_lockdown.sql:10-31]`, `[src: server/migrations/0008_payment_idempotency.sql:15-53]`, `[ev: npm.cmd run migrate --silent --prefix server, 2026-11-26]` |
| 5 | VERIFIED — 36/36 chained suites pass with exit 0; [U~2026-11-26] final validation reports `chatWorker: 110`, `mcpServer: 55 checks`, `chatAssistant: 63`, `livePersistence: 54`, `agoraRoutes: 60`, `sessionPolicy: 37`, `rtcControls: 46`, `razorpayWebhook: all exactly-once assertions passed` and `apiSmoke: passed`; the 7-SQL-file dry run passes without contacting a database. Earlier `livePersistence: 43` and `agoraRoutes: 35` figures are historical v3.1.0 snapshots preserved in §12. | VERIFIED | `[src: E2E_TEST_LOG.md:76-79]`; `[ev: npm.cmd test --prefix server; node server/migrate.js --dry-run, 2026-11-26]`; `[src: server/package.json:13]` |

**Five highest-risk areas.**

| Risk | Why it matters | Tag | Source |
|---|---|---|---|
| Exposed credentials + no live migration | Cloudflare token, Supabase secret key and Agora Primary Certificate require rotation; live RLS/apply state is unverified. | VERIFIED | `[src: TEST_REPORT.md:249,251]`, `[src: PROJECT_GUIDE.md:380,394]` |
| Cross-role privacy boundary | Trainer-only fields, answer keys, hints, correctness, session ids and contact data must never reach student/parent clients or realtime events. | VERIFIED | `[src: server/routes/student.js:20-33]`, `[src: server/routes/sessions.js:46-56,93-105]`, `[src: worker-core.mjs:4-7,59-92]` |
| AI model/agreement drift | Cloudflare Workers AI is the only AI provider: text is pinned to `@cf/meta/llama-3.1-8b-instruct`, vision to `@cf/llava-hf/llava-v1.6b-34b`, with the exact suffix `CRITICAL: Return ONLY valid JSON. No markdown, no explanations.`; no DeepSeek/OpenAI model is used. `TEXT_MODEL` remains an ignored variable, vision licensing is unresolved and no deployed Worker E2E chat is verified [U+2026-11-26]. | VERIFIED | `[src: worker-core.mjs:9-12]`, `[src: worker.js:135-141]`, `[src: wrangler.toml:20-29]`, `[src: TEST_REPORT.md:18-20,36]` |
| Payment/webhook integrity | Razorpay keys are empty locally and live capture was blocked; exactly-once crediting and replay response `ALREADY_CREDITED` are code- and test-level facts only. The pack remains `540 SAR / 12 sessions` [U+2026-11-26]. | VERIFIED | `[src: server/routes/razorpay.js:86-158]`, `[src: worker-core.mjs:20]`, `[src: pricing.html:49-66]`, `[src: TEST_REPORT.md:23,232,243]` |
| Partial product surfaces | Founder settings are runtime drafts; LMS publish/pack import disabled; self-serve trainer access and student registration are roadmap only. | VERIFIED | `[src: TEST_REPORT.md:218-224,252]`, `[src: README.md:81-85]` |
| Uncommitted in-flight surface expansion | KYC image uploads, batch allotment, weekly calendar, nav-driven views, founder announcements, MCP, WhatsApp parent support, hint lock and exactly-once payment guards are implemented and locally tested but not committed, not deployed and not live-provider verified; the evidence snapshot remains dirty against `3b9d597` [U+2026-11-26]. | VERIFIED | `[ev: git rev-parse HEAD; npm.cmd test --prefix server, 2026-11-26]`, `[src: server/services/announcementService.js:1-120]` |
| Parallel-room isolation | Realtime channels, presence events, reactions, media permissions and event retention are keyed by session; batch writes are serialized, overlapping bookings rejected, retries idempotent, and every session owns an Agora channel. A 60-check suite exercises four simultaneous trainer/student rooms; middleware now awaits `db.findSession`, but horizontal scaling and live Supabase parallelism remain UNKNOWN [U+2026-11-26]. | VERIFIED | `[src: server/services/batchService.js:1-260]`, `[src: server/db/index.js:6-16,307-360]`, `[src: server/middleware/auth.js:49,98-103]`, `[src: server/tests/concurrency.test.js:1-200]`, `[ev: npm.cmd test --prefix server, 2026-11-26]` |
| New private-data surfaces | Trainer KYC documents and founder announcement targeting are service-role-only records; a mistaken Data API grant or client-side echo would expose identity documents or individual targeting. Student quiz hints are removed from the safe view and revoked from `authenticated`; founder MCP access requires `MCP_FOUNDER_TOKEN` and exposes only three read-only tools [U+2026-11-26]. | VERIFIED | `[src: server/migrations/0006_trainer_onboarding_batches.sql:5-18]`, `[src: server/db/schema.sql:629-645]`, `[src: server/migrations/0007_student_hint_lockdown.sql:10-31]`, `[src: server/mcp-server.js:28-54,96,520]`, `[src: server/tests/announcements.test.js:90-112]` |
| Founder MCP read-only boundary | `server/mcp-server.js` exposes exactly `get_trainer_payout`, `get_student_mastery` and `get_trainer_attendance`; every response carries `readOnly: true` and `executed: false`, proposals carry `dryRun: true` and `requiresFounderApproval: true`, and startup refuses without `MCP_FOUNDER_TOKEN`; no write tool is exposed [U+2026-11-26]. | VERIFIED | `[src: server/mcp-server.js:28-54,96,150-152,210-212,276-278,401-403,438-440,520]` |
| WhatsApp parent support completion | The parent assistant builds pseudonymous progress context, drafts progress replies, proposes payment links without creating an order, supports rescheduling policy answers, performs deterministic human handoff with bot pause/resume and preserves founder notification plus signature verification/dedupe [U+2026-11-26]. | VERIFIED | `[src: server/services/whatsappAiService.js:24-35,233-245,266-311,379,409,444-503]`, `[src: server/routes/webhooks.js:85-155]` |

**Five biggest unknowns.**

| Unknown | Tag | Source |
|---|---|---|
| Live DB applied state / RLS rows | UNKNOWN (§10 U01) | `[src: server/migrations/README.md:41-49]`, `[ev: npm.cmd run migrate --silent, 2026-11-26]` |
| Deployed env values and actual provider configuration | UNKNOWN (§10 U02) | `[src: render.yaml:10-58]`, `[src: railway.json:1-10]`, `[src: wrangler.toml:3-29]` |
| Deployed Worker end-to-end browser chat | UNKNOWN (§10 U05) | `[src: TEST_REPORT.md:36]` |
| PDF pages 5–17 verbatim policy text | UNKNOWN (§10 U07) | `[src: TEST_REPORT.md:253]` |
| Founder settings persistence decision | UNKNOWN (§10 U08) | `[src: TEST_REPORT.md:252]` |

---

## 3. PROVENANCE TABLE

[VERIFIED] [U+2026-11-26] NEW RULES R1–R9 apply to this section; see §1.6 and `TPFF_UPDATE_REPORT.md` §U3.

| Claim family | Exact source(s) | Tag | Source |
|---|---|---|---|
| Repo identity, branch, commit, tree count | `git branch --show-current`, `git rev-parse HEAD`, `git status`, `git ls-files` | VERIFIED | `[ev: git commands, 2026-11-26]` |
| Roles and role gates | `server/db/schema.sql`, `server/auth/token.js`, `server/middleware/auth.js`, `server/routes/auth.js`, `server/db/mock.js`, role-token searches | VERIFIED | `[src: server/db/schema.sql:29-41]`, `[src: server/middleware/auth.js:5-102]`, `[ev: role searches, 2026-11-26]` |
| Routes and static surfaces | all `server/routes/*.js`, `server/app.js`; added weekly schedule and announcement routes | VERIFIED | `[ev: router/app route enumeration, 2026-11-26]`, `[src: server/app.js:50-104]`, `[src: server/routes/announcements.js:1-49]` |
| DB schema and migrations | `server/db/schema.sql`, 7 ordered review-only SQL files (`0001`, `0002`, `0003`, `0004`, `0006`, `0007`, `0008`), `server/migrate.js`, migration README | VERIFIED | `[src: server/db/schema.sql:23-1424,629-645]`, `[src: server/migrations/0007_student_hint_lockdown.sql:10-31]`, `[src: server/migrations/0008_payment_idempotency.sql:15-53]`, `[src: server/migrations/README.md:1-51]`, `[ev: npm.cmd run migrate --silent --prefix server, 2026-11-26]` |
| State machines | schema enums, trainer/student/session routes, service implementations | VERIFIED | `[src: server/db/schema.sql:105-219,357-396,458-543]`, `[src: server/routes/trainer.js:344-679]`, `[src: server/routes/student.js:36-110]` |
| AI prompts/models/DLP | `worker-core.mjs`, `worker.js`, `wrangler.toml`, Express AI clients; exact text/vision models, JSON-only suffix, trainer closing line and unsafe student reply | VERIFIED | `[src: worker-core.mjs:9-21,47-57,344]`, `[src: worker.js:35-320]`, `[src: server/services/chatWorkerService.js:21-106]` |
| Parent chat | `parentChatService.js`, `parentChatDlp.js`, `routes/parentChat.js`, tests | VERIFIED | `[src: server/services/parentChatService.js:1-303]`, `[src: server/services/parentChatDlp.js:1-192]`, `[src: server/tests/parentChat.test.js:48-306]` |
| Founder announcements | `announcementService.js`, `routes/announcements.js`, founder composer, shared inbox, DLP reuse | VERIFIED | `[src: server/services/announcementService.js:1-120]`, `[src: server/routes/announcements.js:1-49]`, `[src: server/tests/announcements.test.js:1-130]` |
| Trainer onboarding, batches, weekly timetable | `trainerOnboardingService.js`, `trainerDocumentService.js`, `batchService.js` (serialized, conflict-aware, idempotent), `slotService.js`, trainer UI | VERIFIED | `[src: server/services/trainerOnboardingService.js:1-200]`, `[src: server/services/trainerDocumentService.js:1-160]`, `[src: server/services/batchService.js:1-260]`, `[src: server/services/slotService.js:150-260]` |
| Mastery practice | `masteryPracticeService.js`, student routes/tests | VERIFIED | `[src: server/services/masteryPracticeService.js:1-216]`, `[src: server/tests/masteryPractice.test.js:61-140]` |
| Integrations/jobs | Agora/Razorpay/Twilio/Cloudflare/Supabase/notification/reminder services and routes; MCP founder server; WhatsApp parent support; async auth middleware | VERIFIED | `[src: server/services/agoraTokenService.js:1-86]`, `[src: server/routes/agora.js:33-71]`, `[src: server/routes/razorpay.js:86-158]`, `[src: server/services/whatsappAiService.js:24-35,233-245,266-311,444-503]`, `[src: server/routes/webhooks.js:85-155]`, `[src: server/mcp-server.js:28-54,96,150-152,520]`, `[src: server/middleware/auth.js:49,98-103]`, `[src: server/jobs/reminders.js:6-125]` |
| Tests/evidence | `server/package.json:13`, 36 chained suites including `agoraRoutes`, `asyncAuthMiddleware`, `mcpServer` and `razorpayWebhook`, plus the v3.1.0 full run | VERIFIED | `[src: server/package.json:13]`, `[ev: npm.cmd test --prefix server, 2026-11-26]` |
| Docs/constraints | README, PROJECT_GUIDE, TEST_REPORT, server/README, migrations README, policy pages | VERIFIED | `[src: README.md:1-109]`, `[src: PROJECT_GUIDE.md:15,34-36,85,228,395-408]`, `[src: TEST_REPORT.md:4-60,243-253]` |
| Env/deploy/deps | `server/.env.example`, `server/config.js`, CI/Docker/Render/Railway/Worker manifests, lockfile | VERIFIED | `[src: server/.env.example:1-81]`, `[src: server/config.js:1-69]`, `[src: .github/workflows/ci.yml:1-34]`, `[src: server/package.json:18-26]` |
| Live external checks | TEST_REPORT provider results | VERIFIED (documentary) | `[src: TEST_REPORT.md:18-25,36,243]` |
| Founder MCP contract | `server/mcp-server.js`, `server/.env.example`, `server/tests/mcpServer.test.js` | VERIFIED | `[src: server/mcp-server.js:28-54,96,150-152,210-212,438-440,520]`, `[src: server/.env.example:50]`, `[src: server/tests/mcpServer.test.js]` |
| Student hint lock | `server/db/schema.sql` safe view, `0007_student_hint_lockdown.sql`, `server/tests/studentSerializer.test.js` | VERIFIED | `[src: server/db/schema.sql:629-645]`, `[src: server/migrations/0007_student_hint_lockdown.sql:10-31]`, `[src: server/tests/studentSerializer.test.js]` |
| WhatsApp parent support | `whatsappAiService.js`, `routes/webhooks.js`, `server/tests/chatAssistant.test.js` | VERIFIED | `[src: server/services/whatsappAiService.js:24-35,233-245,266-311,379,409,444-503]`, `[src: server/routes/webhooks.js:85-155]`, `[src: server/tests/chatAssistant.test.js]` |
| Unknowns/contradictions | §10/§11 in this file plus evidence reports | VERIFIED | `[src: TEST_REPORT.md:243-253]`, `[src: PROJECT_GUIDE.md:380,395-408]`, `[ev: gh pr list (exit 4), 2026-11-26]` |

---

## 4. ACTOR & ROLE MATRIX — EXHAUSTIVE

[VERIFIED] [U+2026-11-26] NEW RULES R1–R9 apply to this section; see §1.6 and `TPFF_UPDATE_REPORT.md` §U3.

### 4.0 Enumeration, not assumption

| Actor | Present? | Resolution | Tag | Source |
|---|---|---|---|---|
| `founder` | Yes | Human role; DB `users.role` constraint and JWT role claim. | VERIFIED | `[src: server/db/schema.sql:39]`, `[src: server/auth/token.js:39-51]` |
| `trainer` | Yes | Human role; DB constraint and router gate. | VERIFIED | `[src: server/db/schema.sql:39]`, `[src: server/routes/trainer.js:25-26]` |
| `student` | Yes | Human role; DB constraint and router gate. | VERIFIED | `[src: server/db/schema.sql:39]`, `[src: server/routes/student.js:12-13]` |
| `parent` | Yes in Express/demo | Demo role with `childId`; **not** in DB role constraint, a live-mode mismatch. | VERIFIED | `[src: server/db/mock.js:58-62]`, `[src: server/routes/auth.js:65-79]`, `[src: server/routes/parentChat.js:26-28]`, `[src: server/db/schema.sql:39,590-591]` |
| `kid` | Alias only | UI/comment wording, no quoted role literal found. | VERIFIED | `[ev: quoted role literal search (no output), 2026-11-26]`, `[src: server/routes/sessions.js:167]`, `[src: classroom/index.html:769-775]` |
| `guest` | No | 0 matches in role-token search; no guest route or gate. | VERIFIED | `[ev: role token search, 2026-11-26]` |
| `admin` | Not a role | `/api/admin` namespace + founder-only handlers + `ADMIN_EMAIL` notification config only. | VERIFIED | `[src: server/app.js:82]`, `[src: server/routes/admin.js:8-56]`, `[src: server/services/notificationService.js:45]` |
| `moderator` | No | 0 matches in role-token search. | VERIFIED | `[ev: role token search, 2026-11-26]` |
| `support` | Not a role | Capability/log channel (chat support, escalations, founder-only tables). | VERIFIED | `[src: server/routes/chat.js:47-48]`, `[src: server/db/schema.sql:1334-1368]` |
| One account, multiple roles? | No evidence | No code path assigns multiple simultaneous roles; each user row has one `role`. | VERIFIED | `[src: server/db/schema.sql:29-41]`, `[src: server/auth/token.js:42-48]` |
| Service/machine actors | Yes | Supabase `service_role`, Twilio/Razorpay/Agora/recording webhooks, reminders timer, Chat Worker/Cloudflare, Slack/email/observability; no `x-api-key` caller found. | VERIFIED | `[src: server/db/schema.sql:1377-1410]`, `[src: server/routes/webhooks.js:25-61]`, `[src: server/routes/agora.js:91-134]`, `[src: worker.js:118-320]`, `[src: server/services/notificationService.js:11-63]`, `[ev: x-api-key/API_KEY search, 2026-11-26]` |

### 4.1 Role cards

#### ROLE CARD: founder `[src: server/db/schema.sql:39]`, `[src: server/routes/admin.js:8-56]`

**4.1.1 Identity & authentication**

| Claim | Scope | Tag | Source |
|---|---|---|---|
| Authenticates with `POST /api/auth/login`; signed HS256 JWT carries `sub`, `role`, `name`, `iat`, `exp`. | own | VERIFIED | `[src: server/routes/auth.js:31-63]`, `[src: server/auth/token.js:39-52]` |
| Default TTL `43200 s` (12 h) from `AUTH_TTL_SECONDS`; production requires `AUTH_SECRET` ≥ `32` characters. | own | VERIFIED | `[src: server/auth/token.js:6,10-17]`, `[src: server/config.js:26-51]` |
| Role claim is asserted from stored user role; RLS reads `auth.jwt()->'app_metadata'->>'role'`, never `user_metadata`. | own/all | VERIFIED | `[src: server/auth/token.js:42-48]`, `[src: server/db/schema.sql:4-9]`, `[src: server/tests/livePersistence.test.js:77]` |
| Every request re-checks `user.status === 'active'`; a suspended user gets `401`. | own | VERIFIED | `[src: server/middleware/auth.js:40-53]` |
| Revocation/downgrade path: no logout/denylist endpoint found; expiry or status change is the only observed invalidation. | own | UNKNOWN (§10 U11) | `[ev: grep logout|revoke|invalidate|tokenVersion across *.js, 2026-11-26]` |
| Demo login `founder@mathify.app` / `mathify-demo`; `/api/auth/demo` hides contact addresses. | own | VERIFIED | `[src: README.md:87-94]`, `[src: server/routes/auth.js:65-81]` |

**4.1.2 Powers**

| Capability | Surface | Scope | Preconditions | Side effects | State transitions | Tag | Source |
|---|---|---|---|---|---|---|---|
| View health, public config, realtime log | `GET /api/health`, `/api/public/config`, `/api/realtime/log` | all | JWT + founder role for log | none | none | VERIFIED | `[src: server/app.js:50-74,91-93]` |
| Read every session and session-shaped DTO | `/api/trainer/*`, `/api/student/*`, `/api/sessions/*` | all | JWT + founder allowed by router roles / `canAccessSession` | role-shaped views only | none | VERIFIED | `[src: server/routes/trainer.js:25-26]`, `[src: server/routes/student.js:12-13]`, `[src: server/middleware/auth.js:68-77]` |
| Founder-only support/audit | `/api/admin/*`, support escalations, WhatsApp/AI logs | all | JWT + `Role('founder')` | draft patch/reset; read-only log | settings draft reset | VERIFIED | `[src: server/routes/admin.js:8-56]`, `[src: server/db/schema.sql:1334-1368]` |
| Read-only parent chat audit + flags | `/api/parent-chat/thread`, `/unread`, `/flags` | all threads | JWT + founder; write mode rejected | flag read only | none | VERIFIED | `[src: server/routes/parentChat.js:26-28,86-103]`, `[src: server/services/parentChatService.js:64-90,286-292]` |
| Create/edit sessions, planner, quiz flows, slots, attendance, payouts | trainer router | all | JWT + founder role admitted by trainer router | session/quiz/attendance/payout writes | scheduled→live/ended, quiz phases, leave | VERIFIED | `[src: server/routes/trainer.js:25-26,247-691]` |
| Buy pack for any student | `POST /api/razorpay/orders/monthly` | all | JWT + founder role (no ownership check) | order saved | order `created` | VERIFIED | `[src: server/routes/razorpay.js:10-33]` |
| View/manage leave list | `GET/POST /api/leaves` | all | JWT + founder role admitted | none on apply (founder cannot apply) | none | VERIFIED | `[src: server/routes/leaves.js:7-23]`, `[src: server/services/leaveService.js:124-127]` |
| Ask both AI assistants | `/api/chat/trainer-support`, `/api/chat/student-doubt` | all | JWT + founder admitted in both role gates | audit log when configured | none | VERIFIED | `[src: server/routes/chat.js:47-48]`, `[src: worker-core.mjs:284-288]` |
| Send scoped announcement | `POST /api/admin/announcements` | trainer / student / both / one named individual | JWT + founder; audience allowlist; DLP gate | service-only announcement record; neutral `CONTENT_BLOCKED` on contact data | announcement created, nothing on block | VERIFIED | `[src: server/routes/admin.js:145-180]`, `[src: server/services/announcementService.js:35-95]`, `[src: server/tests/announcements.test.js:45-110]` |
| Allot a batch and book the trainer calendar | `POST /api/admin/batches/:batchId/allot` | all batches | JWT + founder; one trainer per batch; serialized writes; overlap check returns 409 `BATCH_SLOT_CONFLICT`; retries are idempotent | batch status `allotted`, one session per slot, unique Agora channel | batch `created→allotted`; session `scheduled` | VERIFIED | `[src: server/routes/admin.js:61-88]`, `[src: server/services/batchService.js:100-260]`, `[src: server/tests/trainerOnboarding.test.js:110-140]`, `[src: server/tests/concurrency.test.js:60-100]` |
| Correct locked KYC fields with audit | `PATCH /api/admin/trainer-onboarding/:trainerId/locked` | all trainers | JWT + founder | append-only correction row; masked default view | KYC value corrected | VERIFIED | `[src: server/routes/admin.js:108-127]`, `[src: server/services/trainerOnboardingService.js:1-200]` |
| Change another role’s data indirectly | trainer/student routes + founder settings | all | founder admitted into trainer/student routers; patch allowlist | session/quiz/attendance/order writes; settings draft only | multiple | VERIFIED | `[src: server/routes/trainer.js:25-26]`, `[src: server/routes/student.js:12-13]`, `[src: server/services/founderSettingsService.js:158-199]` |
| Impersonate/delegate/suspend | none found | — | no endpoint found | none | none | UNKNOWN (§10 U11) | `[ev: role/gate search, 2026-11-26]` |
| Alter config/secrets | settings allowlist only | all | field allowlist; money/network locked | runtime draft, never disk | draft reset | VERIFIED | `[src: server/services/founderSettingsService.js:1-7,50-72,179-205]` |

**4.1.3 Limitations**

| Forbidden action | Surface | Enforcement point | Response | Classification | Logged? | Tag | Source |
|---|---|---|---|---|---|---|---|
| Write/send parent chat | `/api/parent-chat/*` | `authorize(...,'write')` rejects founder | `403 FORBIDDEN` | DENIED BY POLICY | error path returns JSON | VERIFIED | `[src: server/services/parentChatService.js:83-86]`, `[src: server/routes/parentChat.js:91-97]` |
| Apply leave | `POST /api/leaves` | `leaveService.apply` role gate | `403 FORBIDDEN` | DENIED BY POLICY | thrown error | VERIFIED | `[src: server/services/leaveService.js:124-127]` |
| Change money settings | `PATCH /api/admin/settings` | field allowlist + read-only money set | `400 FIELD_READ_ONLY` | DENIED BY POLICY | 400 JSON | VERIFIED | `[src: server/services/founderSettingsService.js:11-72,158-199]`, `[src: server/routes/admin.js:31-47]` |
| Persist settings to disk | founder UI/service | runtime-only draft | silent no-op to file | NOT IMPLEMENTED | UI says server unavailable/offline fallback | VERIFIED | `[src: server/services/founderSettingsService.js:1-7,138-149]`, `[src: founder/app.js:111-122,208-213]` |
| Access public demo without production opt-in | `/api/auth/demo` | `NODE_ENV=production && ENABLE_DEMO_LOGINS!=='true'` | `404 NOT_FOUND` | DENIED BY POLICY | 404 JSON | VERIFIED | `[src: server/routes/auth.js:65-68]` |

**4.1.4 Rules**

| Rule | Applies to | Threshold/window/quota | Enforced where | Tag | Source |
|---|---|---|---|---|---|
| Login throttle | founder login | `5` attempts / `10 min` (`600000 ms`) per IP+email | `routes/auth.js` in-process map | VERIFIED | `[src: server/routes/auth.js:10-28]` |
| Production fail-closed | all production roles | `AUTH_SECRET ≥32`, explicit non-`*` CORS, `DATABASE_MODE=supabase`, 15 named credentials | `server/index.js` via `assertProductionConfig()` | VERIFIED | `[src: server/config.js:14-51]`, `[src: server/index.js:15]` |
| Founder-editable settings ranges | settings draft | quiz unlock `50–100`; heartbeat `5–120 s`; idle `15–600 s`; max slot `1–24 h`; etc. | `founderSettingsService` | VERIFIED | `[src: server/services/founderSettingsService.js:11-72,158-199]` |
| Realtime log access | trainer/founder only | recent bounded event window | app route | VERIFIED | `[src: server/app.js:91-93]`, `[src: server/db/index.js:365-393]` |

**4.1.5 Whose**

| Claim | Tag | Source |
|---|---|---|
| Founder owns platform policy review, support escalation visibility, money-rule visibility and audit of all parent chats; money data remains read-only. | VERIFIED | `[src: founder/index.html:310-338]`, `[src: server/services/founderSettingsService.js:50-72]`, `[src: server/services/parentChatService.js:286-292]` |
| Founder is responsible for privacy-flag review but never receives blocked raw message text; only masked preview and reason code are serialized. | VERIFIED | `[src: server/services/parentChatService.js:115-129,286-292]` |
| Founder-managed trainer access/pay/allotment and student self-registration are approved roadmap, not built. | VERIFIED | `[src: README.md:81-85]`, `[src: PROJECT_GUIDE.md:404-405]` |

**4.1.6 How much**

| Quantity | Value | Unit | Tag | Source |
|---|---:|---|---|---|
| Auth token TTL | `43200` | seconds | VERIFIED | `[src: server/auth/token.js:6]` |
| Login attempts | `5` per `10` | attempts per minutes | VERIFIED | `[src: server/routes/auth.js:10-11]` |
| Parent chat flags query cap | `200` | flags | VERIFIED | `[src: server/services/parentChatService.js:22,291]` |
| Support escalation cap | `200` (default query `50`) | records | VERIFIED | `[src: server/db/index.js:203-205]` |
| Session event ring | `500` (query max `200`, default `20`) | events | VERIFIED | `[src: server/db/index.js:307-331,365-393]` |
| Settings quiz unlock range | `50–100` | score points | VERIFIED | `[src: server/services/founderSettingsService.js:11-72]` |

**4.1.7 However**

| Exception | Status | Tag | Source |
|---|---|---|---|
| UI keeps an offline settings fallback while server allowlist remains authoritative; edits are draft-only. | PARTIAL / intentional | VERIFIED | `[src: founder/app.js:1-5,111-122]`, `[src: server/services/founderSettingsService.js:1-7]` |
| DB role constraint excludes `parent` although Express/demo include it. | OPEN contradiction | VERIFIED | `[src: server/db/schema.sql:39,590-591]` vs `[src: server/db/mock.js:58-62]` |
| No token revocation endpoint found. | UNKNOWN (§10 U11) | UNKNOWN | `[ev: logout/revoke grep, 2026-11-26]` |

#### ROLE CARD: trainer `[src: server/db/schema.sql:39]`, `[src: server/routes/trainer.js:25-26]`

**4.1.1 Identity & authentication**

| Claim | Scope | Tag | Source |
|---|---|---|---|
| Same HS256 JWT flow, TTL `43200 s`, active-status check, role from stored user row / JWT. | own | VERIFIED | `[src: server/auth/token.js:6,39-52]`, `[src: server/middleware/auth.js:40-53]` |
| Demo `trainer@mathify.app` / `mathify-demo`; mock trainer `Ananya Rao`, `payPerSession=350`, max `6 h/day`, `6 sessions/day`. | own | VERIFIED | `[src: README.md:87-94]`, `[src: server/db/mock.js:24-29]` |
| Classroom client role selection is identity only; server verifies every request. | own | VERIFIED | `[src: classroom/api.js:17-18]`, `[src: server/middleware/auth.js:40-66]` |

**4.1.2 Powers**

| Capability | Surface | Scope | Preconditions | Side effects | State transitions | Tag | Source |
|---|---|---|---|---|---|---|---|
| View dashboard, payouts, score, attendance, sessions, slots, schedule | `/api/trainer/*` | own + founder | `Role('trainer','founder')` | none | none | VERIFIED | `[src: server/routes/trainer.js:25-26,98-247,691-717]` |
| Create sessions | `POST /api/trainer/sessions` | own | live DB required; exactly one trainer + one student | session row | none→`scheduled` | VERIFIED | `[src: server/routes/trainer.js:256-282]` |
| Launch/reveal/hint/next/reteach/new-check quizzes | `/api/trainer/sessions/:id/quiz/*` | own session | `loadSession`; quiz guards | quiz/attempt/reveal writes | `draft→answering→awaiting_reveal→revealed/reteach/recheck/complete` | VERIFIED | `[src: server/routes/trainer.js:344-679]` |
| Author curriculum | `PUT /api/trainer/students/:id/curriculum` | assigned student | student-role + assignment checks | curriculum record | draft | VERIFIED | `[src: server/routes/trainer.js:725-745]` |
| Trainer copilot | `POST /api/trainer/copilot/query` | assigned student | access/student checks | audit log if configured | none | VERIFIED | `[src: server/routes/trainer.js:747-776]` |
| Declare/delete slots | `/api/trainer/slots` | own | JWT + trainer router | slot rows | slot create/delete | VERIFIED | `[src: server/routes/trainer.js:691-706]`, `[src: server/services/slotService.js:212]` |
| Control classroom media, reactions, badges, celebration, presence, end session | `/api/sessions/:id/*` | own session | `canAccessSession` + trainer/founder gate | authoritative media/version, events | media permission state, session→`ended` | VERIFIED | `[src: server/routes/sessions.js:134-362]`, `[src: server/services/mediaPermissionService.js:37-63]` |
| Start/stop recording | `/api/agora/recording/*` | own session | call-owner `trainer/founder` + session access | recording row | `recording→stopped` | VERIFIED | `[src: server/routes/agora.js:30-88]` |
| Read/send parent chat | `/api/parent-chat/*` | roster students | roster check | message + unread for parent | unread increment / mark-read | VERIFIED | `[src: server/services/parentChatService.js:78-90,199-245]` |
| Apply leave | `POST /api/leaves` | own | JWT + trainer role | leave row, session `leave`, attendance `leave`, payout `0` | scheduled/live→leave | VERIFIED | `[src: server/services/leaveService.js:124-202]` |
| Read 7-day weekly timetable | `GET /api/trainer/schedule/week?start=YYYY-MM-DD` | own | JWT + trainer router; Monday-aligned 7-day window | none | none | VERIFIED | `[src: server/routes/trainer.js:768-776]`, `[src: server/services/slotService.js:150-210]`, `[src: trainer/schedule.js:1-290]` |
| Submit and edit own KYC | `/api/trainer/onboarding`, `/personal`, `/documents` | own | JWT + trainer; locked fields rejected after first submit; images validated | service-only onboarding + document records; private Storage bytes in live mode | onboarding `draft→submitted`; locked values immutable | VERIFIED | `[src: server/routes/trainer.js:177-222]`, `[src: server/services/trainerOnboardingService.js:1-200]`, `[src: server/tests/trainerOnboarding.test.js:60-100]` |
| Read alloted batches | `GET /api/trainer/batches` | own | JWT + trainer; name + batch ID only | none | none | VERIFIED | `[src: server/routes/trainer.js:219-222]`, `[src: server/services/batchService.js:1-140]` |
| Read scoped announcements | `GET /api/announcements`, `/unread` | trainer-targeted | JWT + trainer; role/individual match | read receipt only on explicit mark-read | unread→read | VERIFIED | `[src: server/routes/announcements.js:25-49]`, `[src: shared/announcements.js:1-100]` |
| Change another role’s data indirectly | quiz/reveal, media, planner, attendance, parent chat | other student | session ownership/roster | student-visible state, parent unread | multiple | VERIFIED | `[src: server/routes/trainer.js:344-679]`, `[src: server/routes/sessions.js:134-362]`, `[src: server/services/parentChatService.js:199-245]` |
| See private fields of student | session state + curriculum | own student | session access | read only safe DTO | none | VERIFIED | `[src: server/routes/student.js:20-33]`, `[src: server/db/schema.sql:671-688]` |
| Suspend/impersonate | none found | — | no endpoint found | none | none | UNKNOWN (§10 U11) | `[ev: role/gate search, 2026-11-26]` |
| Alter secrets | none | — | env only | none | none | VERIFIED | `[src: server/config.js:1-69]` |

**4.1.3 Limitations**

| Forbidden action | Surface | Enforcement point | Response | Classification | Logged? | Tag | Source |
|---|---|---|---|---|---|---|---|
| Student-side batch answer APIs | `/api/student/*` | router `Role('student','founder')` | `403 FORBIDDEN` | DENIED BY POLICY | 403 JSON | VERIFIED | `[src: server/routes/student.js:12-13]`, `[src: server/middleware/auth.js:55-65]` |
| Founder-only admin settings | `/api/admin/*` | `Role('founder')` | `403 FORBIDDEN` | DENIED BY POLICY | 403 JSON | VERIFIED | `[src: server/app.js:82]`, `[src: server/routes/admin.js:8-56]` |
| Parent-chat threads outside roster | `/api/parent-chat/*` | roster check in `authorize` | `403 FORBIDDEN` | DENIED BY OWNERSHIP | thrown error | VERIFIED | `[src: server/services/parentChatService.js:80-82]` |
| Privacy flags | `GET /api/parent-chat/flags` | `Role('founder')` | `403 FORBIDDEN` | DENIED BY POLICY | 403 JSON | VERIFIED | `[src: server/routes/parentChat.js:102-103]`, `[src: server/services/parentChatService.js:288-290]` |
| Quiz next/end while parallel check pending | `/quiz/next`, `/sessions/:id/end` | `PARALLEL_CHECK_REQUIRED` guard | `409` | DENIED BY STATE | 409 JSON | VERIFIED | `[src: server/routes/trainer.js:454-460]`, `[src: server/routes/sessions.js:402-444]` |
| Create live session in mock mode | `POST /api/trainer/sessions` | `DATABASE_MODE=supabase` check | `503 DATABASE_MODE_NOT_LIVE` | DENIED BY STATE | 503 JSON | VERIFIED | `[src: server/routes/trainer.js:256-282]` |
| Student self-service record deletion | none found | no endpoint | n/a | NOT IMPLEMENTED | n/a | UNKNOWN (§10 U11) | `[ev: delete-route grep across server/routes, 2026-11-26]` |

**4.1.4 Rules**

| Rule | Applies to | Threshold/window/quota | Enforced where | Tag | Source |
|---|---|---|---|---|---|
| Payout rate range | trainer sessions | `₹300–₹400` INR per 1-on-1 session | policy + payout service + Worker facts | VERIFIED | `[src: server/config/policy.json:69-74]`, `[src: worker-core.mjs:23]` |
| Attendance bounds | trainer day | `3–6 h/day`, ≤`6 sessions/day` | policy + payout | VERIFIED | `[src: server/config/policy.json:70-73,105-108]` |
| Cancellation fine | trainer late cancel | `<48 h` notice forfeits session pay | policy + attendance/payout | VERIFIED | `[src: server/config/policy.json:79-85]`, `[src: server/services/payoutService.js]` |
| Slot pay | trainer slots | committed `100%`, unutilised `30%`, max `12 h/slot` | policy + slot service | VERIFIED | `[src: server/config/policy.json:21-27]`, `[src: server/services/slotService.js]` |
| Presence pay gate | trainer payout | ≥`15 min` present, heartbeat `20 s`, idle `45 s`, grace `10 min` | policy + presence service | VERIFIED | `[src: server/config/policy.json:28-37]` |
| Leave balance | trainer leave | `8`/month; student-initiated not charged | leave service | VERIFIED | `[src: server/config/policy.json:116-120]`, `[src: server/services/leaveService.js:56-77]` |
| Trainer Desk tone | AI replies | professional; payout/fine/bonus facts only; severe complaints → `founder@mathify.app` | Worker system prompt | VERIFIED | `[src: worker-core.mjs:35-45]` |

**4.1.5 Whose**

| Claim | Tag | Source |
|---|---|---|
| Trainer owns session delivery, planner/quiz progression, attendance marking, slot declaration and remote classroom control for assigned sessions. | VERIFIED | `[src: server/routes/trainer.js:247-691]`, `[src: server/routes/sessions.js:134-362]` |
| Trainer may mutate the student’s visible session state and parent chat unread count but never answer-key visibility before reveal. | VERIFIED | `[src: server/routes/trainer.js:362-404]`, `[src: server/services/parentChatService.js:199-245]` |
| Severe complaints, harassment and money disputes are escalated to founder deterministically even if the model omits the address. | VERIFIED | `[src: worker-core.mjs:32,40,208-235,351-360]` |

**4.1.6 How much**

| Quantity | Value | Unit | Tag | Source |
|---|---:|---|---|---|
| Demo pay per session | `350` | INR | VERIFIED | `[src: server/db/mock.js:24-29]` |
| Max hours/day | `6` | hours | VERIFIED | `[src: server/config/policy.json:71]` |
| Min hours/day | `3` | hours | VERIFIED | `[src: server/config/policy.json:72]` |
| Max sessions/day | `6` | sessions | VERIFIED | `[src: server/config/policy.json:73]` |
| Perfect attendance bonus | `₹2000` | INR | VERIFIED | `[src: server/config/policy.json:74-78]` |
| Monthly increment | `₹500` | INR per consecutive month | VERIFIED | `[src: server/config/policy.json:74-78]` |
| MVT awards | `₹3000`, `₹2000`, `₹1000` | INR ranks 1–3 | VERIFIED | `[src: server/config/policy.json:103]`, `[src: server/db/schema.sql:506-513]` |
| Leave balance | `8` | sessions/month | VERIFIED | `[src: server/config/policy.json:116-120]` |
| Trainer Desk question/reply caps | `600` / `900` | characters | VERIFIED | `[src: worker-core.mjs:14-15]` |
| Network floors | `15` down / `10` up / `250` latency | Mbps / Mbps / ms | VERIFIED | `[src: server/config/policy.json:39-46]` |

**4.1.7 However**

| Exception | Status | Tag | Source |
|---|---|---|---|
| Classroom `?role=...` / `?view=student` QA override exists; normal load adopts server-provided role. | INTENTIONAL QA | VERIFIED | `[src: classroom/session.js:23-31,105-116]` |
| Founder is mapped to trainer UI in classroom token flow. | PARTIAL | VERIFIED | `[src: classroom/api.js:30-31,42-49]` |
| Trainer payout copy in dashboard is complete (`₹300–₹400`, 48-hour notice, fines/bonuses, founder escalation). | VERIFIED | `[src: trainer/index.html:338]` |
| Student Control surface is single; media state authoritative server-side, browser cannot flip a stopped remote device. | INTENTIONAL | VERIFIED | `[src: server/services/mediaPermissionService.js:11-12]`, `[src: TEST_REPORT.md:244-245]` |

#### ROLE CARD: student `[src: server/db/schema.sql:39]`, `[src: server/routes/student.js:12-13]`

**4.1.1 Identity & authentication**

| Claim | Scope | Tag | Source |
|---|---|---|---|
| Same HS256 JWT flow, TTL `43200 s`, active-status check. | own | VERIFIED | `[src: server/auth/token.js:6,39-52]`, `[src: server/middleware/auth.js:40-53]` |
| Demo `student@mathify.app` / `mathify-demo`; mock `Ishaan Verma`, grade `7`, mastery `72`, `9` sessions remaining. | own | VERIFIED | `[src: README.md:87-94]`, `[src: server/db/mock.js:30-57]` |
| `/auth/me` returns only `id`, `name`, `role`; internal `childId` never reaches browser identity. | own | VERIFIED | `[src: server/middleware/auth.js:5,12-15]`, `[src: server/routes/auth.js:83-85]` |

**4.1.2 Powers**

| Capability | Surface | Scope | Preconditions | Side effects | State transitions | Tag | Source |
|---|---|---|---|---|---|---|---|
| View dashboard and safe session DTO | `/api/student/dashboard`, `/sessions/:id` | own | router role + `loadSession` | none | none | VERIFIED | `[src: server/routes/student.js:15-34]` |
| Answer quiz question | `POST /api/student/sessions/:id/quiz/answers` | own | quiz live, `answering|recheck`, current question, no duplicate | attempt, `awaiting_reveal` | answer→awaiting_reveal | VERIFIED | `[src: server/routes/student.js:36-88]` |
| Read own enrollment batch | `GET /api/auth/batch` | own | JWT + student; batch derived from student id | none | none | VERIFIED | `[src: server/routes/auth.js:32-42]`, `[src: server/services/batchService.js:1-60]` |
| Read scoped announcements | `GET /api/announcements`, `/unread`, `/:id/read` | student-targeted | JWT + student; role/individual match | read receipt only on explicit mark-read | unread→read | VERIFIED | `[src: server/routes/announcements.js:25-49]`, `[src: server/tests/announcements.test.js:60-130]` |
| Read own attempt with reveal gate | `GET /quiz/attempts/:id` | own | session access | read only | none | VERIFIED | `[src: server/routes/student.js:90-110]` |
| Read own curriculum | `GET /api/student/me/curriculum` | own | JWT | read only | none | VERIFIED | `[src: server/routes/student.js:121]` |
| Self-practice batch/answer | `/api/student/practice/batch*` | own | JWT; ownership check | private batch record/attempt | batch answered, topic completion | VERIFIED | `[src: server/routes/student.js:129-170]`, `[src: server/services/masteryPracticeService.js:97-203]` |
| Study Buddy query | `POST /api/student/tutor/query` | own | own-id/session checks | audit log if configured | none | VERIFIED | `[src: server/routes/student.js:179-198]` |
| Session state, events, chat, token, reactions, presence | `/api/sessions/:id/*`, `/api/agora/token` | own session | `canAccessSession` + network gate for token | events/reactions/presence | media/reaction/presence versions | VERIFIED | `[src: server/routes/sessions.js:24-342]`, `[src: server/routes/agora.js:37-45]` |
| Buy own monthly pack | `POST /api/razorpay/orders/monthly` | own | student own-id check | order `created` | order created | VERIFIED | `[src: server/routes/razorpay.js:10-33]` |
| Apply leave | `POST /api/leaves` | own | student role | leave row, session `leave`, no pack penalty | scheduled/live→leave | VERIFIED | `[src: server/services/leaveService.js:124-202]` |
| Change another role’s data indirectly | session chat/reactions/practice/pack order | other participants | shared session channel only | safe events; own pack | none | VERIFIED | `[src: server/routes/sessions.js:111-129]`, `[src: server/routes/razorpay.js:10-33]` |
| See private fields of trainer | none beyond safe participant name | other | serializer/view allowlist | read only | none | VERIFIED | `[src: server/serializers.js]`, `[src: server/db/schema.sql:671-688]` |
| Parent chat | none | — | student denied by participant/auditor gates | none | none | VERIFIED | `[src: server/routes/parentChat.js:26-28]`, `[src: server/tests/parentChat.test.js]` |
| Impersonate/suspend | none found | — | no endpoint | none | none | UNKNOWN (§10 U11) | `[ev: role/gate search, 2026-11-26]` |

**4.1.3 Limitations**

| Forbidden action | Surface | Enforcement point | Response | Classification | Logged? | Tag | Source |
|---|---|---|---|---|---|---|---|
| See answer key, explanation, hint, correct option before reveal | student session DTO / events / attempts | double serialization + reveal gate + event scrub | fields omitted / `revealed:false` | DENIED BY POLICY + STATE | `[SECURITY]` warning on hostile payload | VERIFIED | `[src: server/routes/student.js:20-33,90-110]`, `[src: server/routes/sessions.js:46-56,93-105]`, `[src: server/tests/studentSerializer.test.js:5-69]` |
| Change own media permission flag | `/api/sessions/:id/media-permission` | `Role('trainer','founder')` | `403 FORBIDDEN` | DENIED BY OWNERSHIP | 403 JSON | VERIFIED | `[src: server/routes/sessions.js:141-149]`, `[src: server/tests/rtcControls.test.js:64-93]` |
| Launch/reveal quiz | trainer routes | `Role('trainer','founder')` | `403 FORBIDDEN` | DENIED BY POLICY | 403 JSON | VERIFIED | `[src: server/routes/trainer.js:25-26]` |
| Parent chat | `/api/parent-chat/*` | participant/auditor role gates | `403 FORBIDDEN` | DENIED BY POLICY | 403 JSON | VERIFIED | `[src: server/routes/parentChat.js:26-28]`, `[src: server/tests/parentChat.test.js]` |
| Start call before two-sided network pass | `/rtc-token`, `/api/agora/token` | `bothReady` | `409 NETWORK_BELOW_MINIMUM` | DENIED BY STATE | 409 JSON | VERIFIED | `[src: server/routes/sessions.js:28-37]`, `[src: server/services/agoraTokenService.js:41-45]` |
| Buy another student’s pack | `/api/razorpay/orders/monthly` | own-id check | `403 FORBIDDEN` | DENIED BY OWNERSHIP | 403 JSON | VERIFIED | `[src: server/routes/razorpay.js:13-15]` |
| Read another student’s practice batch | `/api/student/practice/batch/:id` | `findForStudent` | `403`/`404` | DENIED BY OWNERSHIP | error JSON | VERIFIED | `[src: server/services/masteryPracticeService.js:161-167]` |

**4.1.4 Rules**

| Rule | Applies to | Threshold/window/quota | Enforced where | Tag | Source |
|---|---|---|---|---|---|
| Practice batch size | self-practice | `10` questions/batch | mastery service | VERIFIED | `[src: server/services/masteryPracticeService.js:15]` |
| Difficulty ramp | self-practice | `+15%` per iteration | mastery service | VERIFIED | `[src: server/services/masteryPracticeService.js:18-20,45-49]` |
| Topic cap | self-practice | `80` questions/topic (`8` batches) | mastery service | VERIFIED | `[src: server/services/masteryPracticeService.js:17,105-107]` |
| Quiz unlock/mastery gating | session progression | `80` threshold; reteach required | policy + gating service | VERIFIED | `[src: server/config/policy.json:54-58]` |
| Pack expiry | student packs | `38` days; non-refundable | schema + policy | VERIFIED | `[src: server/db/schema.sql:64-76]`, `[src: server/config/policy.json:126-131]` |
| AI Study Buddy tone | student chat | friendly emojis, ≤`3` short sentences, Socratic hints only, no final answer | Worker system prompt | VERIFIED | `[src: worker-core.mjs:47-57]` |
| Image upload | student chat only | `image/jpeg`, `image/png`, `image/webp`, `image/gif`; ≤`1 MB` (`1024*1024` bytes) | Worker core | VERIFIED | `[src: worker-core.mjs:14-17]` |
| Hint release | quiz hints | ≤`500` chars after grant; never broadcast | trainer route | VERIFIED | `[src: server/routes/trainer.js:428-441]` |

**4.1.5 Whose**

| Claim | Tag | Source |
|---|---|---|
| Student owns their attempts, practice batches, pack credit and session answers; server owns correctness, answer keys and reveal timing. | VERIFIED | `[src: server/services/masteryPracticeService.js:143-203]`, `[src: server/routes/student.js:36-110]` |
| Parent can read session state of own child but is not a student and cannot use student practice/tutor routes. | VERIFIED | `[src: server/middleware/auth.js:73-75]`, `[src: server/routes/student.js:12-13]` |
| Student data responsibility is shared with assigned trainer for session conduct and founder for audit. | VERIFIED | `[src: server/routes/trainer.js:25-26]`, `[src: server/routes/admin.js:8-56]` |

**4.1.6 How much**

| Quantity | Value | Unit | Tag | Source |
|---|---:|---|---|---|
| Demo mastery | `72` | score points | VERIFIED | `[src: server/db/mock.js:30-36]` |
| Demo sessions remaining | `9` | sessions | VERIFIED | `[src: server/db/mock.js:35]` |
| Practice batch/topic cap | `10` / `80` | questions | VERIFIED | `[src: server/services/masteryPracticeService.js:15-17]` |
| Quiz unlock threshold | `80` | score points | VERIFIED | `[src: server/config/policy.json:5]` |
| Pack sessions | `12` | sessions | VERIFIED | `[src: server/services/razorpayService.js:5-11]` |
| Monthly pack amount | `54000` | halalas (SAR `540`) | VERIFIED | `[src: server/services/razorpayService.js:5-11]` |
| Quiz question caps | `600` question / `900` reply | characters | VERIFIED | `[src: worker-core.mjs:14-15]` |

**4.1.7 However**

| Exception | Status | Tag | Source |
|---|---|---|---|
| The final 80th-question batch must remain answerable; bug fixed so `topicComplete` is true only after all ten answers. | FIXED | VERIFIED | `[src: server/services/masteryPracticeService.js:64-68,189-202]`, `[src: TEST_REPORT.md:38-46]` |
| Legacy `unlimited` API wording replaced with `unlimitedTopics`, `topicLimit`, `topicRemaining`. | FIXED | VERIFIED | `[src: server/services/masteryPracticeService.js:59-63]`, `[src: TEST_REPORT.md:27-35]` |
| `batchLabel` shadowing crash fixed in student simulation. | FIXED (doc evidence) | VERIFIED | `[src: TEST_REPORT.md:38-46]` |
| No browser live image-chat success claimed. | BLOCKED | VERIFIED | `[src: TEST_REPORT.md:19-20,36]` |

#### ROLE CARD: parent `[src: server/db/mock.js:58-62]`, `[src: server/routes/parentChat.js:26-28]`

**4.1.1 Identity & authentication**

| Claim | Scope | Tag | Source |
|---|---|---|---|
| Demo `parent@mathify.app` / `mathify-demo`, linked to `usr_student_001`; `/auth/demo` lists role only, no contact detail. | own | VERIFIED | `[src: README.md:87-94]`, `[src: server/routes/auth.js:69-80]`, `[src: server/db/mock.js:58-62]` |
| Same HS256 JWT and active-status check; role claim `parent`. | own | VERIFIED | `[src: server/auth/token.js:39-52]`, `[src: server/middleware/auth.js:40-53]` |
| `canAccessSession` allows parent only for own child. | own child | VERIFIED | `[src: server/middleware/auth.js:73-75]` |
| DB constraint excludes `parent`; live-mode parent persistence is a mismatch. | own | UNKNOWN (§10 U12) | `[src: server/db/schema.sql:39,590-591]` |

**4.1.2 Powers**

| Capability | Surface | Scope | Preconditions | Side effects | State transitions | Tag | Source |
|---|---|---|---|---|---|---|---|
| Read own child’s parent-chat thread | `GET /api/parent-chat/thread` | own child | `Role('parent')`, `childId` check | none | none | VERIFIED | `[src: server/services/parentChatService.js:70-99,158-171]` |
| Send message to assigned trainer | `POST /api/parent-chat/thread/:studentId/messages` | own child | DLP pass, roster trainer exists | message + trainer unread | unread increment | VERIFIED | `[src: server/services/parentChatService.js:175-220]` |
| Mark own unread read | `POST /api/parent-chat/thread/:studentId/read` | own child | participant | read state | unread→`0` | VERIFIED | `[src: server/services/parentChatService.js:222-246]` |
| Read unread summary | `GET /api/parent-chat/unread` | own child | `AUDITORS` role gate | none | none | VERIFIED | `[src: server/routes/parentChat.js:99-100]`, `[src: server/services/parentChatService.js:248-284]` |
| Read own child’s session state/events/chat | `/api/sessions/:id/*` | own child session | `canAccessSession` | safe events/reaction etc. | none | VERIFIED | `[src: server/middleware/auth.js:73-75]`, `[src: server/routes/sessions.js:21-105]` |
| Request Agora token | `GET /api/agora/token` | own child session | `canAccessSession`, two-sided network pass | token issued | none | VERIFIED | `[src: server/routes/agora.js:37-45]`, `[src: server/services/agoraTokenService.js:41-45]` |
| Founder flags | `GET /api/parent-chat/flags` | none | founder-only | none | none | VERIFIED | `[src: server/routes/parentChat.js:102-103]` |
| Student practice/tutor | `/api/student/*` | none | role gate denies parent | none | none | VERIFIED | `[src: server/routes/student.js:12-13]` |
| Impersonate/delegate/suspend | none found | — | no endpoint | none | none | UNKNOWN (§10 U11) | `[ev: role/gate search, 2026-11-26]` |

**4.1.3 Limitations**

| Forbidden action | Surface | Enforcement point | Response | Classification | Logged? | Tag | Source |
|---|---|---|---|---|---|---|---|
| Read founder privacy flags | `/api/parent-chat/flags` | `FOUNDER` gate + service check | `403 FORBIDDEN` | DENIED BY POLICY | 403 JSON | VERIFIED | `[src: server/routes/parentChat.js:102-103]`, `[src: server/services/parentChatService.js:288-290]` |
| Send in another child’s thread | `/api/parent-chat/thread/:studentId/*` | `actor.childId === studentId` | `403 FORBIDDEN` | DENIED BY OWNERSHIP | thrown error | VERIFIED | `[src: server/services/parentChatService.js:78-80]` |
| Trainer/admin settings | `/api/trainer/*`, `/api/admin/*` | role gates | `403 FORBIDDEN` | DENIED BY POLICY | 403 JSON | VERIFIED | `[src: server/routes/trainer.js:25-26]`, `[src: server/routes/admin.js:8-56]` |
| Parent chat to other students | all threads | roster/ownership | `403 FORBIDDEN` | DENIED BY OWNERSHIP | thrown error | VERIFIED | `[src: server/services/parentChatService.js:78-89]` |
| Share blocked contact detail | parent chat send | regex DLP before write/delivery | `422 CONTENT_BLOCKED` | DENIED BY POLICY | founder-only masked flag | VERIFIED | `[src: server/services/parentChatDlp.js:13-85]`, `[src: server/services/parentChatService.js:175-197]` |

**4.1.4 Rules**

| Rule | Applies to | Threshold/window/quota | Enforced where | Tag | Source |
|---|---|---|---|---|---|
| One thread per student | parent chat | thread id === student id | parent chat service | VERIFIED | `[src: server/services/parentChatService.js:1-16,95-100]` |
| Message cap | parent chat | `100` messages; body ≤`2000` chars | service | VERIFIED | `[src: server/services/parentChatService.js:22-23,131-141]` |
| DLP reason codes | parent chat | `7` codes: email, URL, phone, contact scheme, social handle, social platform, personal contact request | DLP service | VERIFIED | `[src: server/services/parentChatDlp.js:13-21]` |
| Poll cadence | parent/trainer UI | `30 s` | browser clients | VERIFIED | `[src: parent/app.js:18,437-454]`, `[src: trainer/parentChat.js:18,437-452]` |
| AI never involved | parent chat | human thread only | service/UI | VERIFIED | `[src: README.md:34]`, `[src: server/services/parentChatService.js:1-16]` |

**4.1.5 Whose**

| Claim | Tag | Source |
|---|---|---|
| Parent owns the thread for their linked child and can clear only their own unread counter. | VERIFIED | `[src: server/services/parentChatService.js:222-246]` |
| Trainer owns the reply side for assigned students; founder audits read-only. | VERIFIED | `[src: server/services/parentChatService.js:80-89,248-292]` |
| Blocked content is not delivered, echoed, stored as a message, or published to realtime; only a masked founder flag remains. | VERIFIED | `[src: server/services/parentChatService.js:181-196]`, `[src: server/services/parentChatDlp.js:104-152]` |

**4.1.6 How much**

| Quantity | Value | Unit | Tag | Source |
|---|---:|---|---|---|
| Parent chat messages cap | `100` | messages/thread | VERIFIED | `[src: server/services/parentChatService.js:22]` |
| Message body cap | `2000` | characters | VERIFIED | `[src: server/services/parentChatService.js:23,137-139]` |
| Polling interval | `30` | seconds | VERIFIED | `[src: parent/app.js:18]`, `[src: trainer/parentChat.js:18]` |
| DLP reason codes | `7` | codes | VERIFIED | `[src: server/services/parentChatDlp.js:13-21]` |
| Parent demo child link | `1` | student (`usr_student_001`) | VERIFIED | `[src: server/db/mock.js:58-62]` |

**4.1.7 However**

| Exception | Status | Tag | Source |
|---|---|---|---|
| `/auth/demo` omits parent contact details, but parent client hardcodes a fallback demo login. | INTENTIONAL / UI gap | VERIFIED | `[src: server/routes/auth.js:69-80]`, `[src: parent/app.js:14-16,93-111]` |
| Parent role absent from DB constraint; live adapter persistence of parent accounts is unverified. | OPEN | VERIFIED | `[src: server/db/schema.sql:39,590-591]` |
| Parent can reach `/api/agora/token` through session access; no parent-facing classroom UI uses it. | UI-only gap | VERIFIED | `[src: server/routes/agora.js:37-45]`, `[src: server/services/agoraTokenService.js:49,75]` |
| Founder escalation for severe complaints is AI-chat only, not parent chat. | PARTIAL | VERIFIED | `[src: worker-core.mjs:32,40]`, `[src: server/services/parentChatService.js:1-16]` |

### 4.2 Cross-role matrices

#### 4.X.1 Capability × role grid

Legend: **A** = allow, **D** = deny, **N/I** = not implemented, **C** = conditional (condition in citation row). Every cell in a row shares that row’s verified source.

| Capability | founder | trainer | student | parent | Tag | Source |
|---|---|---|---|---|---|---|---|
| Health/public config | A | A | A | A | VERIFIED | `[src: server/app.js:50-74]` |
| Realtime log | A | A | D | D | VERIFIED | `[src: server/app.js:91-93]` |
| Trainer dashboard/payout/quiz control | A | A (own) | D | D | VERIFIED | `[src: server/routes/trainer.js:25-26]` |
| Student dashboard/practice/tutor | A | D | A (own) | D | VERIFIED | `[src: server/routes/student.js:12-13]` |
| Session state/events/chat | A | A (own) | A (own) | C own child | VERIFIED | `[src: server/middleware/auth.js:68-77]`, `[src: server/routes/sessions.js:21-105]` |
| RTC token | A | A | A | C own child + network | VERIFIED | `[src: server/routes/agora.js:37-45]`, `[src: server/services/agoraTokenService.js:41-45]` |
| Recording start/stop | A | A (own) | D | D | VERIFIED | `[src: server/routes/agora.js:30-88]` |
| Parent chat send | D | A (roster) | D | A (own child) | VERIFIED | `[src: server/services/parentChatService.js:64-90]` |
| Parent chat read | A (all) | A (roster) | D | A (own child) | VERIFIED | `[src: server/services/parentChatService.js:64-90]` |
| Founder privacy flags | A | D | D | D | VERIFIED | `[src: server/routes/parentChat.js:102-103]` |
| Admin settings patch | A | D | D | D | VERIFIED | `[src: server/routes/admin.js:31-47]` |
| Curriculum authoring | A | A (assigned) | D | D | VERIFIED | `[src: server/routes/trainer.js:725-745]` |
| Leave apply | D | A | A | D | VERIFIED | `[src: server/services/leaveService.js:124-127]` |
| Pack order | A (any student) | D | A (own) | D | VERIFIED | `[src: server/routes/razorpay.js:10-17]` |
| Trainer Desk AI | A | A | D | D | VERIFIED | `[src: server/routes/chat.js:47]` |
| Study Buddy AI | A | D | A | D | VERIFIED | `[src: server/routes/chat.js:48]` |
| Quiz answer reveal | A | A (own) | D | D | VERIFIED | `[src: server/routes/trainer.js:362-404]` |
| Media permission change | A | A (own) | D | D | VERIFIED | `[src: server/routes/sessions.js:141-149]` |
| Founders-only support escalation read | A | D | D | D | VERIFIED | `[src: server/routes/admin.js:8-17]` |
| Suspend/impersonate | N/I | N/I | N/I | N/I | UNKNOWN (§10 U11) | `[ev: role/gate search, 2026-11-26]` |

#### 4.X.2 Who-can-affect-whom grid

| Row role ↓ / column role → | founder | trainer | student | parent | Tag | Source |
|---|---|---|---|---|---|---|---|
| founder | reads own settings draft | can alter trainer-facing session/quiz/payout data | can alter student-facing session/quiz data | reads parent chat audit | VERIFIED | `[src: server/routes/trainer.js:25-26]`, `[src: server/routes/student.js:12-13]`, `[src: server/services/parentChatService.js:83-86]` |
| trainer | can escalate severe complaints via AI text to founder email | own data | controls session visibility, quiz reveal, media, attendance | sends/receives parent-chat messages, increments unread | VERIFIED | `[src: worker-core.mjs:32,208-235]`, `[src: server/routes/sessions.js:134-362]`, `[src: server/services/parentChatService.js:199-245]` |
| student | no direct founder write | safe session chat/reactions/answers only | own records only | no direct parent-chat write | VERIFIED | `[src: server/routes/sessions.js:111-129,301-320]`, `[src: server/routes/parentChat.js:26-28]` |
| parent | no founder access | sends/receives parent-chat message | reads own child’s safe session state only | own thread only | VERIFIED | `[src: server/services/parentChatService.js:70-99]`, `[src: server/middleware/auth.js:73-75]` |
| service actors | writes audit logs | service-role writes trainer-safe records | service-role writes session records | no parent-chat service actor write path beyond DB | VERIFIED | `[src: server/db/schema.sql:1377-1410]`, `[src: worker.js:208-236]` |

#### 4.X.3 State-transition × role grid

| Transition (from §7) | founder | trainer | student | parent | service/webhook | Tag | Source |
|---|---|---|---|---|---|---|---|
| `scheduled→live` | A | A | D | D | A (server on start) | VERIFIED | `[src: server/routes/trainer.js:247-296]`, `[src: server/routes/sessions.js:28-44]` |
| `scheduled|live→leave` | D apply | A apply | A apply | D | A (server auto-approve) | VERIFIED | `[src: server/services/leaveService.js:124-202]` |
| quiz `draft→answering` | A | A | D | D | D | VERIFIED | `[src: server/routes/trainer.js:344-360]` |
| quiz `answering|recheck→awaiting_reveal` | D | D (student triggers) | A | D | D | VERIFIED | `[src: server/routes/student.js:36-88]` |
| `awaiting_reveal→revealed` | A | A | D | D | D | VERIFIED | `[src: server/routes/trainer.js:362-404]` |
| `answering|revealed→reteach→recheck` | A | A | D | D | D | VERIFIED | `[src: server/routes/trainer.js:522-679]` |
| `recheck→complete` | A | A | D | D | D | VERIFIED | `[src: server/routes/trainer.js:450-487]` |
| pack order `created→credited` | A (order) | D | A (own order) | D | A (Razorpay webhook) | VERIFIED | `[src: server/routes/razorpay.js:10-137]` |
| media permission grant/revoke | A | A | D | D | D | VERIFIED | `[src: server/routes/sessions.js:141-196]` |
| network `not_checked→ready|expired|below_minimum` | A (own check) | A (own check) | A (own check) | C own child | A (server evaluate) | VERIFIED | `[src: server/services/networkQualityService.js:50-148]`, `[src: server/routes/sessions.js:227]` |
| parent-chat `unread→read` | A (audit read) | A (own counter) | D | A (own counter) | D | VERIFIED | `[src: server/services/parentChatService.js:222-246]` |
| parent-chat send→DLP block | D | A (blocked) | D | A (blocked) | D | VERIFIED | `[src: server/services/parentChatService.js:175-197]` |
| founder settings draft patch/reset | A | D | D | D | D | VERIFIED | `[src: server/routes/admin.js:31-56]` |

#### 4.X.4 Negative-matrix reconciliation

| Denial class | Representative enforcement | Matching test | Gap | Tag | Source |
|---|---|---|---|---|---|
| Student cannot see trainer-only fields | double serializer + event scrub | `studentSerializer.test.js`, `privacyBoundary.test.js`, `apiSmoke.test.js` | none for this denial | VERIFIED | `[src: server/tests/studentSerializer.test.js:5-69]`, `[src: server/tests/privacyBoundary.test.js:26-143]` |
| Student cannot change media permission | route role gate | `rtcControls.test.js` | none | VERIFIED | `[src: server/tests/rtcControls.test.js:64-93]` |
| Student cannot access parent chat | role gates + service | `parentChat.test.js` | none | VERIFIED | `[src: server/tests/parentChat.test.js]` |
| Parent/trainer flag secrecy | founder-only flag route/service | `parentChat.test.js` | none | VERIFIED | `[src: server/tests/parentChat.test.js]` |
| Founder cannot send parent chat | `authorize(...,'write')` | `parentChat.test.js` | none | VERIFIED | `[src: server/tests/parentChat.test.js]` |
| Founder cannot apply leave | service role gate | `leaveService.test.js` | none | VERIFIED | `[src: server/tests/leaveService.test.js:7-64]` |
| Money settings read-only | allowlist | `liveReadiness.test.js`, `apiSmoke.test.js`, `navContract.test.js` | none | VERIFIED | `[src: server/tests/liveReadiness.test.js:33-281]`, `[src: server/tests/navContract.test.js:52-61]` |
| Webhook signature failures | HMAC constant-time | `liveReadiness.test.js`, `liveOperations.test.js` | none | VERIFIED | `[src: server/tests/liveReadiness.test.js:33-281]` |
| Parent live-mode persistence | DB constraint excludes parent | no test found | **GAP** — add a live-mode parent-role persistence test | UNKNOWN (§10 U12) | `[src: server/db/schema.sql:39,590-591]`, `[ev: grep parent in server/tests, 2026-11-26]` |
| Token revocation/suspend | status check only | no dedicated revocation test found | **GAP** — add logout/revocation contract test if feature is built | UNKNOWN (§10 U11) | `[ev: grep logout|revoke|invalidate, 2026-11-26]` |

### 4.3 §4 coverage attestation

- VERIFIED — Every role in the code has a Role Card: founder, trainer, student, parent. `[src: server/db/schema.sql:39]`, `[src: server/db/mock.js:20-63]`
- VERIFIED — Every Role Card has seven subsections (identity, powers, limitations, rules, whose, how much, however). `[src: this file §4.1.1-4.1.7]`
- VERIFIED — Every capability row in 4.X.1 is cited. `[src: this file §4.X.1]`
- VERIFIED — Every denial has an enforcement point cited; untested denials are in §10. `[src: this file §4.1.3,4.X.4]`
- VERIFIED — UI-only enforcement gaps are in §11 (parent demo fallback, classroom QA role override, founder offline fallback, parent Agora token reachability). `[src: this file §11 H08,H09,H10,H11]`
- VERIFIED — Every allowed-but-constrained rule has its threshold cited. `[src: this file §4.1.4]`
- VERIFIED — Every state transition in §7 has permitted roles in 4.X.3. `[src: this file §4.X.3]`
- VERIFIED — Roles with allow/deny tests: founder, trainer, student, parent (via `apiSmoke`, `parentChat`, `rtcControls`, `navContract`, `liveReadiness`). `[src: server/tests/apiSmoke.test.js:18-558]`, `[src: server/tests/parentChat.test.js:48-306]`
- VERIFIED — `kid` alias resolved by citation; `guest`/`moderator` absent; `admin`/`support` resolved as non-roles. `[ev: role searches, 2026-11-26]`
- VERIFIED — Roles absent from code but named in conversation (`guest`, `moderator`) are in §10 with exact search. `[src: this file §10 U13]`

<!-- CHUNK2 -->

---

## 5. SURFACE INVENTORY

[VERIFIED] [U+2026-11-26] NEW RULES R1–R9 apply to this section; see §1.6 and `TPFF_UPDATE_REPORT.md` §U3.

### Public and navigation pages

| ID | Path/surface | Method | Auth required | Role gate | Purpose | State delta | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PUB-01 | `index.html` | GET | no | none | Serve the public landing page | none | VERIFIED | [ev: current HTML surface enumeration, 2026-11-26] |
| PUB-02 | `home/index.html` | GET | no | none | Serve the alternate home page | none | VERIFIED | [ev: current HTML surface enumeration, 2026-11-26] |
| PUB-03 | `pricing.html` | GET | no | none | Serve public pricing information | none | VERIFIED | [ev: current HTML surface enumeration, 2026-11-26] |
| PUB-04 | `terms.html` | GET | no | none | Serve public terms | none | VERIFIED | [ev: current HTML surface enumeration, 2026-11-26] |
| PUB-05 | `privacy.html` | GET | no | none | Serve public privacy information | none | VERIFIED | [ev: current HTML surface enumeration, 2026-11-26] |
| PUB-06 | `refund.html` | GET | no | none | Serve public refund information | none | VERIFIED | [ev: current HTML surface enumeration, 2026-11-26] |
| PUB-07 | `contact.html` | GET | no | none | Serve public contact page | none | VERIFIED | [ev: current HTML surface enumeration, 2026-11-26] |
| PUB-08 | `apps.html` | GET | no | none | Serve dashboard entry chooser | none | VERIFIED | [ev: current HTML surface enumeration, 2026-11-26] |
| PUB-NAV | static nav `[Home] [Pricing] [Terms] [Privacy] [Refund] [Contact] [Book Demo]` | GET links | no | none | Expose the exact primary navigation set | none | VERIFIED | [src: index.html:25] |
| PUB-FOOT | footer links `pricing.html`/`terms.html`/`privacy.html`/`refund.html`/`contact.html` | GET links | no | none | Expose the exact footer legal and pricing set | none | VERIFIED | [src: index.html:415] |

### Login

| ID | Path/surface | Method | Auth required | Role gate | Purpose | State delta | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LOG-01 | `login.html` | GET | no | none | Serve credential sign-in page | none | VERIFIED | [ev: current HTML surface enumeration, 2026-11-26] |
| LOG-02 | `/api/auth/login` | POST | no | none | Verify credentials and issue role-bound token | session token issued | VERIFIED | [src: server/routes/auth.js:44] |
| LOG-03 | `/api/auth/demo` | GET | no | none | Return demo identities for public desks | none | VERIFIED | [src: server/routes/auth.js:78] |
| LOG-04 | `/api/auth/me` | GET | yes | authenticated | Return current verified user | none | VERIFIED | [src: server/routes/auth.js:96] |
| LOG-05 | `/api/auth/batch` | GET | no | none | Resolve batch hint for sign-in destination | none | VERIFIED | [src: server/routes/auth.js:32] |

### Founder

| ID | Path/surface | Method | Auth required | Role gate | Purpose | State delta | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FND-PAGE | `founder/index.html` | GET | no | client-side desk | Serve founder console | none | VERIFIED | [ev: current HTML surface enumeration, 2026-11-26] |
| FND-01 | `/api/admin/support-escalations` | GET | yes | founder | List support escalations | none | VERIFIED | [src: server/routes/admin.js:12] |
| FND-02 | `/api/admin/settings` | GET | yes | founder | Read runtime settings draft | none | VERIFIED | [src: server/routes/admin.js:26] |
| FND-03 | `/api/admin/settings` | PATCH | yes | founder | Patch allowed settings sections | settings draft updated | VERIFIED | [src: server/routes/admin.js:35] |
| FND-04 | `/api/admin/settings` | DELETE | yes | founder | Reset settings draft | settings draft reset | VERIFIED | [src: server/routes/admin.js:53] |
| FND-05 | `/api/admin/batches/:batchId/allot` | POST | yes | founder | Allot batch and book trainer calendar | batch becomes allotted; sessions created | VERIFIED | [src: server/routes/admin.js:64] |
| FND-06 | `/api/admin/batches` | GET | yes | founder | List batches | none | VERIFIED | [src: server/routes/admin.js:76] |
| FND-07 | `/api/admin/trainer-onboarding` | GET | yes | founder | List trainer KYC records | none | VERIFIED | [src: server/routes/admin.js:91] |
| FND-08 | `/api/admin/trainer-onboarding/:trainerId/locked` | PATCH | yes | founder | Correct locked KYC fields | onboarding status corrected; audit appended | VERIFIED | [src: server/routes/admin.js:109] |
| FND-09 | `/api/admin/trainer-onboarding/corrections` | GET | yes | founder | Read append-only correction audit | none | VERIFIED | [src: server/routes/admin.js:120] |
| FND-10 | `/api/admin/trainer-onboarding/:trainerId/documents/:documentId` | GET | yes | founder | Read private KYC document bytes | none | VERIFIED | [src: server/routes/admin.js:131] |
| FND-11 | `/api/admin/announcements/recipients` | GET | yes | founder | List trainer and student recipients | none | VERIFIED | [src: server/routes/admin.js:147] |
| FND-12 | `/api/admin/announcements` | GET | yes | founder | List authored announcements | none | VERIFIED | [src: server/routes/admin.js:164] |
| FND-13 | `/api/admin/announcements` | POST | yes | founder | Author DLP-checked announcement | announcement stored | VERIFIED | [src: server/routes/admin.js:175] |

### Trainer

| ID | Path/surface | Method | Auth required | Role gate | Purpose | State delta | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TRN-PAGE | `trainer/index.html` | GET | no | client-side desk | Serve trainer console | none | VERIFIED | [ev: current HTML surface enumeration, 2026-11-26] |
| TRN-01 | `/api/trainer/quiz/templates` | GET | yes | trainer, founder | List quiz templates | none | VERIFIED | [src: server/routes/trainer.js:101] |
| TRN-02 | `/api/trainer/attention` | GET | yes | trainer, founder | Read trainer attention summary | none | VERIFIED | [src: server/routes/trainer.js:108] |
| TRN-03 | `/api/trainer/engagement/live/:sessionId` | GET | yes | trainer, founder | Read live engagement snapshot | none | VERIFIED | [src: server/routes/trainer.js:117] |
| TRN-04 | `/api/trainer/engagement/student/:studentId` | GET | yes | trainer, founder | Read student engagement history | none | VERIFIED | [src: server/routes/trainer.js:132] |
| TRN-05 | `/api/trainer/engagement/cohort` | GET | yes | trainer, founder | Read cohort engagement | none | VERIFIED | [src: server/routes/trainer.js:147] |
| TRN-06 | `/api/trainer/payouts` | GET | yes | trainer, founder | Read payouts | none | VERIFIED | [src: server/routes/trainer.js:152] |
| TRN-07 | `/api/trainer/payouts/:period` | GET | yes | trainer, founder | Read payouts for one period | none | VERIFIED | [src: server/routes/trainer.js:156] |
| TRN-08 | `/api/trainer/score` | GET | yes | trainer, founder | Read teaching score | none | VERIFIED | [src: server/routes/trainer.js:160] |
| TRN-09 | `/api/trainer/dashboard` | GET | yes | trainer, founder | Read trainer dashboard | none | VERIFIED | [src: server/routes/trainer.js:164] |
| TRN-10 | `/api/trainer/onboarding/documents` | POST | yes | trainer, founder | Upload private KYC image | KYC document record stored | VERIFIED | [src: server/routes/trainer.js:177] |
| TRN-11 | `/api/trainer/onboarding` | GET | yes | trainer, founder | Read own onboarding view | none | VERIFIED | [src: server/routes/trainer.js:189] |
| TRN-12 | `/api/trainer/onboarding` | POST | yes | trainer, founder | Submit locked onboarding KYC | onboarding becomes submitted | VERIFIED | [src: server/routes/trainer.js:195] |
| TRN-13 | `/api/trainer/onboarding/personal` | PATCH | yes | trainer, founder | Edit personal and bank fields | editable onboarding fields updated | VERIFIED | [src: server/routes/trainer.js:207] |
| TRN-14 | `/api/trainer/batches` | GET | yes | trainer, founder | List allotted batches | none | VERIFIED | [src: server/routes/trainer.js:219] |
| TRN-15 | `/api/trainer/attendance` | GET | yes | trainer, founder | List attendance | none | VERIFIED | [src: server/routes/trainer.js:225] |
| TRN-16 | `/api/trainer/attendance/:sessionId` | PATCH | yes | trainer, founder | Patch attendance status | attendance updated | VERIFIED | [src: server/routes/trainer.js:232] |
| TRN-17 | `/api/trainer/attendance/:sessionId/save` | POST | yes | trainer, founder | Save attendance details | attendance saved | VERIFIED | [src: server/routes/trainer.js:260] |
| TRN-18 | `/api/trainer/sessions` | GET | yes | trainer, founder | List trainer sessions | none | VERIFIED | [src: server/routes/trainer.js:298] |
| TRN-19 | `/api/trainer/sessions` | POST | yes | trainer, founder | Create live scheduled session | session scheduled | VERIFIED | [src: server/routes/trainer.js:308] |
| TRN-20 | `/api/trainer/sessions/:sessionId` | GET | yes | trainer, founder | Read trainer session detail | none | VERIFIED | [src: server/routes/trainer.js:348] |
| TRN-21 | `/api/trainer/sessions/:sessionId/planner` | PATCH | yes | trainer, founder | Patch planner items | planner updated | VERIFIED | [src: server/routes/trainer.js:352] |
| TRN-22 | `/api/trainer/sessions/:sessionId/page` | PATCH | yes | trainer, founder | Change current lesson page | current page updated | VERIFIED | [src: server/routes/trainer.js:380] |
| TRN-23 | `/api/trainer/sessions/:sessionId/quiz/launch` | POST | yes | trainer, founder | Launch quiz | quiz ready to live, answering | VERIFIED | [src: server/routes/trainer.js:395] |
| TRN-24 | `/api/trainer/sessions/:sessionId/quiz/reveal` | POST | yes | trainer, founder | Reveal answer | quiz phase revealed | VERIFIED | [src: server/routes/trainer.js:413] |
| TRN-25 | `/api/trainer/sessions/:sessionId/quiz/hints` | POST | yes | trainer, founder | Grant a trainer hint | granted hint stored | VERIFIED | [src: server/routes/trainer.js:459] |
| TRN-26 | `/api/trainer/sessions/:sessionId/quiz/next` | POST | yes | trainer, founder | Advance question or complete quiz | phase answering or complete; status may end | VERIFIED | [src: server/routes/trainer.js:501] |
| TRN-27 | `/api/trainer/sessions/:sessionId/quiz/drafts` | GET | yes | trainer, founder | List quiz drafts | none | VERIFIED | [src: server/routes/trainer.js:540] |
| TRN-28 | `/api/trainer/sessions/:sessionId/quiz/drafts/:draftId/approve` | POST | yes | trainer, founder | Approve draft into quiz | draft promoted | VERIFIED | [src: server/routes/trainer.js:544] |
| TRN-29 | `/api/trainer/sessions/:sessionId/quiz/reteach` | POST | yes | trainer, founder | Start reteach phase | quiz phase reteach | VERIFIED | [src: server/routes/trainer.js:573] |
| TRN-30 | `/api/trainer/sessions/:sessionId/quiz/generate` | POST | yes | trainer, founder | Generate moderated quiz drafts | quiz drafts appended | VERIFIED | [src: server/routes/trainer.js:586] |
| TRN-31 | `/api/trainer/sessions/:sessionId/quiz/new-check` | POST | yes | trainer, founder | Add required parallel check | question added; phase recheck | VERIFIED | [src: server/routes/trainer.js:645] |
| TRN-32 | `/api/trainer/slots` | GET | yes | trainer, founder | List trainer slots | none | VERIFIED | [src: server/routes/trainer.js:742] |
| TRN-33 | `/api/trainer/slots` | POST | yes | trainer, founder | Create trainer slot | slot stored | VERIFIED | [src: server/routes/trainer.js:745] |
| TRN-34 | `/api/trainer/slots/:slotId` | DELETE | yes | trainer, founder | Delete trainer slot | slot removed | VERIFIED | [src: server/routes/trainer.js:756] |
| TRN-35 | `/api/trainer/schedule/week` | GET | yes | trainer, founder | Read weekly schedule | none | VERIFIED | [src: server/routes/trainer.js:767] |
| TRN-36 | `/api/trainer/schedule` | GET | yes | trainer, founder | Read schedule | none | VERIFIED | [src: server/routes/trainer.js:774] |
| TRN-37 | `/api/trainer/students/:studentId/curriculum` | PUT | yes | trainer, founder | Update academic curriculum | curriculum updated | VERIFIED | [src: server/routes/trainer.js:783] |
| TRN-38 | `/api/trainer/copilot/query` | POST | yes | trainer, founder | Query trainer support assistant | audit log written | VERIFIED | [src: server/routes/trainer.js:805] |

### Student

| ID | Path/surface | Method | Auth required | Role gate | Purpose | State delta | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STU-PAGE | `student/index.html` | GET | no | client-side desk | Serve student desk | none | VERIFIED | [ev: current HTML surface enumeration, 2026-11-26] |
| STU-LMS | `lms/index.html` | GET | no | client-side library | Serve learning library | none | VERIFIED | [ev: current HTML surface enumeration, 2026-11-26] |
| STU-01 | `/api/student/dashboard` | GET | yes | student, founder | Read student dashboard | none | VERIFIED | [src: server/routes/student.js:15] |
| STU-02 | `/api/student/sessions/:sessionId` | GET | yes | student, founder | Read student-safe session | none | VERIFIED | [src: server/routes/student.js:20] |
| STU-03 | `/api/student/sessions/:sessionId/quiz/answers` | POST | yes | student, founder | Submit quiz answer | attempt appended; phase awaiting reveal | VERIFIED | [src: server/routes/student.js:36] |
| STU-04 | `/api/student/sessions/:sessionId/quiz/attempts/:attemptId` | GET | yes | student, founder | Read own quiz attempt feedback | none | VERIFIED | [src: server/routes/student.js:92] |
| STU-05 | `/api/student/me/curriculum` | GET | yes | student, founder | Read own academic curriculum | none | VERIFIED | [src: server/routes/student.js:121] |
| STU-06 | `/api/student/practice/batch` | POST | yes | student, founder | Create mastery practice batch | practice batch stored | VERIFIED | [src: server/routes/student.js:129] |
| STU-07 | `/api/student/practice/batch/:batchId` | GET | yes | student, founder | Read own practice batch | none | VERIFIED | [src: server/routes/student.js:150] |
| STU-08 | `/api/student/practice/batch/:batchId/answer` | POST | yes | student, founder | Answer practice question | attempt appended | VERIFIED | [src: server/routes/student.js:162] |
| STU-09 | `/api/student/tutor/query` | POST | yes | student, founder | Query study buddy | audit log written | VERIFIED | [src: server/routes/student.js:179] |

### Parent

| ID | Path/surface | Method | Auth required | Role gate | Purpose | State delta | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PAR-PAGE | `parent/index.html` | GET | no | client-side desk | Serve parent desk | none | VERIFIED | [ev: current HTML surface enumeration, 2026-11-26] |
| PAR-01 | `/api/parent-chat/thread` | GET | yes | parent, trainer, founder by service | Read resolved child thread | none | VERIFIED | [src: server/routes/parentChat.js:86] |
| PAR-02 | `/api/parent-chat/thread/:studentId` | GET | yes | parent, trainer, founder by service | Read named child thread | none | VERIFIED | [src: server/routes/parentChat.js:87] |
| PAR-03 | `/api/parent-chat/threads/:studentId/messages` | GET | yes | parent, trainer, founder by service | List bounded thread messages | none | VERIFIED | [src: server/routes/parentChat.js:88] |
| PAR-04 | `/api/parent-chat/messages` | GET | yes | parent, trainer, founder by service | List messages for resolved thread | none | VERIFIED | [src: server/routes/parentChat.js:89] |
| PAR-05 | `/api/parent-chat/thread/:studentId/messages` | POST | yes | parent, trainer only for write | Send DLP-checked message | message stored and unread bumped | VERIFIED | [src: server/routes/parentChat.js:91] |
| PAR-06 | `/api/parent-chat/threads/:studentId/messages` | POST | yes | parent, trainer only for write | Send aliased DLP-checked message | message stored and unread bumped | VERIFIED | [src: server/routes/parentChat.js:92] |
| PAR-07 | `/api/parent-chat/messages` | POST | yes | parent, trainer only for write | Send resolved DLP-checked message | message stored and unread bumped | VERIFIED | [src: server/routes/parentChat.js:93] |
| PAR-08 | `/api/parent-chat/thread/:studentId/read` | POST | yes | participant read | Mark thread read | unread counter cleared | VERIFIED | [src: server/routes/parentChat.js:95] |
| PAR-09 | `/api/parent-chat/threads/:studentId/mark-read` | POST | yes | participant read | Mark thread read by alias | unread counter cleared | VERIFIED | [src: server/routes/parentChat.js:96] |
| PAR-10 | `/api/parent-chat/read` | POST | yes | participant read | Mark resolved thread read | unread counter cleared | VERIFIED | [src: server/routes/parentChat.js:97] |
| PAR-11 | `/api/parent-chat/unread` | GET | yes | parent, trainer, founder | Read unread summary | none | VERIFIED | [src: server/routes/parentChat.js:99] |
| PAR-12 | `/api/parent-chat/unread-summary` | GET | yes | parent, trainer, founder | Read unread dashboard summary | none | VERIFIED | [src: server/routes/parentChat.js:100] |
| PAR-13 | `/api/parent-chat/flags` | GET | yes | founder | Read DLP flags | none | VERIFIED | [src: server/routes/parentChat.js:102] |
| PAR-14 | `/api/parent-chat/privacy-flags` | GET | yes | founder | Read aliased DLP flags | none | VERIFIED | [src: server/routes/parentChat.js:103] |

### Shared API

| ID | Path/surface | Method | Auth required | Role gate | Purpose | State delta | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SHR-PAGE | `classroom/index.html` | GET | no | client-side room | Serve shared live classroom | none | VERIFIED | [ev: current HTML surface enumeration, 2026-11-26] |
| SHR-01 | `/api/health` | GET | no | none | Report process health | none | VERIFIED | [src: server/app.js:56] |
| SHR-02 | `/api/public/config` | GET | no | none | Expose public runtime config | none | VERIFIED | [src: server/app.js:68] |
| SHR-03 | `/api/realtime/log` | GET | yes | trainer, founder | Read realtime log | none | VERIFIED | [src: server/app.js:100] |
| SHR-04 | `/favicon.ico` | GET | no | none | Serve favicon | none | VERIFIED | [src: server/app.js:106] |
| SHR-05 | `/api/agora/token` | GET | yes | session party by token service | Issue RTC token after access and network gates | token issued; observer may be recorded | VERIFIED | [src: server/routes/agora.js:37] |
| SHR-06 | `/api/agora/recording/start` | POST | yes | trainer, founder | Start Agora recording | recording started | VERIFIED | [src: server/routes/agora.js:48] |
| SHR-07 | `/api/agora/recording/stop` | POST | yes | trainer, founder | Stop Agora recording | recording stopped | VERIFIED | [src: server/routes/agora.js:69] |
| SHR-08 | `/api/announcements/` | GET | yes | authenticated; founder sees all | List visible announcements | none | VERIFIED | [src: server/routes/announcements.js:31] |
| SHR-09 | `/api/announcements/unread` | GET | yes | trainer, student | Read unread summary | none | VERIFIED | [src: server/routes/announcements.js:38] |
| SHR-10 | `/api/announcements/:id/read` | POST | yes | trainer, student | Mark announcement read | read receipt stored | VERIFIED | [src: server/routes/announcements.js:43] |
| SHR-11 | `/api/chat/trainer-support` | POST | yes | trainer, founder | Query trainer support assistant | audit log written | VERIFIED | [src: server/routes/chat.js:47] |
| SHR-12 | `/api/chat/student-doubt` | POST | yes | student, founder | Query study buddy assistant | audit log written | VERIFIED | [src: server/routes/chat.js:48] |
| SHR-13 | `/api/contact/` | POST | no | none | Submit public contact request | contact request stored | VERIFIED | [src: server/routes/contact.js:28] |
| SHR-14 | `/api/leaves/` | GET | yes | trainer, student, founder | List leave options and requests | none | VERIFIED | [src: server/routes/leaves.js:10] |
| SHR-15 | `/api/leaves/` | POST | yes | trainer, student | Apply mutual leave | leave approved; session status leave; attendance leave | VERIFIED | [src: server/routes/leaves.js:14] |
| SHR-16 | `/api/network/probe` | GET | no | none | Read network probe metadata | none | VERIFIED | [src: server/routes/network.js:21] |
| SHR-17 | `/api/network/probe` | POST | no | none | Execute network probe | none | VERIFIED | [src: server/routes/network.js:27] |
| SHR-18 | `/api/policy/config` | GET | yes | authenticated | Read policy config | none | VERIFIED | [src: server/routes/policy.js:7] |
| SHR-19 | `/api/razorpay/orders/monthly` | POST | yes | student, founder | Create monthly pack order | order stored with created status | VERIFIED | [src: server/routes/razorpay.js:10] |
| SHR-20 | `/api/sessions/:sessionId/state` | GET | yes | session party or founder by serializer | Read browser-safe session state | none | VERIFIED | [src: server/routes/sessions.js:25] |
| SHR-21 | `/api/sessions/:sessionId/rtc-token` | POST | yes | trainer, student, opt-in founder | Gate and issue RTC token | observer flag may be stored | VERIFIED | [src: server/routes/sessions.js:30] |
| SHR-22 | `/api/sessions/:sessionId/events` | GET | yes | session party by serializer | Poll scrubbed session events | none | VERIFIED | [src: server/routes/sessions.js:129] |
| SHR-23 | `/api/sessions/:sessionId/chat` | POST | yes | session party | Send classroom chat | chat event stored | VERIFIED | [src: server/routes/sessions.js:147] |
| SHR-24 | `/api/sessions/:sessionId/board/share` | POST | yes | trainer, founder | Share board state | board event stored | VERIFIED | [src: server/routes/sessions.js:170] |
| SHR-25 | `/api/sessions/:sessionId/media-permission` | POST | yes | trainer, founder | Set student media toggle permission | media permission version incremented | VERIFIED | [src: server/routes/sessions.js:180] |
| SHR-26 | `/api/sessions/:sessionId/media-state` | POST | yes | trainer, founder | Set intentional remote mic or camera state | media state version incremented | VERIFIED | [src: server/routes/sessions.js:205] |
| SHR-27 | `/api/sessions/:sessionId/reaction-permission` | POST | yes | trainer, founder | Set student reaction permission | reaction permission updated | VERIFIED | [src: server/routes/sessions.js:234] |
| SHR-28 | `/api/sessions/:sessionId/network-check` | POST | yes | session party; role from JWT | Submit participant network check | network check result stored | VERIFIED | [src: server/routes/sessions.js:263] |
| SHR-29 | `/api/sessions/:sessionId/badges` | POST | yes | trainer, founder | Award fixed-catalog badge | badge stored | VERIFIED | [src: server/routes/sessions.js:293] |
| SHR-30 | `/api/sessions/:sessionId/celebrate` | POST | yes | trainer, founder | Publish server-owned celebration | celebration event stored | VERIFIED | [src: server/routes/sessions.js:322] |
| SHR-31 | `/api/sessions/:sessionId/reactions` | POST | yes | session party by permission | Send reaction | reaction event stored | VERIFIED | [src: server/routes/sessions.js:337] |
| SHR-32 | `/api/sessions/:sessionId/notify-parent` | POST | yes | trainer, founder | Send parent recap notification | notification dispatched | VERIFIED | [src: server/routes/sessions.js:365] |
| SHR-33 | `/api/sessions/:sessionId/presence` | GET | yes | session party or founder | Read presence snapshot | none | VERIFIED | [src: server/routes/sessions.js:378] |
| SHR-34 | `/api/sessions/:sessionId/presence` | POST | yes | session party | Record presence heartbeat | presence event appended | VERIFIED | [src: server/routes/sessions.js:382] |
| SHR-35 | `/api/sessions/:sessionId/presence/finalize` | POST | yes | trainer, founder | Finalize presence snapshot | snapshot stored | VERIFIED | [src: server/routes/sessions.js:394] |
| SHR-36 | `/api/sessions/:sessionId/end` | POST | yes | trainer, founder | End session with gated recap and mastery decision | session ended; quiz may end; mastery updated | VERIFIED | [src: server/routes/sessions.js:398] |

### Worker

| ID | Path/surface | Method | Auth required | Role gate | Purpose | State delta | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WRK-01 | worker `/health` | GET | no | none | Report worker health and model config | none | VERIFIED | [src: worker.js:256] |
| WRK-02 | worker `/trainer-support` | POST | no | worker bearer contract | Handle trainer support AI request | audit write through service role | VERIFIED | [src: worker.js:265] |
| WRK-03 | worker `/student-doubt` | POST | no | worker bearer contract | Handle student doubt AI request | audit write through service role | VERIFIED | [src: worker.js:266] |

### Cron and jobs

| ID | Path/surface | Method | Auth required | Role gate | Purpose | State delta | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| JOB-01 | `server/jobs/reminders.js` | timer job / `--once` | no | process-only | Send 24h and 1h student reminders plus daily trainer/founder Needs Attention digests | durable claim rows in service-only `reminder_claim` records | VERIFIED | [src: server/jobs/reminders.js:1] |
| JOB-02 | `.github/workflows/ci.yml` verify job | push/pull_request | no | repository CI | Install, audit, test, and dry-run migration plan | none in application data | VERIFIED | [src: .github/workflows/ci.yml:3] |
| JOB-03 | `.github/workflows/ci.yml` schedule | cron `*/5 * * * *` | no | repository CI | Run `reminders:once` every five minutes on the default branch | only successful deliveries create durable claims | VERIFIED | [src: .github/workflows/ci.yml:6] |
| JOB-04 | `.github/workflows/ci.yml` workflow dispatch | manual | no | repository maintainer | Run the same one-shot reminder + Needs Attention job on demand | only successful deliveries create durable claims | VERIFIED | [src: .github/workflows/ci.yml:9] |

### Webhooks

| ID | Path/surface | Method | Auth required | Role gate | Purpose | State delta | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HOOK-01 | `/api/agora/webhook` | POST | no | HMAC `AGORA_WEBHOOK_SECRET` | Ingest verified join and leave events | presence event appended | VERIFIED | [src: server/routes/agora.js:91] |
| HOOK-02 | `/api/razorpay/webhook` | POST | no | HMAC `RAZORPAY_WEBHOOK_SECRET` | Credit captured monthly pack payment | payment recorded; sessions credited; order credited | VERIFIED | [src: server/routes/razorpay.js:44] |
| HOOK-03 | `/api/webhooks/recording` | POST | no | provider signature in handler | Ingest recording readiness event | recording state updated | VERIFIED | [src: server/routes/webhooks.js:49] |
| HOOK-04 | `/api/webhooks/whatsapp` | POST | no | provider signature in handler | Inbound WhatsApp message | message stored; escalation may be created | VERIFIED | [src: server/routes/webhooks.js:85] |

### CLI and migration commands

| ID | Path/surface | Method | Auth required | Role gate | Purpose | State delta | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CLI-01 | `npm start` at repository root | CLI | no | operator | Start `node server/index.js` | process started | VERIFIED | [src: package.json:7] |
| CLI-02 | `npm run dev` at repository root | CLI | no | operator | Start watched server | process started | VERIFIED | [src: package.json:8] |
| CLI-03 | `npm test` at repository root | CLI | no | operator | Forward tests to server package | none | VERIFIED | [src: package.json:9] |
| CLI-04 | `npm run migrate` at repository root | CLI | no | operator | Forward migration plan to server package | none | VERIFIED | [src: package.json:10] |
| CLI-05 | `npm run seed` at repository root | CLI | no | operator | Forward seed script to server package | mock or live seed writes | VERIFIED | [src: package.json:11] |
| CLI-06 | `npm run reminders` at repository root | CLI | no | operator | Run reminders job | reminder timer started | VERIFIED | [src: package.json:12] |
| CLI-14 | `npm run reminders:once` at repository root | CLI | no | operator | Run one reminder + Needs Attention pass for cron | durable delivery claims | VERIFIED | [src: package.json:13] |
| CLI-07 | `npm start` in `server` | CLI | no | operator | Start `node index.js` | process started | VERIFIED | [src: server/package.json:8] |
| CLI-08 | `npm run dev` in `server` | CLI | no | operator | Start watched server entry | process started | VERIFIED | [src: server/package.json:9] |
| CLI-09 | `npm test` in `server` | CLI | no | operator | Run full Node test chain | none | VERIFIED | [src: server/package.json:13] |
| CLI-10 | `npm run migrate` in `server` | CLI | no | operator | Print ordered migration plan and checksums | none | VERIFIED | [src: server/migrate.js:3] |
| CLI-11 | `npm run migrate -- --apply` in `server` | CLI | yes | `DATABASE_URL` plus `MATHIFY_MIGRATE_CONFIRM=apply` | Apply all pending migrations in one transaction | migrations recorded in marker table | VERIFIED | [src: server/migrate.js:5] |
| CLI-12 | `npm run seed` in `server` | CLI | no | operator | Run `node scripts/seed.js` | seed writes | VERIFIED | [src: server/package.json:11] |
| CLI-13 | `npm run reminders` in `server` | CLI | no | operator | Run `node jobs/reminders.js` | reminder timer started | VERIFIED | [src: server/package.json:13] |
| CLI-15 | `npm run reminders:once` in `server` | CLI | no | operator | Run `node jobs/reminders.js --once` | durable delivery claims | VERIFIED | [src: server/package.json:14] |
| RECON-01 | HTTP definition reconciliation | inventory | no | none | 114 router definitions plus 4 app-level definitions equal 118 HTTP definitions | none | VERIFIED | [ev: current router and app definition enumeration, 2026-11-26] |

## 6. DATA MODEL & PERSISTENCE

[VERIFIED] [U+2026-11-26] NEW RULES R1–R9 apply to this section; see §1.6 and `TPFF_UPDATE_REPORT.md` §U3.

### Relational tables and views

| Table/view | Columns | Relationships and JSON blobs | Owner and retention | Migration | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- |
| `public.users` | `id, name, email, role, password_hash, status, title, grade, created_at` | role constrained to `founder/trainer/student`; status `active/suspended`; referenced by profiles, packs, orders, payments, sessions, quiz reveals/attempts, attendance, leaves, slots, presence events, payouts, incidents, bonuses, rankings and escalations | founder owns all rows; self read/update only | 0001 | VERIFIED | [src: server/db/schema.sql:29] |
| `public.trainer_profiles` | `user_id, pay_per_session, max_hours_per_day, max_sessions_per_day, active` | `user_id` references `public.users(id)` on delete cascade | trainer owns own row; founder all | 0001 | VERIFIED | [src: server/db/schema.sql:43] |
| `public.student_profiles` | `user_id, mastery, streak, sessions_remaining, batch` | `user_id` references `public.users(id)` on delete cascade | student owns own row; founder all | 0001 | VERIFIED | [src: server/db/schema.sql:51] |
| `public.packs` | `id, student_id, label, total_sessions, remaining_sessions, purchased_at, expires_at, refundable, payment_ref` | `student_id` references `public.users(id)`; expiry constrained to `purchased_at + 38 days` | student owns own pack; founder all | 0001 | VERIFIED | [src: server/db/schema.sql:64] |
| `public.razorpay_orders` | `id, student_id, pack_id, sessions, amount_integer, currency, receipt, status, created_at` | `student_id` references `public.users(id)`; `payments.order_id` references this table | student reads own order; founder all; service writes | 0001 | VERIFIED | [src: server/db/schema.sql:78] |
| `public.payments` | `id, order_id, student_id, amount_integer, currency, sessions_credited, captured_at, created_at` | `order_id` references `public.razorpay_orders(id)`; `student_id` references `public.users(id)` | student reads own payments; founder all | 0001 | VERIFIED | [src: server/db/schema.sql:90] |
| `public.sessions` | `id, code, trainer_id, student_id, pack_id, title, status, current_page, scheduled_at, started_at, ends_at, elapsed_seconds, cancelled_at, cancelled_by` | `trainer_id` and `student_id` reference `public.users(id)`; `pack_id` references `public.packs(id)`; party inequality enforced | trainer owns session writes; student read; founder all | 0001 | VERIFIED | [src: server/db/schema.sql:105] |
| `public.lesson_pages` | `id, session_id, page, title, eyebrow, prompt, sketch_label` | `session_id` references `public.sessions(id)` on delete cascade | trainer manages; student reads own session pages | 0001 | VERIFIED | [src: server/db/schema.sql:139] |
| `public.trainer_notes` | `id, page_id, title, body, created_at` | `page_id` references `public.lesson_pages(id)` on delete cascade | trainer only; no student grant | 0001 | VERIFIED | [src: server/db/schema.sql:151] |
| `public.planner_items` | `id, session_id, label, done, position` | `session_id` references `public.sessions(id)` on delete cascade | trainer manages; student reads | 0001 | VERIFIED | [src: server/db/schema.sql:159] |
| `public.quiz_templates` | `id, objective, difficulty, variant_count, active` | referenced by `quiz_questions.template_id` and `quiz_drafts.template_id` | trainer reads active; no student grant | 0001 | VERIFIED | [src: server/db/schema.sql:172] |
| `public.quizzes` | `id, session_id, status, phase, current_question_id, started_at` | `session_id` references `public.sessions(id)` on delete cascade; `current_question_id` references `quiz_questions(id)` on delete set null | trainer owns quiz writes; student read | 0001 | VERIFIED | [src: server/db/schema.sql:180] |
| `public.quiz_questions` | `id, quiz_id, prompt, options, answer_index, hint, explanation, position, source, template_id, status` | `options` is JSONB; `quiz_id` references `quizzes(id)`; `template_id` references `quiz_templates(id)`; answer key columns revoked from Data API | trainer owns; student safe view only | 0001 | VERIFIED | [src: server/db/schema.sql:191] |
| `public.quiz_drafts` | `id, quiz_id, template_id, prompt, options, answer_index, hint, explanation, status, created_at` | `options` is JSONB; `quiz_id` references `quizzes(id)`; `template_id` references `quiz_templates(id)` | trainer only; no student grant | 0001 | VERIFIED | [src: server/db/schema.sql:207] |
| `public.quiz_reveals` | `id, question_id, revealed_by, created_at` | `question_id` references `quiz_questions(id)` on delete cascade; `revealed_by` references `users(id)` | trainer writes; founder all | 0001 | VERIFIED | [src: server/db/schema.sql:221] |
| `public.quiz_attempts` | `id, question_id, student_id, option_index, correct, created_at` | `question_id` references `quiz_questions(id)`; `student_id` references `users(id)`; `correct` revoked from Data API | student sees own safe view; trainer reads session attempts | 0001 | VERIFIED | [src: server/db/schema.sql:228] |
| `public.board_strokes` | `id, session_id, seq, page, tool, color, points, created_at` | `points` is JSONB; `session_id` references `sessions(id)` on delete cascade | trainer writes; student reads; no student writes | 0001 | VERIFIED | [src: server/db/schema.sql:287] |
| `public.quiz_canvas_strokes` | `id, session_id, question_id, stroke_id, seq, surface, type, x, y, color, width, created_at` | `session_id` references `sessions(id)`; `question_id` references `quiz_questions(id)` on delete set null | trainer writes; student select only | 0001 | VERIFIED | [src: server/db/schema.sql:299] |
| `public.recordings` | `id, session_id, channel_name, uid, resource_id, sid, status, mode, provider, url, duration_seconds, started_at, stopped_at, ready_at` | `session_id` references `sessions(id)` on delete cascade | trainer manages; student reads own session recording | 0001 | VERIFIED | [src: server/db/schema.sql:322] |
| `public.attendance` | `id, session_id, trainer_id, student_id, status, marked_at` | `session_id`, `trainer_id` and `student_id` reference sessions and users | trainer writes; student reads own | 0001 | VERIFIED | [src: server/db/schema.sql:357] |
| `public.leaves` | `id, trainer_id, student_id, session_id, requested_by, requested_by_role, starts_on, ends_on, notice_hours, period, reason, status, fine_code, student_status, pack_penalty, auto_approved, decided_at, created_at` | trainer, student, session and requester IDs reference users/sessions; session deletion sets `session_id` null | mutual auto-approved leave; trainer pay 0; no pack penalty | 0001 | VERIFIED | [src: server/db/schema.sql:375] |
| `public.trainer_slots` | `id, trainer_id, day_of_week, slot_date, start_minute_utc, end_minute_utc, label, created_at` | `trainer_id` references `users(id)` | trainer owns; founder all | 0001 | VERIFIED | [src: server/db/schema.sql:416] |
| `public.presence_events` | `id, session_id, user_id, role, kind, active, learning_events, cumulative_learning_events, agora_uid, leaving, at` | `session_id` and `user_id` reference sessions/users | append-only event evidence; participant select only | 0001 | VERIFIED | [src: server/db/schema.sql:429] |
| `public.presence_snapshots` | `id, session_id, computed_at, trainer_present_minutes, student_present_minutes, trainer_present, student_present, payout_eligible, snapshot` | `snapshot` is JSONB; `session_id` references `sessions(id)` on delete cascade | participant select only | 0001 | VERIFIED | [src: server/db/schema.sql:443] |
| `public.payouts` | `id, trainer_id, period_start, period_end, session_count, hours, bonus, fines, mvt_award, amount, status, breakdown, requires_manual_review` | `breakdown` is JSONB; `trainer_id` references `users(id)` | founder writes; trainer reads own; no student grant | 0001 | VERIFIED | [src: server/db/schema.sql:458] |
| `public.trainer_incidents` | `id, trainer_id, session_id, type, notice_hours, status, fine_code, occurred_on, created_at` | trainer references users; session deletion sets `session_id` null | founder writes; trainer reads own; no student grant | 0001 | VERIFIED | [src: server/db/schema.sql:485] |
| `public.attendance_bonus_months` | `id, trainer_id, period, qualified` | `trainer_id` references `users(id)` | founder writes; trainer reads own; no student grant | 0001 | VERIFIED | [src: server/db/schema.sql:498] |
| `public.mvt_rankings` | `id, period, trainer_id, rank, source` | `trainer_id` references `users(id)` | founder writes; trainer reads own; no student grant | 0001 | VERIFIED | [src: server/db/schema.sql:506] |
| `public.whatsapp_messages` | `id, from_number, body, received_at` | inbound provider message body | founder only | 0001 | VERIFIED | [src: server/db/schema.sql:525] |
| `public.support_escalations` | `id, from_number, student_id, student_name, message, summary, status, notifications, created_at` | `notifications` is JSONB; `student_id` references `users(id)` | founder only | 0001 | VERIFIED | [src: server/db/schema.sql:532] |
| `public.trainer_support_logs` | `id, actor_id, role, question, reply, source, reason, model, image_used, image_type, created_at` | founder-read audit; no image bytes or contact data | service-role writes; no anon/authenticated Data API grant | 0004 | VERIFIED | [src: server/db/schema.sql:547] |
| `public.student_doubt_logs` | `id, actor_id, role, question, reply, source, reason, model, image_used, image_type, created_at` | founder-read audit; no image bytes or contact data | service-role writes; no anon/authenticated Data API grant | 0004 | VERIFIED | [src: server/db/schema.sql:561] |
| `public.student_curriculum` | `student_id, curriculum, grade, language, school_chapter, updated_by, updated_at` | `student_id` and `updated_by` reference `users(id)`; academic fields only | student selects own; trainer selects/updates roster; column-level grant | 0002 | VERIFIED | [src: server/migrations/0002_student_curriculum.sql:15] |
| `public.mathify_records` | `collection, key, data, updated_at` in 0003; `collection, key, data, created_at, updated_at` in 0006 | `data` is JSONB service-only store for app collections | service-role only; no anon/authenticated grants | 0003 and 0006 | VERIFIED | [src: server/migrations/0003_live_persistence.sql:13] |
| `public.mathify_session_events` | `seq, session_id, event, payload, created_at` | `payload` is JSONB outbox; indexed by `(session_id, seq)` | service-role only; browser receives scrubbed allowlisted events | 0003 | VERIFIED | [src: server/migrations/0003_live_persistence.sql:25] |
| view `public.student_quiz_questions` | `id, quiz_id, prompt, options, position, status, source` | joins quiz, quiz_question and session tables; excludes `hint`, answer key and explanation fields [U+2026-11-26] | security invoker; student only | 0001 + 0007 review | VERIFIED | [src: server/db/schema.sql:629-645]; [src: server/migrations/0007_student_hint_lockdown.sql:10-31] |
| view `public.student_quiz_attempts` | `id, question_id, student_id, option_index, created_at` | joins attempt, question, quiz and session tables; excludes `correct` | security invoker; student only | 0001 | VERIFIED | [src: server/db/schema.sql:649] |
| view `public.session_participant_names` | `name` | projects only the partner display name from `public.users` | security barrier; participant or founder predicate | 0001 | VERIFIED | [src: server/db/schema.sql:672] |

### Service-only JSON collections

| Collection/key shape | Stored JSON payload | Ownership and exposure | Tag | Source |
| --- | --- | --- | --- | --- |
| `batch` keyed by batch id | one student, optional trainer, code, status, slots and allotment metadata | founder authoring; trainer sees name plus batch id; student sees trainer name and batch code only | VERIFIED | [src: server/services/batchService.js:40] |
| `trainer_onboarding` keyed by trainer id | locked identity and documents plus editable personal and bank details | trainer owns; founder can reveal and correct; no student payload | VERIFIED | [src: server/services/trainerOnboardingService.js:142] |
| `trainer_onboarding_correction` keyed by correction id | before/after locked fields, corrected by, reason and timestamp | founder-only append-only audit | VERIFIED | [src: server/services/trainerOnboardingService.js:239] |
| `trainer_kyc_document` keyed by document id | image metadata; live image bytes are in private Storage and mock bytes stay service-only | founder reads by protected route; browsers never receive byte field | VERIFIED | [src: server/services/trainerDocumentService.js:125] |
| remaining service collections | `announcement`, `announcement_read`, `practice_batches`, `users`, `sessions`, `attendance`, `recordings`, `razorpay_orders`, `payments`, `packs`, `whatsapp_messages`, `support_escalations`, `leave_requests`, `presence_events`, `presence_snapshots`, `reactions`, `trainer_slots`, `contact_requests`, `parent_chat_message`, `parent_chat_flag`, `parent_chat_read` | service-role facade only; no browser Data API role is granted | VERIFIED | [ev: collection enumeration in server/db/supabase.js, 2026-11-26] |

### Migration order and status

| Order | Migration | Purpose and guard | Applied status | Tag | Source |
| --- | --- | --- | --- | --- | --- |
| 1 | `0001_baseline.sql` | baseline schema, RLS, safe student views, answer-key lockdown and explicit grants | live apply status is not proven in this workspace | UNKNOWN | [src: server/migrations/README.md:11] |
| 2 | `0002_student_curriculum.sql` | academic-only curriculum table with column-level authenticated grant | live apply status is not proven in this workspace | UNKNOWN | [src: server/migrations/README.md:12] |
| 3 | `0003_live_persistence.sql` | service-only `mathify_records` and `mathify_session_events` | live apply status is not proven in this workspace | UNKNOWN | [src: server/migrations/README.md:13] |
| 4 | `0004_ai_chat_logs.sql` | founder-only sanitized AI audit tables with no anon/authenticated grants | live apply status is not proven in this workspace | UNKNOWN | [src: server/migrations/0004_ai_chat_logs.sql:1] |
| 5 | `0006_trainer_onboarding_batches.sql` | service-only KYC and batch collections; no anon/authenticated Data API grants | live apply status is not proven in this workspace | UNKNOWN | [src: server/migrations/0006_trainer_onboarding_batches.sql:1] |
| 6 | `0007_student_hint_lockdown.sql` | revokes `hint` from `authenticated` and recreates `student_quiz_questions` without `hint` [U+2026-11-26] | review-only; no live apply performed | UNKNOWN | [src: server/migrations/0007_student_hint_lockdown.sql:10-31]; [ev: npm.cmd run migrate --silent --prefix server, 2026-11-26] |
| 7 | `0008_payment_idempotency.sql` | adds service-only Razorpay payment/order-credit relations and unique payment-identity indexes [U+2026-11-26] | review-only; no live apply performed | UNKNOWN | [src: server/migrations/0008_payment_idempotency.sql:15-53]; [ev: npm.cmd run migrate --silent --prefix server, 2026-11-26] |
| ORDER | `0001, 0002, 0003, 0004, 0006, 0007, 0008` | runner sorts filenames lexicographically before planning and applying | none | VERIFIED | [src: server/migrate.js:26]; [ev: npm.cmd run migrate --silent --prefix server, 2026-11-26] |
| DOC-STATUS | README documentary note | the repository README states that no live migration has been applied | documentary only | VERIFIED | [src: server/migrations/README.md:50] |
| LIVE-STATUS | exact close command | `psql "$DATABASE_URL" -c "select version, name, checksum, applied_at from public.mathify_migrations order by version;"`; apply needs reviewed SQL plus `DATABASE_URL` and `MATHIFY_MIGRATE_CONFIRM=apply` and explicit founder approval | not verified; no apply by this pass | UNKNOWN | [ev: no live database access in this workspace, 2026-11-26] |

### Stores, ownership and retention

| Store | Ownership and access | Retention or lifetime | Tag | Source |
| --- | --- | --- | --- | --- |
| mock memory | service process arrays in `server/db/mock.js`; shape mirrors SQL schema | process-local and lost on restart | VERIFIED | [src: server/db/mock.js:1] |
| Supabase live | server-side service-role secret only; publishable key reserved for browser Realtime | persistent remote rows; live write success not proven here | VERIFIED | [src: server/db/supabase.js:5] |
| Storage bucket `trainer-kyc` | private bucket; service-role key on upload and read; browser never sees bytes | KYC images up to 4 MB; metadata in service-only records | VERIFIED | [src: server/services/trainerDocumentService.js:12] |
| Storage bucket `recordings` | private bucket; service-role writes, one `authenticated` SELECT policy through a security-definer boolean helper; session student, trainer or `app_metadata` founder only | object name is `<session-uuid>/<filename>`; anon has no policy and no table grant | VERIFIED | [src: server/migrations/0009_recordings_storage.sql:1] |
| `sessionStorage` drafts | browser-only demo draft key `mathify.demo.draft.v1` | cleared after successful demo submission | VERIFIED | [src: landing.js:56] |
| `localStorage` tokens | browser-only per-surface token keys used by dashboards | retained until explicit client logout or removal | VERIFIED | [ev: client localStorage token enumeration, 2026-11-26] |
| session event memory outbox | service-process event history with live outbox counterpart | 200 events per session and 10000 events global hard ceiling | VERIFIED | [src: server/db/index.js:11] |
| parent chat messages | parent and trainer participants; founder read audit | message body capped at 2000 characters; thread window capped at 100 | VERIFIED | [src: server/services/parentChatService.js:22] |
| parent chat DLP flags | founder-only masked preview and reason code | flag list capped at 200; blocked raw text never stored | VERIFIED | [src: server/services/parentChatService.js:286] |
| packs | student-owned prepaid sessions | expire 38 days after purchase and are non-refundable | VERIFIED | [src: server/config/policy.json:151] |
| trainer leave balance | trainer-owned 8 credits per calendar month | student-initiated leave does not consume trainer credit | VERIFIED | [src: server/config/policy.json:141] |
| mastery practice batches | student-owned service records | 10 questions per batch, 80-question topic cap, then rest | VERIFIED | [src: server/services/masteryPracticeService.js:15] |
| payouts | founder-owned payroll records; trainer reads own | daily caps of 6 hours and 6 sessions; under 3 hours flagged for review | VERIFIED | [src: server/config/policy.json:81] |

### RLS and Data API boundary

| Boundary | Required rule | Tag | Source |
| --- | --- | --- | --- |
| role source | every RLS role check reads `auth.jwt()->'app_metadata'->>'role'`; `user_metadata` is never trusted | VERIFIED | [src: server/migrations/README.md:37] |
| baseline grant | `service_role` receives all table privileges; anon is revoked; authenticated grants are explicit | VERIFIED | [src: server/db/schema.sql:1377] |
| audit grants 0004 | `trainer_support_logs` and `student_doubt_logs` have no anon or authenticated Data API grants | VERIFIED | [src: server/migrations/0004_ai_chat_logs.sql:68] |
| service-only grants 0003 | `mathify_records` and `mathify_session_events` are revoked from public, anon and authenticated and granted to service_role | VERIFIED | [src: server/migrations/0003_live_persistence.sql:22] |
| service-only grants 0006 | `mathify_records` has no anon or authenticated Data API grants in the KYC and batch migration | VERIFIED | [src: server/migrations/0006_trainer_onboarding_batches.sql:14] |
| student views | safe views use security invoker or barrier and exclude answer keys, hints, explanations and trainer notes; `server/db/schema.sql:629-645` no longer selects `q.hint` [U+2026-11-26] | VERIFIED | [src: server/db/schema.sql:624-645]; [src: server/migrations/0007_student_hint_lockdown.sql:10-31] |
| hint revocation 0007 | `revoke select (hint) on public.quiz_questions from authenticated` and a hint-free student view are review-only hardening; live grant state remains unproven | UNKNOWN | [src: server/migrations/0007_student_hint_lockdown.sql:10-31]; [ev: no live database access in this workspace, 2026-11-26] |
| payment identity 0008 | service-only `mathify_razorpay_payments` plus unique payment/order-credit indexes make exactly-once crediting explicit in reviewed SQL; live apply remains unproven | UNKNOWN | [src: server/migrations/0008_payment_idempotency.sql:15-53]; [ev: no live database access in this workspace, 2026-11-26] |
| live provider proof | no live Supabase, Razorpay, Twilio, Agora or Storage write success is proven by repository text | UNKNOWN | [ev: no live provider call evidence in workspace, 2026-11-26] |

## 7. STATE MACHINES

[VERIFIED] [U+2026-11-26] NEW RULES R1–R9 apply to this section; see §1.6 and `TPFF_UPDATE_REPORT.md` §U3.

### Session lifecycle, access, timing and pay

| Machine | Nodes | Edge/guard | Permitted roles | Illegal transitions | Terminal states | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SESSION | `scheduled → live → ended`; `cancelled` is schema-allowed | schema declares four status nodes and forbids other values | founder writes and reads all; trainer writes own; student reads own | any status outside the declared set is rejected | `ended`, `cancelled` | VERIFIED | [src: server/db/schema.sql:112] |
| SESSION | `scheduled → ended` | `POST /api/sessions/:sessionId/end` accepts a non-ended session and writes `status = 'ended'`, `endsAt`, recap and mastery decision | trainer, founder | student end is role-denied; repeat end returns `SESSION_ALREADY_ENDED` 409 | `ended` | VERIFIED | [src: server/routes/sessions.js:398] |
| SESSION | `scheduled → live`; `scheduled → cancelled` | no current route writes either transition; the only current live value is seed data | none through the HTTP API | clients cannot assume an API-driven transition into `live` or `cancelled` | none through the HTTP API | VERIFIED | [ev: current server source search for session.status assignments, 2026-11-26] |
| ACCESS | `not-open → open → ended` | trainer/student room opens at `start - 10 minutes`; scheduled start is the anchor | trainer, student | earlier entry returns `ROOM_NOT_OPEN` 409; other roles return `PARTICIPANT_REQUIRED` 403 | `ended` | VERIFIED | [src: server/services/sessionAccessService.js:97] |
| ACCESS | `observer absent → active → cleared` | founder must send explicit `observer` or `observe`; implicit entry is denied | founder only | founder without opt-in returns `FOUNDER_OBSERVER_REQUIRED` 403; other roles cannot observe | cleared at session end | VERIFIED | [src: server/services/sessionAccessService.js:75] |
| ACCESS | `active observer → room notice` | published payload is `{active,name,role,joinedAt,leftAt}`; `userId` stays server-side | founder triggers; trainer and student see the notice | no private identity field is published | cleared at session end | VERIFIED | [src: server/services/sessionAccessService.js:109] |
| ACCESS | `any → denied` | ended sessions cannot enter even with observer opt-in | all roles | `SESSION_ENDED` 409 is terminal | `ended` | VERIFIED | [src: server/services/sessionAccessService.js:71] |
| CLOCK | `waiting → started → window closed` | clock starts at `max(trainer verified join, scheduledAt - 1 minute)` | verified trainer presence only | browser login or a token request cannot start the clock | 55-minute window close | VERIFIED | [src: server/services/sessionTimingService.js:95] |
| TIMING | `active seconds → completed` | 50 teaching minutes are required inside the 55-minute window | trainer delivery; founder or trainer end decision | fewer than 50 minutes yields `REQUIRED_MINUTES_NOT_MET` | `COMPLETED_IN_WINDOW` or `REQUIRED_MINUTES_NOT_MET` | VERIFIED | [src: server/services/sessionTimingService.js:176] |
| PAY-LATE | `on_time → half_pay → no_pay → no_pay_fine_forfeited` | 0–5 minutes full pay; 5–9 half pay; 10–14 no pay; 15 or more no pay and no extra fine | trainer payout | client cannot select a pay band | final late band | VERIFIED | [src: server/config/policy.json:98] |
| PAY-STRETCH | `50 minutes → 55 minutes` | each full active teaching minute after 50 and up to 55 adds ₹5 | trainer payout | fractional minutes do not earn a reward | maximum five reward minutes | VERIFIED | [src: server/config/policy.json:104] |
| PRESENCE | `trainer waiting → payout eligible` | 15 active trainer minutes when no student joins; 50 active minutes when a student joins | trainer presence; founder or trainer finalize | a logged-in but absent trainer cannot qualify | payout eligible or not eligible | VERIFIED | [src: server/services/sessionTimingService.js:237] |

### Quiz, mastery gating and practice batches

| Machine | Nodes | Edge/guard | Permitted roles | Illegal transitions | Terminal states | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| QUIZ | `draft/ready → live → answering → revealed → answering → complete/ended` | initial seeded quiz is `status = 'ready'`, `phase = 'draft'` | trainer, founder | student cannot launch or reveal | `complete`, `ended` | VERIFIED | [src: server/db/mock.js:169] |
| QUIZ | `ready → live/answering` | launch sets `status = 'live'`, `phase = 'answering'`, starts attempts and reveals | trainer, founder | launch is role-gated by `auth.loadSession` plus trainer router gate | `live` quiz | VERIFIED | [src: server/routes/trainer.js:395] |
| QUIZ | `answering/recheck → awaiting_reveal` | answer requires live status, current question, valid option and no prior attempt | student, founder | `QUIZ_NOT_LIVE`, `QUIZ_NOT_ACCEPTING_ANSWERS`, `WRONG_QUESTION` and `ALREADY_ANSWERED` are rejected | awaiting trainer reveal | VERIFIED | [src: server/routes/student.js:45] |
| QUIZ | `awaiting_reveal → revealed` | reveal requires a known question id or `all: true`; correctness is released only here | trainer, founder | unknown question returns `QUESTION_NOT_FOUND` | `revealed` | VERIFIED | [src: server/routes/trainer.js:413] |
| QUIZ | `any quiz phase → recheck` | a generated parallel check is marked `requiresCorrectAnswer: true` and becomes current | trainer, founder | the check cannot be skipped without an explicit trainer force | `recheck` until solved | VERIFIED | [src: server/routes/trainer.js:697] |
| QUIZ | `recheck → answering/complete` | pending correct-answer check blocks `next` and `end` unless `force === true` | trainer, founder | blocked advance returns `PARALLEL_CHECK_REQUIRED` 409; force records an override | solved check or forced override | VERIFIED | [src: server/routes/trainer.js:504] |
| QUIZ | `phase → reteach` | reteach sets `phase = 'reteach'` and publishes a trainer-owned event | trainer, founder | student cannot enter reteach directly | `reteach` | VERIFIED | [src: server/routes/trainer.js:573] |
| QUIZ | `last question → complete/ended` | next with no remaining question sets `phase = 'complete'` and `status = 'ended'` | trainer, founder | advancing before the last question stays in `answering` | `complete`, `ended` | VERIFIED | [src: server/routes/trainer.js:524] |
| QUIZ | `live → ended on session end` | ending the session converts a live quiz to `ended` | trainer, founder | ending with a pending check is blocked without force | `ended` | VERIFIED | [src: server/routes/sessions.js:468] |
| MASTERY | `score → unlocked_next` or `reteach_required` | level 1 uses the 80 threshold; level 2 uses 50; level 3 stays in trainer review | student result; trainer or founder end decision | below threshold keeps the same topic and requires reteach | `unlocked_next` or `reteach_required` | VERIFIED | [src: server/services/masteryGating.js:72] |
| PRACTICE | `batch created → answering → complete` | exactly 10 student-safe questions per batch | student, founder | answer keys, hints and explanations never enter the student payload | batch complete | VERIFIED | [src: server/services/masteryPracticeService.js:15] |
| PRACTICE | `batch n → batch n+1` | difficulty rises by 15 percent each iteration | student, founder | a stale batch id from another student cannot steer difficulty | harder batch | VERIFIED | [src: server/services/masteryPracticeService.js:20] |
| PRACTICE | `80 asked and answered → rest` | a topic closes after 80 questions and returns the rest message | student, founder | the last ten cannot be disabled before they are answered | rest state | VERIFIED | [src: server/services/masteryPracticeService.js:17] |

### Payment and order

| Machine | Nodes | Edge/guard | Permitted roles | Illegal transitions | Terminal states | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PACK | `none → order created → payment credited → sessions added` | monthly pack is 12 sessions for 54000 SAR | student buyer, founder delegate | no other pack is implied by this route | credited order | VERIFIED | [src: server/services/razorpayService.js:5] |
| ORDER | `none → created` | `POST /api/razorpay/orders/monthly` stores order with `status = 'created'` | student, founder | a student requesting another student id returns 403 | `created` | VERIFIED | [src: server/routes/razorpay.js:10] |
| WEBHOOK | `created → credited` | webhook HMAC is verified with constant-time comparison before parsing | provider only; signature guard | missing secret fails closed; signature mismatch returns 401 | credited or ignored | VERIFIED | [src: server/services/razorpayService.js:58] |
| WEBHOOK | `created → credited` | only `payment.captured` is processed | provider only | other events are acknowledged as `EVENT_NOT_HANDLED` | credited or ignored | VERIFIED | [src: server/routes/razorpay.js:65] |
| WEBHOOK | `created → credited` | duplicate payment or already-credited order is ignored | provider only | replayed webhooks cannot credit twice | credited or ignored | VERIFIED | [src: server/routes/razorpay.js:74] |
| WEBHOOK | `created → credited` | amount and currency must match the server-created order | provider only | mismatched amount or currency returns `PACK_MISMATCH` | credited or ignored | VERIFIED | [src: server/routes/razorpay.js:95] |
| CREDIT | `order created → payment recorded → sessions added → order credited` | payment is recorded, sessions are added and the order becomes `credited` | service-owned transition | client notes cannot set student identity or value | `credited` | VERIFIED | [src: server/routes/razorpay.js:103] |
| CREDIT | `order credited → pack.credited notice` | browser receives a realtime notice with payment id and remaining sessions | credited student | unverified provider events are never published | credited notice published | VERIFIED | [src: server/routes/razorpay.js:124] |
| LIVE-PAY | `order created → captured` | live Razorpay capture success is not proven by repository text | provider only | no production proof is inferred | not proven here | UNKNOWN | [ev: no live provider call evidence in workspace, 2026-11-26] |

### Media lock, reactions and RTC permission

| Machine | Nodes | Edge/guard | Permitted roles | Illegal transitions | Terminal states | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| MEDIA | `default unlocked → toggle revoked → force-on` | setting `studentCanToggleMedia = false` sets `forceMicOn` and `forceCameraOn` true and increments version | trainer, founder | student cannot call the media-permission route | locked force-on state | VERIFIED | [src: server/services/mediaPermissionService.js:37] |
| MEDIA | `force-on → toggle allowed` | setting `studentCanToggleMedia = true` clears force flags and increments version | trainer, founder | a client cannot clear the lock itself | unlocked state | VERIFIED | [src: server/routes/sessions.js:180] |
| MEDIA | `remote state unchanged → muted/camera-off` | a boolean mic or camera patch changes only supplied keys and increments version when state changes | trainer, founder | missing keys cannot restore a track the trainer turned off | remote muted or camera-off state | VERIFIED | [src: server/services/mediaPermissionService.js:51] |
| REACTION | `allowed → blocked` | `studentCanReact` and `studentCanApplaud` are independently boolean and versioned | trainer, founder | student cannot change reaction permission | blocked or allowed | VERIFIED | [src: server/routes/sessions.js:234] |
| RTC | `token denied → token issued` | every token request re-evaluates session access server-side | trainer, student, opt-in founder | stale client permission is never trusted | denied or issued | VERIFIED | [src: server/routes/sessions.js:36] |
| RTC | `network not ready → token denied` | both verified participants must pass a fresh network check before token issue | trainer, student | a browser cannot opt out or start the peer's call | `NETWORK_BELOW_MINIMUM` 409 | VERIFIED | [src: server/routes/sessions.js:58] |
| RTC | `any → denied` | ended sessions cannot be reopened by token request | all roles | `SESSION_ENDED` 409 is terminal | `ended` | VERIFIED | [src: server/services/sessionAccessService.js:71] |

### Network readiness check

| Machine | Nodes | Edge/guard | Permitted roles | Illegal transitions | Terminal states | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NETWORK | `not_checked → below_minimum → ready → expired` | measurements must be finite, non-negative and range-bounded before evaluation | authenticated session party | invalid numbers return `INVALID_NETWORK_CHECK` 400 | ready, below minimum or expired | VERIFIED | [src: server/services/networkQualityService.js:36] |
| NETWORK | `not_checked → ready` | download floor is 15 Mbps | trainer, student | lower download cannot pass | ready or below minimum | VERIFIED | [src: server/config/policy.json:52] |
| NETWORK | `not_checked → ready` | upload floor is 10 Mbps | trainer, student | lower upload cannot pass | ready or below minimum | VERIFIED | [src: server/config/policy.json:53] |
| NETWORK | `not_checked → ready` | latency ceiling is 250 ms | trainer, student | higher latency cannot pass | ready or below minimum | VERIFIED | [src: server/config/policy.json:54] |
| NETWORK | `ready → expired` | a passing result expires after 15 minutes | trainer, student | an expired result cannot keep the room open | expired | VERIFIED | [src: server/config/policy.json:55] |
| NETWORK | `not_checked → ready` | probe payload is capped at 524288 bytes | public probe endpoints | larger requested probes are clamped | probe served | VERIFIED | [src: server/config/policy.json:56] |
| NETWORK | `trainer ready + student ready → canStartCall` | both fresh checks are required | trainer and student independently | one passing side cannot start the call | `canStartCall = true` only while both are fresh | VERIFIED | [src: server/services/networkQualityService.js:105] |
| NETWORK | `measurement submission → stored result` | role is derived from JWT, not from the request body | trainer, student; founder mapped as trainer by service | a student cannot submit a trainer measurement | stored trainer or student result | VERIFIED | [src: server/routes/sessions.js:268] |
| NETWORK | `ready → peer view` | peer roles see pass/fail and timestamp; measured values are visible only to the runner or founder | trainer, student, founder audit | no peer receives another party's raw numbers | safe state view | VERIFIED | [src: server/services/networkQualityService.js:129] |

### Leave

| Machine | Nodes | Edge/guard | Permitted roles | Illegal transitions | Terminal states | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LEAVE | `scheduled/live → leave` | only trainer or student may apply | trainer, student | founder application returns `FORBIDDEN` 403 | approved leave | VERIFIED | [src: server/services/leaveService.js:124] |
| LEAVE | `scheduled/live → leave` | the target session must still be scheduled or live | trainer, student | ended or already-changed sessions return `SESSION_NOT_OPEN` 409 | approved leave | VERIFIED | [src: server/services/leaveService.js:152] |
| LEAVE | `schedule → leave` | one leave per session | trainer, student | duplicate leave returns `LEAVE_EXISTS` 409 | approved leave | VERIFIED | [src: server/services/leaveService.js:155] |
| LEAVE | `schedule → leave` | at least 48 hours notice is required | trainer, student | shorter notice returns `TOO_LATE` 400 | approved leave | VERIFIED | [src: server/services/leaveService.js:159] |
| LEAVE | `balance → leave` | trainer must have at least one monthly credit; student-initiated leave does not consume a credit | trainer balance | exhausted balance returns `NO_LEAVE_BALANCE` 409 | approved leave | VERIFIED | [src: server/services/leaveService.js:164] |
| LEAVE | `leave request → approved` | request is stored as `approved`, `autoApproved`, student status `leave`, trainer payout 0 and no pack penalty | trainer, student | no manual approval stage exists in the current route | approved leave | VERIFIED | [src: server/services/leaveService.js:174] |
| LEAVE | `session → leave → attendance leave` | session receives `status = 'leave'`, `cancelledBy` and `leaveRequestId`; attendance becomes `leave` | trainer, student | requester cannot choose payout, fine or pack penalty | leave recorded | VERIFIED | [src: server/services/leaveService.js:192] |
| LEAVE | `late trainer cancellation → unattended` | student status is `unattended` for late trainer cancellation | trainer action; student record | it is distinct from mutual leave | `unattended` | VERIFIED | [src: server/config/policy.json:125] |
| LEAVE-CONTRADICTION | `session status leave` | leave service writes `status = 'leave'` while the schema status check allows only scheduled, live, ended and cancelled | trainer, student | live schema writes can reject the service value | unresolved | VERIFIED | [src: server/db/schema.sql:113] |

### KYC onboarding and batch allotment

| Machine | Nodes | Edge/guard | Permitted roles | Illegal transitions | Terminal states | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| KYC-DOC | `upload → metadata record` | private Storage bucket is `trainer-kyc` with service-role access | trainer, founder | browser Data API roles cannot read bytes | uploaded document | VERIFIED | [src: server/services/trainerDocumentService.js:12] |
| KYC-DOC | `upload → metadata record` | JPEG, PNG or WebP images up to 4 MB are accepted | trainer, founder | wrong MIME, invalid base64, oversized or mismatched bytes are rejected | uploaded document | VERIFIED | [src: server/services/trainerDocumentService.js:15] |
| KYC-DOC | `live upload → private object` | live mode writes bytes to Storage and keeps metadata in service-only records | trainer, founder | mock mode keeps base64 bytes in the service-only record | uploaded document | VERIFIED | [src: server/services/trainerDocumentService.js:123] |
| KYC | `none → submitted` | first submission validates locked identity and document fields | trainer | second submission returns `KYC_LOCKED` 409 | submitted locked record | VERIFIED | [src: server/services/trainerOnboardingService.js:186] |
| KYC | `submitted → edited` | only personal and bank groups remain editable | trainer | locked fields cannot be changed through this edge | submitted with edited personal or bank fields | VERIFIED | [src: server/services/trainerOnboardingService.js:214] |
| KYC | `submitted → corrected` | founder correction requires a changed locked field and appends a separate audit record | founder only | no change returns `KYC_NO_CORRECTION` 422 | corrected locked record | VERIFIED | [src: server/services/trainerOnboardingService.js:239] |
| KYC | `corrected → audit` | audit stores before, after, corrected by, reason and timestamp | founder read | trainer cannot invoke the locked-field correction route | append-only audit | VERIFIED | [src: server/services/trainerOnboardingService.js:272] |
| BATCH | `none → unallotted` | student login creates a stable per-student batch id and code | system; founder view | duplicate login cannot create two batches | `unallotted` | VERIFIED | [src: server/services/batchService.js:58] |
| BATCH | `unallotted → allotted` | allotment requires a real trainer and at least one slot | founder only | missing trainer or slot returns a typed 404 or 422 | `allotted` | VERIFIED | [src: server/services/batchService.js:119] |
| BATCH | `unallotted → allotted` | every slot is validated before any session is written; conflicts block the whole allotment | founder only | a conflict in a later slot leaves no partial booking | `allotted` or unchanged | VERIFIED | [src: server/services/batchService.js:166] |
| BATCH | `allotment → sessions scheduled` | each accepted slot becomes a server-derived scheduled session with a unique Agora channel | founder only | client cannot supply a channel or session identity | scheduled sessions | VERIFIED | [src: server/services/batchService.js:195] |
| BATCH | `allotted → public views` | student sees batch code and trainer name only; trainer sees names and batch metadata | student, trainer | student payload omits trainer id and student id | role-safe views | VERIFIED | [src: server/services/batchService.js:53] |
| BATCH | `allot route → founder gate` | the allot endpoint requires founder role | founder only | trainer or student role is denied | gated allotment | VERIFIED | [src: server/routes/admin.js:67] |
| KYC-LIVE | `live upload → Storage object` | live Storage write success is not proven by repository text | service role | no production proof is inferred | not proven here | UNKNOWN | [ev: no live provider call evidence in workspace, 2026-11-26] |

### Announcements

| Machine | Nodes | Edge/guard | Permitted roles | Illegal transitions | Terminal states | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ANNOUNCE | `authoring → stored → visible → read` | audiences are trainers, students, both and individual | founder author | any other audience string is rejected | stored announcement | VERIFIED | [src: server/services/announcementService.js:8] |
| ANNOUNCE | `authoring → stored` | title and message are required and bounded to 120 and 2000 characters | founder author | incomplete content is rejected | stored announcement | VERIFIED | [src: server/services/announcementService.js:45] |
| ANNOUNCE | `individual authoring → stored` | individual recipient must be an active trainer or student and only the name is retained | founder author | invalid recipient is rejected | stored individual notice | VERIFIED | [src: server/services/announcementService.js:57] |
| ANNOUNCE | `authoring → blocked` | title and message are scanned with the parent chat DLP rules | founder author | blocked content is not stored, echoed or broadcast | neutral `CONTENT_BLOCKED` 422 | VERIFIED | [src: server/services/announcementService.js:69] |
| ANNOUNCE | `stored → visible` | visibility matches role audience or exact recipient id | trainer, student; founder list via admin | non-matching recipients cannot see the notice | visible list | VERIFIED | [src: server/services/announcementService.js:21] |
| ANNOUNCE | `visible → read` | mark-read requires a matching announcement and stores a read timestamp | trainer, student | non-matching id returns `ANNOUNCEMENT_NOT_FOUND` 404 | read receipt | VERIFIED | [src: server/services/announcementService.js:117] |
| ANNOUNCE | `unread route → summary` | unread and read routes require trainer or student role | trainer, student | founder cannot use recipient read routes | unread summary | VERIFIED | [src: server/routes/announcements.js:38] |
| ANNOUNCE | `founder view → privacy` | founder identity details are not returned on recipient views | founder, trainer, student | recipient metadata is never exposed to recipients | safe public view | VERIFIED | [src: server/services/announcementService.js:29] |

### Parent chat DLP

| Machine | Nodes | Edge/guard | Permitted roles | Illegal transitions | Terminal states | Tag | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PARENT-CHAT | `unresolved → thread resolved → message submitted` | all operations pass through one authorization function | parent, trainer, founder | unauthenticated caller returns 401 | resolved thread or denial | VERIFIED | [src: server/services/parentChatService.js:66] |
| PARENT-CHAT | `thread → read` | parent may read only the thread for their own child | parent | another child's thread returns `FORBIDDEN` 403 | safe message window | VERIFIED | [src: server/services/parentChatService.js:78] |
| PARENT-CHAT | `thread → read/send` | trainer may act only for students on their roster | trainer | off-roster student returns `FORBIDDEN` 403 | safe message window or sent message | VERIFIED | [src: server/services/parentChatService.js:80] |
| PARENT-CHAT | `thread → audit read` | founder has read-only audit access | founder only | founder write returns `FORBIDDEN` 403 | audit view | VERIFIED | [src: server/services/parentChatService.js:83] |
| DLP | `submitted → inspected` | outbound text is inspected before any write or delivery | parent, trainer | raw text is never echoed to the peer | passed or blocked decision | VERIFIED | [src: server/services/parentChatService.js:175] |
| DLP | `submitted → blocked` | email, phone, URL, contact scheme, social handle, social platform and personal-contact rules are enforced | parent, trainer | blocked text is not stored as a message and not published | founder-only masked flag | VERIFIED | [src: server/services/parentChatDlp.js:26] |
| DLP | `blocked → flag` | flag stores reason code, labels, reasons, masked preview, actor and timestamp | founder audit only | no raw message body is stored in the flag | `CONTENT_BLOCKED` 422 | VERIFIED | [src: server/services/parentChatService.js:181] |
| DLP | `inspected → delivered` | clean message is stored with owner, sender and recipient ids | parent, trainer | blocked content cannot reach this edge | delivered message | VERIFIED | [src: server/services/parentChatService.js:206] |
| DLP | `delivered → unread bumped` | recipient unread count and latest message id are updated | parent, trainer | sender cannot mark the recipient's thread read | unread state | VERIFIED | [src: server/services/parentChatService.js:218] |
| DLP | `delivered → read` | mark-read clears only the caller's unread counter | parent, trainer | another recipient's counter cannot be cleared | read at timestamp | VERIFIED | [src: server/services/parentChatService.js:223] |
| DLP | `flags → founder list` | founder-only flag list is capped and returns masked previews | founder only | non-founder role is denied | founder flag list | VERIFIED | [src: server/services/parentChatService.js:288] |
| PARENT-ROLE | `parent identity → thread ownership` | parent chat service resolves a `parent` role with `childId`, but the SQL role check allows only founder, trainer and student | demo parent identity; SQL constraint | live database rows cannot store the parent role under the current constraint | unresolved | VERIFIED | [src: server/db/schema.sql:590] |

---

## 8. FLOW NARRATIVES

[VERIFIED] [U+2026-11-26] NEW RULES R1–R9 apply to this section; see §1.6 and `TPFF_UPDATE_REPORT.md` §U3.

[VERIFIED] [U~2026-11-26] Assembled scope: §8 and §9 are integrated into the complete §§0–14 TPFF; this block is reconciled against branch `feat/student-rtc-control-permission`, evidence baseline `3b9d597766358356d0d2bd9b555cf7a3614de205`, using the v4.0.0 final pre-commit inventory of 206 tracked files and 41/32/9 (`git status --porcelain=v1 --untracked-files=all` = 41 paths: 32 modified tracked + 9 untracked, including `E2E_TEST_LOG.md` and `TPFF_BLOCKERS.md`), not against clean-tree evidence alone `[ev: git branch --show-current; git rev-parse HEAD; user-supplied v4.0.0 final pre-commit inventory, 2026-11-26]`; `[ev: $suites = @(Get-ChildItem -Path server/tests -Filter *.test.js -File); 'TEST_FILES=' + $suites.Count; $sql = @(Get-ChildItem -Path server/migrations -Filter *.sql -File); 'MIGRATION_SQL_FILES=' + $sql.Count; $script = (Get-Content -Raw server/package.json | ConvertFrom-Json).scripts.test; 'TEST_SCRIPT_ENTRIES=' + @($script -split '&&').Count, 2026-11-26]` → `TEST_FILES=36`, `MIGRATION_SQL_FILES=7`, `TEST_SCRIPT_ENTRIES=36`. [VERIFIED] Earlier 25/18/7 and 28/19/9 snapshots are preserved in §11 H-25 and are superseded for current state; after the v4.0.0 documentation commit the 9 untracked paths become tracked, but the final commit hash is `UNKNOWN_AT_AUTHORING_TIME` `[src: E2E_TEST_LOG.md:70-82]`; `[src: TPFF_BLOCKERS.md:1-7]`. [VERIFIED] [U+2026-11-26] The 10-role audit is cross-referenced here and from §9: A-01…A-09 are all FIXED, while B-01…B-06 remain `BLOCKED_EXTERNAL` and G-01…G-03 remain non-provider gaps; no live success is claimed `[src: E2E_TEST_LOG.md:14-29,38-64]`; `[src: TPFF_BLOCKERS.md:9-40]`. [VERIFIED] Final local validation reports 36/36 suites with `agoraRoutes: 60`, `sessionPolicy: 37`, `rtcControls: 46`, `livePersistence: 54`, `chatWorker: 110`, `mcpServer: 55`, `SYNTAX_FILES=136`, `SYNTAX_FAILURES=0`, a 7-file migration dry run and `git diff --check` exit 0 with CRLF warnings only `[src: E2E_TEST_LOG.md:70-82]`.

### 8.1 Guest / public visitor

1. [VERIFIED] A visitor requests `/`; `GET /` sends `index.html` and the static middleware permits only the root allowlist (`index.html`, `apps.html`, `pricing.html`, `terms.html`, `privacy.html`, `refund.html`, `contact.html`, `public.css`, `landing.css`, `landing.js`, `login.html`) and the directory prefixes `assets`, `classroom`, `founder`, `home`, `lms`, `login`, `parent`, `shared`, `student`, `trainer`; state delta: none `[src: server/app.js:118-154]`.
2. [VERIFIED] A visitor reads a 540 SAR / 12-session monthly pack on `pricing.html`, whose only call to action is "Book Demo" linking to `contact.html`; state delta: none `[src: pricing.html:49-66]`.
3. [VERIFIED] A visitor submits the booking form; `POST /api/contact` throttles at 5 requests per 10 minutes per IP, validates name/email/message, stores one contact request and forwards it to Slack/email, then returns `201` with a reference and per-channel delivery flags; state delta: +1 `contact_request`, no account, batch, pack or payment created `[src: server/routes/contact.js:8-68]`.
4. [VERIFIED] Public paid registration is explicitly not built: student self-registration, payment and self-chosen credentials are recorded as approved roadmap, and demo identities are server-seeded `[src: PROJECT_GUIDE.md:405]`. [VERIFIED] The only live order endpoint is authenticated `POST /api/razorpay/orders/monthly` (`student`/`founder`), so an anonymous visitor cannot open an order `[src: server/routes/razorpay.js:10-20]`.
5. [VERIFIED] A visitor reaches `login.html` from `apps.html` "Sign in" and per-desk links; the page exposes four role tabs (`student`, `trainer`, `founder`, `parent`) and an email/password form, and states that the URL never grants access `[src: apps.html:245-274]`; `[src: login.html:28-65]`.
6. [VERIFIED] The browser sends `POST /api/auth/login` with only `{email, password}`; the server throttles 5 attempts per `10 * 60 * 1000` ms keyed by forwarded IP/email, verifies the password, deletes the throttle entry on success, upgrades legacy hashes when required and returns a signed JWT plus `auth.publicUser` limited to `id`, `name`, `role`; state delta: JWT issued, no server-side session row written `[src: server/routes/auth.js:11-30]`; `[src: server/routes/auth.js:44-76]`; `[src: server/tests/credentialLogin.test.js:34-43]`.
7. [INFERRED] Because the request body contains no role field, the server cannot receive the tab choice; reasoning: the browser posts only `email` and `password` and the handler reads only `body.email`/`body.password` `[src: login/login.js:141-143]`; `[src: server/routes/auth.js:44-56]`.
8. [VERIFIED] The role-mismatch refusal is therefore a browser check: after login the client compares `user.role` to the selected tab, refuses to store the token and displays "Those credentials belong to the … Choose that tab and sign in again."; state delta: no token written on mismatch `[src: login/login.js:144-151]`. [VERIFIED] The API independently denies cross-role access: a student token receives `403` from `GET /api/trainer/dashboard` and a missing token receives `401` from `GET /api/student/dashboard` `[src: server/tests/credentialLogin.test.js:61-67]`. [VERIFIED] This UI-only tab check is recorded as a finding in §11 (H8.1) because API enforcement, not the tab, is authoritative `[src: login/login.js:147-150]`; `[src: server/middleware/auth.js:40-66]`.
9. [VERIFIED] On a match the client stores the JWT in role-specific localStorage keys (`mathify.student.token` + `mathify.classroom.token.student`, `mathify.trainer.token` + `mathify.classroom.token.trainer`, `mathify.classroom.token.founder`, `mathify.parent.token`) and redirects to `next` or the role destination; state delta: 1–2 localStorage tokens per role `[src: login/login.js:14-39]`; `[src: login/login.js:106-110]`; `[src: login/login.js:152-154]`. [VERIFIED] `safeNext` rejects strings containing `//`, `\` or `:`, strips leading slashes and allows only `student|trainer|founder|parent|classroom|lms/...` plus `apps.html` and `index.html` `[src: login/login.js:50-61]`.
10. [VERIFIED] The demo button is hidden by default and only appears when `GET /auth/demo` returns a matching account; that endpoint returns 404 in production unless `ENABLE_DEMO_LOGINS=true`, and its public list deliberately carries roles only, no contact address `[src: login/login.js:166-181]`; `[src: server/routes/auth.js:78-94]`.
11. [VERIFIED] An unauthenticated browser can still read `/api/public/config`, which exposes Supabase URL/publishable key, network floors, `sessionAccess` and `sessionTiming` settings, badges and celebrations but never the secret key; state delta: none `[src: server/app.js:67-82]`.
12. [VERIFIED] Contradiction resolved in this pass: `apps.html` links to `login.html`, and the earlier static allowlist omitted `login.html` and `login/` so sign-in fell through to the JSON 404 handler; `server/app.js` now permits `login.html` and the `login/` directory, and a browser GET of `/login.html?role=student` returned the sign-in document with `login/login.css` and `login/login.js` and no console errors; source and closing evidence: `[src: apps.html:248]`; `[src: server/app.js:119-125]`; `[ev: browser GET http://localhost:4000/login.html?role=student, 2026-11-26]`. [VERIFIED] The landing founder profile now lists the founder's credentials and links the public LinkedIn profile `[src: index.html:284-292]`, `[ev: user-provided credential and profile-link statement, 2026-11-26]`.
13. [UNKNOWN] No public self-service paid registration/payment flow was found; the exact acceptance path (identity proof, account creation, pack purchase and credential delivery) is not in the repo. Close via §10 (U8.1) with `rg -n "register|signup|self-set|choose.*password" . --glob '!node_modules/**'` and a product decision `[src: PROJECT_GUIDE.md:405]`.

### 8.2 Founder

1. [VERIFIED] The founder selects the Founder tab and signs in through `POST /api/auth/login`; the client stores `mathify.classroom.token.founder` and redirects to `founder/index.html`; state delta: JWT in localStorage `[src: login/login.js:27-31]`; `[src: founder/announcements.js:12-34]`.
2. [VERIFIED] Every `/api/admin/*` handler applies `auth.requireAuth` + `auth.requireRole('founder')`; state delta on denial: none, HTTP 401/403 `[src: server/routes/admin.js:12-189]`. [VERIFIED] Settings `GET/PATCH/DELETE` mutate an allowlisted runtime draft only, money and network keys are read-only, and nothing is written to `policy.json` on disk `[src: server/routes/admin.js:26-60]`; `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-data-state-env.md:58]`.
3. [VERIFIED] The founder allots a batch with `POST /api/admin/batches/:batchId/allot`, passing `trainerId` and `slots`; `allot` runs through a process-wide serialize queue and validates every slot before writing any session; state delta on success: batch `status='allotted'`, `allottedAt` set, one `scheduled` session per slot with `durationMinutes` defaulting to 50 and `rtc.channel='mathify_<sessionId>'`, one `batch.allotted` audit event `[src: server/routes/admin.js:62-74]`; `[src: server/services/batchService.js:24-31]`; `[src: server/services/batchService.js:119-180]`; `[src: server/services/batchService.js:183-230]`.
4. [VERIFIED] Allotment refuses an unknown batch (`404 BATCH_NOT_FOUND`), a batch already allotted to a different trainer (`409 BATCH_ALREADY_ALLOTTED`), a non-trainer (`404 BATCH_TRAINER_NOT_FOUND`), an empty slot list (`422 BATCH_SLOT_REQUIRED`), an invalid `startsAt` (`422 BATCH_SLOT_INVALID`) and any trainer/student interval overlap (`409 BATCH_SLOT_CONFLICT`) before a partial booking can be written; an exact slot-key retry is idempotent and returns the existing booking; state delta on refusal/conflict: none `[src: server/services/batchService.js:103-175]`; `[src: server/services/batchService.js:212-232]`; `[src: server/tests/concurrency.test.js:61-118]`; `[ev: npm.cmd test --prefix server, 2026-11-26]`.
5. [VERIFIED] Booking the trainer calendar is a side effect of the same call: each created session carries `trainerId`, `studentId`, `batchId`, `batchCode`, `scheduledAt`/`startedAt` and a unique server-derived Agora channel, and is visible through `GET /api/trainer/schedule/week?start=...` and the seven-day UTC grid; state delta: +1 session per slot, +1 calendar entry, +1 unique channel `[src: server/services/batchService.js:183-204]`; `[src: server/routes/trainer.js:768-773]`; `[src: trainer/schedule.js:117-147]`; `[src: server/tests/concurrency.test.js:78-89]`; `[ev: npm.cmd test --prefix server, 2026-11-26]`.
6. [VERIFIED] The founder reviews trainer KYC with `GET /api/admin/trainer-onboarding`; document numbers and bank/contact digits are masked unless `?reveal=true`; state delta: none `[src: server/routes/admin.js:91-107]`; `[src: server/services/trainerOnboardingService.js:142-183]`. [VERIFIED] A locked-field correction via `PATCH /api/admin/trainer-onboarding/:trainerId/locked` validates required fields, sets `status='corrected'`, appends one immutable correction audit row and emits `trainer.onboarding.corrected`; state delta: +1 onboarding revision, +1 correction audit row `[src: server/routes/admin.js:109-118]`; `[src: server/services/trainerOnboardingService.js:239-288]`. [VERIFIED] No change returns `422 KYC_NO_CORRECTION`, and missing KYC returns `404 KYC_NOT_FOUND` `[src: server/services/trainerOnboardingService.js:239-264]`.
7. [VERIFIED] The founder reads a private KYC image with `GET /api/admin/trainer-onboarding/:trainerId/documents/:documentId`; the response is served with `Cache-Control: no-store` and the recorded MIME type; state delta: none `[src: server/routes/admin.js:131-143]`.
8. [VERIFIED] The founder authors an announcement with `POST /api/admin/announcements` after loading eligible recipients via `GET /api/admin/announcements/recipients`; state delta: +1 announcement record with `id`, `audience`, optional `recipientId`/`recipientName`, title, message, `createdBy`, `createdAt` `[src: server/routes/admin.js:145-189]`; `[src: founder/announcements.js:130-157]`.
9. [VERIFIED] Exactly four audiences are accepted — `trainers`, `students`, `both`, `individual`; an individual recipient must be an active trainer or student, a title (≤120 chars) and message (≤2000 chars) are required, and any DLP hit returns a neutral `422 CONTENT_BLOCKED` without storing or echoing the text; state delta on block: none `[src: server/services/announcementService.js:8]`; `[src: server/services/announcementService.js:45-87]`.
10. [VERIFIED] Recipient inboxes are scoped on read: `matches()` admits `both` to trainers/students, `trainers` to trainers, `students` to students and `individual` only to the named user; founder identity metadata is absent from the recipient DTO and only the founder view adds `recipientName`/`recipientId` `[src: server/services/announcementService.js:21-43]`; `[src: server/routes/announcements.js:31-46]`.
11. [VERIFIED] A founder enters a classroom only through the explicit observer opt-in: `sessionAccess.evaluate` returns `403 FOUNDER_OBSERVER_REQUIRED` without `observer`/`observe` in the RTC-token request, and on success `setObserver` writes `active`, `userId`, name, join time and reason to the session; state delta: +1 `founderObserver` record and one `founder.observer.changed` event broadcast to both participants `[src: server/services/sessionAccessService.js:43-51]`; `[src: server/services/sessionAccessService.js:75-82]`; `[src: server/services/sessionAccessService.js:121-135]`; `[src: server/routes/sessions.js:35-71]`. [VERIFIED] Ending the session clears the observer with a `leftAt` timestamp `[src: server/routes/sessions.js:462-467]`.
12. [VERIFIED] The founder has read access to trainer payouts and the realtime event log through the trainer/founder router gate and trainer/founder role gate respectively; state delta: none `[src: server/routes/trainer.js:25-26]`; `[src: server/app.js:100-102]`. [VERIFIED] Founder settings edits are runtime drafts pending a reviewed deployment decision; routed to §11 (H9.5) `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-tests-timeline.md:123]`.

13. [VERIFIED] [U+2026-11-26] The founder MCP server is a separate stdio process exposing exactly `get_trainer_payout`, `get_student_mastery` and `get_trainer_attendance`; startup requires `MCP_FOUNDER_TOKEN`, all three responses carry `readOnly: true` and `executed: false`, and proposals carry `dryRun: true` plus `requiresFounderApproval: true`; state delta: none, because no write tool is exposed and the suite records `readOnly: true, executed: false` [src: server/mcp-server.js:28-54]; [src: server/mcp-server.js:96]; [src: server/mcp-server.js:150-152]; [src: server/mcp-server.js:210-212]; [src: server/mcp-server.js:438-440]; [src: server/mcp-server.js:520]; [ev: npm.cmd test --prefix server, 2026-11-26].

### 8.3 Trainer

1. [VERIFIED] The trainer selects the Trainer tab, signs in and receives a JWT; the trainer API client stores `mathify.trainer.token` and, on any 401/403, clears that token and redirects to `login.html?role=trainer&next=<safe path>`; state delta: token cleared on rejection `[src: login/login.js:21-26]`; `[src: trainer/api.js:6-9]`; `[src: trainer/api.js:47-85]`.
2. [VERIFIED] Before submitting KYC the trainer uploads each image through `POST /api/trainer/onboarding/documents`; the route is limited to role `trainer`, the body parser allows 6 MB for this path only (all other API bodies 2 MB), and the service accepts only `image/jpeg`, `image/png`, `image/webp`, requires valid base64 with matching magic bytes and enforces 1 byte–4 MB; state delta: +1 document record (metadata only in live mode, base64 bytes in mock mode) `[src: server/routes/trainer.js:177-187]`; `[src: server/app.js:51-54]`; `[src: server/services/trainerDocumentService.js:12-15]`; `[src: server/services/trainerDocumentService.js:33-58]`; `[src: server/services/trainerDocumentService.js:111-139]`.
3. [VERIFIED] In live mode bytes go to the private Supabase Storage bucket `trainer-kyc` with `Cache-Control: private, no-store` and `x-upsert: false`, and only metadata is stored in the service-only record; a missing bucket maps to `502 KYC_STORAGE_BUCKET_MISSING` and unconfigured Storage to `503 KYC_STORAGE_NOT_CONFIGURED` `[src: server/services/trainerDocumentService.js:12]`; `[src: server/services/trainerDocumentService.js:61-95]`; `[src: server/services/trainerDocumentService.js:120-138]`.
4. [VERIFIED] The trainer submits KYC with `POST /api/trainer/onboarding`; validation requires `identity.fullName`, `identity.dateOfBirth`, Aadhaar number + image, PAN number + image and signature image, otherwise `422 KYC_INCOMPLETE`; state delta: onboarding record `status='submitted'`, all seven locked fields (`fullName`, `dateOfBirth`, `aadhaar`, `pan`, `signature`, `bankProof`, `additionalDocuments`) frozen and one `trainer.onboarding.submitted` event `[src: server/services/trainerOnboardingService.js:9-18]`; `[src: server/services/trainerOnboardingService.js:109-126]`; `[src: server/services/trainerOnboardingService.js:186-212]`. [VERIFIED] A second submission returns `409 KYC_LOCKED` `[src: server/services/trainerOnboardingService.js:186-193]`.
5. [VERIFIED] The form disables the locked inputs after submission, changes the button to "Save personal details" and labels the state `KYC locked · <status>`; subsequent saves go to `PATCH /api/trainer/onboarding/personal`, which rewrites only `personal` and `bank` and emits `trainer.onboarding.personal.updated`; state delta: `personal`/`bank` updated, `updatedAt` refreshed, KYC identity untouched `[src: trainer/onboarding.js:21-37]`; `[src: trainer/onboarding.js:129-144]`; `[src: server/routes/trainer.js:207-217]`; `[src: server/services/trainerOnboardingService.js:214-237]`.
6. [VERIFIED] The trainer opens the weekly timetable; `GET /api/trainer/schedule/week?start=YYYY-MM-DD` calls `slotService.weekView` over the trainer's sessions, and the UI renders a seven-day UTC grid with `‹ Prev` (−7 days), `Today` (reset to the current Monday and today column) and `Next ›` (+7 days); state delta: client-only `weekStart` change, no server write `[src: server/routes/trainer.js:768-773]`; `[src: trainer/api.js:126-129]`; `[src: trainer/schedule.js:97-115]`; `[src: trainer/schedule.js:117-147]`.
7. [VERIFIED] The trainer sees allotted batches via `GET /api/trainer/batches`; the trainer view contains `id`, `code`, `status`, `trainerId`, `studentName`, `trainerName`, `createdAt` and no student `id`, batch list is rendered from `allotedBatchList`; state delta: none `[src: server/services/batchService.js:40-56]`; `[src: server/services/batchService.js:235-241]`; `[src: server/routes/trainer.js:219-223]`; `[src: trainer/app.js:1069-1090]`.
8. [VERIFIED] For a scheduled class the trainer may request an RTC token from ten minutes before the scheduled start (`sessionAccess.earlyJoinMinutes = 10`), provided the user is a participant (`trainer`/`student`) or an explicit founder observer; earlier requests return `409 ROOM_NOT_OPEN`, ended sessions `409 SESSION_ENDED`; state delta: `roomAccess.canEnter=true` and no room state change `[src: server/config/policy.json:4-8]`; `[src: server/services/sessionAccessService.js:19-28]`; `[src: server/services/sessionAccessService.js:70-107]`. [VERIFIED] `POST /api/sessions/:id/rtc-token` additionally requires both verified participants to pass a fresh network check (`409 NETWORK_BELOW_MINIMUM`) before issuing a server-derived Agora token `[src: server/routes/sessions.js:56-66]`.
9. [VERIFIED] Room opening does not start the class clock: `sessionTiming.clock` waits (`waitingForTrainer=true`, display `-00:00`) until verified trainer presence from an Agora webhook or heartbeat; dashboard login and token requests are explicitly not presence evidence; state delta: clock remains stopped `[src: server/services/sessionTimingService.js:15-18]`; `[src: server/services/sessionTimingService.js:75-103]`; `[src: server/serializers.js:348-357]`. [VERIFIED] A trainer present before the threshold still waits at `-01:00` (one minute before the allotted start, `clockStartOffsetMinutes=-1`) and reaches `00:00` at the allotted time; a later trainer starts at their verified join time `[src: server/config/policy.json:9-14]`; `[src: server/services/sessionTimingService.js:92-118]`; `[src: server/tests/sessionPolicy.test.js:70-86]`.
10. [VERIFIED] The teaching requirement is 50 active minutes inside the first 55 minutes from the scheduled start (`requiredTeachingMinutes=50`, `completionWindowMinutes=55`); if the student never joins, 15 active minutes suffice, and legacy sessions with no timing evidence keep pay factor 1; state delta: `completion.completed` and pay factor computed at presence finalisation `[src: server/config/policy.json:9-14]`; `[src: server/services/sessionTimingService.js:152-187]`; `[src: server/services/sessionTimingService.js:223-255]`; `[src: server/services/presenceService.js:279-315]`.
11. [VERIFIED] Trainer pay bands by verified join time are 0–5 min → factor 1, 5–10 min → 0.5, 10–15 min → 0, 15+ min → 0 with no extra fine; each full active minute beyond 50 up to 55 adds ₹5; state delta: auditable `lateBand`, `completionCode`, `baseAmount` and `stretchPay` lines `[src: server/config/policy.json:98-110]`; `[src: server/services/sessionTimingService.js:27-32]`; `[src: server/services/sessionTimingService.js:189-220]`; `[src: server/services/payoutService.js:97-111]`. [VERIFIED] A test asserts half pay + full pay = ₹525 base, ₹25 stretch, ₹550 total at a ₹350 rate `[src: server/tests/sessionPolicy.test.js:112-143]`.
12. [VERIFIED] During the lesson the trainer drives quiz phases (`launch`, `reveal`, `reteach`, `new-check`, `next`) and media/reaction permissions; `POST /sessions/:id/end` re-checks a pending parallel check, sets `status='ended'`, `endsAt`, ends a live quiz, records mastery gating and clears the founder observer; `POST /sessions/:id/presence/finalize` writes the presence snapshot to the session and creates student attendance only when none exists; state delta: session terminal, presence snapshot persisted `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-data-state-env.md:84-93]`; `[src: server/routes/sessions.js:462-479]`; `[src: server/services/presenceService.js:342-370]`.
13. [VERIFIED] The payout view is calculated, not disbursed: base rate is clamped to ₹300–₹400 (default ₹350), daily work is capped at 6 h / 6 sessions with days under 3 h flagged, perfect attendance pays ₹2000 + ₹500 per consecutive month, MVT pays ₹3000/₹2000/₹1000, and a trainer cancellation under 48 h notice costs one session pay while mutual leave and no-shows are unpaid `[src: server/services/payoutService.js:113-122]`; `[src: server/services/payoutService.js:160-249]`; `[src: server/services/payoutService.js:277-335]`; `[src: server/services/payoutService.js:388-585]`.
14. [VERIFIED] The trainer applies leave through `POST /api/leaves`: applicable only for `scheduled`/`live` sessions, duplicate `409 LEAVE_EXISTS`, notice under 48 h `400 TOO_LATE`, exhausted monthly balance `409 NO_LEAVE_BALANCE`; on success status is auto-`approved`, session becomes `status='leave'`, student attendance `leave`, trainer payout 0, no pack penalty; balance is 8 per month and student-initiated leaves are not charged; state delta: +1 leave request, +1 session transition, +1 attendance row `[src: server/services/leaveService.js:152-201]`; `[src: server/config/policy.json:116-125]`; `[src: server/config/policy.json:141-149]`.

15. [VERIFIED] [U+2026-11-26] Trainer-facing replies include the trainer policy facts and append exactly one closing line to every reply: `Is there anything else I can help you with, or would you like me to connect you with the admin?`; no DeepSeek or OpenAI model is used, and the pinned text model is `@cf/meta/llama-3.1-8b-instruct` with suffix `CRITICAL: Return ONLY valid JSON. No markdown, no explanations.`; state delta: one reply envelope only [src: worker-core.mjs:9]; [src: worker-core.mjs:12]; [src: worker-core.mjs:20]; [src: worker-core.mjs:47-57]; [ev: npm.cmd test --prefix server, 2026-11-26].

### 8.4 Student

1. [VERIFIED] The student selects the Student tab, signs in and receives a JWT; the student API client stores `mathify.student.token` and redirects to `login.html?role=student&next=<safe path>` on 401/403; state delta: JWT in localStorage, token cleared on rejection `[src: login/login.js:15-20]`; `[src: student/api.js:1-10]`; `[src: student/api.js:47-85]`.
2. [VERIFIED] `GET /api/auth/batch` is intended to create or return the student's enrollment batch (`status='unallotted'`, code `TB-XXXXXX`, deterministic id `batch_student_<studentId>`) via serialized `batchService.ensureForStudent`, so parallel logins reuse one record; state delta on success: +1 batch record with `studentId` and name only `[src: server/routes/auth.js:32-42]`; `[src: server/services/batchService.js:14]`; `[src: server/services/batchService.js:58-84]`; `[src: server/tests/concurrency.test.js:61-67]`; `[ev: npm.cmd test --prefix server, 2026-11-26]`. [VERIFIED] Defect: the route has no `auth.requireAuth`, so `req.user` is absent and every request returns `403 ROLE_DENIED`; routed to §11 (H8.3) `[src: server/routes/auth.js:32-38]`. [VERIFIED] No browser call to `/api/auth/batch` was found; the student batch switcher only changes a local label `[src: student/app.js:64-96]`; `[ev: rg -n "/auth/batch" student login.html login, 2026-11-26]` → no match in student/login sources. [UNKNOWN] The intended student batch view is therefore unverified end-to-end; close via §10 (U8.2) after adding auth and a client call.
3. [VERIFIED] The student requests self-practice via `POST /api/student/practice/batch`; each batch contains exactly 10 student-safe questions, every successive batch is 15% harder (inside the requested 10–20% range), a topic holds at most 80 questions across 8 batches, and a 9th request returns `409 TOPIC_PRACTICE_COMPLETE`; state delta: +1 service-only batch with private answer keys, browser receives prompts/options only `[src: server/services/masteryPracticeService.js:1-24]`; `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-tests-timeline.md:27]`; `[src: student/api.js:104-115]`.
4. [VERIFIED] Answer submission goes to `POST /api/student/practice/batch/:batchId/answer` with a private correct/try-again result; no hint, explanation, answer key or trainer-only field is serialised `[src: server/services/masteryPracticeService.js:1-8]`; `[src: student/api.js:110-115]`.
5. [VERIFIED] In a live quiz the student may answer only while `quiz.status='live'` and `phase` is `answering` or `recheck`; the handler rejects a wrong current question and duplicate answers, computes correctness server-side, appends an attempt and sets `phase='awaiting_reveal'`; correct/incorrect is withheld from the student until the trainer reveals `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-data-state-env.md:84-93]`.
6. [VERIFIED] The student joins the same room from ten minutes before the scheduled start after a fresh passing network check from both peers; a founder observer, when present, is visible in shared state as a name/role/join time with no internal id or contact detail `[src: server/services/sessionAccessService.js:57-107]`; `[src: server/routes/sessions.js:56-71]`; `[src: server/serializers.js:397-404]`; `[src: server/tests/sessionPolicy.test.js:217-234]`.
7. [VERIFIED] The student inbox calls `GET /api/announcements` with `mathify.student.token` and sees only notices targeted to students, `both` or their own id; `POST /api/announcements/:id/read` writes one `readAt`; unread is computed from `readAt` and the notice stays unread on a failed mark-read; state delta: +1 announcement-read record on success `[src: shared/announcements.js:50-90]`; `[src: student/index.html:1781-1788]`; `[src: server/services/announcementService.js:21-27]`; `[src: server/services/announcementService.js:89-129]`.
8. [VERIFIED] A student can request a monthly pack only after authentication and only for their own id (`403 FORBIDDEN` otherwise), and the service returns `503 RAZORPAY_NOT_CONFIGURED` when keys are absent; state delta: +1 order with `status='created'` on success `[src: server/routes/razorpay.js:10-41]`. [VERIFIED] A student may apply leave with no balance charge and no pack penalty `[src: server/config/policy.json:146-149]`.

9. [VERIFIED] [U+2026-11-26] A Study Buddy image query is acknowledged but answered with only hint step 1, never the final answer; unsafe or personal-detail requests receive exactly `I'm just an AI study buddy, but please tell your parents or your Mathify trainer about this right away!`; the safe student view no longer selects `q.hint`; state delta: hint-free reply or exact escalation reply only [src: worker-core.mjs:21]; [src: worker-core.mjs:57]; [src: worker-core.mjs:344]; [src: server/db/schema.sql:629-645]; [src: server/migrations/0007_student_hint_lockdown.sql:10-31]; [ev: npm.cmd test --prefix server, 2026-11-26].

### 8.5 Parent

1. [VERIFIED] The parent selects the Parent tab and signs in; the client stores `mathify.parent.token`, and no contact address is exposed in the public demo list `[src: login/login.js:33-38]`; `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-data-state-env.md:64]`; `[src: server/routes/auth.js:82-93]`.
2. [VERIFIED] The parent can read and write only the thread for their own child: the service is strictly 1:1 (one thread per student, exactly one parent and one assigned roster trainer, no groups/batches), students are denied at the router, founder is read-only audit, and unread scope is parent=own child, trainer=roster, founder=all `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:77-83]`; `[src: server/routes/parentChat.js:24-28]`; `[src: server/routes/parentChat.js:86-103]`.
3. [VERIFIED] On send, `POST /api/parent-chat/thread/:studentId/messages` authorises the actor, normalises the body and scans it before any write; a DLP hit appends a founder-only masked flag (reason code, label, masked preview) and throws `422 CONTENT_BLOCKED`; state delta on block: +1 masked flag, **no** `insertParentChatMessage`, no realtime publish and no echoed raw text `[src: server/services/parentChatService.js:173-197]`; `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:79-83]`.
4. [VERIFIED] On an allowed message the recipient is the assigned trainer (or parent when the trainer sent it), and a safe message is inserted with `threadId`, `studentId`, `parentId`, `trainerId`, sender, recipient and body; state delta: +1 message `[src: server/services/parentChatService.js:199-214]`.
5. [VERIFIED] Parent and trainer transports are poll-only at 30-second intervals, and mark-read clears only the caller's unread counter; state delta: caller's counter reset `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:82]`; `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:79]`; `[src: server/services/parentChatService.js:222-236]`.
6. [VERIFIED] [U+2026-11-26] The WhatsApp assistant builds pseudonymous progress context, drafts progress replies, proposes a payment link without creating an order, answers rescheduling policy, pauses/resumes the bot on deterministic human handoff and preserves founder notification; signature verification and message dedupe remain in force; state delta: +1 WhatsApp message record in mock mode, handoff pause/resume flag when unsafe, no order created from a proposal [src: server/services/whatsappAiService.js:24-35]; [src: server/services/whatsappAiService.js:233-245]; [src: server/services/whatsappAiService.js:266-311]; [src: server/services/whatsappAiService.js:379]; [src: server/services/whatsappAiService.js:409]; [src: server/services/whatsappAiService.js:444-503]; [src: server/routes/webhooks.js:85-155]. [UNKNOWN] No live SMS send was performed; close via §10 (U8.3) with real Twilio credentials and a signed webhook [src: TEST_REPORT.md:24]; [src: TEST_REPORT.md:243].

### 8.6 Machine / webhook / service actors

1. [VERIFIED] [U+2026-11-26] The reminders job still supports a server timer at `REMINDER_CHECK_MS` (default 300000 ms, floor 60000 ms) with 24 h and 1 h windows, but the deployment path is `--once` from the five-minute CI cron; it also derives each trainer's Needs Attention queue and one aggregate founder digest, claims every recipient/day in service-only `reminder_claim` records, releases a claim when delivery is unconfigured or fails, and is disabled as an API timer by `REMINDERS_ENABLED=false`; state delta: notification attempts only, with `not_configured` returned honestly when channels are unset `[src: server/jobs/reminders.js:8-18]`; `[src: server/jobs/reminders.js:147-234]`; `[src: server/db/supabase.js:132-145]`; `[src: .github/workflows/ci.yml:6]`; `[src: render.yaml:48-55]`.
2. [VERIFIED] [U+2026-11-26] Agora `POST /api/agora/webhook` verifies `x-agora-signature` HMAC-SHA256 with `timingSafeEqual`, fails closed when the secret is missing and refuses ambiguous channels; the token query contract returns `409 AMBIGUOUS_CHANNEL` for a duplicate channel name while a single authorized channel lookup stays server-owned; verified `user-joined`/`user-left` payloads map to presence `join`/`leave` events; state delta: +1 presence event per accepted join/leave, no token on ambiguity [src: server/routes/agora.js:33-71]; [src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-roles-surfaces.md:202]; [src: server/services/presenceService.js:117-142]; [src: server/tests/agoraRoutes.test.js]. [UNKNOWN] No live Agora join or webhook was proven; close via §10 (U8.4) [src: TEST_REPORT.md:21]; [src: TEST_REPORT.md:243].
3. [VERIFIED] [U+2026-11-26] Razorpay `POST /api/razorpay/webhook` reads the raw body before JSON parsing, verifies `x-razorpay-signature` in constant time, revalidates amount/currency/order/student and replay protection, and credits only `payment.captured` exactly once; a replay returns `{received:true, ignored:true, reason:'ALREADY_CREDITED'}`; the pack remains `540 SAR / 12 sessions`; state delta: +1 payment and pack credit on the first valid capture only [src: server/routes/razorpay.js:86-158]; [src: server/tests/razorpayWebhook.test.js]; [src: worker-core.mjs:20]; [src: pricing.html:49-66].
4. [VERIFIED] Recording `POST /api/webhooks/recording` verifies `x-webhook-secret` in constant time and returns 503 in production when unconfigured; state delta: recording record updated to ready when accepted `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-roles-surfaces.md:203]`; `[src: server/routes/webhooks.js:49-61]`.
5. [VERIFIED] Twilio `POST /api/webhooks/whatsapp` verifies HMAC-SHA1 over URL + sorted params, skips verification only outside production with absent credentials, deduplicates by message id, calls the AI service with pseudonymous context and hands off to the founder on unsafe or failed replies `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-roles-surfaces.md:200]`; `[src: server/routes/webhooks.js:25-47]`; `[src: server/routes/webhooks.js:85-153]`.
6. [VERIFIED] The chat Worker verifies the forwarded bearer token, applies role allowlists again in `worker-core.mjs`, rate-limits at 20/min per minute+IP+subject, prunes buckets above 2000 keys and writes Supabase audit rows when URL + secret key exist (skipping otherwise); state delta: +1 audit row when configured `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:20-22]`; `[src: worker.js:118-133]`; `[src: worker.js:208-236]`; `[src: worker-core.mjs:284-288]`.
7. [VERIFIED] Notification and observability actors post to Slack webhook, send email via a configured sender and fire-and-forget alerts to `OBSERVABILITY_WEBHOOK_URL` with a 3 s abort; all return `not_configured` when unset; state delta: external delivery attempt only `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:72-74]`; `[src: server/services/logger.js:78-100]`.
8. [VERIFIED] The database facade routes to mock or live by `DATABASE_MODE` and in live mode throws `LIVE_ADAPTER_METHOD_MISSING` rather than silently falling back; `insertSession` requires live mode; service-role bypasses RLS for answer keys, trainer notes and strokes; state delta: no silent mock writes in live mode `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:62-63]`; `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-roles-surfaces.md:199]`. [VERIFIED] Real-time events are scrubbed and replayed by an outbox with an exclusive sequence cursor; state delta: +1 outbox row, never an answer key or hint `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:64-65]`.
9. [VERIFIED] A local-only four-room regression creates four trainers, four students and four simultaneous sessions; each room sees only its own realtime events, presence evidence and media permissions, no two rooms share an Agora channel, and a contested batch has exactly one winner with `BATCH_ALREADY_ALLOTTED` for the loser; state delta: +4 isolated sessions, no cross-talk `[src: server/tests/concurrency.test.js:1-4]`; `[src: server/tests/concurrency.test.js:44-89]`; `[src: server/tests/concurrency.test.js:106-170]`; `[ev: npm.cmd test --prefix server, 2026-11-26]` → `concurrency: 60 checks passed`.
10. [VERIFIED] The mock event outbox retains 200 events per session before trimming and 10000 globally only as a hard ceiling, so a 210-event burst in one room leaves a quiet room's event intact; state delta: busy room trimmed to its newest 200, quiet room unchanged, global sequence monotonic `[src: server/db/index.js:8-12]`; `[src: server/db/index.js:313-340]`; `[src: server/tests/concurrency.test.js:131-139]`; `[ev: npm.cmd test --prefix server, 2026-11-26]`.
11. [UNKNOWN] [U+2026-11-26] HOWEVER reference U9.7: the synchronous-middleware defect is fixed — `auth.requireAuth` awaits `db.findUserById` and `loadSession` awaits `db.findSession` — and `asyncAuthMiddleware` passes 6 assertions; live Supabase mode is still NOT verified for the four-room path, so live parallelism remains UNKNOWN rather than proven. Close via §10 by rerunning the four-room suite with `DATABASE_MODE=supabase` and real credentials `[src: server/middleware/auth.js:49,98-103]`; `[src: server/db/supabase.js:216-218]`; `[src: server/tests/asyncAuthMiddleware.test.js]`; `[src: server/tests/concurrency.test.js:1-4]`; `[ev: npm.cmd test --prefix server, 2026-11-26]`.

### 8.7 Findings routed from §8

| ID | Tag | Severity | Finding | Route |
|---|---|---|---|---|
| H8.1 | VERIFIED | MED | The role-tab mismatch refusal exists only in `login/login.js`; the API relies on per-route role gates. | §11 `[src: login/login.js:147-150]`; `[src: server/tests/credentialLogin.test.js:61-67]` |
| H8.2 | VERIFIED | HIGH → RESOLVED | `apps.html` links to `login.html`; earlier allowlist omitted `login.html` and `login/`, but `server/app.js` now permits both and a browser GET returned the sign-in page with CSS/JS and no console errors. | §11 `[src: apps.html:248]`; `[src: server/app.js:119-125]`; `[ev: browser GET http://localhost:4000/login.html?role=student, 2026-11-26]` |
| H8.3 | VERIFIED | HIGH | `GET /api/auth/batch` has no `auth.requireAuth`; it checks `req.user.role` and returns 403 for everyone. | §11 `[src: server/routes/auth.js:32-42]` |
| H8.4 | VERIFIED | MED | [U+2026-11-26] Evidence reports were captured on a clean tree; §8/§9 initially reconciled the v3.1.0 snapshot (18 modified tracked code/config paths, 7 in-scope untracked paths), so older statements such as "27 suites", "4 migrations", "32 suites" and "5 SQL files" are stale. [U~2026-11-26] The v4.0.0 final pre-commit inventory supersedes both that snapshot and the 19/9 local recheck with 41/32/9; A-09 (migration README omission) is FIXED and B-05 remains `BLOCKED_EXTERNAL`; see H-25 and `TPFF_BLOCKERS.md`. | §11 `[src: E2E_TEST_LOG.md:46,70-82]`; `[src: TPFF_BLOCKERS.md:15,32]` |
| U8.1 | UNKNOWN | HIGH | Public paid registration path absent. | §10, `rg -n "register|signup|choose.*password" . --glob '!node_modules/**'` `[src: PROJECT_GUIDE.md:405]` |
| U8.2 | UNKNOWN | MED | Student batch endpoint unverified end-to-end. | §10, add auth + client call, then re-run `credentialLogin` `[src: server/routes/auth.js:32-42]` |
| U8.3 | UNKNOWN | HIGH | Live WhatsApp send unverified. | §10, real Twilio credentials + signed webhook `[src: TEST_REPORT.md:243]` |
| U8.4 | UNKNOWN | HIGH | Live Agora webhook unverified. | §10, real credentials + signature test `[src: TEST_REPORT.md:243]` |
| U8.5 | UNKNOWN | HIGH | HOWEVER: live Supabase parallel-room flow unverified; synchronous `auth.loadSession`/`db.findSession` conflicts with the async live adapter and the 60-check suite is mock-only. | §10 U9.7: make middleware async, set `DATABASE_MODE=supabase`, rerun four-room suite `[src: server/middleware/auth.js:91-101]`; `[src: server/db/supabase.js:216-218]`; `[src: server/tests/concurrency.test.js:1-4]`; `[ev: npm.cmd test --prefix server, 2026-11-26]` |

---

## 9. INTEGRATIONS & JOBS

[VERIFIED] [U+2026-11-26] NEW RULES R1–R9 apply to this section; see §1.6 and `TPFF_UPDATE_REPORT.md` §U3.

[VERIFIED] [U+2026-11-26] The 10-role multi-agent audit cross-reference for integrations and jobs is `E2E_TEST_LOG.md` §§3–6: external provider blockers B-01…B-06 are unchanged in `TPFF_BLOCKERS.md`, while in-repo defects A-01…A-09 are FIXED (A-09 by the v3.1.0 docs pass and not re-applied). Final local checks include 36/36 suites, a 136-file `node --check` sweep with zero failures, a seven-file review-only migration dry run and a clean `git diff --check` apart from CRLF warnings; no live provider call, migration apply, commit or push is claimed. `[src: E2E_TEST_LOG.md:38-82]`; `[src: TPFF_BLOCKERS.md:9-40]`

### 9.1 Integration register

| Integration | Tag | Endpoint / mechanism | Auth & credential surface | Failure mode when down or misconfigured | Source |
|---|---|---|---|---|---|
| Cloudflare Workers AI (text) | VERIFIED | Worker REST `https://api.cloudflare.com/client/v4/accounts/.../ai/run/...` plus `[ai]` binding; Express bridge `CHAT_WORKER_URL`, else local REST | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, Worker `AUTH_SECRET` | Non-prod deterministic fallback; production throws; one live text call PASS HTTP 200 ~453 ms | `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:18-37]`; `[src: TEST_REPORT.md:18]` |
| Cloudflare Workers AI (vision) | VERIFIED | Student-doubt image path, one retry | Requested `@cf/llava-hf/llava-v1.6b-34b` returns HTTP 400 "No route for that URI"; fallback `@cf/meta/llama-3.2-11b-vision-instruct` returns HTTP 403 "Model Agreement" | No live image chat succeeded; fallback path triggered | `[src: TEST_REPORT.md:19-20]`; `[src: worker-core.mjs:9-11]` |
| Agora RTC | VERIFIED | `POST /api/agora/token`, `/sessions/:id/rtc-token`; batch booking assigns unique `mathify_<sessionId>` channel | `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE` (local SET); TTL 3600 s; channel/UID/role server-derived | Two-sided network gate blocks token (`NETWORK_BELOW_MINIMUM`); local token generation PASS, no live join proof | `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:39-45]`; `[src: server/services/agoraTokenService.js:7-18]`; `[src: server/services/batchService.js:199-201]`; `[src: server/tests/concurrency.test.js:85-89]`; `[ev: npm.cmd test --prefix server, 2026-11-26]` |
| Agora Cloud Recording | VERIFIED | `POST /api/agora/recording/start|stop` | `AGORA_CUSTOMER_KEY`/`SECRET` EMPTY locally; bucket/access/secret EMPTY, vendor/region SET | Mock state when unconfigured; recording webhook 503 in production if secret absent | `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:42-46]`; `[src: server/routes/webhooks.js:49-61]` |
| Razorpay | VERIFIED | `POST /api/razorpay/orders/monthly`, webhook | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` all EMPTY in local `server/.env` | `503 RAZORPAY_NOT_CONFIGURED` on order; unsigned/invalid webhook rejected; live order/capture SKIPPED | `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:48-52]`; `[src: server/routes/razorpay.js:34-41]` |
| Twilio WhatsApp | VERIFIED | `POST /api/webhooks/whatsapp` | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WEBHOOK_URL`, `TWILIO_WHATSAPP_NUMBER`, `WHATSAPP_DEMO_PARENT_PHONE`; absent/EMPTY in live checks | HMAC-SHA1 verified; production fails closed when URL/secret missing; AI failure → founder handoff; live send SKIPPED | `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:54-58]`; `[src: server/routes/webhooks.js:25-47]` |
| Supabase data / outbox / Realtime | VERIFIED | Service-role REST via `fetch`, no `@supabase/*` SDK | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL`, `MATHIFY_MIGRATE_CONFIRM`; local key state UNKNOWN | Live mode throws `LIVE_ADAPTER_METHOD_MISSING`; curriculum repository alone falls back to memory with a one-time warning; browser receives publishable key only | `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:60-68]`; `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-data-state-env.md:45-49]` |
| Supabase Storage (KYC) | VERIFIED | Private bucket `trainer-kyc`, service-role bearer | `config.supabase.url` + `secretKey` | 503 when unconfigured, 502 on upload/read failure, 502 `KYC_STORAGE_BUCKET_MISSING` on 404 | `[src: server/services/trainerDocumentService.js:61-95]`; `[src: server/services/trainerDocumentService.js:147-169]` |
| Slack / email notifications | VERIFIED | `POST` Slack webhook; Nodemailer sender | `SLACK_WEBHOOK_URL`, `ADMIN_EMAIL`, `NODEMAILER_SERVICE/EMAIL/PASSWORD` | `Promise.allSettled`; `not_configured` when unset; no delivery | `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:72]`; `[src: server/services/notificationService.js:11-95]` |
| Observability webhook | VERIFIED | Fire-and-forget `logger.alert` | `OBSERVABILITY_WEBHOOK_URL` | `not_configured` when unset; 3 s abort; no throw | `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:74]`; `[src: server/services/logger.js:78-100]` |
| Event outbox (mock mode) | VERIFIED | `appendSessionEvent` with `mathify:session:<id>` channel and exclusive sequence cursor | No browser Data API access; service-only session events | 200 per session retained first, 10000 global hard ceiling; busy room cannot evict a quiet room's unread events | `[src: server/db/index.js:8-12]`; `[src: server/db/index.js:313-354]`; `[src: server/tests/concurrency.test.js:120-139]`; `[ev: npm.cmd test --prefix server, 2026-11-26]` |

### 9.2 Credential surface (names and state only; no values)

| Variable / binding | Tag | Surface | Local state or requirement | Down / misconfigured behavior | Source |
|---|---|---|---|---|---|
| `AUTH_SECRET` | VERIFIED | Express JWT, Worker HMAC | SET locally; production requires ≥32 chars | Production boot fails closed; error text never contains values | `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:99]`; `[src: server/config.js:26-51]` |
| `CORS_ORIGIN` | VERIFIED | Express CORS | SET locally; production must be explicit and not `*` | Production boot fails closed | `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:99]`; `[src: server/config.js:26-51]` |
| `DATABASE_MODE`, `DATABASE_URL`, `MATHIFY_MIGRATE_CONFIRM` | VERIFIED | Persistence and migration runner | `mock` default locally; apply needs URL + `MATHIFY_MIGRATE_CONFIRM=apply` | Dry run only; no DB contacted; no apply performed | `[src: server/config.js:60-64]`; `[src: server/migrate.js:20-94]`; `[ev: npm.cmd run migrate --silent --prefix server, 2026-11-26]` |
| `MCP_FOUNDER_TOKEN` | VERIFIED | Founder MCP bearer credential | Declared in `server/.env.example` at line 50; startup refuses without it | MCP process exits with a missing-token error; no unauthenticated tool call | `[src: server/.env.example:50]`; `[src: server/mcp-server.js:96]`; `[src: server/mcp-server.js:520]` |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | VERIFIED | Orders and webhook | All three EMPTY in local `server/.env` | `503` on order; production guard fails; live capture SKIPPED | `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:99]`; `[src: server/routes/razorpay.js:34-41]` |
| Twilio variables | VERIFIED | WhatsApp webhook | Absent/EMPTY in live checks | Production fail-closed; local mock path only | `[src: TEST_REPORT.md:24]`; `[src: server/routes/webhooks.js:25-47]` |
| `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE` | VERIFIED | RTC tokens | SET locally | Token route fails without credentials; local token generation PASS | `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:99]`; `[src: TEST_REPORT.md:21]` |
| `AGORA_WEBHOOK_SECRET`, `RECORDING_WEBHOOK_SECRET`, `x-webhook-secret` | VERIFIED | Webhooks | Required in production | Constant-time verification; 503/fail-closed when absent | `[src: server/config.js:45-48]`; `[src: server/routes/webhooks.js:49-61]` |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_MODEL`, `CLOUDFLARE_TIMEOUT_MS` | VERIFIED | Workers AI REST | SET locally | Fallback on missing/error/timeout in non-prod; production throws; 15000 ms default timeout | `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:99]`; `[src: server/services/cloudflareAiService.js:14-16]` |
| `TEXT_MODEL`, `VISION_MODEL`, `VISION_FALLBACK_MODEL` in `wrangler.toml` | VERIFIED | Worker vars | Declared, but `TEXT_MODEL` is ignored by code | Changing the var does not change the pinned text model → §11 (H9.1) | `[src: wrangler.toml:20-29]`; `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:21]` |
| `CHAT_WORKER_URL`, `CLOUDFLARE_VISION_MODEL`, `CLOUDFLARE_VISION_FALLBACK_MODEL`, `ENABLE_DEMO_LOGINS` | VERIFIED | Bridge / vision overrides / demo login | Used in code but absent from `server/.env.example` | Operator must know undocumented names → §11 (H9.2) | `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:118]`; `[src: server/services/chatWorkerService.js:21-28]` |
| `DEMO_PASSWORD`, `ENABLE_DEMO_LOGINS`, `ALLOW_DEMO_AUTH` | VERIFIED | Demo accounts | `DEMO_PASSWORD` SET; `/auth/demo` 404 in production unless `ENABLE_DEMO_LOGINS=true`; Worker dev uses untracked `.dev.vars` | Production hides demo identities | `[src: server/routes/auth.js:78-94]`; `[src: wrangler.toml:10-11]` |
| `SLACK_WEBHOOK_URL`, `ADMIN_EMAIL`, `NODEMAILER_*`, `OBSERVABILITY_WEBHOOK_URL` | VERIFIED | Notifications / alerts | Declared in `.env.example` | `not_configured` return; no delivery or alert | `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:97]`; `[src: server/services/notificationService.js:11-95]` |
| `REMINDERS_ENABLED`, `REMINDER_CHECK_MS`, `REMINDER_RUN_ONCE` | VERIFIED | API timer switch / cron one-shot | `REMINDERS_ENABLED=false`, `REMINDER_CHECK_MS=300000`, `REMINDER_RUN_ONCE=false` in example; CI sets `true`/`300000` | Web process stays timer-free; five-minute cron runs `reminders:once` | `[src: server/.env.example:82-86]`; `[src: .github/workflows/ci.yml:58-64]`; `[src: server/jobs/reminders.js:8-13]` |
| Supabase local key state | UNKNOWN | `.env` audit did not list `SUPABASE_*` names | Close via §10 (U9.1): read key names/SET states without values from gitignored `server/.env` | No verification of live adapter availability in this workspace | `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:99]`; `[src: TEST_REPORT.md:22]` |

### 9.3 Webhooks

| Webhook | Tag | Verification | Accepted event / effect | Rejection or down behavior | Source |
|---|---|---|---|---|---|
| `POST /api/webhooks/whatsapp` | VERIFIED | `X-Twilio-Signature` HMAC-SHA1 over URL + sorted params | TwiML flow, dedupe, pseudonymous AI reply, progress draft, payment-link proposal, reschedule answer, handoff pause/resume and founder notice | Production fails closed if URL/secret missing | `[src: server/services/whatsappAiService.js:24-35,266-311,444-503]`; `[src: server/routes/webhooks.js:85-155]` |
| `POST /api/webhooks/recording` | VERIFIED | `x-webhook-secret`, constant-time compare | Recording ready | 503 in production when unconfigured | `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-roles-surfaces.md:203]`; `[src: server/routes/webhooks.js:49-61]` |
| `POST /api/razorpay/webhook` | VERIFIED | Raw body + `x-razorpay-signature` HMAC-SHA256, constant-time | Only `payment.captured`; amount/currency/order/student revalidated; exactly-once credit | Unsigned/mismatched/replayed payload rejected; replay returns `ALREADY_CREDITED`; no second credit | `[src: server/routes/razorpay.js:86-158]`; `[src: server/tests/razorpayWebhook.test.js]` |
| `POST /api/agora/webhook` | VERIFIED | `x-agora-signature` HMAC-SHA256, fail-closed if secret absent | Join/leave → presence events; token query returns `AMBIGUOUS_CHANNEL` on duplicate channel | Ambiguous channel fails closed with `409`; no token issued | `[src: server/routes/agora.js:33-71]`; `[src: server/services/presenceService.js:117-142]`; `[src: server/tests/agoraRoutes.test.js]` |
| `POST /api/chat/student-doubt` bridge | VERIFIED | Express bearer + Worker HMAC verify; role allowlist rechecked in core | Student image/question to pinned models | Blocked roles rejected; vision 400/403 → fallback or no image chat | `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-roles-surfaces.md:205]`; `[src: TEST_REPORT.md:19-20]` |

### 9.4 Cron, timers and background jobs

| Job | Tag | Cadence | Action | Down / disabled behavior | Source |
|---|---|---|---|---|---|
| Reminders + Needs Attention | VERIFIED | CI cron `*/5 * * * *`; API timer optional at 300000 ms (5 min) with 60000 ms floor | 24 h/1 h student reminders, per-trainer digest and aggregate founder digest, each deduped by service-only claims | `REMINDERS_ENABLED=false` disables the API timer; unconfigured delivery releases the claim and logs `not_configured` | `[src: .github/workflows/ci.yml:6]`; `[src: server/jobs/reminders.js:8-18]`; `[src: server/jobs/reminders.js:147-234]`; `[src: render.yaml:48-55]` |
| Presence / payout finalisation | VERIFIED | Event-driven at `POST /sessions/:id/presence/finalize` and session end | Snapshot + attendance + session `presence` block | Without timing evidence legacy sessions keep factor 1 | `[src: server/services/presenceService.js:342-370]`; `[src: server/services/sessionTimingService.js:223-236]` |
| Migration runner | VERIFIED | `npm run migrate`: dry-run default; apply only with both guards | Ordered 8 reviewed SQL files (`0001`, `0002`, `0003`, `0004`, `0006`, `0007`, `0008`, `0009`), checksum log in `public.mathify_migrations`, single transaction | No DB contacted on dry run; no runner-based apply; `0009` was applied and hardened through the linked Supabase MCP after review | `[ev: npm.cmd run migrate --dry-run --prefix server, 2026-11-26]`; `[src: server/migrate.js:20-94]`; `[src: server/migrations/README.md:9-20,45-55]` |
| Chat Worker rate buckets | VERIFIED | Per-minute key; prune when size > 2000 | 20 requests/min per minute+IP+subject | 429 with `Retry-After` at Express limiter; Worker limit local to instance | `[src: worker.js:118-133]`; `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:37]` |
| External backup / export job | UNKNOWN | none found | Close via §10 (U9.2): `grep -r "export\|backup\|dump" server/jobs server/services` | No such job found in inventory | `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:113]` |

### 9.5 Retry policy and failure seams

| Seam | Tag | Policy | Behavior when dependency is down | Source |
|---|---|---|---|---|
| Cloudflare text | VERIFIED | One request, then deterministic fallback in non-prod; production throws; 15000 ms timeout | Honest `source: 'fallback'`, not a fabricated answer | `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:25-27]`; `[src: server/services/chatAssistantService.js:1-8]` |
| Cloudflare vision | VERIFIED | Model-not-found detection → one fallback retry | Requested 34b route 400; fallback 403 Model Agreement; no live image chat | `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:19]`; `[src: TEST_REPORT.md:19-20]` |
| Notification fan-out | VERIFIED | `Promise.allSettled` per channel | `not_configured` per channel; 201 still returned to caller | `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:72]`; `[src: server/routes/contact.js:59-67]` |
| Logger alert | VERIFIED | Fire-and-forget, 3000 ms abort | No throw; `not_configured` when unset | `[src: server/services/logger.js:78-100]` |
| Supabase live facade | VERIFIED | No silent mock fallback | `LIVE_ADAPTER_METHOD_MISSING`; curriculum exception warns once and uses memory | `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:62]`; `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-data-state-env.md:46]` |
| Founder batch allotment | VERIFIED | Process-wide serialize queue; deterministic `batch_student_<id>` key; exact slot-key retry returns original booking; overlap check before writes | Conflict returns `409 BATCH_SLOT_CONFLICT` with no partial booking; contested batch returns `409 BATCH_ALREADY_ALLOTTED` to the loser; unique `mathify_<sessionId>` channel per booking | `[src: server/services/batchService.js:24-31]`; `[src: server/services/batchService.js:58-84]`; `[src: server/services/batchService.js:103-175]`; `[src: server/services/batchService.js:183-204]`; `[src: server/tests/concurrency.test.js:61-118]`; `[ev: npm.cmd test --prefix server, 2026-11-26]` |
| Distributed rate limiting | UNKNOWN | No shared-store limiter found | Close via §10 (U9.3): `rg -n "redis|RateLimiter|rateLimit" server --glob '*.js'` | `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-tests-timeline.md:126]` |
| Provider-side retry budgets | UNKNOWN | No documented Cloudflare/Razorpay/Twilio retry schedule in repo | Close via §10 (U9.4): provider dashboard/billing docs; not derivable from repo | `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:37]` |

### 9.6 Cost, quota and quantity facts

| Quantity | Tag | Value and unit | Source |
|---|---|---|---|
| Pinned text model and exact JSON-only suffix | VERIFIED | `@cf/meta/llama-3.1-8b-instruct`; suffix `CRITICAL: Return ONLY valid JSON. No markdown, no explanations.` | `[src: worker-core.mjs:9]`; `[src: worker-core.mjs:12]` |
| Vision models | VERIFIED | Requested `@cf/llava-hf/llava-v1.6b-34b`; fallback `@cf/meta/llama-3.2-11b-vision-instruct` | `[src: worker-core.mjs:10-11]` |
| Chat caps | VERIFIED | Question ≤600 chars, reply ≤900 chars, image ≤1 MB (`1024*1024` bytes), MIME `image/jpeg,image/png,image/webp,image/gif` | `[src: worker-core.mjs:14-17]`; `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-data-state-env.md:150]` |
| Worker throttle | VERIFIED | 20/min per minute+IP+subject; buckets pruned at 2000 keys; CORS preflight max-age 600 s | `[src: worker.js:118-132]`; `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-data-state-env.md:127]` |
| Express throttles | VERIFIED | Login 5/10 min; contact 5/10 min; webhook 120/min; contact 20/min; probe 40/min; generic limiter 60/min with `Retry-After` | `[src: server/routes/auth.js:11-12]`; `[src: server/routes/contact.js:8-9]`; `[src: server/app.js:36-43]`; `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-data-state-env.md:153]` |
| Razorpay pack | VERIFIED | 12 sessions, 54000 smallest units, `540 SAR / 12 sessions`, non-refundable, expires 38 days | `[src: server/routes/razorpay.js:86-158]`; `[src: pricing.html:49-66]`; `[src: worker-core.mjs:20]` |
| Trainer reply closing line | VERIFIED | `Is there anything else I can help you with, or would you like me to connect you with the admin?` appended exactly once to every trainer-facing reply | `[src: worker-core.mjs:20]`; `[src: worker-core.mjs:47-57]`; `[ev: npm.cmd test --prefix server, 2026-11-26]` |
| Study Buddy image and unsafe replies | VERIFIED | Image queries acknowledge the upload and give only hint step 1; unsafe replies use `I'm just an AI study buddy, but please tell your parents or your Mathify trainer about this right away!` | `[src: worker-core.mjs:21]`; `[src: worker-core.mjs:57]`; `[src: worker-core.mjs:344]`; `[src: server/db/schema.sql:629-645]` |
| Founder MCP contract | VERIFIED | Exactly `get_trainer_payout`, `get_student_mastery`, `get_trainer_attendance`; `readOnly: true`, `executed: false`; proposals `dryRun: true`, `requiresFounderApproval: true`; requires `MCP_FOUNDER_TOKEN` | `[src: server/mcp-server.js:28-54]`; `[src: server/mcp-server.js:96]`; `[src: server/mcp-server.js:150-152]`; `[src: server/tests/mcpServer.test.js]` |
| Agora token ambiguity | VERIFIED | Duplicate channel lookup returns `409 AMBIGUOUS_CHANNEL`; a single channel remains server-owned | `[src: server/routes/agora.js:33-71]`; `[src: server/tests/agoraRoutes.test.js]` |
| Trainer pay | VERIFIED | ₹300–₹400/session; ₹2000 perfect attendance + ₹500/month; MVT ₹3000/₹2000/₹1000; ₹5 per extra minute up to 55; unutilised slot 30%; 6 h/6 sessions/day cap, 3 h/day floor | `[src: server/config/policy.json:81-129]`; `[src: server/services/payoutService.js:113-122]`; `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-data-state-env.md:137]` |
| Leave | VERIFIED | 8 trainer leaves/month; 48 h notice; student balance hidden and uncharged; mutual leave payout 0, fine 0, no pack penalty | `[src: server/config/policy.json:116-149]`; `[src: server/services/leaveService.js:159-201]` |
| KYC upload | VERIFIED | ≤4 MB per image, JPEG/PNG/WebP, 6 MB JSON body route limit | `[src: server/services/trainerDocumentService.js:14-15]`; `[src: server/app.js:51-53]` |
| Bounded stores | VERIFIED | Session events 200 per session retention / 10000 global hard ceiling / 200 query max; support escalations 200; parent chat messages 100; flags 200; JWT TTL default 43200 s | `[src: server/db/index.js:8-12]`; `[src: server/db/index.js:313-354]`; `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-data-state-env.md:51-55]` |
| Parallel-room regression | VERIFIED | Local/mock mode only: 4 trainers + 4 students + 4 simultaneous sessions; 60 checks passed; session-scoped realtime events, presence evidence and media permissions; unique Agora channel per session; no cross-talk | `[src: server/tests/concurrency.test.js:1-4]`; `[src: server/tests/concurrency.test.js:44-170]`; `[ev: npm.cmd test --prefix server, 2026-11-26]` |
| Cloudflare per-model quota and token cost | UNKNOWN | Close via §10 (U9.5): Cloudflare account AI usage/billing dashboard; no repo command yields it | `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:37]` |
| Exact provider output-token cap | UNKNOWN | Close via §10 (U9.6): `rg -n "max_tokens|maxTokens|max_output" server worker.js worker-core.mjs` → none found; two-phase generation is only a mitigation | `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-data-state-env.md:170]` |

### 9.7 Live verification gaps

| Gap | Tag | Evidence | Exact closing action (§10) | Source |
|---|---|---|---|---|
| Workers AI text | VERIFIED | One live call PASS HTTP 200 ~453 ms; strict parse failed and tolerant extraction was added after | Re-run direct provider call with real token | `[src: TEST_REPORT.md:18]`; `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-tests-timeline.md:80]` |
| Workers AI vision | VERIFIED | Requested model 400 "No route"; fallback 403 "Model Agreement" | User accepts Meta one-time `agree`, then retry | `[src: TEST_REPORT.md:19-20]`; `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-tests-timeline.md:98]` |
| Deployed Worker end-to-end browser chat | UNKNOWN | Not claimed; no deployed E2E | Deploy with `wrangler secret put`, set `CHAT_WORKER_URL`, run browser chat | `[src: TEST_REPORT.md:36]`; `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-tests-timeline.md:99]` |
| Supabase live adapter / RLS | UNKNOWN | SKIPPED; no call, no audit row | Set mode + credentials, apply reviewed migrations, query `auth.jwt()` policies | `[src: TEST_REPORT.md:22]`; `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-tests-timeline.md:92]` |
| Parallel rooms under live Supabase | UNKNOWN | [U+2026-11-26] The middleware defect is resolved — `requireAuth` awaits `db.findUserById` and `loadSession` awaits `db.findSession`, with 6 `asyncAuthMiddleware` assertions — but the 60-check four-room proof remains mock-only | Set `DATABASE_MODE=supabase` with real credentials and rerun four-room suite; live parallelism stays UNKNOWN until then | `[src: server/middleware/auth.js:49,98-103]`; `[src: server/tests/asyncAuthMiddleware.test.js]`; `[src: server/tests/concurrency.test.js:1-4]`; `[ev: npm.cmd test --prefix server, 2026-11-26]` |
| Migration apply | VERIFIED | [U+2026-11-26] Dry run only; 7 review-only SQL files listed, no DB contact | Reviewed SQL + human approval + `DATABASE_URL` + `MATHIFY_MIGRATE_CONFIRM=apply`, then query `public.mathify_migrations` | `[ev: npm.cmd run migrate --silent --prefix server, 2026-11-26]`; `[src: server/migrations/README.md:28-36]` |
| Razorpay / Twilio / Agora webhook | UNKNOWN | All SKIPPED or unproven; local env keys EMPTY | Real credentials and signed webhook tests | `[src: TEST_REPORT.md:21-24]`; `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-tests-timeline.md:94-96]` |
| Credential rotation | VERIFIED | Exposed Cloudflare token, Supabase secret key and Agora Primary Certificate still require rotation | Rotate at providers; no values in repo or chat | `[src: TEST_REPORT.md:249]`; `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-tests-timeline.md:115]` |
| Deployed configuration / PR state | UNKNOWN | Manifests declare intent only; no PR verified | Render/Railway dashboard + `wrangler deployments list`; `gh pr list --state all --repo rohit4333/edtech` | `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:130]`; `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-tests-timeline.md:102]` |

### 9.8 Counts and reconciliation

| Count | Tag | Value | Exact command / source | Source |
|---|---|---|---|---|
| Test files in `server/tests` | VERIFIED | 36 | `$suites = @(Get-ChildItem -Path server/tests -Filter *.test.js -File); 'TEST_FILES=' + $suites.Count` → `TEST_FILES=36` | `[ev: count command in §8 preamble, 2026-11-26]` |
| Chained test entries | VERIFIED | 36 | `$script = (Get-Content -Raw server/package.json | ConvertFrom-Json).scripts.test; 'TEST_SCRIPT_ENTRIES=' + @($script -split '&&').Count` → `TEST_SCRIPT_ENTRIES=36` | `[src: server/package.json:13]`; `[ev: count command in §8 preamble, 2026-11-26]` |
| Passing suites | VERIFIED | 36, exit 0 | [U~2026-11-26] `npm.cmd test --prefix server` completed 36 chained suites; final highlights are `agoraRoutes: 60`, `sessionPolicy: 37`, `rtcControls: 46`, `livePersistence: 54`, `chatWorker: 110`, `mcpServer: 55` and `razorpayWebhook: all exactly-once assertions passed`; earlier `agoraRoutes: 35` and `livePersistence: 43` values are historical v3.1.0 snapshots | `[src: E2E_TEST_LOG.md:76]`; `[ev: npm.cmd test --prefix server, 2026-11-26]`; `[src: server/package.json:13]` |
| Concurrency suite checks | VERIFIED | 60 | `server/tests/concurrency.test.js` four-room suite; output `concurrency: 60 checks passed` | `[src: server/tests/concurrency.test.js:1-4]`; `[src: server/tests/concurrency.test.js:44-176]`; `[ev: npm.cmd test --prefix server, 2026-11-26]` |
| Migration SQL files | VERIFIED | 7 | `$sql = @(Get-ChildItem -Path server/migrations -Filter *.sql -File); 'MIGRATION_SQL_FILES=' + $sql.Count` → `MIGRATION_SQL_FILES=7`; names `0001`, `0002`, `0003`, `0004`, `0006`, `0007`, `0008`; all review-only | `[ev: count command in §8 preamble, 2026-11-26]`; `[ev: npm.cmd run migrate --silent --prefix server, 2026-11-26]` |
| Gap in migration numbering | VERIFIED | No `0005` SQL file; one test asserts zero `0005` migrations | `Get-ChildItem server/migrations -Filter *.sql`; `rg -n "0005" .` | `[src: server/tests/parentChat.test.js:83]`; `[ev: Get-ChildItem -Path server/migrations -File | Sort-Object Name | ForEach-Object { $_.Name }, 2026-11-26]` |
| Modified tracked / untracked files | VERIFIED | 32 / 9 in the v4.0.0 final pre-commit inventory | [U~2026-11-26] Supersedes the earlier 18 / 7 code snapshot and the 19 / 9 local recheck preserved in H-25; all 9 untracked paths become tracked after the v4.0.0 documentation commit | `[ev: user-supplied v4.0.0 final pre-commit inventory, 2026-11-26]`; `[src: E2E_TEST_LOG.md:46,70-82]` |
| Status porcelain lines | VERIFIED | 41 in the v4.0.0 final pre-commit inventory | [U~2026-11-26] `git status --porcelain=v1 --untracked-files=all` = 41 paths (32 modified tracked + 9 untracked); earlier 25 and 28 observations are preserved in H-25 | `[ev: user-supplied v4.0.0 final pre-commit inventory; git status --porcelain=v1 --untracked-files=all, 2026-11-26]`; `[src: E2E_TEST_LOG.md:46,70-82]` |
| Baseline evidence drift | VERIFIED | Evidence reports state 27 suites and 4 migrations on a clean tree; v3.1.0 records 36 suites, 36 test files, 7 SQL files and 206 tracked files at HEAD `3b9d597` | Reported counts and commands above | `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-tests-timeline.md:9]`; `[ev: git rev-parse HEAD; npm.cmd test --prefix server, 2026-11-26]` |

### 9.9 Findings routed from §9

| ID | Tag | Severity | Finding | Route |
|---|---|---|---|---|
| H9.1 | VERIFIED | MED | `wrangler.toml` `TEXT_MODEL` var is ignored; pinned text model is in code. | §11 `[src: wrangler.toml:23]`; `[src: worker.js:135-141]` |
| H9.2 | VERIFIED | MED | `.env.example` omits `CHAT_WORKER_URL`, vision overrides and `ENABLE_DEMO_LOGINS`. | §11 `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:118]` |
| H9.3 | VERIFIED | MED | Realtime canvas claim has no live proof; polling is the only exercised path. | §11 `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:124]` |
| H9.4 | VERIFIED | HIGH | No live Supabase/Razorpay/Twilio/webhook/migration proof; only text AI, local Agora token and the mock-only 60-check parallel suite succeeded. | §11 `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:134-136]`; `[src: server/tests/concurrency.test.js:1-4]`; `[ev: npm.cmd test --prefix server, 2026-11-26]` |
| H9.5 | VERIFIED | MED | Founder settings are runtime drafts with read-only money fields; persistence decision pending. | §11 `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-tests-timeline.md:123]` |
| U9.1 | UNKNOWN | MED | Supabase local credential state not captured in the SET/EMPTY audit. | §10: inspect names only in gitignored `server/.env` `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:99]` |
| U9.2 | UNKNOWN | LOW | No external backup/export job found. | §10: `grep -r "export\|backup\|dump" server/jobs server/services` `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:113]` |
| U9.3 | UNKNOWN | MED | Distributed rate limiting not built. | §10: `rg -n "redis|RateLimiter|rateLimit" server --glob '*.js'` `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-tests-timeline.md:126]` |
| U9.4 | UNKNOWN | MED | Provider-side retry budgets undocumented. | §10: provider dashboards/billing docs `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:37]` |
| U9.5 | UNKNOWN | HIGH | Cloudflare per-model quota and token cost unknown. | §10: Cloudflare AI usage/billing dashboard `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:129]` |
| U9.6 | UNKNOWN | MED | Exact output-token cap unknown. | §10: `rg -n "max_tokens|maxTokens|max_output" server worker.js worker-core.mjs` `[src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-data-state-env.md:170]` |
| U9.7 | UNKNOWN | HIGH | [U+2026-11-26] HOWEVER: the middleware now awaits `db.findUserById` and `db.findSession` and `asyncAuthMiddleware` passes 6 assertions, but live Supabase parallelism remains unverified because the 60-check proof is mock-only. | §10: set `DATABASE_MODE=supabase` with real credentials and rerun four-room suite `[src: server/middleware/auth.js:49,98-103]`; `[src: server/tests/asyncAuthMiddleware.test.js]`; `[src: server/tests/concurrency.test.js:1-4]`; `[ev: npm.cmd test --prefix server, 2026-11-26]` |

---

## 10. KNOWN UNKNOWNS REGISTER

[VERIFIED] [U+2026-11-26] NEW RULES R1–R9 apply to this section; see §1.6 and `TPFF_UPDATE_REPORT.md` §U3.

[U~2026-11-26] Counts used in this section are the v4.0.0 final pre-commit inventory: 206 tracked files; 41 `git status --porcelain=v1 --untracked-files=all` paths (32 modified tracked paths + 9 untracked paths, including `E2E_TEST_LOG.md` and `TPFF_BLOCKERS.md`); 36 test files and 36 registered `node tests/*.test.js` script entries with zero registration gaps; 7 review-only SQL migration files; 114 router route definitions; 32 `app.(get|post|use)(` lines in `server/app.js`. Earlier 25/18/7 and 28/19/9 observations are preserved in §11 H-25 and are superseded for current state; after the v4.0.0 documentation commit the 9 untracked paths become tracked, but the final commit hash is `UNKNOWN_AT_AUTHORING_TIME` [ev: git ls-files; git status --porcelain=v1 --untracked-files=all; Get-ChildItem server/tests -Filter *.test.js; Get-ChildItem server/migrations -Filter *.sql; node.exe C:/Users/rohit/AppData/Local/Temp/opencode/tpff-routes.js; Select-String -Path server\app.js -Pattern 'app\.(get|post|use)\('; node.exe -e scripts-entry audit; user-supplied v4.0.0 final pre-commit inventory, 2026-11-26]; [src: E2E_TEST_LOG.md:70-82]. VERIFIED.

No live external provider was contacted by this drafting pass beyond local npm/node commands; the provider results below are either documentary evidence from prior reports or explicitly unresolved [ev: npm.cmd test --prefix server; npm.cmd run migrate --silent --prefix server; gh pr list --state all --repo rohit4333/edtech; supabase --version, 2026-11-26]. VERIFIED.

| # | What is unknown | Why it matters | Exact artifact or command to close it | Owner | Tag | Source |
|---|---|---|---|---|---|---|---|
| U-01 | Which of the seven review-only SQL files (`0001`, `0002`, `0003`, `0004`, `0006`, `0007`, `0008`) are actually applied in a live Supabase project | Every live table, RLS policy, service-only store and outbox depends on the reviewed plan; the runner dry-run contacted no database | `psql "$DATABASE_URL" -c "select version, name, checksum, applied_at from public.mathify_migrations order by version;"`; artifact: one row per applied file with matching checksum | Platform/DB operator (migration guard holder) | UNKNOWN | [src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-data-state-env.md:38]; [ev: npm.cmd run migrate --silent --prefix server, 2026-11-26] |
| U-02 | Deployed RLS and Data API grant state: `app_metadata` policies, safe views, answer-key column lockdown, `rls_auto_enable` execute revoke | Static schema assertions do not prove what is deployed; wrong grants expose answer keys, trainer notes or event payloads | `psql "$DATABASE_URL" -c "select tablename, rowsecurity from pg_tables where schemaname='public' order by tablename;" -c "select schemaname, tablename, policyname, roles from pg_policies where schemaname='public' order by tablename, policyname;"`; artifact: all public tables RLS-enabled and only allowlisted roles granted | Platform/DB operator + Security reviewer | UNKNOWN | [src: server/db/schema.sql:1377-1424]; [src: TEST_REPORT.md:251]; [src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-data-state-env.md:21-23] |
| U-03 | Whether private Storage bucket `trainer-kyc` exists live and is never readable by anon/authenticated | KYC bytes are intended for private Storage only; metadata-only records are not byte storage | `curl -sS -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" "$SUPABASE_URL/storage/v1/bucket/trainer-kyc"`; artifact: bucket JSON showing non-public bucket and no browser-facing bucket policy | Platform/DB operator | UNKNOWN | [src: server/migrations/0006_trainer_onboarding_batches.sql:21-22]; [src: server/services/trainerDocumentService.js:1-15] |
| U-04 | Live service-role write proof for KYC metadata and upload bytes | Mock-mode tests prove only in-memory behavior; no live service-role row/object write was captured | Set live credentials, then `curl -sS -X POST "$SUPABASE_URL/rest/v1/mathify_records" -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" -H "Content-Type: application/json" -H "Prefer: return=representation" -d '{"collection":"trainer_documents","key":"verify:<trainerId>:aadhaar","data":{}}'` and `curl -sS -X POST "$SUPABASE_URL/storage/v1/object/trainer-kyc/verify:<trainerId>:aadhaar" -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" --data-binary @<test-image>`; artifact: metadata row and private object path with no anon read | Backend/DB operator | UNKNOWN | [src: server/services/trainerDocumentService.js:1-15]; [src: server/migrations/0006_trainer_onboarding_batches.sql:14-22]; [src: TEST_REPORT.md:22] |
| U-05 | Live Supabase service-role adapter proof for practice, chat audit and session events | `TEST_REPORT.md` records SKIPPED with no practice or chat audit row written live | Set `DATABASE_MODE=supabase` + credentials, run the 36-suite test command with live adapter enabled, then `psql "$DATABASE_URL" -c "select collection, key, updated_at from public.mathify_records order by updated_at desc limit 20;"`; artifact: live rows plus no credential values in logs | Backend/QA lead | UNKNOWN | [src: TEST_REPORT.md:22,243]; [src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-data-state-env.md:45-49] |
| U-06 | Live Supabase Realtime proof for canvas strokes and scrubbing | Docs describe Realtime canvas strokes, but no live Supabase call was made and mock/non-UUID sessions use polling only | `wrangler tail mathify-ai-chat` is unrelated; use browser live session with UUID and Supabase dashboard Realtime inspector plus `psql "$DATABASE_URL" -c "select id, session_id, created_at from public.quiz_canvas_strokes order by created_at desc limit 10;"`; artifact: realtime INSERT observed and browser payload contains no answer key | Frontend/Realtime owner | UNKNOWN | [src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:64-65,124]; [src: classroom/realtime.js:67-82] |
| U-07 | Live Razorpay order/capture/webhook proof | No order, capture or payment was made; credentials absent/empty in the recorded evidence | Set real keys, then `curl -sS -X POST http://localhost:4000/api/razorpay/orders/monthly -H "Authorization: Bearer <student-token>" -H "Content-Type: application/json" -d '{}'`; artifact: order id, captured payment id, `payment.captured` webhook accepted and pack credited once | Payments owner + QA lead | UNKNOWN | [src: TEST_REPORT.md:23,243]; [src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:48-53] |
| U-08 | Live Twilio WhatsApp send/reply proof | No message was sent; credentials absent/empty in the recorded evidence | Set real Twilio credentials, send a signed POST to `/api/webhooks/whatsapp` from Twilio, then inspect Twilio message SID and server log; artifact: inbound SID, TwiML reply and founder-handoff row where applicable | Parent-assistant owner | UNKNOWN | [src: TEST_REPORT.md:24,243]; [src: server/routes/webhooks.js:25-47,85-153] |
| U-09 | Live Agora webhook and real-join proof | Local token generation passed, but no Agora webhook was proven and browser Join was deliberately not clicked | `curl -sS -X POST http://localhost:4000/api/agora/webhook -H "Content-Type: application/json" -H "x-agora-signature: <HMAC>" -d '<signed fixture>'`; artifact: accepted join/leave callback and presence event, plus browser Join with real device permission | RTC owner + QA lead | UNKNOWN | [src: TEST_REPORT.md:21,244]; [src: server/routes/agora.js:91-134] |
| U-10 | Live Cloudflare Workers AI text call in the current in-flight tree and deployed Worker browser chat | The recorded PASS is documentary from an earlier check; no deployed Worker end-to-end browser chat was exercised | `wrangler tail mathify-ai-chat` while running browser chat with `CHAT_WORKER_URL` set; artifact: routed Worker call source, HTTP 200 and reply envelope | AI/Worker owner | UNKNOWN | [src: TEST_REPORT.md:18,36]; [src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:123] |
| U-11 | Whether requested vision model is available or Meta fallback agreement accepted | Requested vision failed HTTP 400 and fallback vision was blocked HTTP 403 Model Agreement; no live image chat succeeded | Explicit Meta `agree` action by the account owner, then `wrangler tail mathify-ai-chat` during an image query; artifact: successful image reply with no image bytes in logs | Founder/account owner | UNKNOWN | [src: TEST_REPORT.md:19-20,250] |
| U-12 | PR data and upstream review state | Remotes are known, but `gh` is unauthenticated here; no PR state was verified | `gh auth login` then `gh pr list --state all --repo rohit4333/edtech` and `gh pr view <n> --repo rohit4333/edtech`; artifact: PR numbers, states, reviewers and merge commits | Repo maintainer | UNKNOWN | [ev: gh pr list --state all --repo rohit4333/edtech; GH_EXITCODE: 4, 2026-11-26]; [src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-tests-timeline.md:102] |
| U-13 | Verbatim content of PDF pages 5–17 | Policy numbers such as “Score 60” and “8% unlock” cannot be quoted or reconciled without OCR | Provide the PDF or extracted text, then `pdftotext -f 5 -l 17 <policy.pdf> -`; artifact: page-numbered text that can be compared to `server/config/policy.json` | Founder/Policy owner | UNKNOWN | [src: PROJECT_GUIDE.md:395]; [src: TEST_REPORT.md:253] |
| U-14 | Persistence decision for founder settings drafts | Server drafts are explicitly runtime-only and never written to disk; no reviewed deployment policy was promoted | Human approval plus reviewed diff promoting `view()` values into `server/config/policy.json` and redeploy; artifact: committed policy diff and deployed snapshot matching founder-approved values | Founder + Platform owner | UNKNOWN | [src: server/services/founderSettingsService.js:1-7,138-149]; [src: TEST_REPORT.md:252] |
| U-15 | Planner publish and pack import behavior | Planner is live only as local authoring/export; publish and pack import are explicitly disabled | Product decision plus implementation commit and test; artifact: enabled UI controls, server route or documented local-only contract and passing 36-suite run | Product/LMS owner | UNKNOWN | [src: PROJECT_GUIDE.md:399]; [src: lms/planner.js:550-554] |
| U-16 | Deployed environment values on Render/Railway/Cloudflare | Repo manifests declare intent only; no provider dashboard was inspected and no secret values were read | Render/Railway dashboard variable export plus `wrangler secret list --name mathify-ai-chat`; artifact: names present, values confirmed SET/EMPTY by provider without copying them into docs | Platform/DevOps owner | UNKNOWN | [src: render.yaml:10-58]; [src: railway.json:1-10]; [src: wrangler.toml:3-11]; [src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-data-state-env.md:114] |
| U-17 | Completion of credential rotations | Exposed Cloudflare API token, Supabase secret key and Agora Primary Certificate still require rotation; no rotation was performed | Rotate at each provider, replace gitignored `server/.env` values, then `git check-ignore -v server/.env`; artifact: rotation receipts with no values in chat or git | Founder + Security owner | UNKNOWN | [src: TEST_REPORT.md:249]; [src: PROJECT_GUIDE.md:380,394] |
| U-18 | Cloudflare per-model quota, token cost and billing cap | Worker rate limit 20/min is configured, but provider quota and cost are not derivable from repo | Cloudflare AI usage/billing dashboard export; artifact: per-model request counts and cost for the billing period | Founder/Finance owner | UNKNOWN | [src: wrangler.toml:20-29]; [src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:37,130] |
| U-19 | Announcement live creation, targeting, delivery and read-state proof | New announcement routes/services exist untracked and are covered only by mock-mode tests | Set live credentials, call `POST /api/admin/announcements` as founder, then `GET /api/announcements` and `POST /api/announcements/:id/read` as each target role; artifact: targeted rows, inbox delivery and read receipts in live DB | Backend/QA lead | UNKNOWN | [src: server/routes/announcements.js:31-43]; [src: server/routes/admin.js:147-175]; [src: server/tests/announcements.test.js:1-147] |
| U-20 | Live batch allotment, onboarding and weekly schedule write proof | Services and tests are mock-only; no live Supabase row proof exists | Set live credentials, call `POST /api/admin/batches/:batchId/allot`, `POST /api/trainer/onboarding` and `GET /api/trainer/schedule/week`; artifact: live `mathify_records` rows for batches, onboarding and weekly slots | Backend/DB operator | UNKNOWN | [src: server/routes/admin.js:64-131]; [src: server/routes/trainer.js:177-225,768]; [src: server/tests/trainerOnboarding.test.js:1-3] |
| U-21 | Browser smoke / Lighthouse / click-through results for the new login and announcement surfaces | Prior browser smoke evidence predates the untracked login and announcement files | Run the project browser automation with pages `login.html`, `founder/index.html`, `parent/index.html`, `trainer/index.html`; artifact: click-through log and Lighthouse JSON for each surface | Frontend/QA lead | UNKNOWN | [src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-tests-timeline.md:103]; [src: login/login.js:1-226] |
| U-22 | Implemented transition tables for payouts, escalations, incidents, cancelled sessions and rejected/cancelled leaves | Schema enums are verified; service-level transition coverage was not fully traced | `rg -n "status\\s*=\\s*'|status:\\s*'" server/services server/routes --glob '*.js'`; artifact: transition matrix with actor and guard per edge | Backend reviewer | UNKNOWN | [src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-data-state-env.md:80,99,171] |
| U-23 | Meaning of `REALTIME_MODE` env var | Name appears in `.env.example` but no code reference was found in the prior pass; realtime mode is derived from `DATABASE_MODE` | `rg -n "REALTIME_MODE" . --glob '!node_modules/**'`; artifact: either a code reference or a documented removal decision | Backend reviewer | UNKNOWN | [src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-data-state-env.md:172] |
| U-24 | Exact provider output-token cap | Two-phase curriculum generation exists to stay inside a provider limit, but no numeric cap was found | `rg -n "max_tokens|maxTokens|max_output" server worker.js worker-core.mjs`; artifact: provider-documented cap or explicit “unbounded/unknown” decision | AI/Worker owner | UNKNOWN | [src: server/services/cloudflareService.js:1-10]; [src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-data-state-env.md:170] |
| U-25 | Live multi-instance concurrency proof for batch allotment, celebration throttling, rate limiting and reminders | The local 60-check suite proves single-process isolation; reminder delivery claims are now shared in `reminder_claim` records, but rate-limit and celebration state remain per-process | Run two or more instances with `DATABASE_MODE=supabase`, replay the four-trainer/four-student concurrency fixture at both instances at once, then `psql "$DATABASE_URL" -c "select collection, key, data from public.mathify_records where collection in ('batches','presence_events','reminder_claim') order by collection, key;"`; artifact: test log with 60 checks, no duplicate booking or Presence event, and one shared rate-limit/reminder decision per window | Platform/Backend + QA lead | UNKNOWN | [src: server/tests/concurrency.test.js:1-4,158-176]; [src: server/services/batchService.js:24-31]; [src: server/services/celebrationService.js:126-147]; [src: server/middleware/rateLimit.js:1-5]; [src: server/db/supabase.js:132-145]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| U-26 | Real Agora parallel-room join proof for four simultaneous sessions | The 60-check suite proves local channel, Presence and media isolation with mock state; no real four-room Agora join was performed | Join four live rooms with real device permissions, then export Agora Console channel usage and POST signed join/leave webhooks to the server; artifact: four distinct channel names, four isolated participant streams and one Presence event per room | RTC owner + QA lead | UNKNOWN | [src: server/tests/concurrency.test.js:1-4,150-176]; [src: server/services/agoraTokenService.js:29-47]; [src: server/routes/agora.js:37-55,90-119]; [src: TEST_REPORT.md:21,244]; [ev: npm.cmd test --prefix server, 2026-11-26] |

## 11. HOWEVER LOG

[VERIFIED] [U+2026-11-26] NEW RULES R1–R9 apply to this section; see §1.6 and `TPFF_UPDATE_REPORT.md` §U3.

Severity scale: HIGH = launch/security blocker; MED = correctness or drift; LOW = documentation/hygiene; INFO = disclosed fact with no action required. Status is evidence status, not a claim that a fix shipped [src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-tests-timeline.md:111]. VERIFIED.

| ID | Severity | Owner | Role/surface | Observation | Status | Tag | Citation |
|---|---|---|---|---|---|---|---|
| H-01 | HIGH | AI/Worker owner | AI/Worker | `wrangler.toml:23` declares `TEXT_MODEL`, but `worker.js:135-141` pins the text model in code; changing the variable has no effect on chat text | OPEN / DRIFT | VERIFIED | [src: wrangler.toml:23]; [src: worker.js:135-141] |
| H-02 | HIGH | Student image-chat owner | Student/image chat | Requested vision model returned HTTP 400 `No route for that URI`; fallback vision returned HTTP 403 `Model Agreement`; no live image chat succeeded | OPEN / BLOCKED | VERIFIED | [src: TEST_REPORT.md:19-20,242] |
| H-03 | MED | Documentation owner | Docs/branch | [U+2026-11-26] Older docs still name `9838d0a` or `f36321c`; v3.1.0 evidence HEAD is `3b9d597766358356d0d2bd9b555cf7a3614de205`, and the reconciliation is uncommitted on that HEAD | RECONCILED IN v3.1.0 | VERIFIED | [src: PROJECT_GUIDE.md:5]; [src: TEST_REPORT.md:4]; [ev: git rev-parse HEAD; git log -1 --format='%h %ad %s' --date=iso-strict, 2026-11-26] |
| H-04 | MED | Documentation owner | Docs/tests | [U+2026-11-26] The 26-suite and three-migration statements were stale; the v3.1.0 evidence snapshot records 36 test files, 36 chained suite entries and 7 review-only SQL files, and the sidecar docs were updated | RECONCILED IN v3.1.0 | VERIFIED | [src: server/migrations/README.md:43-51]; [src: TEST_REPORT.md:10,161]; [src: server/package.json:13]; [ev: Get-ChildItem server/tests,server/migrations -File, 2026-11-26] |
| H-05 | LOW | Documentation owner | Docs/tests | `PROJECT_GUIDE.md:55` says `navContract` has 44 assertions; current run reports 126 assertions | DRIFT | VERIFIED | [src: PROJECT_GUIDE.md:55]; [src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-current-test.log:36] |
| H-06 | MED | Platform owner | Docs/runtime | Root `package.json:15` declares Node `>=18`, server `package.json:16` declares `>=20`, and CI pins Node 20; `TEST_REPORT.md:236` claims alignment to `>=20` but root manifest is stale | DRIFT | VERIFIED | [src: package.json:14-16]; [src: server/package.json:15-16]; [src: .github/workflows/ci.yml:17-22]; [src: TEST_REPORT.md:236] |
| H-07 | HIGH | DB/Schema owner | DB/parent chat | `parent` is a real Express/demo role with chat routes, but `users.role` DB constraint allows only `founder`, `trainer`, `student`; live parent identity would violate the schema constraint | OPEN | VERIFIED | [src: server/db/schema.sql:39]; [src: server/db/schema.sql:590-591]; [src: server/db/mock.js:58-62]; [src: server/routes/parentChat.js:26-28] |
| H-08 | MED | Payments/Policy owner | Trainer/pay policy | The 15+ minute late band is `no_pay_fine_forfeited` with label “No pay; no extra fine”; the test phrase “no extra fine” means pay is forfeited and no additional penalty is added, not that pay is preserved | CLARIFIED | VERIFIED | [src: server/config/policy.json:98-103]; [src: server/tests/sessionPolicy.test.js:95-98]; [src: server/services/sessionTimingService.js:9-13] |
| H-09 | LOW | Security/DB owner | DB/advisories | `rls_auto_enable` EXECUTE is revoked from `public`, `anon` and `authenticated` specifically to remove the Supabase security-advisor Data API surface without changing trigger behavior; this is intentional, not an unresolved grant | INTENTIONAL | VERIFIED | [src: server/db/schema.sql:1421-1424]; [src: server/migrations/0001_baseline.sql:1372-1375] |
| H-10 | MED | Migrations owner | Migrations/tests | `0005` was renamed to `0006_trainer_onboarding_batches.sql` because `parentChat.test.js` asserts that no migration matching `/^0005/` exists; inserting `0005` would break that contract | RESOLVED BY RENAME | VERIFIED | [src: server/tests/parentChat.test.js:82-84]; [src: server/migrations/0006_trainer_onboarding_batches.sql:1-22]; [ev: npm.cmd run migrate --silent --prefix server, 2026-11-26] |
| H-11 | MED | Backend owner | Trainer/session creation | `POST /api/trainer/sessions` returns 503 `DATABASE_MODE_NOT_LIVE` in mock mode; session creation is intentionally live-only and demo sessions come from seeded mock state | INTENTIONAL | VERIFIED | [src: server/routes/trainer.js:307-314]; [src: server/db/index.js:479-506] |
| H-12 | MED | Founder/Platform owner | Founder/settings | Founder edits are validated runtime drafts, never written to disk; money fields are read-only and file-backed policy remains authoritative until reviewed deployment | INTENTIONAL / UNDECIDED | VERIFIED | [src: server/services/founderSettingsService.js:1-7,138-149]; [src: TEST_REPORT.md:218-220,252] |
| H-13 | MED | Product/LMS owner | LMS/planner | Planner designer is live as local authoring/export only; publish and pack import remain disabled | PARTIAL / INTENTIONAL | VERIFIED | [src: PROJECT_GUIDE.md:399]; [src: lms/planner.js:550-554] |
| H-14 | HIGH | Security owner | Platform/credentials | Exposed Cloudflare API token, Supabase secret key and Agora Primary Certificate still require rotation; no rotation was performed | OPEN | VERIFIED | [src: TEST_REPORT.md:249]; [src: PROJECT_GUIDE.md:380,394] |
| H-15 | HIGH | Platform/Integrations owner | Live integrations | No Supabase call, Razorpay order/capture, Twilio message, Agora webhook or migration apply was made in the recorded verification round; credentials were absent/empty | OPEN | VERIFIED | [src: TEST_REPORT.md:22-25,243] |
| H-16 | MED | AI/Worker owner | Cloudflare/Worker | `[ai] binding` is configured in `wrangler.toml`, but `worker.js` also contains a REST path using account ID and API token; actual deployed call source is unproven | PARTIAL | VERIFIED | [src: wrangler.toml:17-18]; [src: worker.js:167-181]; [src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-integrations-docs.md:123] |
| H-17 | MED | Realtime owner | Realtime/browser | Docs describe Supabase Realtime canvas strokes, but no live Supabase call was made and browser bridge disables Realtime for non-UUID/mock sessions; only polling was exercised | PARTIAL | VERIFIED | [src: server/README.md:153-159]; [src: classroom/realtime.js:67-82]; [src: TEST_REPORT.md:22] |
| H-18 | MED | RTC/QA owner | Student/RTC | Agora Join was not clicked in browser smoke because it would request real camera/microphone; token and gate contracts are covered by server tests | INTENTIONAL | VERIFIED | [src: TEST_REPORT.md:244-245]; [src: PROJECT_GUIDE.md:400]; [src: server/tests/rtcControls.test.js:204-230] |
| H-19 | MED | Policy owner | Data/policy | PDF pages 5–17 were not OCR’d; verbatim policy numbers cannot be quoted from this evidence set | OPEN | VERIFIED | [src: PROJECT_GUIDE.md:395]; [src: TEST_REPORT.md:253] |
| H-20 | LOW | QA/Logging owner | Tests/log | Fallback, `[SECURITY]` and mock-realtime lines in test output are expected; one line carries PowerShell’s `npm.cmd : ` prefix from `Tee-Object` | EXPECTED | VERIFIED | [src: TEST_REPORT.md:126-134]; [src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-current-test.log:11,18,22,28] |
| H-21 | INFO | Documentation owner | Security/review | A stale external review claimed no schema/tests/CI/realtime and DeepSeek usage; it describes an older Phase-1 snapshot and must not be used as a to-do list | DISMISSED | VERIFIED | [src: PROJECT_GUIDE.md:408]; [src: server/tests/cloudflareClient.test.js:114-140] |
| H-22 | INFO | Data/Ops owner | Data/ops | One demo founder row was inserted in `public.users` at the user’s request; this is data, not a schema migration | DISCLOSED | VERIFIED | [src: TEST_REPORT.md:241] |
| H-23 | LOW | Docs/Copy owner | Docs/copy | “No group classes” is live behavior, while “Max 3 kids” is explicitly future chapter-plan language; quoting it without the qualifier is a copy risk | RESOLVED / COPY RISK | VERIFIED | [src: README.md:3]; [src: PROJECT_GUIDE.md:15,85,228] |
| H-24 | INFO | Platform owner | Migrations/tooling | Supabase CLI is absent, while `server/migrations/README.md` says migrations are not managed by CLI; consistent, but no CLI-based live apply is possible here | CONSISTENT | VERIFIED | [src: server/migrations/README.md:3-4]; [ev: supabase --version, 2026-11-26] |
| H-25 | MED | Repo maintainer | In-flight work | [U+2026-11-26] The v3.1.0 code evidence snapshot is 25 porcelain paths (18 modified tracked + 7 in-scope untracked) on HEAD `3b9d597`; two pre-existing untracked docs and modified `PROJECT_GUIDE.md` are outside that snapshot. A local recheck observed 28 porcelain paths, 19 modified and 9 untracked. [U~2026-11-26] The v4.0.0 final pre-commit inventory supersedes both with 41/32/9 (32 modified tracked + 9 untracked, including `E2E_TEST_LOG.md` and `TPFF_BLOCKERS.md`); after the v4.0.0 documentation commit the 9 untracked paths become tracked | SUPERSEDED IN v4.0.0 | VERIFIED | [ev: user-specified v3.1.0 evidence snapshot; user-supplied v4.0.0 final pre-commit inventory, 2026-11-26]; [src: E2E_TEST_LOG.md:46,70-82] |
| H-26 | MED | Documentation owner | Parent/announcements | New parent/announcement surfaces add 15 router definitions beyond the earlier 99-definition inventory, and §5 now inventories all 118 definitions while §13.e reconciles to the same 118 total | RESOLVED IN v2.0 | VERIFIED | [src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-roles-surfaces.md:229-235]; [src: PROJECT_FLOW_FILE.md:§5,§13.e]; [ev: Get-ChildItem PROJECT_FLOW_FILE.md | Select-String '^## ', 2026-11-26] |
| H-27 | HIGH | Backend owner | Live session routes | [U+2026-11-26] The unawaited-session defect is fixed: `requireAuth` awaits `db.findUserById` and `loadSession` awaits `db.findSession`; `asyncAuthMiddleware` passes 6 assertions. Live Supabase four-room behavior remains unverified | RESOLVED IN CODE / LIVE UNVERIFIED | VERIFIED | [src: server/middleware/auth.js:49,98-103]; [src: server/tests/asyncAuthMiddleware.test.js]; [src: server/db/supabase.js:216-218]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| H-28 | MED | Platform/Backend owner | Scale/concurrency | Batch allotment uses a process-wide promise queue, celebration throttles and rate-limit buckets remain per-process, and the API reminder timer is per-process even though delivery claims are shared in `reminder_claim`; horizontal scaling still needs shared coordination | OPEN / SCALE RISK | VERIFIED | [src: server/services/batchService.js:24-31]; [src: server/services/celebrationService.js:126-147]; [src: server/middleware/rateLimit.js:1-5]; [src: server/db/supabase.js:132-145]; [src: server/jobs/reminders.js:255-269]; [src: server/tests/concurrency.test.js:1-4,158-176]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| H-29 | MED | Credential-login owner | Login | Client role-tab mismatch refusal exists only in `login/login.js`; the API relies on per-route role gates. | OPEN / CLIENT-ONLY | VERIFIED | [src: login/login.js:147-150]; [src: server/tests/credentialLogin.test.js:61-67] |
| H-30 | HIGH | Auth/Backend owner | Auth API | `GET /api/auth/batch` has no `auth.requireAuth`; it checks `req.user.role` and returns 403 for everyone. | OPEN / AUTH GAP | VERIFIED | [src: server/routes/auth.js:32-42] |
| H-31 | LOW | Platform/Frontend owner | Static serving | The `login.html` static-allowlist gap that returned JSON 404 is resolved; `server/app.js` now permits `login.html` and `login/`, and a browser GET returned the sign-in page with CSS/JS and no console errors. | RESOLVED | VERIFIED | [src: server/app.js:119-125]; [ev: browser GET http://localhost:4000/login.html?role=student, 2026-11-26] |

[VERIFIED] [U+2026-11-26] No new H row was added for the v4.0.0 audit: its confirmed in-repo defects are recorded separately as A-01…A-09 in `TPFF_BLOCKERS.md` and all are FIXED (A-09 by the v3.1.0 docs pass, not re-applied). The 10-role outcomes are Founder FAIL (observer publisher bug, fixed as A-01), Trainer 1 PASS with `1,224 counted assertions + apiSmoke`, Trainer 2 BLOCKED only on the exact `*_002` fixture with contracts PASS, Kid 1 FAIL on an over-strict session-id interpretation and explicitly NOT a defect, Kid 2 FAIL on the same observer bug, Observer FAIL with 3 findings, Tester PASS, QA PASS, Bug Finder FAIL with 6 confirmed findings and Bug Fixer PASS after two authorized batches. B-01…B-06 external blockers and G-01…G-03 gaps are unchanged; no live success is claimed. `[src: E2E_TEST_LOG.md:14-29,38-64]`; `[src: TPFF_BLOCKERS.md:18-40]`

## 12. TIMELINE

[VERIFIED] [U+2026-11-26] NEW RULES R1–R9 apply to this section; see §1.6 and `TPFF_UPDATE_REPORT.md` §U3.

This section lists only events with a local git record, a captured command output, or a dated documentary record in the cited reports; documentary provider results are labelled as such and are not claimed as provider-verified by this drafting pass [src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-tests-timeline.md:70-84]. VERIFIED.

[U~2026-11-26] The v3.1.0 and v4.0.0 evidence baseline is `3b9d597766358356d0d2bd9b555cf7a3614de205` on branch `feat/student-rtc-control-permission`; the v4.0.0 final commit hash is `UNKNOWN_AT_AUTHORING_TIME` and must not be invented. Older named bases `f36321c`, `b2bf372` and `9838d0a` are ancestors and remain in the append-only history [ev: git branch --show-current; git rev-parse HEAD; git log -1 --format='%h %ad %s' --date=iso-strict, 2026-11-26]; [src: E2E_TEST_LOG.md:5]. VERIFIED.

| Date/time (IST) | Event actually recorded | Evidence status | Tag | Citation |
|---|---|---|---|---|
| 2026-11-26 10:47:07 | `b2bf372` “Complete live adapter, realtime outbox and live-readiness DX”; in HEAD ancestry and pointed to by `feat/mathify-phase-3-curriculum` | Local commit evidence | VERIFIED | [ev: git show --stat --format=fuller --no-patch b2bf372; git log --format='%h %ad %s' --date=iso -25, 2026-11-26]; [src: PROJECT_GUIDE.md:418] |
| 2026-11-26 11:29:34 | `9838d0a` “Add comprehensive project guide covering what, why, where, when and how”; now `main`/`origin/main` and the base named by older docs | Local commit evidence | VERIFIED | [ev: git log --format='%h %ad %s' --date=iso -25; git log --oneline --decorate -20, 2026-11-26]; [src: TEST_REPORT.md:4] |
| 2026-11-26 13:07:19 | `2a3b7b8` “Harden student control, engagement and security boundaries”; recorded as 55 files including classroom media/reactions/celebrations, two new suites, CI and audit updates | Local commit evidence; file count documentary | VERIFIED | [ev: git log --format='%h %ad %s' --date=iso -25, 2026-11-26]; [src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-tests-timeline.md:76] |
| 2026-11-26 13:50:14 | `d93bf1d` “Add founder settings drafts and planner designer”; recorded as 19 files, +1675/−35, adding `founderSettingsService.js`, `lms/planner.js`, admin settings route and test assertions | Local commit evidence; diff counts documentary | VERIFIED | [ev: git log --format='%h %ad %s' --date=iso -25, 2026-11-26]; [src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-tests-timeline.md:77] |
| 2026-11-26 14:58:25 | `f36321c` “Add parent chat DLP and complete AI mastery simulation fixes”; v2.0/v3.0.0 baseline; recorded as 46 files, +5648/−160, adding parent chat, DLP, Worker core, practice service, `0004` and four tests | Local commit evidence; diff counts documentary | VERIFIED | [ev: git log --format='%h %ad %s' --date=iso -25, 2026-11-26]; [src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-tests-timeline.md:78] |
| 2026-11-26 17:17:35 | `3b9d597` “docs(tpff): v3.0.0 — apply founder rules and complete validated TPFF”; [U~2026-11-26] evidence baseline for v3.1.0 and v4.0.0, not a claimed v4.0.0 commit | Local commit evidence | VERIFIED | [ev: git log -1 --format='%h %ad %s' --date=iso-strict, 2026-11-26]; [src: E2E_TEST_LOG.md:5] |
| 2026-11-26 (documented) | Direct provider checks recorded: Workers AI text PASS HTTP 200 about 453 ms; requested vision FAIL HTTP 400; fallback vision BLOCKED HTTP 403 Model Agreement; Agora local token PASS; Supabase/Razorpay/Twilio/migration SKIPPED | Documentary record; no provider access by this pass | VERIFIED | [src: TEST_REPORT.md:12-25,36] |
| 2026-11-26 (documented) | Simulation agents found/fixed `batchLabel` shadowing, 80th-question batch disabled too early, favicon 404, incomplete trainer payout copy, `explanation: null` draft rejection and legacy tutor prompts carrying `sessionId` | Documentary record | VERIFIED | [src: TEST_REPORT.md:38-46] |
| 2026-11-26 (documented) | Backend/frontend agents completed parent↔trainer chat; static allowlist was updated for `parent/` after agents reported; local API smoke on port 4001 plus parent/trainer browser smokes were recorded | Documentary record | VERIFIED | [src: TEST_REPORT.md:54-60] |
| 2026-11-26 (documented) | Post-live-check fixes: literal model slugs in REST paths, LLaVA “No route” treated as model-not-found, balanced-JSON extraction, sanitizers, forced founder escalation and honest 80-question `topicLimit`/`topicRemaining` | Documentary record | VERIFIED | [src: TEST_REPORT.md:27-35] |
| 2026-11-26 (prior evidence run) | 27-suite `npm.cmd test --prefix server` exit 0, migration dry run exit 0, `npm.cmd audit --omit=dev --prefix server` 0 vulnerabilities, `git diff --check` clean, tree clean | Captured command evidence in prior pass | VERIFIED | [src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-tests-timeline.md:43-60,84]; [src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-final-test.log:1-87] |
| 2026-11-26 (v3.1.0 evidence snapshot) | Code evidence snapshot: 206 tracked files and 25 porcelain paths (18 modified tracked code/config paths + 7 in-scope untracked implementation paths); excludes two pre-existing untracked docs and the modified `PROJECT_GUIDE.md` | User-specified snapshot | VERIFIED | [ev: user-specified v3.1.0 evidence snapshot, 2026-11-26] |
| 2026-11-26 (v3.1.0 evidence snapshot) | `npm.cmd test --prefix server` completed all 36 chained suites with exit code 0; highlights: `chatWorker: 110 assertions passed`, `mcpServer: 55 checks`, `chatAssistant: 63 assertions passed`, `livePersistence: 43 assertions passed`, `asyncAuthMiddleware: 6 assertions passed`, `razorpayWebhook` exactly-once assertions and `agoraRoutes: 35 assertions passed`; `server/package.json:13` has 36 entries | Captured command evidence | VERIFIED | [ev: npm.cmd test --prefix server, 2026-11-26]; [src: server/package.json:13] |
| 2026-11-26 (v3.1.0 evidence snapshot) | Migration dry run listed seven review-only SQL files in order (`0001`, `0002`, `0003`, `0004`, `0006`, `0007`, `0008`), reported no database contact and exit 0 | Captured command evidence | VERIFIED | [ev: npm.cmd run migrate --silent --prefix server, 2026-11-26]; [src: server/migrations/README.md:9-17] |
| 2026-11-26 (local recheck) | After this reconciliation, `git status --porcelain=v1 --untracked-files=all` observed 28 lines, `git diff --name-only` 19 modified tracked paths and `git ls-files --others --exclude-standard` 9 untracked paths; this discrepancy is recorded in H-25 and does not replace the user-specified 25/18/7 evidence snapshot | Captured command evidence | VERIFIED | [ev: git status --porcelain=v1 --untracked-files=all; git diff --name-only; git ls-files --others --exclude-standard, 2026-11-26] |
| 2026-11-26 (this drafting pass) | Route scanning measured 114 router definitions across 15 route files, 4 app-level HTTP definitions and 32 `app.(get|post|use)(` lines; `PROJECT_FLOW_FILE.md` had only §§0–4 | Captured command evidence | VERIFIED | [ev: node.exe C:/Users/rohit/AppData/Local/Temp/opencode/tpff-routes.js; Select-String -Path server\app.js -Pattern 'app\.(get|post|use)\('; Get-Content PROJECT_FLOW_FILE.md | Select-String '^## ', 2026-11-26]; [src: C:/Users/rohit/AppData/Local/Temp/opencode/tpff-current-routes.txt:1-130] |
| 2026-11-26 (this drafting pass) | `gh pr list --state all --repo rohit4333/edtech` failed unauthenticated with exit code 4; `supabase --version` was not recognized | Captured command evidence | VERIFIED | [ev: gh pr list --state all --repo rohit4333/edtech; GH_EXITCODE: 4; supabase --version, 2026-11-26] |
| 2026-11-26 (10-role audit) | [U+2026-11-26] Ten isolated role agents ran against evidence baseline `3b9d597`; A-01…A-09 are all FIXED (A-09 by v3.1.0, not re-applied), B-01…B-06 remain `BLOCKED_EXTERNAL` and G-01…G-03 remain unchanged gaps | Captured multi-agent audit evidence | VERIFIED | [src: E2E_TEST_LOG.md:14-29,38-64]; [src: TPFF_BLOCKERS.md:9-40] |
| 2026-11-26 (v4.0.0 final validation) | [U+2026-11-26] `npm.cmd test --prefix server` exit 0 with 36/36 suites (`agoraRoutes: 60`, `sessionPolicy: 37`, `rtcControls: 46`, `livePersistence: 54`, `chatWorker: 110`, `mcpServer: 55`), `node --check` `SYNTAX_FILES=136`/`SYNTAX_FAILURES=0`, seven-file migration dry run exit 0, `git diff --check` exit 0 with CRLF warnings only; final pre-commit inventory 41/32/9 | Captured command evidence | VERIFIED | [src: E2E_TEST_LOG.md:70-82]; [ev: user-supplied v4.0.0 final pre-commit inventory, 2026-11-26] |

## 13. APPENDICES

[VERIFIED] [U+2026-11-26] NEW RULES R1–R9 apply to this section; see §1.6 and `TPFF_UPDATE_REPORT.md` §U3.

Citation paths without a drive prefix in §13 are relative to `C:/Users/rohit/AppData/Local/Temp/opencode/`; repository paths are relative to the working tree root. VERIFIED.

### 13.a Env variable reference

[U+2026-11-26] Names only are reproduced here; no secret value was read or printed. The inventory contains 45 names from `server/.env.example` plus 14 additional names referenced in code, config or deploy manifests, for 59 total; `MCP_FOUNDER_TOKEN` is newly present in the template [ev: Select-String -Path 'server\.env.example' -Pattern '^\s*([A-Z][A-Z0-9_]*)\s*='; combined name audit, 2026-11-26]; [src: server/.env.example:50]. VERIFIED.

| Name | Purpose | Required / default | Fail-closed behavior | Tag | Source |
|---|---|---|---|---|---|
| `ADMIN_EMAIL` | Founder notification sender destination | Optional; no default in evidence | `not_configured` notification result when unset | VERIFIED | [src: tpff-data-state-env.md:106]; [src: tpff-integrations-docs.md:72] |
| `AGORA_APP_CERTIFICATE` | RTC token signing certificate | Prod required; no default | Production boot guard throws missing/weak | VERIFIED | [src: server/config.js:45-48]; [src: tpff-data-state-env.md:112] |
| `AGORA_APP_ID` | RTC app identity | Prod required; no default | Production boot guard throws missing/weak | VERIFIED | [src: server/config.js:45-48]; [src: tpff-data-state-env.md:112] |
| `AGORA_CUSTOMER_KEY` | Cloud Recording REST Basic auth key | Optional; local audit EMPTY | Recording service uses mock state when unconfigured | VERIFIED | [src: tpff-integrations-docs.md:42,46,99] |
| `AGORA_CUSTOMER_SECRET` | Cloud Recording REST Basic auth secret | Optional; local audit EMPTY | Recording service uses mock state when unconfigured | VERIFIED | [src: tpff-integrations-docs.md:42,46,99] |
| `AGORA_RECORDING_ACCESS_KEY` | Recording storage access key | Optional; local audit EMPTY | Recording vendor config skipped when unconfigured | VERIFIED | [src: tpff-integrations-docs.md:46,99] |
| `AGORA_RECORDING_BUCKET` | Recording storage bucket | Optional; local audit EMPTY | Recording vendor config skipped when unconfigured | VERIFIED | [src: tpff-integrations-docs.md:46,99] |
| `AGORA_RECORDING_REGION` | Recording storage region | Optional; local audit SET | Recording vendor config skipped when unconfigured | VERIFIED | [src: tpff-integrations-docs.md:46,99] |
| `AGORA_RECORDING_SECRET_KEY` | Recording storage secret key | Optional; local audit EMPTY | Recording vendor config skipped when unconfigured | VERIFIED | [src: tpff-integrations-docs.md:46,99] |
| `AGORA_RECORDING_STORAGE_CONFIG` | Recording vendor storage configuration | Optional; local audit EMPTY | Recording vendor config skipped when unconfigured | VERIFIED | [src: tpff-integrations-docs.md:46,99] |
| `AGORA_RECORDING_VENDOR` | Recording vendor name | Optional; local audit SET | Recording vendor config skipped when unconfigured | VERIFIED | [src: tpff-integrations-docs.md:46,99] |
| `AGORA_WEBHOOK_SECRET` | Agora webhook HMAC-SHA256 verification | Prod required; no default | Missing secret fails webhook/production guard | VERIFIED | [src: server/config.js:45-48]; [src: tpff-roles-surfaces.md:202] |
| `ALLOW_DEMO_AUTH` | Worker local demo auth switch | Worker variable; `false` in `wrangler.toml`, `.dev.vars` may set `true` | Production must omit demo auth | VERIFIED | [src: wrangler.toml:20-29]; [src: tpff-data-state-env.md:109] |
| `ALLOWED_ORIGINS` | Worker CORS allowlist | Worker variable; localhost:4000/127.0.0.1:4000 in config | Worker CORS rejects other origins | VERIFIED | [src: wrangler.toml:20-29]; [src: worker.js:35-67] |
| `AUTH_SECRET` | JWT signing secret | Prod required, minimum 32 chars | `requireEnv` throws missing/weak value | VERIFIED | [src: server/config.js:16-21,26-31]; [src: tpff-data-state-env.md:112] |
| `AUTH_TTL_SECONDS` | Demo token lifetime | Default 43200 s (12 h) | No explicit production guard cited | VERIFIED | [src: tpff-data-state-env.md:55]; [src: server/auth/token.js:6] |
| `CHAT_WORKER_URL` | Deployed Worker bridge base URL for Express chat | Optional; absent from `.env.example` | Local Cloudflare REST path used when unset | VERIFIED | [src: server/services/chatWorkerService.js:21-50]; [src: tpff-integrations-docs.md:118] |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare AI account identifier | Prod required; no default | Production boot guard throws | VERIFIED | [src: server/config.js:40-41]; [src: tpff-data-state-env.md:112] |
| `CLOUDFLARE_API_TOKEN` | Cloudflare AI REST token | Prod required; no default | Production boot guard throws; non-prod uses deterministic fallback | VERIFIED | [src: server/config.js:40-41]; [src: server/services/cloudflareAiService.js:90-103] |
| `CLOUDFLARE_MODEL` | Server-side AI model name | Optional; local audit SET | Missing/errored call falls back in non-prod; throws in prod | VERIFIED | [src: tpff-integrations-docs.md:99]; [src: server/services/cloudflareAiService.js:14-16] |
| `CLOUDFLARE_TIMEOUT_MS` | AI request timeout | Default 15000 ms | Timeout triggers non-prod fallback / prod throw | VERIFIED | [src: server/services/cloudflareAiService.js:14-25]; [src: tpff-integrations-docs.md:99] |
| `CLOUDFLARE_VISION_FALLBACK_MODEL` | Vision fallback override | Optional; absent from `.env.example` | Worker core fallback model pinned if unset | VERIFIED | [src: server/services/chatWorkerService.js:21-23]; [src: tpff-integrations-docs.md:118] |
| `CLOUDFLARE_VISION_MODEL` | Vision model override | Optional; absent from `.env.example` | Worker core vision model pinned if unset | VERIFIED | [src: server/services/chatWorkerService.js:21-23]; [src: tpff-integrations-docs.md:118] |
| `CORS_ORIGIN` | Express CORS origin | Prod required and must not be `*`; default `*` | Production boot guard throws on `*` | VERIFIED | [src: server/config.js:14-51,60-64]; [src: tpff-data-state-env.md:113] |
| `DATABASE_MODE` | Selects `mock` or `supabase` adapter | Prod required `supabase`; default `mock` | Live-only writes return 503 in mock; no silent fallback | VERIFIED | [src: server/config.js:26-51,60-64]; [src: server/db/index.js:1-12,479-506] |
| `DATABASE_URL` | Postgres/Supabase connection string for migrations | Required only for `--apply`; default absent | Apply blocked unless guard and URL present | VERIFIED | [src: server/migrations/README.md:27-35]; [src: tpff-data-state-env.md:106] |
| `DEMO_PASSWORD` | Shared demo password for seeded accounts | Optional; used by tests/local demo | Demo hidden in production | VERIFIED | [src: tpff-data-state-env.md:106]; [src: server/routes/auth.js:65-81] |
| `ENABLE_DEMO_LOGINS` | Server demo-account discovery switch | Optional; absent from `.env.example` | Production demo route gated by server logic | VERIFIED | [src: server/routes/auth.js:66]; [src: tpff-data-state-env.md:109] |
| `MATHIFY_MIGRATE_CONFIRM` | Explicit migration apply guard | Must equal `apply` for apply; default absent | Dry run only; no DB contact | VERIFIED | [src: server/migrate.js:20-94]; [src: server/migrations/README.md:27-35] |
| `MCP_FOUNDER_TOKEN` | Founder MCP bearer credential | Required by `server/mcp-server.js`; no default | MCP process refuses startup and exposes no tool without it | VERIFIED | [src: server/.env.example:50]; [src: server/mcp-server.js:96]; [src: server/mcp-server.js:520] |
| `NODE_ENV` | Environment selector | Optional; production enables fail-closed guard | `assertProductionConfig()` runs only when `production` | VERIFIED | [src: server/config.js:14-26]; [src: tpff-data-state-env.md:109] |

| `NODEMAILER_EMAIL` | SMTP sender address | Optional; no default | Notification returns `not_configured` when unset | VERIFIED | [src: tpff-data-state-env.md:106]; [src: tpff-integrations-docs.md:72] |
| `NODEMAILER_PASSWORD` | SMTP password | Optional; no default | Notification returns `not_configured` when unset | VERIFIED | [src: tpff-data-state-env.md:106]; [src: tpff-integrations-docs.md:72] |
| `NODEMAILER_SERVICE` | SMTP service/provider | Optional; no default | Notification returns `not_configured` when unset | VERIFIED | [src: tpff-data-state-env.md:106]; [src: tpff-integrations-docs.md:72] |
| `OBSERVABILITY_WEBHOOK_URL` | Structured-alert webhook | Optional; no default | `alert()` returns `not_configured`; 3 s abort when set | VERIFIED | [src: server/services/logger.js:78-120]; [src: tpff-data-state-env.md:106] |
| `PORT` | Express listen port | Default 4000 | No production guard cited | VERIFIED | [src: server/config.js:60-64]; [src: tpff-data-state-env.md:113] |
| `POSTGRES_DB` | Docker-compose review database name | Optional; review-only compose | Compose default not captured; not a Supabase replacement | VERIFIED | [src: docker-compose.yml:18-23]; [src: tpff-data-state-env.md:109] |
| `POSTGRES_PASSWORD` | Docker-compose review database password | Optional; review-only compose | Compose default not captured; not a Supabase replacement | VERIFIED | [src: docker-compose.yml:18-23]; [src: tpff-data-state-env.md:109] |
| `POSTGRES_USER` | Docker-compose review database user | Optional; review-only compose | Compose default not captured; not a Supabase replacement | VERIFIED | [src: docker-compose.yml:18-23]; [src: tpff-data-state-env.md:109] |
| `RATE_LIMIT_PER_MIN` | Worker per-minute rate limit | Default/configured 20 | Worker limiter returns 429 with bucket keyed by minute+IP+subject | VERIFIED | [src: wrangler.toml:20-29]; [src: worker.js:118-132] |
| `RAZORPAY_KEY_ID` | Razorpay key identifier | Prod required; local audit EMPTY | Production boot guard throws | VERIFIED | [src: server/config.js:42-44]; [src: tpff-integrations-docs.md:99] |
| `RAZORPAY_KEY_SECRET` | Razorpay order/signature secret | Prod required; local audit EMPTY | Production boot guard throws | VERIFIED | [src: server/config.js:42-44]; [src: tpff-integrations-docs.md:99] |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook HMAC secret | Prod required; local audit EMPTY | Production boot guard throws; unsigned webhook rejected | VERIFIED | [src: server/config.js:42-44]; [src: server/services/razorpayService.js:58-72] |
| `REALTIME_MODE` | Listed realtime selector with no code reference found | Optional; meaning unresolved in U-23 | No fail-closed behavior found; mode derived from `DATABASE_MODE` | VERIFIED | [src: tpff-data-state-env.md:172]; [src: server/realtime/index.js:11] |
| `RECORDING_WEBHOOK_SECRET` | Recording webhook shared secret | Prod required; no default | Missing prod secret returns 503; constant-time compare | VERIFIED | [src: server/config.js:45-48]; [src: server/routes/webhooks.js:49-61] |
| `REMINDER_CHECK_MS` | Reminder timer interval | Default 300000 ms; floor 60000 ms | `REMINDERS_ENABLED=false` disables timer | VERIFIED | [src: server/jobs/reminders.js:7-8,113]; [src: render.yaml:51-54] |
| `REMINDERS_ENABLED` | Reminder timer switch | Default enabled in code; deploy sets `false` | Disabled timer logs `reminders disabled`; `--once` cron path ignores the switch | VERIFIED | [src: server/jobs/reminders.js:255-259]; [src: render.yaml:48-55] |
| `REMINDER_RUN_ONCE` | Alternate one-shot cron switch | Default `false`; CI uses the explicit `--once` flag | When `true`, a direct job invocation runs one pass and exits | VERIFIED | [src: server/jobs/reminders.js:8-9]; [src: server/.env.example:82-86] |
| `SLACK_WEBHOOK_URL` | Slack founder-handoff webhook | Optional; no default | Notification returns `not_configured` when unset | VERIFIED | [src: tpff-data-state-env.md:106]; [src: tpff-integrations-docs.md:72] |
| `SUPABASE_PUBLISHABLE_KEY` | Browser-safe Data API key | Prod required; no default | Production boot guard throws; browser receives this key only | VERIFIED | [src: server/config.js:37-39]; [src: server/app.js:68-82] |
| `SUPABASE_SECRET_KEY` | Service-role key for server/Worker writes | Prod required; no default | Production boot guard throws; never serialized to browser | VERIFIED | [src: server/config.js:37-39]; [src: server/db/supabase.js:13-25] |
| `SUPABASE_URL` | Supabase project REST URL | Prod required; no default | Production boot guard throws; adapter requires all three Supabase values | VERIFIED | [src: server/config.js:37-39]; [src: server/db/supabase.js:17-25] |
| `TEXT_MODEL` | Worker declared text model variable | Worker variable; ignored by pinned code | Changing it has no effect; see H-01 | VERIFIED | [src: wrangler.toml:23]; [src: worker.js:135-141] |
| `TWILIO_ACCOUNT_SID` | Twilio account identity | Optional in repo; prod webhook validation uses credentials | Production webhook fails closed when URL/secret missing | VERIFIED | [src: tpff-data-state-env.md:106]; [src: server/routes/webhooks.js:25-47] |
| `TWILIO_AUTH_TOKEN` | Twilio signature verification token | Prod required; no default | Production boot guard throws; webhook HMAC fails closed | VERIFIED | [src: server/config.js:49-50]; [src: server/routes/webhooks.js:25-47] |
| `TWILIO_WEBHOOK_URL` | Twilio webhook base URL | Prod required; no default | Production boot guard throws | VERIFIED | [src: server/config.js:49-50]; [src: tpff-data-state-env.md:112] |
| `TWILIO_WHATSAPP_NUMBER` | WhatsApp sender number | Optional; no default | Message send skipped when credentials absent | VERIFIED | [src: tpff-data-state-env.md:106]; [src: TEST_REPORT.md:24] |
| `VISION_FALLBACK_MODEL` | Worker declared vision fallback variable | Worker variable; core also pins fallback | Fallback blocked until Meta agreement; see H-02 | VERIFIED | [src: wrangler.toml:25-29]; [src: worker-core.mjs:9-11] |
| `VISION_MODEL` | Worker declared vision model variable | Worker variable; requested model unavailable on account | Requested vision returns model-not-found handling | VERIFIED | [src: wrangler.toml:24]; [src: TEST_REPORT.md:19] |
| `WHATSAPP_DEMO_PARENT_PHONE` | Demo parent phone for WhatsApp assistant | Optional; no default | Demo route omits parent contact detail | VERIFIED | [src: tpff-data-state-env.md:106]; [src: tpff-roles-surfaces.md:223] |

`assertProductionConfig()` requires 17 values with explicit non-`*` CORS and minimum 32-character `AUTH_SECRET`; error text never includes values [src: server/config.js:14-51]; [src: tpff-data-state-env.md:112]. VERIFIED.

Local `server/.env` key-state audit recorded `PORT`, `AUTH_SECRET`, `CORS_ORIGIN`, `DATABASE_MODE`, `REALTIME_MODE`, `DEMO_PASSWORD`, `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`, `AGORA_RECORDING_VENDOR`, `AGORA_RECORDING_REGION`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_MODEL` and `CLOUDFLARE_TIMEOUT_MS` as SET, and the remaining audited provider keys as EMPTY; values were never read or printed [src: tpff-integrations-docs.md:99]. VERIFIED.

### 13.b Dependency list

`server/package-lock.json` is lockfileVersion 3; runtime declarations and locked resolutions are listed below; server devDependencies are empty and root dependencies/devDependencies are empty [ev: node.exe -e "const p=require('./server/package.json'), l=require('./server/package-lock.json'); ...", 2026-11-26]; [src: tpff-integrations-docs.md:103-107]. VERIFIED.

| Package | Declared | Locked | Purpose | Tag | Source |
|---|---|---|---|---|---|
| `agora-token` | `^2.0.7` | `2.0.7` | RTC/RTM token generation | VERIFIED | [src: server/package.json:18-26]; [src: tpff-integrations-docs.md:105] |
| `cors` | `^2.8.5` | `2.8.6` | Express CORS middleware | VERIFIED | [src: server/package.json:18-26]; [src: tpff-integrations-docs.md:105] |
| `dotenv` | `^16.4.5` | `16.6.1` | Loads `server/.env` | VERIFIED | [src: server/config.js:1]; [src: tpff-integrations-docs.md:105] |
| `express` | `^4.18.3` | `4.22.3` | HTTP server and router | VERIFIED | [src: server/package.json:18-26]; [src: tpff-integrations-docs.md:105] |
| `nodemailer` | `^10.6.1` | `10.6.1` | SMTP founder notifications | VERIFIED | [src: server/package.json:18-26]; [src: tpff-integrations-docs.md:105] |
| `razorpay` | `^2.9.6` | `2.9.8` | Payment order creation | VERIFIED | [src: server/package.json:18-26]; [src: tpff-integrations-docs.md:105] |
| `zod` | `^4.6.7` | `4.6.7` | Runtime payload validation | VERIFIED | [src: server/package.json:18-26]; [src: tpff-integrations-docs.md:105] |

No `@supabase/*` SDK and no Redis/job-queue client are declared; Supabase access is raw `fetch` REST through the service-role adapter [src: server/package.json:18-26]; [src: tpff-integrations-docs.md:63,104]. VERIFIED.

`npm.cmd audit --omit=dev --prefix server` reported `0 vulnerabilities` in the prior evidence run, and the dependency-CVE fix is documented for `zod` and `nodemailer` [ev: npm.cmd audit --omit=dev --prefix server, 2026-11-26]; [src: TEST_REPORT.md:236]. VERIFIED.

### 13.c Test inventory

There are 36 test files and 36 `node tests/*.test.js` entries in `server/package.json:13`, with empty unregistered-file and missing-file sets [ev: node.exe -e scripts-entry audit; Get-ChildItem server/tests -Filter *.test.js; npm.cmd test --prefix server, 2026-11-26]. VERIFIED.

| File | What it covers | What it does not cover | Tag | Source |
|---|---|---|---|---|
| `server/tests/agoraRoutes.test.js` | Agora token query contract, duplicate-channel `409 AMBIGUOUS_CHANNEL`, webhook signature and channel resolution | No live Agora join, device permission or provider webhook | VERIFIED | [src: server/tests/agoraRoutes.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/aiCurriculumIntegration.test.js` | Student-to-curriculum-to-AI prompt wiring, fallback, no PII | No live provider, route auth, DB or deployed Worker | VERIFIED | [src: server/tests/aiCurriculumIntegration.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/announcements.test.js` | Founder audience targeting, DLP, inbox reads and unread state in mock mode | No live delivery, DB, browser or notification provider | VERIFIED | [src: server/tests/announcements.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/apiSmoke.test.js` | Boots Express: health/config, static allowlist, auth, parent chat DLP, founder drafts, tutor/copilot bridges, practice, curriculum, hints, payout/schedule/leave, session events, quiz flow, session end | Mock DB only; no live providers or browser | VERIFIED | [src: server/tests/apiSmoke.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/asyncAuthMiddleware.test.js` | Awaited `findUserById` and `findSession` in auth/session middleware | No live Supabase mode or four-room proof | VERIFIED | [src: server/tests/asyncAuthMiddleware.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/attendancePolicy.test.js` | Mutual leave, late cancellation, effective student status, missing notice | No leave API, balance DB or payout interaction | VERIFIED | [src: server/tests/attendancePolicy.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/chatAssistant.test.js` | Offline fallback honesty, tutor/copilot prompts, injection, reply-side DLP, WhatsApp pseudonymity | Stubbed fetch only; no deployed Worker, Twilio, Supabase or browser | VERIFIED | [src: server/tests/chatAssistant.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/chatWorker.test.js` | Model pins, model-not-found, JSON extraction, sanitisation, role gate, vision retry/limits, bridge contracts | No real Cloudflare/Supabase call, browser or log-byte proof beyond source text | VERIFIED | [src: server/tests/chatWorker.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/cloudflareClient.test.js` | Fallback/throw, endpoint, bearer auth, JSON cleanup, envelope, no DeepSeek/OpenAI in JS | No live Cloudflare call, real timeout or vision model | VERIFIED | [src: server/tests/cloudflareClient.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/concurrency.test.js` | Four simultaneous trainer/student sessions: isolated event streams, Presence, RTC channel and calendar bookings; 60 local checks | No live Supabase adapter, real Agora join, multi-instance coordination or browser device permissions | VERIFIED | [src: server/tests/concurrency.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/credentialLogin.test.js` | Server-signed token contract, role destination hints, refusal on role mismatch, per-surface token keys | No real provider, browser page execution or live DB | VERIFIED | [src: server/tests/credentialLogin.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/curriculumAuthoring.test.js` | Planner schema, block types, student stripping, quiz tiers, hints, two-call generation, parallel checks | No live provider, HTTP routes, persistence adapter or browser rendering | VERIFIED | [src: server/tests/curriculumAuthoring.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/curriculumContext.test.js` | Seven boards, aliases, nested profile, PII absence | No AI call, HTTP or profile write path | VERIFIED | [src: server/tests/curriculumContext.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/curriculumPersistence.test.js` | Memory adapter, PII rejection, Supabase mapping, migration checks, transaction/checksum text | Stubbed fetch; no live Supabase, apply or HTTP routes | VERIFIED | [src: server/tests/curriculumPersistence.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/engagementControls.test.js` | Reactions allowlist/roles, applause/emoji pauses, media-state interaction, 6 celebration types, preferences, throttle/gap, scrubbed events, reduced-motion/sound/share contracts | No real device hardware change, browser or live persistence | VERIFIED | [src: server/tests/engagementControls.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/leaveService.test.js` | 48 h rule, 8-credit balance, auto-approval, session/attendance mutation, founder denial | No HTTP route, Supabase or notification delivery | VERIFIED | [src: server/tests/leaveService.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/liveOperations.test.js` | Draft moderation, rate-limit 429/Retry-After, notification honesty, recording chapters, session-party validation, mock seed safety | No live scheduler/email/Slack, distributed limiter or DB | VERIFIED | [src: server/tests/liveOperations.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/livePersistence.test.js` | Mock-safe default, live insert fail-closed, outbox ordering/cursor, Supabase no-creds refusal, facade coverage, migration shape, checksum guards | No live Supabase call/apply, realtime backend or browser | VERIFIED | [src: server/tests/livePersistence.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/liveReadiness.test.js` | Production fail-closed, password hashing, demo hiding, webhook guards, Agora identity, scrubbed events, chat roles, board share, Slack honesty, Razorpay captured/replay, migration wrapper | No live provider/DB/payment/webhook or browser | VERIFIED | [src: server/tests/liveReadiness.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/masteryGating.test.js` | 80/79 threshold, reteach flags, levels, pending parallel checks | No HTTP, quiz generation/AI or persistence | VERIFIED | [src: server/tests/masteryGating.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/masteryPractice.test.js` | Batch 10, cap 80, 15% ramp, 9th batch error, private answer, ownership errors | No HTTP routes, live persistence, AI or browser | VERIFIED | [src: server/tests/masteryPractice.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/mcpServer.test.js` | Exactly three founder MCP tools, token gate, `readOnly: true`, `executed: false` and dry-run approval proposals | No live founder data writes or production MCP deployment | VERIFIED | [src: server/tests/mcpServer.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/navContract.test.js` | Policy links on 7 surfaces, LMS/apps labels, founder money read-only, planner constraints, 7-item public nav, 5 dashboard nav targets, no dead ends | Static HTML/JS only; no browser click-through or server routes | VERIFIED | [src: server/tests/navContract.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/parentChat.test.js` | DLP categories/masking, no `/^0005/` migration, role scoping, message allowlist, unread/mark-read, blocked content behavior, flag secrecy | Mock store; no real DB, realtime push, browser or notifications | VERIFIED | [src: server/tests/parentChat.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/payoutService.test.js` | Pay bands, fines, leave bonus, MVT, full payout breakdown, no-show, presence gate, 30% unutilised pay | No HTTP/RBAC, real DB or disbursement | VERIFIED | [src: server/tests/payoutService.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/presenceService.test.js` | Role from signed user/session, UID mapping, trainer min presence, heartbeat delta | No HTTP, Agora webhook or live DB | VERIFIED | [src: server/tests/presenceService.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/privacyBoundary.test.js` | Public user shape, name-only participant views, contact regex absence, schema grant assertions | Static checks only; no live grants, browser DOM or network privacy proof | VERIFIED | [src: server/tests/privacyBoundary.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/quizGenerator.test.js` | Difficulty mapping, adaptive quiz shape, next draft | No real provider, moderation path or HTTP | VERIFIED | [src: server/tests/quizGenerator.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/quizPromptInjection.test.js` | Stubbed prompt fencing, curriculum context, trainer fields, strict JSON | No real model, validation failure path or browser | VERIFIED | [src: server/tests/quizPromptInjection.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/razorpayWebhook.test.js` | Exactly-once capture crediting, `ALREADY_CREDITED` replay, amount/currency/order/student revalidation and signature guard | No live Razorpay order, capture or provider webhook | VERIFIED | [src: server/tests/razorpayWebhook.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/rtcControls.test.js` | Student media defaults/403, trainer revoke/version, scrubbed media events, two-sided network gate, public config, trophy labels, browser source contracts | No real Agora SDK/device/browser interaction; fake credentials | VERIFIED | [src: server/tests/rtcControls.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/scaffoldedUI.test.js` | Static practice badge, trainer-only override, required-check client flow, no student trainer controls | Static source only; no browser, API or AI | VERIFIED | [src: server/tests/scaffoldedUI.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/sessionPolicy.test.js` | Room window, trainer-driven clock, late-join pay bands including 15+ no-extra-fine, 50-in-55 rule, stretch reward, founder observer access | No live payment, Agora webhook, DB or browser | VERIFIED | [src: server/tests/sessionPolicy.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/slotService.test.js` | Committed/unutilised pay, empty slot, out-of-slot class, minute labels, rate bands, validation | No HTTP, DB or calendar UI | VERIFIED | [src: server/tests/slotService.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/studentSerializer.test.js` | Student-safe DTO, hostile payload sanitisation, trainer answerKey retention | No HTTP, event stream or client DOM | VERIFIED | [src: server/tests/studentSerializer.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |
| `server/tests/trainerOnboarding.test.js` | Locked KYC fields, editable fields, document refs, batch allotment, weekly timetable, 50-minute link rollover | No live DB, Storage bucket or founder correction persistence | VERIFIED | [src: server/tests/trainerOnboarding.test.js:1]; [ev: npm.cmd test --prefix server, 2026-11-26] |

Current full-run result: 36/36 chained suites completed with exit code 0 [ev: npm.cmd test --prefix server, 2026-11-26]; [src: server/package.json:13]. VERIFIED.

### 13.d File-by-file index

The tracked baseline contains 206 files from `git ls-files`; each tracked file is listed once below with a path-derived or evidence-derived description and a command citation. [U~2026-11-26] Nine in-scope untracked paths are listed as UF rows from the v4.0.0 final pre-commit inventory: the original seven implementation paths plus `E2E_TEST_LOG.md` and `TPFF_BLOCKERS.md`. All nine become tracked after the v4.0.0 documentation commit; the final commit hash is `UNKNOWN_AT_AUTHORING_TIME` [ev: git ls-files; user-supplied v4.0.0 final pre-commit inventory, 2026-11-26]; [src: E2E_TEST_LOG.md:70-82]. VERIFIED.

| # | Path | Description / out-of-scope reason | Tag | Source |
|---|---|---|---|---|
| 1 | `.dockerignore` | Root project file for  | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 2 | `.github/workflows/ci.yml` | CI workflow support for ci | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 3 | `.gitignore` | Root project file for  | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 4 | `Dockerfile` | Root project file for Dockerfile | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 5 | `HOWEVER_LOG.md` | Root project file for HOWEVER LOG | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 6 | `KNOWN_UNKNOWNS.md` | Root project file for KNOWN UNKNOWNS | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 7 | `PROJECT_FLOW_FILE.md` | Authoritative Total Project Flow File | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 8 | `PROJECT_FLOW_INDEX.json` | Machine-readable TPFF index and inventory | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 9 | `PROJECT_GUIDE.md` | Root project file for PROJECT GUIDE | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 10 | `README.md` | Root project file for README | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 11 | `TEST_REPORT.md` | Root project file for TEST REPORT | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 12 | `TPFF_QUESTION_LEDGER.md` | Append-only TPFF question ledger | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 13 | `TPFF_UPDATE_REPORT.md` | Append-only TPFF update report | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 14 | `apps.html` | Root project file for apps | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 15 | `assets/poppins.css` | Shared asset for poppins | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 16 | `classroom/agora.css` | Classroom surface for agora | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 17 | `classroom/agora.js` | Classroom surface for agora | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 18 | `classroom/api.js` | Classroom surface for api | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 19 | `classroom/app.js` | Classroom surface for app | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 20 | `classroom/board.css` | Classroom surface for board | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 21 | `classroom/engagement.css` | Classroom surface for engagement | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 22 | `classroom/engagement.js` | Classroom surface for engagement | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 23 | `classroom/index.html` | Classroom surface for index | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 24 | `classroom/networkCheck.js` | Classroom surface for networkCheck | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 25 | `classroom/panels.css` | Classroom surface for panels | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 26 | `classroom/realtime.js` | Classroom surface for realtime | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 27 | `classroom/responsive.css` | Classroom surface for responsive | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 28 | `classroom/room.css` | Classroom surface for room | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 29 | `classroom/session.css` | Classroom surface for session | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 30 | `classroom/session.js` | Classroom surface for session | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 31 | `contact.html` | Root project file for contact | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 32 | `docker-compose.yml` | Root project file for docker compose | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 33 | `founder/announcements.css` | Founder console surface for announcements | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 34 | `founder/announcements.js` | Founder console surface for announcements | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 35 | `founder/app.js` | Founder console surface for app | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 36 | `founder/founder.css` | Founder console surface for founder | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 37 | `founder/index.html` | Founder console surface for index | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 38 | `home/index.html` | home support file for index | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 39 | `index.html` | Root project file for index | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 40 | `landing.css` | Root project file for landing | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 41 | `landing.js` | Root project file for landing | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 42 | `lms/app.js` | LMS surface for app | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 43 | `lms/detail.css` | LMS surface for detail | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 44 | `lms/index.html` | LMS surface for index | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 45 | `lms/library.css` | LMS surface for library | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 46 | `lms/planner.css` | LMS surface for planner | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 47 | `lms/planner.js` | LMS surface for planner | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 48 | `lms/responsive.css` | LMS surface for responsive | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 49 | `lms/shell.css` | LMS surface for shell | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 50 | `login.html` | Root project file for login | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 51 | `login/login.css` | Login surface for login | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 52 | `login/login.js` | Login surface for login | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 53 | `package.json` | Root project file for package | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 54 | `parent/app.js` | Parent console surface for app | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 55 | `parent/index.html` | Parent console surface for index | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 56 | `parent/parent.css` | Parent console surface for parent | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 57 | `pricing.html` | Root project file for pricing | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 58 | `privacy.html` | Root project file for privacy | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 59 | `public.css` | Root project file for public | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 60 | `railway.json` | Root project file for railway | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 61 | `refund.html` | Root project file for refund | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 62 | `render.yaml` | Root project file for render | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 63 | `server/.env.example` | Server support file for .env | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 64 | `server/README.md` | Server support file for README | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 65 | `server/app.js` | Server support file for app | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 66 | `server/auth/password.js` | Server support file for password | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 67 | `server/auth/token.js` | Server support file for token | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 68 | `server/config.js` | Server support file for config | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 69 | `server/config/celebrations.json` | Server support file for celebrations | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 70 | `server/config/policy.json` | Server support file for policy | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 71 | `server/db/curriculum.js` | Server support file for curriculum | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 72 | `server/db/index.js` | Server support file for index | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 73 | `server/db/mock.js` | Server support file for mock | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 74 | `server/db/schema.sql` | Review-only SQL migration for schema | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 75 | `server/db/supabase.js` | Server support file for supabase | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 76 | `server/index.js` | Server support file for index | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 77 | `server/jobs/reminders.js` | Server support file for reminders | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 78 | `server/middleware/auth.js` | Server support file for auth | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 79 | `server/middleware/rateLimit.js` | Server support file for rateLimit | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 80 | `server/migrate.js` | Server support file for migrate | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 81 | `server/migrations/0001_baseline.sql` | Review-only SQL migration for 0001 baseline | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 82 | `server/migrations/0002_student_curriculum.sql` | Review-only SQL migration for 0002 student curriculum | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 83 | `server/migrations/0003_live_persistence.sql` | Review-only SQL migration for 0003 live persistence | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 84 | `server/migrations/0004_ai_chat_logs.sql` | Review-only SQL migration for 0004 ai chat logs | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 85 | `server/migrations/0006_trainer_onboarding_batches.sql` | Review-only SQL migration for 0006 trainer onboarding batches | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 86 | `server/migrations/README.md` | Server support file for README | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 87 | `server/package-lock.json` | Server support file for package lock | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 88 | `server/package.json` | Server support file for package | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 89 | `server/quiz/generator.js` | Server support file for generator | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 90 | `server/quiz/moderation.js` | Server support file for moderation | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 91 | `server/quiz/templates.js` | Server support file for templates | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 92 | `server/realtime/agora.js` | Server support file for agora | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 93 | `server/realtime/index.js` | Server support file for index | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 94 | `server/routes/admin.js` | Server support file for admin | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 95 | `server/routes/agora.js` | Server support file for agora | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 96 | `server/routes/announcements.js` | Server support file for announcements | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 97 | `server/routes/auth.js` | Server support file for auth | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 98 | `server/routes/chat.js` | Server support file for chat | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 99 | `server/routes/contact.js` | Server support file for contact | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 100 | `server/routes/leaves.js` | Server support file for leaves | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 101 | `server/routes/network.js` | Server support file for network | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 102 | `server/routes/parentChat.js` | Server support file for parentChat | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 103 | `server/routes/policy.js` | Server support file for policy | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 104 | `server/routes/razorpay.js` | Server support file for razorpay | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 105 | `server/routes/sessions.js` | Server support file for sessions | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 106 | `server/routes/student.js` | Server support file for student | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 107 | `server/routes/trainer.js` | Server support file for trainer | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 108 | `server/routes/webhooks.js` | Server support file for webhooks | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 109 | `server/scripts/seed.js` | Server support file for seed | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 110 | `server/serializers.js` | Server support file for serializers | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 111 | `server/services/agoraRecordingService.js` | Server support file for agoraRecordingService | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 112 | `server/services/agoraTokenService.js` | Server support file for agoraTokenService | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 113 | `server/services/aiCurriculumService.js` | Server support file for aiCurriculumService | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 114 | `server/services/announcementService.js` | Server support file for announcementService | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 115 | `server/services/attendancePolicy.js` | Server support file for attendancePolicy | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 116 | `server/services/badgeService.js` | Server support file for badgeService | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 117 | `server/services/batchService.js` | Server support file for batchService | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 118 | `server/services/celebrationService.js` | Server support file for celebrationService | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 119 | `server/services/chatAssistantService.js` | Server support file for chatAssistantService | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 120 | `server/services/chatWorkerService.js` | Server support file for chatWorkerService | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 121 | `server/services/cloudflareAiService.js` | Server support file for cloudflareAiService | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 122 | `server/services/cloudflareClient.js` | Server support file for cloudflareClient | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 123 | `server/services/cloudflareService.js` | Server support file for cloudflareService | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 124 | `server/services/curriculumContext.js` | Server support file for curriculumContext | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 125 | `server/services/founderSettingsService.js` | Server support file for founderSettingsService | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 126 | `server/services/leaveService.js` | Server support file for leaveService | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 127 | `server/services/logger.js` | Server support file for logger | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 128 | `server/services/masteryGating.js` | Server support file for masteryGating | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 129 | `server/services/masteryPracticeService.js` | Server support file for masteryPracticeService | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 130 | `server/services/mediaPermissionService.js` | Server support file for mediaPermissionService | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 131 | `server/services/networkQualityService.js` | Server support file for networkQualityService | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 132 | `server/services/notificationService.js` | Server support file for notificationService | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 133 | `server/services/parentChatDlp.js` | Server support file for parentChatDlp | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 134 | `server/services/parentChatService.js` | Server support file for parentChatService | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 135 | `server/services/payoutService.js` | Server support file for payoutService | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 136 | `server/services/presenceService.js` | Server support file for presenceService | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 137 | `server/services/razorpayService.js` | Server support file for razorpayService | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 138 | `server/services/reactionPermissionService.js` | Server support file for reactionPermissionService | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 139 | `server/services/reactionService.js` | Server support file for reactionService | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 140 | `server/services/sessionAccessService.js` | Server support file for sessionAccessService | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 141 | `server/services/sessionPartyService.js` | Server support file for sessionPartyService | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 142 | `server/services/sessionTimingService.js` | Server support file for sessionTimingService | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 143 | `server/services/slotService.js` | Server support file for slotService | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 144 | `server/services/trainerDocumentService.js` | Server support file for trainerDocumentService | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 145 | `server/services/trainerOnboardingService.js` | Server support file for trainerOnboardingService | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 146 | `server/services/whatsappAiService.js` | Server support file for whatsappAiService | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 147 | `server/tests/aiCurriculumIntegration.test.js` | server / tests local assertion suite for aiCurriculumIntegration.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 148 | `server/tests/announcements.test.js` | server / tests local assertion suite for announcements.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 149 | `server/tests/apiSmoke.test.js` | server / tests local assertion suite for apiSmoke.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 150 | `server/tests/attendancePolicy.test.js` | server / tests local assertion suite for attendancePolicy.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 151 | `server/tests/chatAssistant.test.js` | server / tests local assertion suite for chatAssistant.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 152 | `server/tests/chatWorker.test.js` | server / tests local assertion suite for chatWorker.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 153 | `server/tests/cloudflareClient.test.js` | server / tests local assertion suite for cloudflareClient.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 154 | `server/tests/concurrency.test.js` | server / tests local assertion suite for concurrency.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 155 | `server/tests/credentialLogin.test.js` | server / tests local assertion suite for credentialLogin.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 156 | `server/tests/curriculumAuthoring.test.js` | server / tests local assertion suite for curriculumAuthoring.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 157 | `server/tests/curriculumContext.test.js` | server / tests local assertion suite for curriculumContext.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 158 | `server/tests/curriculumPersistence.test.js` | server / tests local assertion suite for curriculumPersistence.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 159 | `server/tests/engagementControls.test.js` | server / tests local assertion suite for engagementControls.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 160 | `server/tests/leaveService.test.js` | server / tests local assertion suite for leaveService.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 161 | `server/tests/liveOperations.test.js` | server / tests local assertion suite for liveOperations.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 162 | `server/tests/livePersistence.test.js` | server / tests local assertion suite for livePersistence.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 163 | `server/tests/liveReadiness.test.js` | server / tests local assertion suite for liveReadiness.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 164 | `server/tests/masteryGating.test.js` | server / tests local assertion suite for masteryGating.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 165 | `server/tests/masteryPractice.test.js` | server / tests local assertion suite for masteryPractice.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 166 | `server/tests/navContract.test.js` | server / tests local assertion suite for navContract.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 167 | `server/tests/parentChat.test.js` | server / tests local assertion suite for parentChat.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 168 | `server/tests/payoutService.test.js` | server / tests local assertion suite for payoutService.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 169 | `server/tests/presenceService.test.js` | server / tests local assertion suite for presenceService.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 170 | `server/tests/privacyBoundary.test.js` | server / tests local assertion suite for privacyBoundary.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 171 | `server/tests/quizGenerator.test.js` | server / tests local assertion suite for quizGenerator.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 172 | `server/tests/quizPromptInjection.test.js` | server / tests local assertion suite for quizPromptInjection.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 173 | `server/tests/rtcControls.test.js` | server / tests local assertion suite for rtcControls.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 174 | `server/tests/scaffoldedUI.test.js` | server / tests local assertion suite for scaffoldedUI.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 175 | `server/tests/sessionPolicy.test.js` | server / tests local assertion suite for sessionPolicy.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 176 | `server/tests/slotService.test.js` | server / tests local assertion suite for slotService.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 177 | `server/tests/studentSerializer.test.js` | server / tests local assertion suite for studentSerializer.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 178 | `server/tests/trainerOnboarding.test.js` | server / tests local assertion suite for trainerOnboarding.test | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 179 | `shared/announcements.css` | Shared module for announcements | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 180 | `shared/announcements.js` | Shared module for announcements | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 181 | `shared/contact-form.js` | Shared module for contact form | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 182 | `shared/leave-calendar.css` | Shared module for leave calendar | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 183 | `shared/leave-calendar.js` | Shared module for leave calendar | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 184 | `shared/public-nav.js` | Shared module for public nav | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 185 | `shared/tokens.css` | Shared module for tokens | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 186 | `student/api.js` | Student desk surface for api | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 187 | `student/app.js` | Student desk surface for app | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 188 | `student/index.html` | Student desk surface for index | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 189 | `terms.html` | Root project file for terms | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 190 | `trainer/agora.js` | Trainer console surface for agora | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 191 | `trainer/api.js` | Trainer console surface for api | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 192 | `trainer/app.js` | Trainer console surface for app | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 193 | `trainer/details.css` | Trainer console surface for details | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 194 | `trainer/index.html` | Trainer console surface for index | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 195 | `trainer/onboarding.css` | Trainer console surface for onboarding | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 196 | `trainer/onboarding.js` | Trainer console surface for onboarding | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 197 | `trainer/parent-chat.css` | Trainer console surface for parent chat | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 198 | `trainer/parentChat.js` | Trainer console surface for parentChat | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 199 | `trainer/responsive.css` | Trainer console surface for responsive | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 200 | `trainer/schedule.css` | Trainer console surface for schedule | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 201 | `trainer/schedule.js` | Trainer console surface for schedule | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 202 | `trainer/sections.css` | Trainer console surface for sections | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 203 | `trainer/shell.css` | Trainer console surface for shell | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 204 | `worker-core.mjs` | Cloudflare Worker reply core with pinned AI models and exact reply strings | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 205 | `worker.js` | Cloudflare Worker HTTP entry and bearer gate | VERIFIED | [ev: git ls-files, 2026-11-26] |
| 206 | `wrangler.toml` | Root project file for wrangler | VERIFIED | [ev: git ls-files, 2026-11-26] |
| UF-1 | `server/mcp-server.js` | Founder MCP stdio server exposing exactly three read-only tools | VERIFIED | [ev: user-specified v3.1.0 evidence snapshot, 2026-11-26] |
| UF-2 | `server/migrations/0007_student_hint_lockdown.sql` | Review-only SQL revoking student hint exposure | VERIFIED | [ev: user-specified v3.1.0 evidence snapshot, 2026-11-26] |
| UF-3 | `server/migrations/0008_payment_idempotency.sql` | Review-only SQL for exactly-once payment crediting | VERIFIED | [ev: user-specified v3.1.0 evidence snapshot, 2026-11-26] |
| UF-4 | `server/tests/agoraRoutes.test.js` | Local assertion suite for Agora token and webhook contracts | VERIFIED | [ev: user-specified v3.1.0 evidence snapshot, 2026-11-26] |
| UF-5 | `server/tests/asyncAuthMiddleware.test.js` | Local assertion suite for awaited auth middleware | VERIFIED | [ev: user-specified v3.1.0 evidence snapshot, 2026-11-26] |
| UF-6 | `server/tests/mcpServer.test.js` | Local assertion suite for founder MCP contract | VERIFIED | [ev: user-specified v3.1.0 evidence snapshot, 2026-11-26] |
| UF-7 | `server/tests/razorpayWebhook.test.js` | Local assertion suite for exactly-once Razorpay crediting | VERIFIED | [ev: user-specified v3.1.0 evidence snapshot, 2026-11-26] |
| UF-8 | `E2E_TEST_LOG.md` | 10-role multi-agent audit trail, triage decisions and final validation evidence | VERIFIED | [src: E2E_TEST_LOG.md:14-82] |
| UF-9 | `TPFF_BLOCKERS.md` | B-01…B-06 external/gap register and A-01…A-09 fixed-defect register | VERIFIED | [src: TPFF_BLOCKERS.md:9-40] |
| UF-10 | `server/migrations/0009_recordings_storage.sql` | Private recordings bucket, security-definer session reader and SELECT policy | VERIFIED | [src: server/migrations/0009_recordings_storage.sql:1] |

Total inventory rows: 216 (215 tracked files plus one untracked path, `server/migrations/0009_recordings_storage.sql`). [U+2026-11-26] This supersedes the earlier 215-row v4.0.0 pre-commit snapshot; the nine earlier untracked paths became tracked in commit `767337c`, and the new migration becomes tracked after the current cron/storage commit, whose hash is `UNKNOWN_AT_AUTHORING_TIME` [ev: git ls-files; git status --porcelain=v1 --untracked-files=all, 2026-11-26]. VERIFIED.

### 13.e Route count reconciliation

[U+2026-11-26] Current measured router definitions are 114 across 15 route files; current app-level HTTP definitions are 4; current total HTTP route definitions are 118. The founder MCP stdio server is a separate process and contributes no HTTP route definitions [ev: node.exe C:/Users/rohit/AppData/Local/Temp/opencode/tpff-routes.js; Select-String -Path server\app.js -Pattern 'app\.(get|post|put|patch|delete)\(', 2026-11-26]; [src: server/mcp-server.js:438-440]. VERIFIED.

| Route file | Definitions | Tag | Source |
|---|---:|---|---|
| `server/routes/admin.js` | 13 | VERIFIED | [src: tpff-current-routes.txt:14] |
| `server/routes/agora.js` | 4 | VERIFIED | [src: tpff-current-routes.txt:19] |
| `server/routes/announcements.js` | 3 | VERIFIED | [src: tpff-current-routes.txt:23] |
| `server/routes/auth.js` | 4 | VERIFIED | [src: tpff-current-routes.txt:28] |
| `server/routes/chat.js` | 2 | VERIFIED | [src: tpff-current-routes.txt:31] |
| `server/routes/contact.js` | 1 | VERIFIED | [src: tpff-current-routes.txt:33] |
| `server/routes/leaves.js` | 2 | VERIFIED | [src: tpff-current-routes.txt:36] |
| `server/routes/network.js` | 2 | VERIFIED | [src: tpff-current-routes.txt:39] |
| `server/routes/parentChat.js` | 14 | VERIFIED | [src: tpff-current-routes.txt:54] |
| `server/routes/policy.js` | 1 | VERIFIED | [src: tpff-current-routes.txt:56] |
| `server/routes/razorpay.js` | 2 | VERIFIED | [src: tpff-current-routes.txt:59] |
| `server/routes/sessions.js` | 17 | VERIFIED | [src: tpff-current-routes.txt:77] |
| `server/routes/student.js` | 9 | VERIFIED | [src: tpff-current-routes.txt:87] |
| `server/routes/trainer.js` | 38 | VERIFIED | [src: tpff-current-routes.txt:126] |
| `server/routes/webhooks.js` | 2 | VERIFIED | [src: tpff-current-routes.txt:130] |

The four app-level HTTP definitions are `GET /api/health` [src: server/app.js:56], `GET /api/public/config` [src: server/app.js:68], `GET /api/realtime/log` [src: server/app.js:100] and `GET /favicon.ico` [src: server/app.js:106]; the line count for `app.(get|post|put|patch|delete)(` is 4 [ev: Select-String -Path server\app.js -Pattern 'app\.(get|post|put|patch|delete)\(', 2026-11-26]. VERIFIED.

`app.(get|post|use)(` yields 32 lines because it includes 4 HTTP definitions plus 28 `app.use` lines: 5 throttles [src: server/app.js:39-43], CORS [src: server/app.js:45], 2 raw-body parsers [src: server/app.js:49-50], 2 JSON parsers [src: server/app.js:53-54], 15 router mounts [src: server/app.js:84-98], and 3 terminal middleware lines (static allowlist, 404, error handler) [src: server/app.js:130,156,160]; `APP_GET_POST_USE_LINES: 32` and `APP_USE_LINES: 28` [ev: Select-String -Path server\app.js -Pattern 'app\.(get|post|use)\('; Select-String -Path server\app.js -Pattern 'app\.use\(', 2026-11-26]. VERIFIED.

The 15 router mounts are `/api/auth`, `/api/trainer`, `/api/student`, `/api/sessions`, `/api/policy`, `/api/webhooks`, `/api/admin`, `/api/agora`, `/api/network`, `/api/announcements`, `/api/razorpay`, `/api/leaves`, `/api/contact`, `/api/chat` and `/api/parent-chat` [src: server/app.js:84-98]. VERIFIED.

The older evidence inventory counted 95 router definitions plus 4 app-level HTTP definitions = 99 [src: tpff-roles-surfaces.md:229-235]. VERIFIED.

The current 114 router definitions exceed that 95-definition baseline by 19 definitions: `admin.js` +9, new `announcements.js` +3, `auth.js` +1 and `trainer.js` +6; app-level HTTP definitions remain 4, so the current 118 total is exactly 99 + 19 [src: tpff-roles-surfaces.md:229-235]; [src: tpff-current-routes.txt:14,23,28,126,130]; [ev: ROUTER_TOTAL: 114; APP_HTTP_LINES: 4, 2026-11-26]. VERIFIED.

Static GET/HEAD file serving, the 404 handler and the error handler are real middleware surfaces but are not counted as HTTP route definitions; they are counted only in the 28 `app.use` lines [src: server/app.js:115-173]. VERIFIED.

The assembled `PROJECT_FLOW_FILE.md` now contains a §5 surface inventory with 147 ID rows, of which 130 carry HTTP methods; those rows cover static page GETs, webhook/worker surfaces and the 118 HTTP definitions counted here. The authoritative reconciliation remains 114 router definitions plus 4 app-level HTTP definitions = 118, measured directly from source [ev: section scan and route count of assembled PROJECT_FLOW_FILE.md, 2026-11-26]. VERIFIED.

---

## 14. COMPLETENESS COVERAGE ATTESTATION

[VERIFIED] [U+2026-11-26] NEW RULES R1–R9 apply to this section; see §1.6 and `TPFF_UPDATE_REPORT.md` §U3.

| Box | Honest answer | Tag | Source |
| --- | --- | --- | --- |
| Every file in the tree appears in Appendix 13.d, described or marked out-of-scope with a reason | CLOSED — 216 rows: 215 tracked files plus one untracked path, `server/migrations/0009_recordings_storage.sql`, each described or given an explicit reason | VERIFIED | `[src: PROJECT_FLOW_FILE.md:§13.d]`; `[ev: git ls-files; git status --porcelain=v1 --untracked-files=all, 2026-11-26]` |
| Every route appears in §5, and §13.e reconciles the count | CLOSED — §5 carries 147 ID rows and 130 method-bearing rows covering static pages, hooks, worker surfaces and the 118 HTTP definitions; §13.e reconciles 114 router definitions + 4 app-level HTTP definitions = 118 | VERIFIED | `[src: PROJECT_FLOW_FILE.md:§5,§13.e]`; `[ev: route enumeration, 2026-11-26]` |
| Every env var appears in Appendix 13.a | CLOSED — 59 name rows, with purpose, requirement/default, fail-closed behavior and source, including `MCP_FOUNDER_TOKEN` | VERIFIED | `[src: PROJECT_FLOW_FILE.md:§13.a]`; `[ev: env-name audit, 2026-11-26]` |
| Every table and migration appears in §6 | CLOSED — 32 canonical tables/views and 8 ordered reviewed SQL files (`0001`, `0002`, `0003`, `0004`, `0006`, `0007`, `0008`, `0009`), with runner-based apply still registered as U-01 and the `0009` bucket/policy applied through the linked Supabase MCP after review | VERIFIED | `[src: PROJECT_FLOW_FILE.md:§6]`; `[ev: schema and migration enumeration; npm.cmd run migrate --dry-run --prefix server; Supabase MCP bucket/policy queries, 2026-11-26]` |
| Every role appears in §4 with a complete Role Card | CLOSED — eight role cards: guest, founder, trainer, student/kid, parent, admin namespace, support namespace and moderator alias status | VERIFIED | `[src: PROJECT_FLOW_FILE.md:§4.1]`; `[ev: role enumeration, 2026-11-26]` |
| Every state machine lists all transitions, including illegal | CLOSED for the nine machines enumerated in §7; rejection, forbidden, expired and no-show edges are listed, and other lifecycle states are cross-referenced from §4 and §6 | VERIFIED | `[src: PROJECT_FLOW_FILE.md:§7]`; `[ev: state-machine source review, 2026-11-26]` |
| Every item in §11 has severity and owner | CLOSED — 31 rows, each with severity and an explicit owner column | VERIFIED | `[src: PROJECT_FLOW_FILE.md:§11]`; `[src: HOWEVER_LOG.md]` |
| Every item in §10 names the artifact or command to close it | CLOSED — 26 rows, each with an exact command or artifact and an owner | VERIFIED | `[src: PROJECT_FLOW_FILE.md:§10]`; `[src: KNOWN_UNKNOWNS.md]` |
| No claim in the entire document lacks a citation or a tag | CLOSED — [U~2026-11-26] the v4.0.0 final validator printed `VALIDATION=PASS`, `EXACT_STRINGS_MISSING=0` and `CITATION_PATH_FAILURES=0`; its untagged diagnostic is limited to table headers and the append-only version-history table, whose rows are governed by `TPFF_UPDATE_REPORT.md` §U0, §U9 and §U10 | VERIFIED | `[ev: tpff_final_validate.ps1 v4.0.0 final run, 2026-11-26]`; `[src: E2E_TEST_LOG.md:80]`; `[src: TPFF_UPDATE_REPORT.md:§U0,§U9,§U10]` |
| Every contradiction is in §11 | CLOSED — §8 local findings H8.1, H8.2, H8.3 and H8.4 are represented by H-29, H-31, H-30 and H-25 respectively | VERIFIED | `[src: PROJECT_FLOW_FILE.md:§8.7,§11]`; `[src: HOWEVER_LOG.md]` |
| Every partial or unfinished surface is called out explicitly in both its own section and §11 | CLOSED — runtime-only founder settings, disabled planner publish/pack import, live-only session creation, mock-only proofs, deployed-state gaps and horizontal-scale risk appear in their own sections and §11 | VERIFIED | `[src: PROJECT_FLOW_FILE.md:§§7–9,§11]`; `[ev: cross-section audit, 2026-11-26]` |

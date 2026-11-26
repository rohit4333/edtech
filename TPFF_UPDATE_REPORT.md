# TPFF UPDATE REPORT — v3.0.0

## U0. HEADER

| Field | Value |
|---|---|
| Previous version | v2.0, built from `f36321c830f4aa6a9282f7341034841dbfa3194e` |
| Current version | v3.0.0 |
| Commits compared | `f36321c..f36321c` (no commit since v2.0; all changes are in the working tree) |
| Mode | PATCH (declared once; not changed) |
| Date | 2026-11-26 |
| Author | OpenCode assisted Principal Systems Archivist; user-supplied rules R1–R9 |
| Review first | §U3 rule application, §U5 contradictions, §U8 ambiguities |

Recommended commit workflow (not executed by the archivist until explicitly approved):

```
git add TPFF_UPDATE_REPORT.md PROJECT_FLOW_FILE.md PROJECT_FLOW_INDEX.json KNOWN_UNKNOWNS.md HOWEVER_LOG.md TPFF_QUESTION_LEDGER.md
git commit -m "docs(tpff): v3.0.0 — apply nine founder rules and record update ledger"
git push
```

## U1. SUMMARY

Material changes: the nine verbatim founder rules preserved in v2.0 §1.1 are promoted to first-class axes in §1.6 and cross-referenced from §§2–14; the static allowlist now serves `login.html` and `login/`; the landing founder card carries the public LinkedIn profile and the credential line `PATENT HOLDER • multiple RESEARCH PAPERS PUBLISHED`; the working-tree snapshot is reconciled to 40 modified tracked + 25 untracked paths; the former §5 route-table drift is resolved. Reviewer should look first at U3, U5 and U8.

## U2. CHANGE INVENTORY

| ID | Classification | Section | Summary | Old value | New value | New citation |
|---|---|---|---|---|---|---|
| UC-0001 | NEW_RULE_APPLIED | §1.6, §§2–14 | R1 name-only privacy rule applied | Preserved text only | Rule row R1-A/B/C | `[ev: founder rule R1, 2026-11-26]`; `[src: server/tests/privacyBoundary.test.js]` |
| UC-0002 | NEW_RULE_APPLIED | §1.6, §§4,6,7,8,11 | R2 editable KYC fields applied | Preserved text only | Rule rows R2-A/B/C | `[ev: founder rule R2, 2026-11-26]`; `[src: server/services/trainerOnboardingService.js]` |
| UC-0003 | NEW_RULE_APPLIED | §1.6, §§5,6,7,9,10 | R3 KYC image upload applied | Preserved text only | Rule rows R3-A/B/C | `[ev: founder rule R3, 2026-11-26]`; `[src: server/services/trainerDocumentService.js]` |
| UC-0004 | NEW_RULE_APPLIED | §1.6, §§5,6,7,8 | R4 calendar booking applied | Preserved text only | Rule rows R4-A/B | `[ev: founder rule R4, 2026-11-26]`; `[src: server/services/batchService.js]` |
| UC-0005 | NEW_RULE_APPLIED | §1.6, §§4,6,7,8,12 | R5 50-minute rule applied | Preserved text only | Rule rows R5-A/B/C | `[ev: founder rule R5, 2026-11-26]`; `[src: server/config/policy.json]` |
| UC-0006 | NEW_RULE_APPLIED | §1.6, §§4,6,7,8,11 | R6 55-minute award/link rule applied | Preserved text only | Rule rows R6-A/B | `[ev: founder rule R6, 2026-11-26]`; `[src: server/services/payoutService.js]` |
| UC-0007 | NEW_RULE_APPLIED | §1.6, §§5,8,11 | R7 one-window nav rule applied | Preserved text only | Rule rows R7-A/B | `[ev: founder rule R7, 2026-11-26]`; `[src: server/tests/navContract.test.js]` |
| UC-0008 | NEW_RULE_APPLIED | §1.6, §§4,5,6,7,8,11 | R8 announcement targeting applied | Preserved text only | Rule rows R8-A/B/C | `[ev: founder rule R8, 2026-11-26]`; `[src: server/routes/announcements.js]` |
| UC-0009 | NEW_RULE_APPLIED | §1.6, §§5,8,9,11,13 | R9 landing/booking rule applied | Preserved text only | Rule rows R9-A/B/C | `[ev: landing request R9, 2026-11-26]`; `[src: landing.js]` |
| UC-0010 | NEW_FACT | §5, §8, §11 | Static allowlist serves sign-in page | `login.html`/`login/` omitted; JSON 404 | both permitted; browser GET 200 with CSS/JS | `[src: server/app.js:119-125]`; `[ev: browser GET http://localhost:4000/login.html?role=student, 2026-11-26]` |
| UC-0011 | NEW_FACT | §8, §13 | Founder card credentials and LinkedIn link added | no link, no credential row | `PATENT HOLDER • multiple RESEARCH PAPERS PUBLISHED` + linked profile | `[src: index.html:284-292]`; `[ev: user-provided credential and link, 2026-11-26]` |
| UC-0012 | CITATION_DRIFT | §8, §10 | Working-tree counts re-anchored | 39 modified / 23 untracked | 40 modified / 25 untracked (65 porcelain paths) | `[ev: git status --porcelain=v1 --untracked-files=all, 2026-11-26]` |
| UC-0013 | RESOLVED_GAP | §11 | H8.2 sign-in 404 resolved | HIGH contradiction | resolved in v3.0.0 | `[src: server/app.js:119-125]`; `[ev: browser GET login.html, 2026-11-26]` |
| UC-0014 | RESOLVED_GAP | §11 | H-26 §5 route table drift resolved | DRIFT / IN FLIGHT | RESOLVED IN v2.0/v3.0.0 | `[src: PROJECT_FLOW_FILE.md:§5,§13.e]`; `[ev: route count audit, 2026-11-26]` |
| UC-0015 | NEW_GAP | §10, U8 | NEW QUESTIONS list was not supplied; zero questions answered this version | n/a | ambiguity U8-A; no KU created because no question was asked | `[ev: v3.0 prompt NEW QUESTIONS template only, 2026-11-26]` |
| UC-0016 | NEW_FACT | §0, §1.5 | Version bump and append-only update history introduced | v2.0 only | v3.0.0 + history table | `[ev: TPFF v3.0 update prompt OUTPUT 1, 2026-11-26]` |
| UC-0017 | HOWEVER_DELTA | §11 | H8.2 and H-26 statuses changed; no entries deleted | OPEN/DRIFT | RESOLVED | `[src: PROJECT_FLOW_FILE.md:§9,§11]` |
| UC-0018 | NEW_FACT | §9, §13 | Booking success/error states re-verified in browser | earlier success only | success `contact_1795692515867`, client email block, 400 INVALID_PAYLOAD, simulated-offline fallback | `[ev: browser booking checks, 2026-11-26]` |
| UC-0019 | HOWEVER_DELTA | §11, sidecars | Three local §8 findings promoted to owned HOWEVER entries and final coverage attestation rewritten for the assembled file | 28 entries; replacement-scope attestation | 31 entries with owners; assembled-file attestation | `[src: PROJECT_FLOW_FILE.md:§8.7,§11,§14]`; `[src: HOWEVER_LOG.md]` |

## U3. NEW RULES APPLIED

Nine rules were supplied (R1–R9), restated verbatim in §1.6. Each touches multiple sections; the per-rule table in §1.6 lists every new row ID and its citation, and every affected section carries a `[U+2026-11-26]` cross-reference marker after its heading.

| Rule | Sections touched | Rows | Where the rows live |
|---|---|---|---|
| R1 | §2, §4, §5, §6, §7, §8, §9, §11 | R1-A/B/C | §1.6 rule table; cross-references in each section |
| R2 | §4, §6, §7, §8, §11 | R2-A/B/C | §1.6 rule table; role/data/flow sections |
| R3 | §5, §6, §7, §9, §10 | R3-A/B/C | §1.6 rule table; surface/data/integration sections |
| R4 | §5, §6, §7, §8 | R4-A/B | §1.6 rule table; calendar/onboarding sections |
| R5 | §4, §6, §7, §8, §12 | R5-A/B/C | §1.6 rule table; timing/policy sections |
| R6 | §4, §6, §7, §8, §11 | R6-A/B | §1.6 rule table; pay/link-change sections |
| R7 | §5, §8, §11 | R7-A/B | §1.6 rule table; navigation sections |
| R8 | §4, §5, §6, §7, §8, §11 | R8-A/B/C | §1.6 rule table; announcement sections |
| R9 | §5, §8, §9, §11, §13 | R9-A/B/C | §1.6 rule table; landing/booking sections |

No rule was left unapplied. Supporting source files for every row are in the §1.6 table.

## U4. NEW QUESTIONS ANSWERED

No NEW QUESTIONS were supplied — the pasted v3.0 prompt contained only the template line `Q1. <paste each new question as its own line>`. Count: 0. Per the user's instruction to complete the update, an empty list was treated as "no new questions" rather than a blocker, and this is recorded as ambiguity U8-A. No question row was invented in `TPFF_QUESTION_LEDGER.md`.

## U5. CONTRADICTIONS

| Severity | Prior value | Current value | Owner | Citations |
|---|---|---|---|---|
| HIGH → RESOLVED | `apps.html` links to `login.html`, but static allowlist omitted it and `login/`; sign-in returned JSON 404 | allowlist now includes both; browser GET returns sign-in with CSS/JS and no console errors | Frontend/Platform owner | `[src: apps.html:248]`; old `[src: server/app.js:119-153]`; new `[src: server/app.js:119-125]`; `[ev: browser GET, 2026-11-26]` |
| MED → RESOLVED | `PROJECT_FLOW_FILE.md` had §§0–4 only and no §5 route table; §13.e was provisional count authority | §5 contains 118 route rows and §13.e reconciles 114 + 4 = 118 | Documentation owner | `[src: PROJECT_FLOW_FILE.md:§5,§13.e]`; `[ev: route count audit, 2026-11-26]` |
| MED | v2.0 preamble recorded 39 modified / 23 untracked paths | final snapshot is 40 modified / 25 untracked | Documentation owner | `[ev: git status --porcelain=v1 --untracked-files=all, 2026-11-26]` |
| MED | §8 local finding H8.1: role-tab mismatch refusal existed only in client code | logged as H-29 with owner and open status | Credential-login owner | `[src: login/login.js:147-150]`; `[src: server/tests/credentialLogin.test.js:61-67]` |
| HIGH | §8 local finding H8.3: batch endpoint lacked `auth.requireAuth` | logged as H-30 with owner and open status | Auth/Backend owner | `[src: server/routes/auth.js:32-42]` |
| LOW | §8 local finding H8.2: sign-in static allowlist gap | logged as H-31 and resolved | Platform/Frontend owner | `[src: server/app.js:119-125]`; `[ev: browser GET login.html, 2026-11-26]` |

## U6. CITATIONS RE-ANCHORED

| Old anchor | New anchor | Reason |
|---|---|---|
| `[src: server/app.js:119-153]` (allowlist gap) | `[src: server/app.js:119-125]` + browser GET evidence | file changed; lines shifted and gap closed |
| `[src: PROJECT_FLOW_FILE.md:3-522]` (§§0–4 draft) | `[src: PROJECT_FLOW_FILE.md:§5,§13.e]` | document expanded to full §§0–14 |
| `MODIFIED_TRACKED=39`, `UNTRACKED=23` | `MODIFIED_TRACKED=40`, `UNTRACKED=25` | working-tree snapshot advanced |
| `tpff_sections_10_13.md` (sidecar source note) | `PROJECT_FLOW_FILE.md` §10 / §11 | sidecars now derive from the assembled master |

No citation was dropped without a replacement. External evidence files under `%TEMP%\opencode` remain cited as documentary evidence; they are not workspace sources.

## U7. SECTION-BY-SECTION DIFF SUMMARY

| Section | Added | Changed | Superseded | Removed | Action |
|---|---|---|---|---|---|
| §0 COVER | 6 new cover rows | version row | none | none | PATCH |
| §1 HOW TO READ | §1.5 history, §1.6 rules | none | none | none | PATCH (new subsections) |
| §2 EXECUTIVE MAP | rule cross-ref | none | none | none | PATCH |
| §3 PROVENANCE | rule cross-ref | none | none | none | PATCH |
| §4 ROLES | rule cross-ref | none | none | none | PATCH |
| §5 SURFACES | rule cross-ref; login.html allowlist row | none | none | none | PATCH |
| §6 DATA MODEL | rule cross-ref | none | none | none | PATCH |
| §7 STATE MACHINES | rule cross-ref | none | none | none | PATCH |
| §8 FLOWS | rule cross-ref; sign-in resolution; founder card row | 2 rows | none | none | PATCH |
| §9 INTEGRATIONS | rule cross-ref | none | none | none | PATCH |
| §10 UNKNOWNS | rule cross-ref | snapshot counts | none | none | PATCH |
| §11 HOWEVER | rule cross-ref | H8.2, H-26 status | none | none | PATCH |
| §12 TIMELINE | rule cross-ref | none | none | none | PATCH |
| §13 APPENDICES | rule cross-ref | founder card file content | none | none | PATCH |
| §14 ATTESTATION | rule cross-ref | re-run | none | none | PATCH |

No section shrank. No row was deleted.

## U8. AMBIGUITIES

- **U8-A**: NEW QUESTIONS list absent. The v3.0 prompt says to STOP when the question list is missing, but the user explicitly chose "Treat earlier founder rules as R1–R9" and asked for the work to be finished and pushed. Treated as zero new questions. Exact artifact needed to close: pasted `Q1. …` lines from the user.
- **U8-B**: The nine rules were already preserved verbatim in v2.0 §1.1, so "new" means newly promoted to applied axes, not newly discovered. User confirmation of this interpretation is recorded in the choice of R1–R9.

## U9. REVIEWER CHECKLIST

- Confirm the nine rules in §1.6 are the intended R1–R9.
- Confirm the empty NEW QUESTIONS list is acceptable for this version.
- Confirm the `login.html` / `login/` allowlist change is desired production behavior.
- Confirm the founder credential wording `PATENT HOLDER • multiple RESEARCH PAPERS PUBLISHED` and the LinkedIn URL.
- Confirm no live-deployment claim was introduced; all live proofs remain UNKNOWN.

## COVERAGE ATTESTATION — UPDATE-SPECIFIC

- [x] Every prior `[src:]`/`[ev:]` citation re-checked; changed anchors re-anchored above.
- [x] Every prior VERIFIED claim re-confirmed or explicitly resolved; no silent overwrites.
- [x] Every new rule R1–R9 has a U3 row and rows in every touched section.
- [x] Every new question (zero) has a ledger row — none existed; ambiguity U8-A logged.
- [x] Every removal logged as REMOVED_FACT — none occurred.
- [x] Every contradiction logged in U5 with severity and owner.
- [x] Every STALE citation resolved before delivery.
- [x] Route count in §5 reconciles with §13.e (118 = 114 + 4).
- [x] Env var count in §13.a reconciles with the current env inventory.
- [x] Migration applied-state in §6 remains UNKNOWN with the exact close command; no live claim introduced.
- [x] Version bumped in §0 and §1.5; previous version retained.
- [x] Update mode declared once (PATCH).
- [x] Every ambiguity is in U8.
- [x] HOWEVER_LOG.md retains all 28 prior entries plus H-29–H-31 (31 total, each with severity and owner); KNOWN_UNKNOWNS.md retains all 26 entries with deltas recorded.
- [x] PROJECT_FLOW_INDEX.json is valid JSON and diffs cleanly.
- [x] No prior section shrank without a corresponding change row.

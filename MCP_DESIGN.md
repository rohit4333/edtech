# Mathify MCP design — RM desk + planner designer

Status: **implemented and verified**. Internal tooling only; no end-user product surface.
Date: 2026-11-28.

## 1. Why this is feasible and safe

`server/mcp-core.js` now implements the hard parts for every server:

- stdio JSON-RPC 2.0 (`initialize`, `tools/list`, `tools/call`), protocol `2025-06-18`;
- startup fails closed when the server's token is missing;
- exactly three founder `get_*` tools, no mutation verb exposed;
- dry-run `proposal` objects that are never executed;
- db access goes through the existing service facade, not raw SQL;
- tests in `server/tests/mcpServer.test.js`, `mcpRmServer.test.js` and
  `mcpPlannerServer.test.js` assert all of the above.

So the new servers are an **extraction plus role profiles**, not a new stack. The
non-negotiable rule is now refined: **an MCP designer generates and regenerates; the
founder approves publication through the existing founder-reviewed suggestion path.**
The founder no longer has to author planners by hand, but publication keeps a human gate.

MCP servers are internal developer/founder tools, never handed to parents, students,
trainers or RMs as end-user surfaces (same guidance Supabase gives for its MCP server).

## 2. Open-source patterns adopted

| Source | Pattern borrowed |
|---|---|
| `modelcontextprotocol/servers` (reference servers, `src/everything`, `src/filesystem`) | stdio default, small explicit tool set, `npx`-style launch config, "reference not production" discipline. |
| `modelcontextprotocol/typescript-sdk` v2 (`@modelcontextprotocol/server`, Zod v4) | `registerTool` shape, typed `structuredContent` + `outputSchema`, Express/Streamable-HTTP middleware as an optional later phase. |
| `github/github-mcp-server` | Toolsets + per-tool allow-list, `--read-only` overriding explicit tool requests, tool names as stable API, audit-friendly compact DTOs. |
| `supabase/mcp` (`mcp-server-supabase`) | `readOnly`, `project_ref` scoping, feature groups, mutating tools **hidden from `tools/list`**, untrusted-data delimiters around DB output, explicit warning not to give MCP to end users. |
| MCP spec security guidance | Least privilege, no secrets in results, treat tool output as data not instructions, human confirmation for writes. |

We keep the current zero-dependency JSON-RPC core for Phase 1 and port these patterns.
Phase 2 can swap in the official SDK v2 without changing tool contracts.

## 3. Architecture

```
server/mcp-core.js                 shared JSON-RPC, auth gate, tool registry,
                                   structuredContent and shared error shape
   ├── server/mcp-server.js           existing 3 founder tools (wrapped, unchanged contract)
   ├── server/mcp-rm-server.js        RM-scoped reads + draft-only proposals
   └── server/mcp-planner-server.js   designer profiles: design / validate /
                                      cross-check / bounded regenerate loop

server/services/plannerRubricService.js      deterministic checks, versioned
server/config/planner-rubric.json            reviewable "perfect" definition
server/logs/mcp-actions.jsonl                append-only, secrets never logged
.mcp.json.example                            host config with env var names only
```

All servers launch over **stdio** initially. Streamable HTTP is deferred until there is
a concrete internal need, because it requires its own auth and host-header validation.

## 4. Tool contracts

### 4.1 Founder MCP (existing, unchanged)

`get_trainer_payout`, `get_student_mastery`, `get_trainer_attendance`.
Token: `MCP_FOUNDER_TOKEN`. Still read-only, still dry-run proposals.

### 4.2 RM MCP — `mathify-rm-desc`

Token: `MCP_RM_TOKEN`. Role context is fixed to `relationship_manager`; there is no
`actor_role` argument a caller can escalate with. Read-only is the default and cannot be
turned off in this server.

Exposed tools:

| Tool | Purpose | Boundary |
|---|---|---|
| `get_rm_dashboard` | Own RM desk, salary, counts, `TRAINER_ACCESS_PENDING` lock state | Scoped to the token's staff id |
| `list_trainers` | Trainer roster with status, subject, KYC state | No credential fields |
| `get_trainer_pay` | Full derived pay statement for one trainer | Read-only; matches RM web permission exactly |
| `get_trainer_attendance` | Attendance register for a month | Read-only |
| `get_trainer_onboarding` | KYC record | Masked by default; `reveal` is not an RM MCP option |
| `get_demo_queue` | Booking/demo queue | Never returns family password |
| `get_support_escalations` | Escalation inbox | Read-only |
| `draft_base_rate_change` | Dry-run of the one pay edit RM is allowed to make | Returns proposal only; founder/RM web UI applies it |

**Never registered, so they never appear in `tools/list`:** salary edits, penalties,
penalty revoke, settings/policy/payout/gratitude writes, LMS/planner tools, KYC reveal,
credential retrieval, password issuance, access grant/revoke, token minting.

Handlers call the same service functions with an explicit actor context that the Express
routes use; they do not bypass `requireStaffAccess` or role gates. Output is wrapped in
`<untrusted-data-…>` delimiters like Supabase MCP, and run through allowlist DTOs so no
hash/salt/aadhaar/account number can leak.

### 4.3 Planner designer MCP — `mathify-planner-designer`

Token: `MCP_PLANNER_DESIGNER_TOKEN`, which must map to a **founder** context. The
`planner_agent` role stays fail-closed (`PLANNER_AGENT_MUTATIONS_DISABLED`) and is not a
valid token for this server.

| Tool | Purpose | Mutation |
|---|---|---|
| `get_curriculum_catalog` | Boards/grades/topics + `promptVersion` | None |
| `get_planner` | Read stored planner for a selection | None |
| `get_rubric` | Current versioned rubric + policy snapshot | None |
| `draft_planner` | Generate a candidate through the same AI chain (`freelm → Gemini → Groq → Cloudflare`) used by `weeklyPlannerService` | none — draft only |
| `validate_planner` | Deterministic rubric check with per-rule evidence | None |
| `cross_check_planner` | Independent second-provider review of the same candidate, different prompt, findings with severity | None |
| `regenerate_until_pass` | Bounded loop: draft → validate → cross-check → feed findings back → repeat, max attempts and score threshold from rubric | none — returns best draft + full trace |
| `get_run_trace` | Hash-stamped trace of a design run | None |

### 4.4 Planner authoring profiles

The designer server has **two separate profiles** so generation can move off the founder
without collapsing the safety boundary. These are MCP service identities, not new
browser logins — `sharedLoginPair` and the single-canonical-role login model are unchanged.

| Profile | Token | Can generate? | Can publish? | Notes |
|---|---|---|---|---|
| `review` (default) | `MCP_PLANNER_DESIGNER_TOKEN` | Yes — draft, validate, cross-check, regenerate | No | Founder reviews; safe default |
| `author` | `MCP_PLANNER_AUTHOR_TOKEN` | Yes, same loop | **Suggests only** — files a review-queue record | Founder still accepts via `/api/lms/planner-suggestion/:id/decide` |

Decision (2026-11-28): **founder approval is retained**. No autonomous publishing profile
is implemented; there is no `publish_planner_draft` tool.

Tool added for the author profile:

| Tool | Purpose | Mutation |
|---|---|---|
| `submit_planner_draft` | Files the finalist into `planner_agent_suggestion` with `authorRole:'planner_designer'`, rubric score and hash trace | Writes a **suggestion**, never an active planner |

How this reuses existing code:

- `plannerAgentService.propose()` already validates with `planner.validatePlannerOutput()`,
  records `targetVersion`, `authorId`, `authorRole`, `status:'pending'`.
- `plannerAgentService.decide()` already re-validates on accept and calls
  `planner.editPlanner(..., {createdByRole:'founder'})`.
- Today `AGENT_MUTATIONS_ENABLED = false` fails closed for the **browser `planner_agent`
  user role**. We do **not** flip that global flag. Instead `assertAuthoringAllowed(actor,
  profile)` accepts only the explicit `planner_designer` MCP service identity; the HTTP
  user-role path stays refused, and the author profile still files a pending suggestion
  for founder review.
- The `review` profile has no submit/publish tools at all, so they never appear in
  `tools/list`.

This means the designer MCP can generate and regenerate planner candidates, while the
founder alone decides what becomes active through the existing suggestion queue. There is
no autonomous publishing profile. The temporary dev fixture can never be returned as an
authored or founder-generated planner.

## 5. What "perfect" means (the rubric)

`server/config/planner-rubric.json` is versioned and reviewable. Rules are split into
hard gates and scored dimensions.

Hard gates:

1. Valid planner JSON for the current `promptVersion` and selection.
2. curriculum / board / grade / topic resolved from the real catalog — no invented topics.
3. Continuous kid-friendly narrative across concepts, with in-class practice after each.
4. Quiz after each question; wrong answer reveals nothing until trainer explanation;
   AI-generated Retest replacement; 3 correct per section before unlock.
5. Question transfer payload is stem + image only — no options, answer, key, hint,
   explanation, trainer instructions, notes or misconceptions.
6. Ratios unchanged from the source; levels `1/2/3`; quiz economics `80/10/+15%/80`.
7. Images preserve natural aspect ratio (`aspect-safe` / natural-box containment).
8. No `href="#"`, no iframe, official nav/brand invariants in any rendered surface.

Scored dimensions: narrative continuity, age-appropriateness, practice/quiz balance,
difficulty ladder, clarity of trainer prompts. Threshold and max attempts are config,
not prompt text.

**Fail-closed on missing founder input.** Exact production narrative/script fields,
batch-to-planner assignment rules and the LMS visual reference are still pending from
the founder. The rubric marks those rules `pending_founder_input`; if any are required
for a selection, the loop returns `BLOCKED_PENDING_FOUNDER_INPUT` and does **not**
invent content or promote the temporary dev fixture. A dev-fixture planner can never be
returned as a founder-generated result.

Every draft, finding and finalist is recorded with a SHA-256 hash of selection +
rubric version + prompt version + candidate, so two runs are comparable and the founder
can see exactly what changed between attempts.

## 6. Security invariants

- Separate token per server; missing token refuses startup before `tools/list`.
- Read-only by default; write-shaped tools are absent from discovery unless the server is
  launched with an explicit author token.
- Authoring profiles are service identities, never user roles or browser logins. The
  global `AGENT_MUTATIONS_ENABLED=false` stays in force for the `planner_agent` user role.
- No password, JWT, refresh token, secret key, KYC document number or bank account in any
  tool input echo, result, error or audit line.
- DB/AI text treated as untrusted data and delimited.
- Tool arguments validated against explicit JSON schemas (`additionalProperties:false`).
- Append-only audit of actor role, tool name, argument/result hashes and timestamp.
- Bound all loops (attempts, provider timeouts, output size) to prevent runaway spend.
- Reuse the existing AI provider chain and policy config; no second, drifting prompt stack.

## 7. Rollout

1. **Core extraction** — done: `mcp-core.js` wraps all three servers, with contract tests.
2. **RM MCP** — done: tools above, tests mirroring `rmPayAccess.test.js` boundaries.
3. **Planner rubric service** — done: versioned gates plus pending-founder-input blocks.
4. **Planner designer MCP** — done: draft/validate/cross-check/loop with hash traces, plus
   the `author` profile feeding the existing founder-reviewed suggestion queue.
5. **Host config + docs** — done: `.mcp.json.example`, `.env.example`, README, this design.
6. **Optional Phase 2** — not done: official SDK v2 + Streamable HTTP + elicitation-based
   confirmation, only if an internal need appears.

## 8. References

- https://github.com/modelcontextprotocol/servers — reference servers and transport guidance.
- https://github.com/modelcontextprotocol/typescript-sdk — v2 SDK, typed tools, middleware.
- https://github.com/github/github-mcp-server — toolsets, read-only precedence, tool allow-lists.
- https://github.com/supabase/mcp — `readOnly`, project scoping, hidden mutating tools, untrusted-data framing.
- https://modelcontextprotocol.io/specification/latest — current protocol and security guidance.

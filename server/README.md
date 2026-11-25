# Mathify server — Phase 1

Role-based API behind the trainer dashboard, student dashboard and live 1:1 session.

Phase 1 delivers **auth + RBAC + session APIs** against an in-memory mock store. The data shape matches `db/schema.sql`, so the swap to Supabase/PostgreSQL is mechanical. No real Agora token, Realtime channel or recording webhook is active yet; their seams are included.

## Run

```powershell
cd server
npm install
copy .env.example .env
npm start
```

Health check:

```text
GET http://localhost:4000/api/health
```

Demo accounts (password `mathify-demo`, or `DEMO_PASSWORD` from `.env`):

| Role | Email |
| --- | --- |
| Founder | founder@mathify.app |
| Trainer | trainer@mathify.app |
| Student | student@mathify.app |

`GET /api/auth/demo` returns the same list.

## Auth

```http
POST /api/auth/login
Content-Type: application/json

{ "email": "trainer@mathify.app", "password": "mathify-demo" }
```

Response:

```json
{ "token": "...", "user": { "id": "...", "role": "trainer", "name": "Ananya Rao" } }
```

Send the token as `Authorization: Bearer <token>`.

## Endpoints

### Trainer / founder

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/trainer/dashboard` | Hero, today timeline, attention queue and metric sources |
| `GET` | `/api/trainer/score` | Teaching score shape; value stays null until bands are configured |
| `GET` | `/api/trainer/payouts` | Current payout period with null total until rules are confirmed |
| `GET` | `/api/trainer/payouts/:period` | Payout for a `YYYY-MM` period |
| `GET` | `/api/trainer/attention` | Derived planner, quiz, draft, attendance and recording signals |
| `GET` | `/api/trainer/attendance` | Six-session attendance register with present/absent/late states |
| `PATCH` | `/api/trainer/attendance/:sessionId` | Set one student's status for a session |
| `POST` | `/api/trainer/attendance/:sessionId/save` | Save records and return the refreshed register |
| `GET` | `/api/trainer/sessions` | Sessions owned by the trainer |
| `GET` | `/api/trainer/sessions/:sessionId` | Full planner, pages, trainer notes, quiz answer key |
| `PATCH` | `/api/trainer/sessions/:sessionId/planner` | Replace planner or toggle one item |
| `PATCH` | `/api/trainer/sessions/:sessionId/page` | Set current page, 1–3 |
| `GET` | `/api/trainer/quiz/templates` | Curriculum templates available for AI drafts |
| `POST` | `/api/trainer/sessions/:sessionId/quiz/launch` | Start quiz, reset attempts, publish event |
| `POST` | `/api/trainer/sessions/:sessionId/quiz/reveal` | Reveal one question or all to the student |
| `POST` | `/api/trainer/sessions/:sessionId/quiz/next` | Advance; completes the quiz after the last question |
| `GET` | `/api/trainer/sessions/:sessionId/quiz/drafts` | AI drafts awaiting trainer approval |
| `POST` | `/api/trainer/sessions/:sessionId/quiz/drafts/:draftId/approve` | Approve a draft into the live question set |
| `POST` | `/api/trainer/sessions/:sessionId/quiz/reteach` | Freeze quiz during reteach |
| `POST` | `/api/trainer/sessions/:sessionId/quiz/new-check` | Add a fresh parallel question from the same objective |

### Student / founder

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/student/dashboard` | Next session, streak, Mastery, recordings |
| `GET` | `/api/student/sessions/:sessionId` | Sanitized lesson + quiz; no notes or answer key |
| `POST` | `/api/student/sessions/:sessionId/quiz/answers` | Save answer only; no correctness or explanation |

### Shared session

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/sessions/:sessionId/state` | Role-aware live state and permissions |
| `POST` | `/api/sessions/:sessionId/rtc-token` | Agora-shaped demo token |
| `POST` | `/api/sessions/:sessionId/end` | Trainer-only end + recap + recording link |

### Quizzer state flow

Questions are generated as **curriculum template + AI draft**, then approved by the trainer before they reach a student.

```text
draft → answering → awaiting_reveal → revealed → answering → … → complete
                         ↓
                      reteach → recheck
```

- `POST /quiz/answers` only returns `{ attemptId, saved, phase }`.
- `quiz.answer.saved` carries no correctness.
- Correctness, `answerIndex` and `explanation` enter the student payload only after `POST /quiz/reveal`.
- Low readiness never auto-promotes; the trainer triggers `reteach` and then `new-check`.

Realtime events:

`quiz.launched`, `quiz.answer.saved`, `quiz.answer.revealed`, `quiz.question.changed`, `quiz.reteach.started`, `quiz.check.added`, `quiz.completed`, `quiz.draft.approved`.

### Policy / webhooks

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/policy/config` | Configurable rules; unresolved values are `null` |
| `POST` | `/api/webhooks/recording` | Store vendor recording URL and notify |
| `GET` | `/api/realtime/log` | Trainer/founder view of local event log |

### DeepSeek, Agora, Razorpay

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/agora/token?channelName=…&uid=…` | Publisher RTC token + RTM token, 1-hour expiry |
| `POST` | `/api/agora/recording/start` | Start Agora Cloud Recording or mock recording |
| `POST` | `/api/agora/recording/stop` | Stop a started recording by `recordingId` |
| `POST` | `/api/razorpay/orders/monthly` | Create a 12-session / 540 SAR Razorpay order |
| `POST` | `/api/razorpay/webhook` | `payment.captured` → credit `sessions_remaining` once |

`services/deepseekService.js` exports `generateQuizDraft(topic, difficulty)`. Difficulty accepts
`easy|medium|hard` or `1|2|3` and is sent to DeepSeek as `Level 1–3`. It returns a parsed
`{ questions: [...] }` object with `question_text`, `options`, `correct_option_index` and `hint`.
Drafts stay trainer-only until approved.

Add these env vars in `.env`:
`DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
`RAZORPAY_WEBHOOK_SECRET`, `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`,
`AGORA_CUSTOMER_KEY`, `AGORA_CUSTOMER_SECRET`, `AGORA_RECORDING_STORAGE_CONFIG`.

## Safety rules already enforced

- Sessions are strictly one trainer and one student.
- Trainers only see their own sessions; students only see their own.
- `trainer_instructions` live in a separate table/mapping and are never serialized for students.
- Quiz `answerIndex`, `explanation` and attempt `correct` are withheld until the trainer reveals that question.
- Correctness is not broadcast on the shared realtime channel; `quiz.answer.saved` only carries ids and a timestamp.
- AI drafts and templates are trainer-only until approved.
- Founder role can audit all sessions.

## Configurable policy

`config/policy.json` intentionally leaves quiz scoring bands, unlock threshold, teaching-score bands and payout bonus/fine rules unset. Known rules are present:

- 6 hours / 6 sessions daily cap
- 48-hour leave notice; `LATE_NOTICE_FINE` below it
- 38-day non-refundable packs
- 24–48-hour reschedule window
- no-show without notice marks session used

## Next phases

1. Swap `db/index.js` to Supabase/PostgreSQL using `schema.sql`.
2. Replace `realtime/index.js` with Supabase Realtime channels.
3. Replace the mock `realtime/agora.js` seam with the `/api/agora/token` service everywhere.
4. Wire the existing classroom frontend to `/state`, `/rtc-token` and the realtime channel.
5. Mirror the mock `recordings`, `razorpay_orders`, `payments` and `packs` stores onto `schema.sql`.

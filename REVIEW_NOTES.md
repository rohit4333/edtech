# Live session review notes

- Branch: `feat/student-rtc-control-perfection`
- Starting commit: `f02dc10`
- Environment: local mock server `http://127.0.0.1:4004` (real production origin / Supabase credentials are not available here)
- Workflow: one page at a time. I render a page, drive the relevant live API/action, pause for your `go`, then append your updates below. No new development changes will be made until the full review is compiled.
- User clarification: skip Razorpay and Twilio/WhatsApp entirely; focus only on session functionality using live HTTP API calls, not unit/mock tests. Student should show 8 session credits for the walkthrough.
- Open item: no production/Supabase/LiveKit/Razorpay credentials or deployed URL are configured in this environment, so the live target still needs to be confirmed.

## Planned page sequence

1. Trainer dashboard / Start class
2. Shared connect page — trainer
3. Shared connect page — student waiting
4. Trainer whiteboard / shared board
5. Student shared whiteboard
6. Trainer planner designer / question handoff
7. Quiz sheet / trainer
8. Quiz sheet / student
9. Classroom engagement, reactions, network bar, session detail
10. LMS curriculum library
11. Landing page

## Review entries

### 1. Trainer dashboard / Start class

- URL: `http://127.0.0.1:4004/trainer/today?review=1795812288938&live=1795812290…`
- Dev label: `DEV PAGE · Trainer dashboard / Start class`
- Rendered at: `1795812288938` (tab focused)
- Live API/action exercised: `POST /api/auth/login`, `GET /api/trainer/dashboard`, `GET /api/sessions/ses_math_001/state` → `live`; `Start class` and `Camera only` present; no `Join call`; 5-minute cue hidden
- Setup: student wallet seeded to **8 credits** and verified through `GET /api/student/dashboard`
- Review question: “what's ‘camera only’ in session deck of trainer dashboard?”
- Answer logged: it opens the same shared connect page as `Start class` (`classroom/connect.html?sessionId=…&role=trainer&camera=1`) with the toast “Opening camera check…”. The connect page is a pre-lesson camera/mic and network check in a server-owned preview room; it does not start the class clock, attendance or pay. The trainer’s `Start the session` button there is what actually opens the lesson desk. Current `connect.js` does not branch on `camera=1`, so both dashboard buttons land on the same screen; only the toast differs.

- Review update: hide/remove the **Camera only** action from the trainer dashboard. Keep `connect.html` reachable for testing/direct links, but do not surface it as a dashboard action; `Start class` remains the only trainer entry into the connect flow.
- Reason logged: camera/mic and network checking already happens automatically during normal session joining on the connect page, so a separate camera-test action is useless to the trainer. Student dashboard device check was not part of this update.

### Copilot / Trainer Desk review notes

- Current contents: one floating panel with two modes — `Mathify copilot` (chips: Differentiate today’s set, Draft a parent note, Summarise last session) and `Mathify Trainer Desk` (chips: What is the session payout?, 48-hour cancellation rule, How do leaves work?, Attendance bonus rules).
- Current backend: copilot → `POST /api/trainer/copilot/query` → `chatAssistant.reply('trainer')` → Workers AI with academic context only (subject/curriculum/grade/chapter/language); no pay or personal data reaches it. Trainer Desk → `POST /api/chat/trainer-support` → Worker core with static facts mirrored from `server/config/policy.json` (`₹300–₹400`, `48 hours`, `₹2,000`, etc.), not the signed-in trainer’s own pay/ledger.
- Requirement logged: clicking any suggested option/chip must **paste the text into the typing area**, not send it. The query is sent only when the user presses Enter / the send button. The same applies to `[data-ask]` entry points.
- Requirement logged: the copilot must be able to hand a relevant query to the Trainer Desk panel. Open question: should the Trainer Desk paste it and wait for the user to press send, or auto-send after switching from copilot to Trainer Desk?
- Requirement logged: session payout and all Trainer Desk offers/info must be extracted from that trainer’s own pay/database records (pay rate, payouts, leave/attendance, protected founder credit, policy values) — not generic/static/random answers. Student names, contact details and trainer-only leaks must remain blocked.

### Notification / announcement clarification

- User clarification: the trainer notification/announcement surface exists so the trainer knows when the RM or founder sends them a notice, or when a parent sends them a message — things like that. The announcement surface is for that purpose.
- Current state: `Announcements` is a collapsed list in the trainer dashboard fed by `/api/announcements`; founder/RM can author notices via `/api/admin/announcements`, targeted to trainers/students/both/one account, with unread badge and mark-read. Parent messages are a separate `parent-chat` unread badge and thread panel. The top bell button is currently static demo text (`3 notifications: 2 parent replies and 1 quiz update`) and does not read live counts.
- Requirement logged: make the trainer notification surface live and unified for incoming RM/founder notices and parent messages; replace the static bell/toast with real unread counts and a working inbox. Founder/RM identity details and student contact details must still be stripped.
- UI requirement logged: the bell at top right, immediately left of the profile avatar, must open a mailbox-style notification popup/panel when clicked. It needs its own close button. Each message opens inside that same window/panel, with a dedicated Back option to return to the notification list — no separate page or external popup.
- UI requirement logged: a long notification list must scroll inside the notification panel itself, with a sensible max height, so the dashboard behind it does not become the scroll surface.
- UI requirement logged: the scrollbar must be conditional — it appears only when the mail text/content exceeds the visible panel/viewport capacity, and stays hidden when everything fits.
- Your updates: pending — awaiting `go`
- Status: awaiting `go`

### 2. Shared connect page — trainer

- URL: `http://127.0.0.1:4004/classroom/connect.html?sessionId=ses_math_001&role=trainer&camera=1&review=1795813213950&live=…`
- Dev label: `DEV PAGE · Shared connect page`
- Rendered at: `1795813213950` (tab focused)
- Live API/action exercised: `POST /api/auth/login`, `GET /api/sessions/ses_math_001/state` → `live`, `GET /api/sessions/ses_math_001/presence`, `POST /api/sessions/ses_math_001/preview-token` (local preview room), `POST /api/sessions/ses_math_001/network-check` with downloaded/uploaded/latency measurement
- Observed: trainer role, peer name `Ishaan Verma`, peer wait “Waiting to connect…”, mic and camera buttons, network meter `5` bars / `excellent`, `Start the session` present but disabled because student has not passed yet; automated browser reported camera access blocked, so allow camera/mic in the tab to see the live preview.
- Review update: camera and mic buttons feel too delayed. They should react immediately on press (optimistic icon/badge state), then reconcile with the LiveKit/server result instead of waiting on the round trip.
- Review update: after camera/mic permission is granted, nothing displays over the camera frame. The tile must show the live local/remote video with its overlay indicators (name, mic state, speaking state) visible on the frame.
- Review update: there is no audio-receiving visual. Add a fluctuating greenish level indicator on the mic control/tile that responds to the receiving volume.
- Review update (all camera decks, connect page and classroom): highlight whoever is speaking with a coloured border on their window, using the existing project palette tokens (teal/coral family), not a new arbitrary colour. Default interpretation logged: teal (`--teal`) for speaking/audio level; coral reserved for muted/attention states.
- Your updates: pending — awaiting `go`
- Status: awaiting `go`

### 3. Shared connect page — student waiting

- URL: `http://127.0.0.1:4004/classroom/connect.html?sessionId=ses_math_001&role=student&view=student&state=live&review=1795813589044&live=1795813591960`
- Dev label: `DEV PAGE · Shared connect page`
- Rendered at: `1795813589044` (tab focused)
- Live API/action exercised: `POST /api/auth/login`, `GET /api/student/dashboard` → `sessionsRemaining=8`, `GET /api/sessions/ses_math_001/state` → `live`, `GET /api/sessions/ses_math_001/presence`, `POST /api/sessions/ses_math_001/preview-token`, `POST /api/sessions/ses_math_001/network-check` with measured download/upload/latency
- Observed: student role, peer name `Ananya Rao`, peer wait “Waiting to connect…”, mic and camera buttons, network meter `5` bars / `excellent`, status “Connection ready for a private 1:1 class”; `Start the session` exists in markup but is hidden for the student role and not actionable. Server state reported `network.canStartCall=true` after the check, but presence still shows both participants absent and `classroomOpen=false`; automated browser reports camera access blocked, so allow camera/mic in the tab to see the live preview.
- Review update: same issue as the trainer side — camera and mic controls respond too slowly, and after permission is granted there is no visible camera feed or mic/audio feedback on the student connect page. Apply the same fixes here: immediate optimistic control response, live local/remote video in the frame, overlays, greenish receiving-volume indicator, and active-speaker border using project palette tokens.
- Your updates: pending — awaiting `go`
- Status: awaiting `go`

### 4. Trainer whiteboard / shared board

- URL: `http://127.0.0.1:4004/classroom/index.html?sessionId=ses_math_001&role=trainer&board=full&review=1795813751611&live=1795813755120`
- Dev label: `DEV PAGE · Trainer whiteboard / shared board`
- Rendered at: `1795813751611` (tab focused)
- Live API/action exercised: `POST /api/auth/login`, `GET /api/sessions/ses_math_001/state` → `live`, `GET /api/sessions/ses_math_001/events` → 21 events, `POST /api/sessions/ses_math_001/cursor` (ephemeral pointer published), `GET /api/sessions/ses_math_001/cursor` (read back)
- Observed: full board opens directly from `board=full`, canvas `1303×878`, active tool `select`, zoom `100%`, ink panel hidden, share button not pressed, board visible. `Mathify.` watermark nodes exist in the DOM (8 matches across mark/footmark classes) — visual check needed that only the bottom mark is visible on the shareable board. Six `[data-celebration-style]` surfaces remain elsewhere in the classroom page.
- Review update: the ink dropdown slides over the camera deck. The ink panel must be positioned so it does not collide with the camera deck, and must be **page-centred every time** — whether opened from the Pen caret or the Highlighter caret. Current CSS anchors the panel to its own `.board-ink-tool` (`left:0; top:calc(100% + 8px)`), which makes its position depend on which caret was clicked.
- Review update: the Shapes control needs a **default selected shape** shown on the main button. When the trainer opens the dropdown and picks another shape, that choice becomes the new default shown on the button; changing it again requires reopening the dropdown. Current markup shows a generic combined shapes icon on the main button and only highlights choices inside the menu.
- Your updates: pending — awaiting `go`
- Status: awaiting `go`

### 5. Student shared whiteboard

- URL: `http://127.0.0.1:4004/classroom/index.html?sessionId=ses_math_001&role=student&view=student&review=1795813896967&live=1795813900480`
- Dev label: `DEV PAGE · Student shared whiteboard`
- Rendered at: `1795813896967` (tab focused)
- Live API/action exercised: trainer `POST /api/sessions/ses_math_001/board/share` → `{ok:true,shared:true,seq:27}`; student `POST /api/auth/login`, `GET /api/sessions/ses_math_001/state` → `live`, `GET /api/sessions/ses_math_001/events` → 29 events
- Observed: board sharing is on (`body.board-shared=true`) and the full board auto-opened for the student; canvas `1303×878`. No active board tools, no visible trainer controls, no share/zoom/undo controls, no ink panel, top deck hidden, reaction sets hidden. The `View only` badge exists in markup but is not visible, consistent with the white-canvas-only requirement.
- State note: board sharing was deliberately left ON for this review page. It must be turned OFF before rendering the planner/quiz pages so the student view is not locked to the board.
- Your updates: pending — awaiting `go`
- Status: awaiting `go`

### 6. Trainer planner designer / question handoff

- URL: `http://127.0.0.1:4004/lms/index.html?review=1795814193535&live=1795814196590`
- Dev label: `DEV PAGE · Trainer planner designer`
- Rendered at: `1795814193535` (tab focused; planner sheet opened via `Planner designer`)
- Live API/action exercised: trainer `POST /api/auth/login`; `POST /api/sessions/ses_math_001/board/share` → sharing OFF (`seq 30`); `GET /api/sessions/ses_math_001/state` → `live`; planner quiz prompt and image URL fields filled; `Send question to whiteboard` clicked; handoff target `http://127.0.0.1:4004/classroom/index.html?sessionId=ses_math_001&role=trainer&board=full&plannerQuestion=1&review=1795814198470` opened in a background tab.
- Handoff payload verified: `mathify.planner.question` contained only `id`, `q` (“A bar model shows 3 parts = 15. What is the value of 5 parts?”), `image` (data URL SVG), and `at`. No options, answer, hint, explanation, trainer instructions or misconceptions were included. The board tab consumed and removed the payload from local storage, confirming handoff receipt; visual check still needed that the question card appears top-right with the image at original ratio.
- Observed: planner sheet title “Draft a lesson without leaking trainer notes.”, send button visible, question prompt and image fields present, board opened from the handoff URL with `plannerQuestion=1` and the board visible. Board sharing remained OFF after this page.
- Review update: remove the **Planner designer** surface/access for trainers. A trainer must not design or generate a planner; they can only **access the planner assigned to them from the LMS according to batch details**.
- Review update: the whole planner should be extractable from the LMS, but this is **pending founder generation of each planner**. Marked in `PENDING_RULES.md` as a founder-owned pending task; do not implement trainer-side generation or fake extraction before that.
- Your updates: pending — awaiting `go`
- Status: awaiting `go`

### 7. Quiz sheet / trainer

- URL: `http://127.0.0.1:4004/classroom/index.html?sessionId=ses_math_001&role=trainer&sheet=quiz&review=1795814528846&live=1795814532496`
- Dev label: `DEV PAGE · Quiz sheet / trainer`
- Rendered at: `1795814528846` (tab focused)
- Live API/action exercised: trainer `POST /api/auth/login`; `POST /api/trainer/sessions/ses_math_001/quiz/launch` → 200, quiz `status=live`, `phase=answering`, `currentQuestionId=q_1`; `GET /api/sessions/ses_math_001/state` confirmed the same quiz state; trainer clicked **Launch quiz** in the sheet.
- Observed before launch: quiz sheet visible, title `Quiz`, question “Which ratio is equivalent to 3 : 5?”, 4 options with **1 answer key marked**, launch button visible. Trainer-only note explains that the question goes to the whiteboard top-right with its image when present, options stay in the quiz, answers stay hidden until reveal.
- Observed after launch: `quiz-live` active, question “Which ratio is equivalent to 3 : 5?”, 4 options, no question image (text question), no hints granted yet, answer state “Waiting for Ishaan Verma’s answer.”, Reveal control visible.
- Review update: remove the whole **Scratchpad · blank space** section from the quiz stage. Current markup has `#studentInk` with a canvas and two `Mathify.` watermark nodes; it must not appear in the trainer quiz view.
- Review update: add an explicit **Push to whiteboard** control for the trainer. Current behaviour is automatic transfer only (`q-note` says it goes to the whiteboard automatically); the trainer needs a visible, deliberate action to push the current question to the board.
- Review update: remove the **Explain** option from the trainer `Quiz actions` dropdown. It currently opens the separate `scratchOverlay` “Temporary Wacom overlay”/new whiteboard inside the quiz.
- Review update: replace **Reteach + new check** with only **New check on same concept**. No reteach action/freeze wording should remain on that control.
- Review update: questions generated from **New check on same concept** must eventually count toward the child’s platform-wide attempted/solved question totals, using all mastery questions and in-class quiz questions as the source. Data/aggregation implementation needs to be part of the compiled change list.
- Review update: the trainer quiz view is too large. Make it compact, but it must show the planner-provided **suggested edits** and **hint additions** — fetch those from the planner rather than maintaining a separate bulky trainer surface. Remove the scratchpad/explain surface. This depends on the founder-generated planner work already marked pending in `PENDING_RULES.md`.
- Review update: remove the **board sharing** control that currently sits in the same row as reward badge and Star moment on the quiz/trainer view. There are too many board-sharing entry points; keep one canonical sharing control elsewhere.
- Your updates: pending — awaiting `go`
- Status: awaiting `go`

### 8. Quiz sheet / student

- URL: `http://127.0.0.1:4004/classroom/index.html?sessionId=ses_math_001&role=student&view=student&quiz=1&review=1795815075668&live=1795815079565`
- Dev label: `DEV PAGE · Quiz sheet / student`
- Rendered at: `1795815075668` (tab focused)
- Live API/action exercised: student `POST /api/auth/login`; page loaded `GET /api/student/sessions/ses_math_001`; trainer re-issued `POST /api/trainer/sessions/ses_math_001/quiz/launch` after the quiz had drifted to `ended/complete`; student clicked option A and saved an answer through `POST /api/student/sessions/ses_math_001/quiz/answers`; final server state `quizStatus=live`, `quizPhase=awaiting_reveal`.
- Observed: student question “Which ratio is equivalent to 3 : 5?”, 4 options, no answer key marked, no trainer controls visible, question image hidden (text question), Hint and Skip visible, feedback “Answer saved. Your trainer will reveal feedback.”. The scratchpad section is still visible on the student quiz stage — already logged for removal on page 7.
- Issue noticed during render: first student render showed a different smoothie-ratio question and the first answer attempt was rejected because server quiz had become `ended/complete`. After re-launch and reload, the question matched the trainer/server `q_1` and the answer saved. Needs review: quiz state/question sync between trainer and student must stay aligned without manual relaunch.
- Review update: remove the scratchpad section from the student/kid quiz stage as well. It must not appear on either side of the quiz.
- Review update: keep the question options interactive for kids, but add an explicit **Submit** flow — the student selects an option, presses Submit, and only then is the answer sent. Current behaviour saves immediately on option click.
- Review update: after Submit, the selected answer must reflect back to the trainer desk immediately (attempt/answer state), and the trainer then decides when to reveal the answer. No correctness or answer key may be shown to the student before trainer reveal.
- Your updates: pending — awaiting `go`
- Status: awaiting `go`

### 9. Classroom engagement, reactions, network bar, session detail

- URL: `http://127.0.0.1:4004/classroom/index.html?sessionId=ses_math_001&role=trainer&review=1795815914762&live=1795815914763`
- Dev label: `DEV PAGE · Classroom / trainer`
- Rendered at: `1795815914762` (tab focused; session detail and chat sheets opened via their buttons)
- Live API/action exercised: trainer `POST /api/auth/login`, `GET /api/sessions/ses_math_001/state` → `live`, `POST /api/sessions/ses_math_001/network-check` → network `5` bars / `excellent`, `POST /api/sessions/ses_math_001/reactions` with `👏`; opened `In the room` and `Ask, answer, nudge` sheets.
- Observed: network meter and people/hand/chat buttons visible; session detail sheet `In the room` had 2 rows with `On mic` and `Hand up`; chat sheet `Ask, answer, nudge` had a working form and 3 messages. The engagement bar and reaction sets exist in markup but were not visible in this state; visible `[data-celebration-style]` surfaces were `0`; camera deck hidden; quiz and board sharing inactive.
- Review update: the engagement bar and reaction sets must be visible on this classroom page, not hidden in the current state. Show them together with reward badge and Star moment on every session page.
- Review update (reaffirmed): remove the **board sharing** button sitting next to reward badge/Star moment. There must not be a second sharing control in this row.
- Review update received before render: remove the **Shared board** link from the student dashboard/session surfaces. In a live session the child should see whatever the trainer pushes — whiteboard, quiz or lesson content — not navigate to it through a dashboard link.
- Review update received before render: once a session starts, hide the student balance, session-credit pack and the full Mathify header/dashboard block. The running session must feel like a live class, not a dashboard view.
- Review update received before render: present a full-screen session shell with only essential controls — signal strength/network meter, recording timer/status, **End session**, hand-up and chat. These controls must also live in floating decks, not a fixed dashboard/header bar.
- Review update received before render: remove the **1-1 / guided practice** block from the live session view; that belongs on the student dashboard, not inside a running session. A quiz must not appear there as a standing dashboard card — it appears only when the trainer launches/pushes it.
- Review update received before render: still show **chapter name** and **topic name**, but place them in small floating decks rather than a dashboard header.
- Your updates: pending — awaiting `go`
- Status: pending

### 10. LMS curriculum library

- URL: `http://127.0.0.1:4004/lms/index.html?review=1795816239116&live=1795816239116#libraryHealth`
- Dev label: `DEV PAGE · LMS curriculum library`
- Rendered at: `1795816239116` (tab focused)
- Live API/action exercised: trainer `POST /api/auth/login`; `GET /api/lms/curriculum-catalog` → 200, `count=60`, subjects visible `["Mathematics"]`; `GET /api/lms/planner?studentId=usr_student_001&subject=math&curriculum=cbse&grade=class-7` → 200, planner version `1`; LMS search for `ratio` returned 2 results.
- Observed: planner sheet hidden, notification button visible, `Planner designer` button still visible (already logged for removal). The course grid rendered **0 cards / 00** for the trainer even though the catalog API returned 60 curricula — needs review of trainer subject scoping in the local library.
- Review update (reaffirmed/strengthened): remove **all** trainer access to planner generation or mutation. Trainer can only **view** the assigned planner — cannot change, update, regenerate, design or generate anything. All planner creation and updates are founder-only. Apply to UI controls and server endpoints; update `PENDING_RULES.md` accordingly.
- Review update: design the **complete LMS curriculum library** around that model — a finished, coherent library surface for trainer view-only access, with founder-only authoring/generation. If “like that” refers to a specific visual reference, the founder still needs to point to the exact page/screenshot or describe the layout to copy.
- Your updates: pending — awaiting `go`
- Status: awaiting `go`

### 11. Landing page

- URL: `http://127.0.0.1:4004/?review=1795816366972&live=1795816370008`
- Dev label: `DEV PAGE · Landing page`
- Rendered at: `1795816366972` (tab focused)
- Live action/API exercised: `GET /api/health` → `200`, `ok=true`, `database=mock`, `realtime=mock`; `GET /api/auth/demo` → 200 with 6 demo accounts.
- Observed: title `Mathify — Live 1-on-1 maths, where your child is finally seen`; brand mark `Mathify<i>.</i>` present in source; nav includes `Home`, `Pricing`, `Terms`, `Privacy`, `Refund`, `Contact`, `Book Demo` (desktop and mobile copies); founder LinkedIn URL `https://www.linkedin.com/in/rohit4333/` present once; founder credential line `PATENT HOLDER • multiple RESEARCH PAPERS PUBLISHED` present in source; `href="#"` count `0`; `iframe` count `0`.
- Observation for review: the landing page itself does not display `§§0–14`, the quiz `80 / 10 / +15% / 80` figures, or Level 1/2/3 rules. Those strings currently live in project documentation and student/classroom surfaces rather than the landing page. No change logged yet — awaiting your review.
- Review update: `contact.html` form must be exactly like the **home page demo** form — same working shared booking frame, same validation/progress/success/credential behaviour, and exactly the same demo booking flow. Current state: home uses `#demoForm` + `landing.js` multi-step flow; contact uses a separate `#bookingForm` + `shared/contact-form.js`.
- Review update: in **Your request**, do not mention `35 min` demo. Say **book a demo** and adjust all additive/summary sentences accordingly. Current strings are in `landing.js` `buildMessage()` (“book a 35-minute live 1-on-1 demo”) and the post-booking WhatsApp link (“I just requested a 35-minute 1-on-1 demo”). Apply the same no-35-minute wording to the contact card if it adopts the shared frame.
- Review update: landing page text “35-minute live session” → **50 min. demo**. Run through the whole `index.html` and change every `35 min` / `35-minute` demo occurrence to `50 min` / `50-minute` (including `Book the 35-minute demo`). Do **not** change the separate `35-minute child gate` payout rule in server/services.
- Review update: that completes the walkthrough.
- Your updates: complete
- Status: complete

## Compiled changes to implement after full review

### A — Trainer dashboard, copilot, notifications

1. Remove **Camera only** from the trainer dashboard. `connect.html` stays reachable for direct links/testing, but `Start class` is the only trainer entry into the connect flow. Camera/mic/network checking already happens automatically during joining.
2. Copilot/Trainer Desk chips and `[data-ask]` suggestions must **paste into the typing area**, not send. Send only on Enter / send button.
3. Trainer Desk payout/info must be derived from the signed-in trainer’s own pay/database records (rate, payouts, leave, attendance, protected founder credit, policy values). No static/random answers and no student contact/trainer-only leaks.
4. Replace the static bell/toast with a live mailbox-style inbox for RM/founder notices and parent messages: real unread counts, bell left of profile, close button, each message opens in the same panel with Back, and an internal scrollbar only when content exceeds the panel.

### B — Connect page camera/mic (trainer and student)

5. Mic/camera buttons react immediately with optimistic state, then reconcile with the LiveKit/server result.
6. After permission, the tile shows live local/remote video with name, mic and speaking overlays on the frame.
7. Add a fluctuating greenish audio-level indicator tied to receiving volume.
8. Highlight the active speaker with a coloured border using project palette tokens — teal (`--teal`) for speaking/level, coral for muted/attention.

### C — Board tools

9. Ink dropdown must be page-centred every time, whether opened from Pen or Highlighter, and must never slide over the camera deck.
10. Shapes control shows a default selected shape on the main button; a menu choice becomes the new default shown on the button.

### D — Planner / LMS

11. Remove all trainer planner-design/generation/mutation access from UI and server. Trainer gets **view-only** access to the planner assigned by batch. All creation/update/regeneration is founder-only. Planner-agent mutation stays disabled until the founder explicitly re-enables it. This is already recorded in `PENDING_RULES.md`; do not fabricate extraction before each planner is founder-generated.
12. Trainer quiz view must fetch planner-provided **suggested edits** and **hint additions** (depends on item 11/founder-generated planners).
13. Design the complete LMS curriculum library around trainer view-only/founder authoring. Fix the trainer course grid showing `00` despite 60 catalog curricula. Exact visual reference for “like that” was not supplied — if a specific layout is expected, the founder must provide the page/screenshot before pixel-matching.

### E — Quiz, trainer side

14. Remove the whole **Scratchpad · blank space** section.
15. Add an explicit **Push to whiteboard** control for deliberate question transfer.
16. Remove **Explain** from Quiz actions; no separate Wacom/new-whiteboard overlay.
17. Replace **Reteach + new check** with **New check on same concept** only — no reteach/freeze wording.
18. New-check questions must count toward the child’s platform-wide attempted/solved totals, sourced from all mastery questions and in-class quiz questions.
19. Make the trainer quiz view compact and remove the duplicate **board sharing** control beside reward badge/Star moment. Keep one canonical sharing control elsewhere.

### F — Quiz, student side

20. Remove the scratchpad section from the student/kid quiz stage too.
21. Keep options interactive, but add an explicit **Submit** button: selecting an option must not send immediately.
22. On Submit, the answer reflects back to the trainer immediately; the trainer alone controls reveal. No correctness or answer key before reveal.
23. Fix trainer/student quiz state sync — the student must not drift to a different question or an ended quiz while the trainer sees a live one.

### G — Classroom / live session shell

24. Make the engagement bar and reaction sets visible with reward badge and Star moment on every session page; remove the duplicate board-sharing button from that row.
25. Student live session: remove the **Shared board** link; show only what the trainer pushes (board/quiz/lesson), not a dashboard navigation link.
26. Once a session starts, hide the student balance, credit pack and full Mathify header/dashboard block. Use a full-screen class shell with **floating decks only** for signal strength, recording timer/status, **End session**, hand-up and chat.
27. Remove **1-1 / guided practice** and standing quiz cards from the live session (they remain dashboard features). Show **chapter name** and **topic name** in small floating decks.

### H — Landing and contact

28. `contact.html` uses the exact same shared booking frame/flow as the home page demo form (`#demoForm` + `landing.js` behaviour): same fields, progress, validation, time chips, Your request, success/credentials and status behaviour.
29. In **Your request**, never mention `35 min` demo. Say **book a demo** and adjust all additive/summary sentences accordingly, including the post-booking WhatsApp message/contact card copy.
30. Change every demo-duration occurrence of `35 min` / `35-minute` in `index.html` to `50 min` / `50-minute`, including `35-minute live session` → `50 min. demo` and `Book the 35-minute demo`. Do not touch the separate server-side `35-minute child gate` payout rule.

### I — Still blocked / explicitly out of scope

- Copilot → Trainer Desk handoff behaviour (paste-and-wait vs auto-send after switching modes) is still unresolved and needs a founder choice before implementation.
- Founder-generated planners and batch-to-planner assignment rules are still pending; no fake extraction or trainer authoring.
- Production origin/Supabase/LiveKit credentials are unavailable; walkthrough remains on local mock HTTP `127.0.0.1:4004`.
- Razorpay, Twilio/WhatsApp, RM fine revocation and global brand rename remain excluded/pending per `PENDING_RULES.md`.
- Development badge stays on every rendered page during implementation, hidden by `?devLabel=0`, and is removed only after final development review.

## Implementation pass 1 — landing / contact booking frame

- Implemented compiled items 28–30 only. No other compiled change has been applied yet.
- Changed `index.html`: all five demo-duration strings now read 50 (`50-minute live session`, `Fifty minutes`, `Book the 50-minute demo`, `50:00`, orb `50`). The inline booking card was replaced by `#demoBookingMount`.
- Added `shared/demo-booking.js`: one shared two-step booking card/flow used by both pages; **Your request** now says `I would like to book a demo`, never a minute count; post-submit WhatsApp copy says `I just requested a demo`.
- Rewrote `landing.js` to keep only landing reveal animations; booking/openBooking logic moved to the shared module.
- Rewrote `contact.html`: added `landing.css`, `#book-demo` section, same shared mount and scripts; removed the separate `shared/contact-form.js` flow. Nav `Book Demo` now targets `#book-demo`.
- Rendered landing page: `http://127.0.0.1:4004/index.html?review=1795817071243&live=1795817071243` — dev label `DEV PAGE · Landing page`, form mounted, no `35` strings, Step 2 generated request text was duration-neutral.
- Rendered contact page: `http://127.0.0.1:4004/contact.html?review=1795817083338&live=1795817086418` — dev label `DEV PAGE · contact.html`, same 8 fields/4 time chips/two-step flow, no `35` strings, Step 2 generated the same duration-neutral request text.
- Syntax check passed for `shared/demo-booking.js` and `landing.js`.
- Fix after user review: the contact booking card existed but stayed at `opacity: 0` because `contact.html` loaded `landing.css` without `landing.js`, so `.reveal` was never marked `is-visible`. Added `landing.js` to `contact.html`.
- Re-rendered contact page: `http://127.0.0.1:4004/contact.html?review=1795817268425&live=1795817268426` — dev label `DEV PAGE · contact.html`, card class `booking-card reveal is-visible`, opacity `1`, form and all 8 fields visible, 4 time chips, no `35` strings, no console errors. Step 2 flow generated the same duration-neutral request text and showed Back.

## Implementation pass 2 — board tools

- Implemented compiled items 9–10 only.
- `shared/fullBoard.css`: the ink row is now `position:fixed`, horizontally centred and placed below the floating tool deck. The board-open override was split so group menus keep their old caret-relative position.
- `shared/fullBoard.js`: `anchorInkPanel()` became `centreInkPanel()`; pen and highlighter both call it, so the row always lands at the page centre. The panel is moved to `document.body` while the board is open because the tool deck's `backdrop-filter` otherwise creates a containing block for `position:fixed`; it is restored on close.
- `classroom/index.html`: the Shapes button now contains a `[data-shape-glyph]` preview. `shared/fullBoard.js` keeps `currentShape` (default `square`), clones the chosen menu icon into the button and updates `aria-label`/`title`.
- Rendered trainer board: `http://127.0.0.1:4004/classroom/index.html?sessionId=ses_math_001&role=trainer&review=1795817437340&live=1795817437341` — dev label `DEV PAGE · Classroom / trainer`; pen and highlighter panels both measured centre X `521` against viewport centre `521`, top `68`, no overlap with the camera PiP; selecting Circle changed the Shapes button to `Shapes · Circle selected` and the glyph to a circle.
- Rendered student board: `http://127.0.0.1:4004/classroom/index.html?sessionId=ses_math_001&role=student&view=student&review=1795817530406&live=1795817530407` — dev label `DEV PAGE · Student shared whiteboard`, board opens, trainer-only tools hidden, no console errors.
- `node --check shared/fullBoard.js` passed.

## Implementation pass 3 — trainer dashboard, copilot, notifications

- Implemented compiled items 1–4.
- `trainer/index.html`: removed `#cameraOnlyBtn`; `#startClass` is the sole dashboard entry. Static toast bell replaced by `#notificationBtn` / `#notificationBadge` / `#notificationPanel` mailbox shell placed before `#profileBtn`.
- `trainer/app.js`: `openCameraPage` → `openConnectPage` with no `&camera=1`; `.ai-chips` and `[data-ask]` now paste into `#aiInput` and focus it without sending; `openPanel(true)` avoids focus overwriting pasted text. Trainer Desk replies now combine live signed-in-trainer pay/dashboard/attendance/leave records under **From your records** with the worker's **General Mathify policy**; no invented figures.
- Added `shared/notificationInbox.js` / `.css`: grouped RM/founder notices and parent messages, real combined unread count, detail view with Back, mark-read POSTs, safe fields only, conditional internal scroll.
- Updated `server/tests/rewardDeck.test.js`; aligned `server/tests/navContract.test.js` with the shared booking frame (`navContract: 225 assertions passed`).
- Rendered trainer dashboard: `http://127.0.0.1:4004/trainer/today?review=1795818026539&live=1795818026540` — dev label `DEV PAGE · Trainer dashboard / Start class`, no Camera only button, Start class present, bell before profile, no `href="#"`, no iframe. A copilot chip pasted `Differentiate today’s set` into `#aiInput` without creating a user message. Mailbox opened with close button and internal scroll; mock data honestly showed no notices/messages. No console errors.

## Implementation pass 4 — connect media controls

- Implemented compiled items 5–8.
- Added `shared/rtcMediaUi.js` / `.css` with `window.mathifyRtcMediaUi`, binding `ActiveSpeakersChanged`, `TrackMuted`, `TrackUnmuted`, `ParticipantDisconnected` and `Disconnected`, throttled `audioLevel` painting and teal/coral frame states.
- `classroom/connect.js`: mic/camera clicks now render optimistically, reconcile from the real LiveKit participant flags when the promise resolves, and restore the prior state with a status message on failure. Added request tickets so rapid toggles cannot overwrite each other.
- `classroom/connect.html`: added `#peerMic`, `#selfSpeaking`, `#peerSpeaking`, `#micLevel`, `#selfLevel`, `#peerLevel` and `[data-media-frame]` tile state attributes. The shared helper loads immediately before `connect.js`; forbidden session/app/livekit scripts remain absent.
- Updated `server/tests/cameraConnect.test.js` (+19 assertions; 46 total passed with `DATABASE_MODE=mock`).
- Rendered trainer connect: `http://127.0.0.1:4004/classroom/connect.html?sessionId=ses_math_001&role=trainer&view=trainer&review=1795818051495&live=1795818051496` — dev label `DEV PAGE · Shared connect page`, all eight new identifiers present, media helper loaded, no forbidden scripts. Mic/camera controls responded immediately; failed SDK calls in the mock reconciled back to real state. The only console error is the known mock LiveKit WebSocket failure.
- At this stage student connect used the same page and handed off to `index.html` on `classroomOpen`; that early behaviour was corrected in pass 8 — the child now waits on the camera feed and follows the trainer's explicit `board.opened` handoff instead.

## Implementation pass 5 — LMS / planner view-only

- Implemented compiled items 11–13 within the bounds of `PENDING_RULES.md`: trainer sees a view-only, batch-scoped assigned planner; all authoring and regeneration is founder-only; planner-agent mutation stays disabled; no planner content is fabricated.
- `lms/app.js`: `applyRolePresentation()` is now actually called (it was defined but never invoked), and `loadCatalog()` is awaited before the first count/card repaint. Trainer library now shows the real `60` catalog curricula instead of `00`; `New course`, `Import pack` and planner mutation surfaces are hidden for trainers, the planner button reads `Assigned planner`, and the role banner states the read-only policy.
- `lms/autoPlanner.js`: founder/planner-agent loads wait for a real curriculum and grade instead of calling `/api/lms/planner?subject=math`, which could only return `UNKNOWN_CURRICULUM`. No academic selection is guessed.
- Server planner read path: founder/planner-agent use `designSelection()`, family roles stay pinned to the stored child profile; non-founder cache misses return `409 PLANNER_NOT_GENERATED`, trainer edit/regeneration returns `403`, planner-agent mutation remains disabled. Added `server/services/plannerReadService.js` guidance to the read-only payload.
- Rendered trainer LMS: `http://127.0.0.1:4004/lms/index.html?role=trainer&review=1795818925488&live=1795818925489` — dev label `DEV PAGE · LMS curriculum library`, `60` curricula, `60` course cards, view-only banner, no authoring buttons, `Assigned planner`, no `href="#"`, no iframe, no console errors.
- Rendered founder LMS: `http://127.0.0.1:4004/lms/index.html?review=1795819072610&live=1795819072611` — dev label `DEV PAGE · LMS curriculum library`, authoring buttons present, `68` courses (60 catalogue + founder drafts), no 4xx requests, no console errors.
- Tests: `lmsClientContract` 30, `lmsPlannerAccess` 46, `plannerRead` 23, `plannerAgent` 42, `autoPlanner` 62, `subjectExpansion` 84 — all passed.
- Exact visual reference for the LMS layout was never supplied, so layout was not pixel-matched; the surface follows the existing Paper & Ink theme.

## Implementation pass 6 — temporary dev Ratio Railway planner fixture

- `scripts/fixtures/temporary-ratio-planner.json`: `id: dev_ratio_railway_v1`, `status: temporary_dev_fixture`, with the warning “Local test fixture only. Not a founder-generated planner. Never load in production.” It carries one continuous kid-friendly Mira story (`Mira and the Snack Cart`, railway stops Apple Orchard → Ribbon Bridge → Bead Garden) across 3 concepts × 3 practice questions (`dev_ratio_q1`–`dev_ratio_q9`). `completionRule.type=three_correct_unlocks_next_section`, `minimumCorrectPerSection=3`, plus `practiceRequiresCorrect`, `retestGeneratesReplacement` and `trainerOverride`. Answer keys, hints, explanations, trainer instructions and misconceptions exist in the fixture for trainer-side use only.
- `server/services/temporaryPlannerFixture.js`: `validate()` requires the dev status, story and questions; `build()` converts the JSON into the existing quiz shape plus a guide; `apply()` attaches `plannerGuide` and a `ready`/`draft` quiz to the selected session. `guideFor(session, 'trainer')` keeps all sections, story beats and trainer-only notes. `guideFor(session, 'student')` recalculates progress from live correct attempts, truncates concepts/story beats to the current section and emits question cards containing only `id`, `stem` and `image`; `answerIndex`, `hint`, `explanation`, `trainerInstructions` and `misconceptions` are never copied into the student view. `sectionStats()`, `pendingSection()` and `nextQuestionId()` implement the three-correct gate.
- `scripts/load-dev-planner-fixture.js`: explicit mock/dev loader (`node -r ./scripts/load-dev-planner-fixture.js server/index.js`; `MATHIFY_DEV_PLANNER_SESSION` overrides `ses_math_001`). It skips when `NODE_ENV=production`, creates no endpoint and no trainer mutation/generation path. `server/serializers.js` exposes the role-scoped `plannerGuide` on trainer/student session views and session state; sessions without the fixture omit the field.

## Implementation pass 7 — wrong-answer flow and retest

- Trainer `#quizPushBoard` / `pushQuizQuestionToBoard()` is an explicit **Explain on board** action. It sends only that exact current question's `{q, image}` to `window.MathifyFullBoard.pushQuestion`; options, answerIndex, hint, explanation, trainer notes and misconceptions stay in the quiz layer, and no render/state sync pushes automatically. The planner designer handoff is likewise stem/image only.
- **Retest** (`#quizRetest`) calls the existing `POST /api/trainer/sessions/:sessionId/quiz/new-check` with `replace: true`, the failed question id and the section concept/topic id. The server generates one AI parallel question, groups it under the requested section, replaces the failed card, clears its attempts/reveals and makes it current with `phase: 'recheck'`; the realtime payload carries no answer key. **New check on same concept** uses the same endpoint without `replace`; a labelled local scaffold is only the failure fallback.
- Unlock rule: `pendingSection()` returns `CURRENT_QUESTION_REQUIRED` (409) while the current question is unsolved, then `SECTION_PRACTICE_REQUIRED` (409) until 3 correct answers exist in that section. Ordinary quizzes keep `PARALLEL_CHECK_REQUIRED`. `#quizForceNext` / `force: true` remains an explicit trainer override, recorded with questionId, sectionId, forcedBy and timestamp.
- `server/tests/temporaryPlannerFlow.test.js` covers the fixture shape, student sanitization, launch, wrong-answer block, retest replacement/current/same-section grouping, nine retained correct answers through completion, guide counts and the student dashboard question-total delta. `server/tests/preflightFlow.test.js` covers the readiness gate below. Verification results will be appended in `E2E_LOG.md`; no test run is claimed here.

## Implementation pass 8 — readiness gate → camera → whiteboard

- New `classroom/preflight.html`, `classroom/preflight.js` and `classroom/preflight.css`: camera/microphone permission + preview, network check, mic/camera room presets forwarded to the camera page, and role-specific actions. Trainer **Join the session** POSTs an active `/api/sessions/:sessionId/presence` heartbeat, which starts the server-owned class clock. There is no student bypass button: once the child's own checks finish, the page opens the shared camera feed automatically with `clock=check`; the child never starts the clock. Preflight itself never joins a LiveKit room.
- Links now enter through preflight: trainer `Start class` (`trainer/app.js`), student join (`student/app.js`), subject panels, `apps.html`, unified shell “Join on this device”, and notification/reminder join URLs (`notificationService.js`, `parentReminderService.js`). PWA precache (`sw.js`) and shortcut (`webapp/manifest.webmanifest`) were updated too.
- Flow: preflight → shared full-screen camera page `classroom/connect.html` (self and peer feeds visible to both roles; the child waits there for the trainer). Trainer presence only updates the child's waiting copy. Trainer-only **Open whiteboard** publishes `POST /api/sessions/:sessionId/board/open` (`board.opened`), and the child follows that explicit event into the whiteboard; a child cannot publish the handoff. Then one explicit trainer **Share with kid** board action (`#shareBoardBtn`, `POST /api/sessions/:sessionId/board/share`) makes the board visible → close whiteboard (`#fullBoardFullscreen` → `backToCamera()`) returns to the camera page with `MATHIFY_STAY_PRESENT`, so clock and recording continue until **End session**. The camera page's preview room still cannot start attendance, pay or the clock by itself.
- This discontinues the page-9 page-movement flow as the session entry/advance path; page 9 surfaces are **not deleted** — engagement/reaction shell, network meter, session-detail sheet and other classroom surfaces remain in `classroom/index.html`.
- Founder-only planner generation/update remains intact. The exact production planner narrative and the exact LMS visual reference are still pending. All walkthroughs here are local mock HTTP (`127.0.0.1:4004`) only, with no fake LMS extraction.

## Final close-out status (2026-11-28)

- The compiled review list is implementation-complete except the items explicitly still blocked in `PENDING_RULES.md`. Trainer planner mutation is removed; trainers read only assigned planners. The browser `planner_agent` role remains disabled.
- Role-scoped MCP tooling is implemented: founder read/dry-run server, RM read-only desk with one draft-only pay-rate proposal, and planner designer with `review` and `author` profiles. The author profile files a pending suggestion for founder decision; there is no autonomous publish tool.
- Final verification: 65/65 deterministic suites (`EXITCODE=0`), mock master HTTP 26 pass / 0 fail / 5 skip, live read-only master HTTP 21 pass / 0 fail / 10 skip, and live companion HTTP 36 pass / 0 fail / 1 skip. Exact logs and commands are in `E2E_LOG.md`.
- Live read-only mode used real Supabase reads and a real AI chain ping; Razorpay, Twilio/WhatsApp, real Egress recording, live Realtime mode change, runner-based migration apply and signed iOS build remain honestly gated.
- This review log is now closed; no further development changes are pending from the compiled list.

## Engineering-quality close-out (2026-11-28)

- CI now fails on moderate audit findings, ESLint errors or any suite failure. `npm test` runs all 65 suites through `scripts/run-tests.js` under c8 and reports coverage to the console plus `coverage/` artefacts.
- The pre-commit hook runs lint-staged with ESLint and Prettier only on staged files. Private vulnerability reporting and standardized issue/PR templates were added.
- Demo passwords are no longer printed in active READMEs; they live in `server/.env.example` and `/api/auth/demo` remains disabled in production. Existing founder-only gates and the planner approval queue were unchanged.

## All-surface audio visual and camera look (2026-11-28)

- Founder question: “everywhere auditory visual feed should be displayed” and “backgrounds and blurring … if not implement it”. Both roles are now covered on the readiness gate, the shared camera deck and the in-session whiteboard PiP.
- Readiness gate: real local mic energy via `AudioContext` + `AnalyserNode`, a resume action for suspended contexts, and the same local background/lighting choices as the camera deck. It still never joins a LiveKit room and never starts the clock; only the trainer's Join heartbeat does that.
- Shared camera deck: unchanged honest analyser evidence, with local-only remote caveat. Its camera look now uses the shared stylesheet and the generated brand assets.
- In-session PiP: both trainer and kid tiles paint LiveKit `participant.audioLevel` through `shared/rtcMediaUi.js`, with teal speaking levels and coral only for muted. Local camera look can be opened from the small **Look** control and disables itself when the student's media controls are revoked. No second capture is created.
- The generated image service failed authentication, so the three branded Mathify presets are local SVG assets under `assets/camera-backgrounds/`. They are versioned, precached by the service worker and require no external image host.
- Presence, pay, class clock, recording, quiz correctness, permission state and the trainer-only board handoff were not changed. 65/65 suites pass with `DATABASE_MODE=mock`; focused counts are in `E2E_LOG.md`.

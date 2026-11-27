# Pending rules

Rules listed here are **not implemented**. Do not treat them as active policy until the founder supplies the final text and an implementation is completed and tested.

## NOT DONE · PENDING — RM fine revocation policy

- **Status:** NOT DONE / PENDING
- **Owner:** Founder
- **Requested on:** 2026-11-27
- **Founder note:** A future revoking policy will also give the relationship manager authority to revoke trainer fines.
- **Current active rule:** Fine and penalty changes remain founder-only. RM has read-only access to all trainer pay data and may edit only the shared demo/regular trainer pay rate. RM fine revocation is **not** enabled.
- **Rules still needed from the founder:**
  - Which fines an RM may revoke (late-join, short presence, child-gate, cancellation, or all).
  - Whether revocation needs founder approval or is a standalone RM action.
  - Any time window, evidence, or reason-note requirement.
  - Any monthly/per-trainer cap or audit fields.
  - Exact parent/facing wording and notification rules, if any.
- **Implementation gate:** Do not code this until the founder provides the exact policy. When implemented, it must remain fully audited and must not weaken the protected Founder’s Gratitude Gift or the founder’s unrestricted edit authority.

## NOT DONE · PENDING — Razorpay payments

- **Status:** NOT DONE / PENDING
- **Owner:** Founder
- **Requested on:** 2026-11-27
- **Founder note:** Two pending items remain beyond the app build: Razorpay and WhatsApp/Twilio.
- **Current active rule:** Razorpay remains credential-gated. No payment link, capture, refund or other billable/irreversible provider action is executed in tests or review runs.
- **Rules/details still needed from the founder:** live key mode and environment, account/settlement configuration, product/pack mapping, currency and tax behaviour, refund/cancellation policy, and approval wording.
- **Implementation gate:** Do not run live payment tests or create real payment links/captures until the founder supplies credentials and explicitly authorises a live check.

## NOT DONE · PENDING — WhatsApp / Twilio

- **Status:** NOT DONE / PENDING
- **Owner:** Founder
- **Requested on:** 2026-11-27
- **Founder note:** WhatsApp/Twilio delivery is the second remaining pending provider item.
- **Current active rule:** Twilio remains credential-gated. No real WhatsApp message is sent in tests or review runs.
- **Rules/details still needed from the founder:** Twilio credentials, sender/number, approved templates, recipient opt-in/consent records, retry/quiet-hour rules, failure escalation, and notification copy.
- **Implementation gate:** Do not send live WhatsApp messages or billable provider requests until the founder supplies credentials, templates, consent evidence, and explicit authorisation.

## NOT DONE · PENDING — global brand rename

- **Status:** NOT DONE / PENDING
- **Owner:** Founder
- **Requested on:** 2026-11-28
- **Founder note:** Keep `Mathify.` on every board watermark for now. The founder will later supply a new company name and ask for a line-by-line change across the whole project.
- **Current active rule:** Every board surface uses the quiet, non-interactive `Mathify.` watermark through `.mathify-board-mark`.
- **Rules/details still needed from the founder:** exact replacement name, whether the trailing period stays, and any legal/trademark wording.
- **Implementation gate:** Do not rename anything until the founder supplies the exact final name. The later pass must cover every occurrence line by line across HTML, JS, CSS, JSON, docs, manifests, native wrappers and tests.

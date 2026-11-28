## Summary

What changed, and why?

## Scope

- [ ] UI
- [ ] API / service
- [ ] Security / permissions
- [ ] MCP tooling
- [ ] Docs / verification only

## Verification

- [ ] `DATABASE_MODE=mock npm test` passes from `server/`
- [ ] `npm run lint` passes from `server/`
- [ ] `git diff --check` has no whitespace errors
- [ ] Relevant E2E log updated when behaviour changes
- [ ] Coverage report reviewed when logic changes

## Safety checklist

- [ ] No real credentials, tokens, KYC data, bank details or student records committed
- [ ] Founder-only actions remain founder-only
- [ ] Student payloads remain correctness-free until trainer reveal
- [ ] No autonomous planner publishing or trainer planner mutation
- [ ] `PENDING_RULES.md` updated if a blocked item changed status

## Founder approval

If this changes a policy item in `PENDING_RULES.md`, link the explicit founder decision.

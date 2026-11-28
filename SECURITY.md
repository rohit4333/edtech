# Security policy

Mathify takes security reports seriously. Please do not open a public GitHub issue for a
vulnerability, and do not include real student, parent, trainer or payment data in a report.

## Reporting a vulnerability

Email **security@mathify.app** with:

- a short description of the issue and the affected URL, endpoint or build;
- the steps needed to reproduce it;
- the impact you observed, including whether student data or credentials are exposed;
- any suggested mitigation, if you have one.

You should receive an acknowledgement within 3 business days. We may ask for more detail
before confirming the report. Please give us a reasonable opportunity to fix the issue
before public disclosure.

## What is in scope

- the Mathify web app, shared API, PWA shell and native wrappers;
- authentication, session isolation, role boundaries and whiteboard sharing;
- payment, KYC, recording and notification flows;
- the internal MCP servers and their token boundaries.

## What is out of scope

- reports that only restate a documented `PENDING_RULES.md` blocker;
- generic scanner output without a reproducible impact;
- social engineering of staff or other users;
- issues in third-party services that are not caused by Mathify configuration.

## Safe handling

Never send passwords, auth tokens, API keys, full KYC documents, bank details or live student
records by email. If you encounter production data while testing, stop, do not copy it, and
include only the minimum metadata needed to locate the problem.

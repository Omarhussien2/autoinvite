# Campaign Continuity 1.1 — Acceptance Report

Date: 2026-07-12
Branch: `codex/campaign-continuity-v1`
Base commit: `9b7b21c1c26e1796d73433e03775602b46f108b0`
Release decision: **GO for locked deployment; outbound activation remains NO-GO until server verification**

## Scope reviewed

- Additive `campaign_recipients` persistence and idempotent migrations.
- Atomic recipient claim, restart safety, durable stop, session-loss handling, and duplicate prevention.
- Campaign preflight, plan approval hash, fixed batches, Smart Schedule explanations, and Arabic RTL execution UI.
- Low-risk dependency updates from the same release branch.

The user-owned change in `src/middleware/quotaGuard.js` is excluded from this release. It must not be staged, committed, or deployed with Campaign Continuity 1.1.

## Evidence completed locally

| Check | Result |
|---|---|
| `npm ci` including postinstall | Passed |
| Canvas native build | Passed during clean install on Node `v24.12.0` |
| `npm test` | Passed, 65/65 after independent review fixes |
| EJS and browser JavaScript syntax | Passed |
| `git diff --check` | Passed |
| `npm audit` | 5 moderate findings remain through WPPConnect |
| Actual-send count during acceptance | 0 |

## Production-like CSV dry run

Source: `D:\Omar_Data\Downloads\azzam-glass-ready.csv`

- Source rows: 684
- Valid recipients: 684
- Invalid recipients: 0
- Duplicates: 0
- First normalized recipient: `رائد كمال عبد العال`, `966537083811`
- Rendered text: `مرحبًا رائد كمال عبد العال`
- Image generation: passed, 3,236,793 bytes; validation artifact removed
- Fixed batches: `100, 100, 100, 100, 100, 100, 84`
- Smart Schedule planned all 684 recipients
- WhatsApp/processBatch/provider calls: 0

## Continuity scenarios

- Restart skips `sent` and resumes `pending`.
- A durable stop prevents the next claim and cancels future scheduled jobs.
- Session loss after an uncertain attempt produces `needs_review` and leaves remaining recipients pending.
- Concurrent claims do not send the same recipient twice.
- Two tenants can run isolated campaigns concurrently.
- `MESSAGING_ENABLED=false` prevents the isolated staging recipient from being claimed or sent.
- The execution UI reads counters from the server snapshot; Socket.IO only requests refreshes.
- A campaign cannot start or run from the scheduler without a current approved plan; the scheduler revalidates the plan hash before opening WhatsApp.
- Test messages and inbox replies respect the same durable messaging gate as campaigns.
- Fixed-batch plans map around previously sent rows without dropping remaining recipients.

## Remaining outbound-activation blockers

1. SSH verification failed with `Permission denied (publickey,password)`; production Node, PostgreSQL, PM2, and schema versions remain unverified.
2. No authenticated staging deployment was available. The `MESSAGING_ENABLED=false` staging check is automated locally, not executed on the staging host.
3. `npm audit` reports five moderate vulnerabilities in WPPConnect's `file-type` and `latest-version -> package-json -> got` tree. The suggested forced fix downgrades WPPConnect to a breaking version and is rejected.
4. Database concurrency tests use a database boundary harness. Run the PostgreSQL concurrency checks in staging before outbound activation.

Local browser QA passed at desktop and 390px mobile widths. The execution page had no horizontal overflow, no overlapping controls, and no browser console errors.

## Approval criteria

The code may be deployed only while every tenant remains at `messaging_enabled=false`. Enable outbound messaging only after:

- server versions are captured;
- staging migrations complete twice without error;
- staging remains at `messaging_enabled=false` during dry checks;
- responsive UI and execution snapshots are verified;
- a separately authorized, single-recipient staging send is completed, if the release owner requests it;
- no unapproved WhatsApp send occurs;
- the release diff excludes `src/middleware/quotaGuard.js`.

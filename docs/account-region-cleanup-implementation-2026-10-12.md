# Account function regions and scheduled cleanup

Status: Gate1 approved, local implementation/validation and independent review complete; user approved Gate2 commit of the exact11files on2026-10-12. Push remains pending separate confirmation. Base branch codex/project-maintenance-20261011 at eb51137. No hosted migration, maintenance secret, cron activation or Production deployment performed.

## Resulting behavior

vercel.ts replaces vercel.json, using the named config export and pinned @vercel/config0.12.0. Build-time Production config selects sin1 for the account-image and maintenance functions; Preview/development selects hnd1. Other function regions are not overridden. Maintenance maxDuration60; cron0 18 * * * is emitted only for Production. Hobby scheduling is approximately01:00–01:59Vietnam, not precise or guaranteed; Vercel may miss/duplicate invocations and does not retry failures automatically. [Configuration](https://vercel.com/docs/project-configuration/vercel-ts), [cron operations](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [Hobby limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

GET /api/maintenance/account-images authenticates explicit Bearer CRON_SECRET before creating privileged dependencies. Missing configuration fails closed, wrong authorization401, query parameters400; unsupported methods405, including explicit HEAD to prevent Next's implicit GET invocation. All responses no-store; only sanitized aggregate counts/errors returned. Existing image GET/upload authorization, grants, cache behavior and upload cleanup RPC remain unchanged.

Worker acquires a90-second database lease with a durable owner cursor. At most20owners,20assets/owner,400candidates total, two parallel asset operations,45-second budget and5-second request timeout. Timeout stops new operations and retains the lease to expire: cancelling fetch does not prove SQL stopped. The cap does not promise400 completed deletes in one run.

Additive migration adds cleanup_attempted_at, a candidate index and a private singleton lease/cursor table. Owner cursor advances on acquire, including failed/crashed runs. Claims rotate least-recently-attempted assets to avoid repeated failed objects starving later candidates. Token, expiry, owner-list membership and one claim/owner/lease validated. Lock order singleton→account_settings→assets; current avatar/cover pointers excluded; existing one-hour pending/retired grace retained. SECURITY DEFINER empty search_path, fully qualified objects, lock_timeout2seconds. EXECUTE only service_role; private table has no browser/service direct grants. Existing reserve/upload cleanup functions are compatible.

Canonical UUID owner/id/kind/path equality is mandatory before Storage operations. Registry delete follows confirmed exact-path Storage deletion; an empty removal response requires strict authenticated metadata-not-found confirmation. Registry deletion filters id/owner/path/state deleting. Ambiguous timeout/error leaves retryable rows. No new service credential is exposed to browser code.

## Local evidence and review

- TDD new DB/worker modules initially failed before implementation; Vercel test failed for missing vercel.ts before configuration replacement. Sandbox child-spawn failure was re-run outside sandbox and not counted as a product regression.
- Main verified scheduled cleanup DB fresh/upgrade and idempotent migration:20owner wrap with21owners, >20asset rotation/poisoned first20, lease busy/expiry/token/owner/replay, grace/current pointers and service-only grants. Attach-first/claim-first tests are sequential PGlite outcomes, not real concurrent PostgreSQL sessions.
- Existing npm run test:db passed all schema/group/account/Storage checks; standalone cleanup DB test passed. New cleanup test is now wired into test:db.
- npm run test:api passed existing movie/image suites plus new worker/route checks:400cap,concurrency2,timeout halt/no later writes, retry and provider error shapes, malformed RPC/path, actual route imports, auth fail-before-admin, unsupported methods/no-store and sanitized output.
- npm test67/67, npm run typecheck and npm run build PASS. node tests/vercel-config.mjs PASS in isolated Production/Preview/development/unset processes; exact two function scopes, no global region override, Production-only cron and exact dependency/version/integrity checked. Exposed as npm run test:config.
- Independent code/security review found no blockers in DB/worker/API/config/tests. No hosted source validation claimed.

## Required TEST / Preview acceptance

After exact Gate2 commit/push approval, verify Vercel understands the named programmatic config and both functions run hnd1. Before calling maintenance, obtain separate approval for the exact hashed TEST migration, then user-configure a unique TEST CRON_SECRET with hidden-input workflow and redeploy Preview. Do not alter Production secrets.

Guard disposable TEST fixtures by owner/run/path allowlists. Confirm current/fresh images protected, aged candidates removed, failed removal/registry retry, overlap busy, lease expiry, cursor/asset fairness and cleanup teardown. Inspect actual Storage remove/info responses and not-found confirmation. Measure query plans, execution/lock contention and timeout behavior. acquire DISTINCT scans globally eligible assets despite output cap; lock_timeout alone is not a total statement deadline. These are release requirements, not already proven by local tests.

Production sin1 configuration is locally checked; actual invocation requires separately approved release smoke testing. Cron targets Production only, so Preview manual invocation cannot prove its delivery schedule. Monitor missed/partial cleanup/backlog and use authenticated manual retries when needed.

## Migration/rollback sequence

Run only after existing account feature migration. Preserve bootstrap/repair policy order described in readiness docs; never bootstrap schema.sql over existing Production tables. New migration is additive. Review SQL hash/statement scope and backup immediately before execution; test first. App rollback can leave additive column/index/table/RPC objects intact. Disable/update active cron explicitly: InstantRollback does not update the active cron. Verify the actual currently assigned Production deployment before approving any rollback target.

Fresh read-only Production public/auth/private snapshot and scoped local restore are documented separately in account-backup-restore-preparation-2026-10-12.md. Archive/Auth/raw evidence remain outside Git. This is not full managed DR, ownership/role-membership or runtime Auth recovery proof.

## Exact Gate2 proposal:11files

1. Delete vercel.json.
2. Add vercel.ts.
3. package.json.
4. package-lock.json.
5. app/api/maintenance/account-images/route.ts.
6. lib/account-image-cleanup-server.ts.
7. supabase/migrations/20261012_account_image_scheduled_cleanup.sql.
8. tests/account-image-cleanup-api.mjs.
9. tests/account-image-cleanup-db.mjs.
10. tests/vercel-config.mjs.
11. docs/account-region-cleanup-implementation-2026-10-12.md.

Message: feat: schedule bounded account image cleanup by environment

PLAN/readiness/handoff/planning/backup documents and prior maintenance changes are excluded from this application commit. No commit/push/hosted migration/key setup/Production merge or deploy without its applicable approval.

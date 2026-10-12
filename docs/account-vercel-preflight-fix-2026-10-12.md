# Vercel TS configuration preflight compatibility

Status: Gate1 approved, local fix/verification complete; user approved Gate2 exact3file commit and Preview push on2026-10-12. Basea8331a0. No hosted fix acceptance or Production release claim.

## Failure and change

Preview BhL4deDV7DkuTbi7FGY3of57N6Pw failed before build with regions should NOT have fewer than1items. Existing runtime Node imports produced correct nonempty regions, but did not cover static extraction. Actual @vercel/static-config3.4.4 rejects the old [region] export with Unhandled type Identifier. Its message differs from hosted validation, so exact hosted compiler/version/mechanism is still unproven.

vercel.ts now exports a literal initial Preview config: account image and maintenance functions hnd1, maintenance maxDuration60, crons empty. An external strict VERCEL_ENV==='production' condition replaces the functions with literal sin1 values and adds the same daily cron. No dependency, route, SQL, secret or grant changed.

## Verification

- TDD genuine RED: newly added TypeScript AST regression rejected the old export with configuration preflight requires literals; found Identifier.
- GREEN: node tests/vercel-config.mjs passed. AST extraction accepts only bounded literal structures, rejects identifiers/conditionals/spread/computed keys, enforces a single exported const config and compares the extracted initial metadata to exact Preview expectations. Runtime fresh-process checks still verify production/preview/development/unset behavior, function scoping and pinned dependency. Sandbox spawn failure was rerun escalated and not counted as product failure.
- Main independently ran the real ignored vendor extractor @vercel/static-config3.4.4: exact two hnd1 function definitions, maintenance maxDuration60 and empty crons returned successfully. This is independent of the custom AST test; it is not the hosted compiler itself.
- npm run typecheck and npm run build PASS, Next.js16.4.0. Scoped diffcheck PASS.
- Independent code/security review found no source/test blockers. No database/API behavior changed, so previously passed package suites were not unnecessarily repeated for this config-only repair.

## Release limitations and next acceptance

New hosted Preview must build and confirm both functions actually run hnd1, Preview crons remain empty and cleanup fails closed before TEST migration/secret setup. Do not label the workaround successful on hosted infrastructure before these checks.

**Production resolution remains a release blocker.** A static-only platform would read hnd1/emptycron even in Production, despite local runtime returning sin1/dailycron. Before publishing Production, verify its resolved platform configuration without activating/publishing it if supported; otherwise prepare the separately approved deterministic static release-branch alternative. No Production deployment or automatic cron activation is authorized by this fix.

Sources: [official static extractor](https://github.com/vercel/vercel/blob/main/packages/static-config/src/index.ts), [runtime compiler](https://github.com/vercel/vercel/blob/main/packages/cli/src/util/compile-vercel-config.ts), [configuration documentation](https://vercel.com/docs/project-configuration/vercel-ts).

## Exact Gate2 scope

1. vercel.ts
2. tests/vercel-config.mjs
3. docs/account-vercel-preflight-fix-2026-10-12.md

Message: fix: keep Vercel preflight configuration literal

Commit on codex/project-maintenance-20261011 and push Preview only after exact approval. Prior a8331a0 push approval does not cover this new commit. Progress/planning/backup docs and ignored vendor tooling/raw evidence are excluded. No hosted migration, service secret, merge or Production deploy.

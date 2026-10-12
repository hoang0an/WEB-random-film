# Reject animated PNG account uploads

## Problem and resulting behavior

The accepted eadba47 Preview accepted a valid two-frame APNG upload with HTTP 200, although account images must be static. Sharp exposes the fixture as pages=1, so the existing page-count check did not detect PNG animation.

The fix scans PNG chunk boundaries before decoding and rejects animation chunk types acTL, fcTL and fdAT, including one-frame APNG. Declared lengths are checked against remaining bytes before reading or advancing; truncated chunks return 400. Text containing animation names inside a normal chunk payload is accepted. Sharp continues to decode, validate MIME/pixel/page limits, rotate and normalize static images to WebP.

Invalid normalization never reserves/uploads a new asset or performs post-registration cleanup. The existing authenticated pre-normalization expired-asset cleanup in the Route Handler is preserved.

## Verification and review

- RED: node tests/account-images-api.mjs failed before the source change: valid two-frame APNG returned 200, expected400.
- GREEN: npm run test:api passed the full mocked API suites, including valid two-/one-frame APNG, individual animation chunks, truncated signature/header/payload/CRC, oversized lengths, PNG tEXt containing chunk names, JPEG/static WebP success and animated WebP rejection. Helper and real Route Handler mocks verify no new writes for rejected input.
- npm test: 67/67 passed; npm run typecheck passed; npm run build passed (Next.js16.4.0); git diff --check passed for the implementation/test scope.
- Independent code/security review found no blockers: bounded offset arithmetic, guaranteed loop progress, chunk-boundary matching and unchanged authentication/GET grants/cache headers. Review was static; main ran the suites.

This is locally validated source, not a deployed Preview fix. Hosted boundary acceptance must run after separately approved commit/push; the existing Preview remains eadba47 with the APNG defect. No claim of full PNG format/CRC validation beyond Sharp's decoder behavior is made.

## Gate 2 commit proposal

Exact three-file scope:

1. lib/account-images-server.ts
2. tests/account-images-api.mjs
3. docs/account-apng-display-validation-fix-2026-10-12.md

Suggested message: fix: reject animated PNG account uploads

Target branch: codex/project-maintenance-20261011. User approved Gate 2 on 2026-10-12: commit exactly these three files and push the Preview branch. Broader PLAN/readiness/handoff/maintenance changes and ignored raw QA files are excluded. Hosted acceptance follows deployment and is reported separately. No new dependency, migration, Storage policy, key, region/cron change, merge or Production deployment.

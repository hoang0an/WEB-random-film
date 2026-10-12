# Account image latency — measured baseline and Gate 1

Status: user approved Gate 1 and Gate 2 for the exact two-file commit/push; the local per-function region configuration is implemented and reviewed. The live baseline remains Preview commit `1d96fab`; the new Preview must still be verified for placement and performance. This plan supersedes the earlier initialProfile-first proposal in PLAN.md.

## Evidence

Preview: https://randomfilmkietgay-k9m2gvrtm-hoang0an.vercel.app/

Computer Use reproduced delayed images on QA B. Chrome DevTools then measured three refreshes and three panel opens in the same session, using Resource Timing and DOM image completion. All persisted evidence contains operation names and timings only, without request headers, bodies, tokens, passwords or full image paths.

| Observation | Minimum | Median | Maximum |
| --- | ---: | ---: | ---: |
| Avatar GET, six requests | 1740 ms | 2384 ms | 2670 ms |
| Cover GET, three requests | 2341 ms | 2720 ms | 2849 ms |
| API body end to visible completed image, nine images | 171 ms | 227 ms | 314 ms |
| Header avatar ready after refresh, three runs | 3370 ms | 3843 ms | 4106 ms |
| Panel avatar ready after panel mount, three runs | 2739 ms | 3585 ms | 3621 ms |
| Panel cover ready after panel mount, three runs | 3529 ms | 3745 ms | 4384 ms |

Cross-origin Auth/RPC timings expose duration but not detailed TTFB, because response timing access is restricted. The same-origin image GET exposes TTFB/body end. Most GET time was waiting for the response, with body transfer around 0.2s for avatars and 0.39–0.44s for covers. Rendering follows the final browser Auth check; image readiness occurred roughly 5–10ms after that Auth request finished in these samples.

Vercel log for an independent successful avatar GET at 15:43:56 GMT+7 shows: ingress Hong Kong `hkg1`, function Washington `iad1`, execution 2.90s, response 3.3s. The four external calls are test Supabase Auth, first permission RPC, Storage, final permission RPC. Hobby log view does not expose individual external-call latency; no paid upgrade is needed for this investigation.

Supabase Infrastructure for **test** `dgivczwqlzxcvxwzpadm` confirms Tokyo `ap-northeast-1`. Current Production Supabase region was not inspected.

The API/server segment is the dominant measured delay. The distance between Washington and Tokyo is a strong explanation to test, not yet a proven performance improvement. Starting image reads from initialProfile would remove only the profile wait and would leave most GET delay.

Local artifacts, ignored by Git:

- `test-results/account-hosted/account-image-network-baseline.json`
- `test-results/account-hosted/account-image-opening-baseline.json`
- `test-results/account-hosted/account-image-iad1-log.png`
- `test-results/account-hosted/account-image-test-tokyo-region.png`

## Approved Gate 1 scope

1. Add one `vercel.json` per-function override for `app/api/account/images/route.ts` to Tokyo `hnd1`, with the Vercel schema URL. Verify the source matcher and allowed single-region behavior on this Hobby project; do not change global project settings if the platform rejects the override.
2. Keep application code and security behavior intact: real server Auth, two permission RPCs with final grant after buffering, ten-second server deadline, no-store headers, browser final actor guard, no signed URLs or Blob cache. No SQL, service keys or environment values change.
3. This route serves **GET and POST**, so both image reads and uploads move region. No other route is intentionally moved. The branch configuration affects its new Preview deployment; if later merged, it will also apply to Production. Verify Production's data region before any release approval.
4. Validate JSON/schema as available, build/typecheck and independent configuration/security review. Record an exact commit manifest and present Gate 2 before commit/push. Next's installed `preferredRegion` guide explicitly deprecates route exports, so do not add that export.
5. After an approved Preview push, confirm real invocations run at `hnd1` from Vercel logs. Repeat the same three refreshes and three panel opens; compare both GET duration and image readiness. Acceptance target: at least 30% lower median GET latency, with no permission/cache regressions. This is a target, not a promised result.
6. Recheck QA owner images, peer avatar/owner-only cover, denied access, no-store, and a small upload. If routing is wrong or performance does not improve, report it and reassess before changing Auth or permissions. Rollback is removal of the exact per-function override followed by an approved Preview deployment.

Expected implementation manifest: `vercel.json` plus this result/plan document, updated around actual validation. PLAN.md stays the local handoff. No new application tests that merely mirror a static configuration are planned; the meaningful proof is deployment routing and live acceptance.

## Sources checked

- Installed Next guide: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/preferredRegion.md` — deprecated, remove export.
- [Vercel per-function regions](https://vercel.com/docs/functions/configuring-functions/region#per-function-configuration)
- [Vercel JSON function regions](https://vercel.com/docs/project-configuration/vercel-json#per-function-regions-and-functionfailoverregions)
- [Vercel region codes](https://vercel.com/docs/regions)

## Implementation and validation

Added `vercel.json` with this exact configuration:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "functions": {
    "app/api/account/images/route.ts": {
      "regions": ["hnd1"]
    }
  }
}
```

- `npm.cmd run build`: PASS with Next 16.4.0; `/api/account/images` remains a dynamic Node route.
- `npm.cmd run typecheck`: PASS.
- JSON validation: PASS against the applicable official Vercel schema fields (`$schema`, `functions`, function key pattern/limits, `regions`). The local PowerShell validator could not parse the full draft-04 schema, so it validated a stricter projection of these fields; this is not a full platform build or project-plan eligibility check. Schema artifacts remain ignored in `test-results/account-hosted` and no validator dependency was installed.
- Independent configuration/security review: no blocker. No changes to application source, Auth, permissions, cache headers, runtime, SQL or environment values.
- `git diff --check`: PASS; only pre-existing CRLF normalization warnings in unrelated maintenance documents.

Next local build does not validate Vercel function placement. The exact matcher, Hobby project support, real `hnd1` invocation and latency gain must be confirmed after the approved Preview push. Do not silently widen to project-wide regions if deployment rejects the configuration.

## Gate 2 manifest

Commit exactly these two files:

1. `vercel.json`
2. `docs/account-image-latency-plan-2026-10-12.md`

Proposed message: `perf: colocate account image API with test storage in Tokyo`.

User approved Gate 2 on 2026-10-12: commit exactly this manifest and push only branch `codex/project-maintenance-20261011` to create Preview, then verify real routing, repeat the measured baseline, and check image permissions/no-store/upload. Other local maintenance/acceptance changes and PLAN.md are excluded. No SQL migration, global project setting change, merge or Production deployment is authorized for this region trial. Hosted results will be recorded in PLAN.md after the approved push.

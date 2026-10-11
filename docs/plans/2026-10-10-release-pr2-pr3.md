# Phát hành PR #2 rồi PR #3 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Phát hành TMDB API Key trước, sau đó quản lý đóng góp/nhóm, có kiểm soát deployment, dữ liệu và rollback.

**Architecture:** Production dùng Supabase riêng, không trỏ vào project nghiệm thu. Tách merge mã, staged build, migration và promotion thành các checkpoint có bằng chứng. PR #3 chỉ đổi base về main sau #2 merge và review lại diff.

**Tech Stack:** Next.js 16, Node 24, Vercel, Supabase Auth/PostgreSQL/RLS, SMTP, TMDB.

---

## Trạng thái và giới hạn

Đây là kế hoạch, chưa thực hiện thay đổi Production hay merge. Ngày 10/10 đọc lại Vercel project `randomfilmkietgay`: main tự tạo Production Deployment, Auto-assign Custom Production Domains bật; Project → Production không có Environment Variables. Shared variables cần kiểm tra riêng trước phát hành. Không coi domain randomfilm.cc là sở hữu của người dùng; dùng domain Vercel được xác nhận. Project `dgivczwqlzxcvxwzpadm` là thử nghiệm dù dashboard gắn nhãn main Production.

PR #2 draft/head `9eafeabaa5227e5a0655e0ea898d0d6513b603f7`, main `0d9722c7704a0abd934db81c356bd6f5b1198410`. PR #3 draft, base nhánh #2. SHA là snapshot: đọc lại trước từng bước. Dùng @executing-plans; chỉ bắt đầu các task thay đổi Production sau khi người dùng cho phép rõ phạm vi. Không mua gói/domain và không nhập bí mật thay người dùng.

### Task 1: Chốt release và đường rollback

**Files:** Read `docs/pr-2-final-review-2026-10-10.md`, `docs/group-management-acceptance-2026-10-10.md`; Create `docs/release-execution.md` (khi thực hiện).

1. Đọc PR #2/#3 và main hiện tại; ghi SHA, trạng thái draft/merge/checks. Dừng nếu có diff mới chưa review.
2. Đọc Vercel Current deployment id/SHA/domain, Git integrations, shared env names và branch policy; không đọc secret ra log.
3. Ghi deployment trước phát hành có thể rollback, người chịu trách nhiệm, cửa sổ thực hiện và tiêu chí dừng. Nếu rollback về demo làm người dùng mất khả năng dùng nhóm thật, nêu rõ; không chuyển sang Supabase thử nghiệm.
4. Chạy `npm test`, `npm run test:db`, `npm run test:api`, `npm run build`, `npm run typecheck`, `git diff --check` ở đúng SHA PR. Mong đợi tất cả exit 0. Ghi kết quả vào release-execution, commit chỉ tài liệu không chứa secret.

### Task 2: Kiểm soát merge → Production

**Files:** Create `vercel.json` trong PR kiểm soát phát hành riêng **nếu** chọn merge mà không tạo Production deployment; Read `docs/pr-2-final-review-2026-10-10.md`.

1. Chọn một cơ chế với người dùng: chặn hoàn toàn auto-deploy main, hoặc cho phép staged Production build. Tắt auto-assign chỉ ngăn gắn domain, **vẫn tạo Production Deployment**; chưa đáp ứng quyền hiện tại.
2. Với merge không deploy, nội dung dự kiến:

```json
{"$schema":"https://openapi.vercel.sh/vercel.json","git":{"deploymentEnabled":{"main":false}}}
```

3. Trước bất kỳ commit main nào, xác minh cấu hình này được áp dụng ngay trên commit đó bằng canary ở project/nhánh thử có cùng tích hợp. Kiểm tra không có wildcard true khớp main, hook/CLI/integration khác. Nếu không chứng minh được, giữ cả PR chưa merge. Không tự đổi production branch để lách kiểm soát.
4. Sau quyền Production riêng, staged option: tắt Auto-assign Custom Production Domains, lưu, đọc lại; ghi domain Current. Sau merge kiểm tra deployment Staged và Current không đổi. Manual `--prod` vẫn là deployment cần quyền riêng.
5. Ghi bằng chứng lựa chọn vào release-execution. Không bật auto-merge. [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration), [staged build/promotion](https://vercel.com/docs/deployments/promoting-a-deployment).

### Task 3: Chuẩn bị Supabase Production riêng và baseline #2

**Files:** Read `.env.example`, `supabase/schema.sql` **ở head #2**, `supabase/audit-preview-group-access.sql`; Create backup ngoài Git (khi thực hiện).

1. Xác nhận project/ref Production riêng. Người dùng tự hoàn tất đăng ký/điều khoản hoặc mật khẩu nếu cần; không nâng cấp trả phí.
2. Kiểm tra schema và dữ liệu hiện có. Nếu không trống, backup schema/data và kiểm tra khôi phục trên project thử trước; lập migration chênh lệch có review. Không chạy bootstrap lên DB có dữ liệu.
3. Với DB mới trống, lấy baseline đúng PR #2 (`git show 9eafeabaa5227e5a0655e0ea898d0d6513b603f7:supabase/schema.sql`) và áp dụng tại project đã xác nhận sau quyền Production. Không dùng schema của PR #3 để phát hành #2 rồi gọi là baseline #2.
4. Kiểm tra bảng profiles/groups/members/group_movies/ratings/comments, trigger profile, RLS, anonymous/authenticated grants và các RPC baseline. DB cũ cần đối chiếu thêm `supabase/migrations/20261009_movie_genres.sql`; schema baseline mới đã có genres. Audit script chỉ dùng sau đọc và thay fixture test cho project đã xác nhận; không chạy nhầm fixture Preview trên Production.
5. Nghiệm thu hai tài khoản chỉ dữ liệu release-test: người ngoài không đọc nhóm, direct writes bị chặn, owner/member baseline đúng. Ghi counts, timestamp và schema fingerprint; không ghi id/secret từ auth export vào Git.

### Task 4: Cấu hình Production env, SMTP và redirect

**Files:** Read `.env.example`, `lib/auth-redirect.ts`, `lib/auth-service.ts`, `app/auth/callback/page.tsx`, `app/auth/reset-password/page.tsx`; Modify chỉ dashboard Production sau quyền riêng.

1. Vercel Production: `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_ANON_KEY` của project Production; `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=false`. Không dùng service_role/secret key.
2. Đặt **một** credential máy chủ `TMDB_API_KEY` (key v3) hoặc `TMDB_READ_ACCESS_TOKEN` (Bearer), kiểm tra trim/fallback; không đặt tiền tố NEXT_PUBLIC. `CINEMA_QA_BUILD` không được có trên hosting. Kiểm tra Shared env không vô tình ghi đè/mang test ref.
3. Supabase Auth: bật email/password và email confirmation, Site URL là HTTPS domain Production chính xác. Allowlist exact `/auth/callback` và `/auth/reset-password`; đối chiếu `auth-redirect.ts` trước lưu. Nghiệm thu cả đăng ký qua invite có query string; chỉ bổ sung pattern query trên đúng HTTPS host/path nếu redirect không khớp, không wildcard domain/path Production. Preview/test giữ ở project thử nghiệm. Kiểm tra Email templates giữ đúng ConfirmationURL, không thay token link bằng SiteURL.
4. SMTP Production: tận dụng nhà cung cấp hiện có chỉ khi sender được phép gửi tới người dùng thật. Gmail app-password đang dùng cho nghiệm thu không chứng minh sẵn sàng production. Nếu cần domain riêng/verification chưa sở hữu, đây là gate người dùng quyết định/chuẩn bị; không mua. Người dùng nhập SMTP secret trực tiếp, agent thêm DNS mail-only tại domain đã xác nhận sở hữu, không đổi nameserver/website.
5. Xác minh sender, SPF/DKIM nếu dịch vụ yêu cầu, trạng thái domain, SMTP host/port/TLS, giới hạn Auth/email và link expiration. Gửi tới email được người dùng chỉ định; đọc Auth logs phân biệt SMTP rejection, rate limit và token cũ. Không tắt email confirmation để vượt nghiệm thu.
6. Sau cấu hình env, rebuild đúng SHA; env NEXT_PUBLIC là build-time, không coi đổi dashboard đã cập nhật bundle. [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

### Task 5: Phát hành #2 và smoke test

**Files:** Modify `docs/release-execution.md`; Test `tests/api.mjs`, báo cáo account Preview hiện có.

1. Yêu cầu quyền merge #2 cụ thể chỉ sau task 1–4 đã review. Kiểm tra lại head/base/checks và cơ chế deploy; squash merge nếu phù hợp branch rules. Ghi merge SHA, không bật auto-merge.
2. Xác minh Vercel đúng hành vi đã chọn: chặn hoàn toàn không tạo job Production, hoặc staged build đúng SHA/env Production và Current giữ nguyên. Khi staged build gặp failure, dừng không promote.
3. Kiểm thử staged domain theo exact redirect đã cho phép: đăng ký/xác nhận email mới nhất, login, reload, logout, recovery, mật khẩu cũ bị từ chối/mới hoạt động (người dùng tự nhập). Google tắt. TMDB search/add phim và điểm/bình luận baseline, hai phiên riêng, RLS REST.
4. Chỉ promote khi người dùng cho phép website production cập nhật, sau kết quả trên; xác minh domain Current/SHA. Smoke lại trên domain chính, theo dõi Auth/API/Vercel errors 15–30 phút và rate limits. Không ghi password/token/link email vào báo cáo.
5. Nếu auth/mail/search/permissions lỗi nghiêm trọng, dùng rollback task 8, không tiếp tục #3.

### Task 6: Đổi base #3 về main và review diff sau #2 merge

**Files:** Review toàn bộ diff #3, đặc biệt `components/cinema-app.tsx`, `lib/group-permissions.ts`, `lib/repository-errors.ts`, `supabase/schema.sql`, `supabase/migrations/20261010_group_self_management.sql`, `tests/`.

1. Fetch origin, ghi SHA main mới và base cũ #2. Backup nhánh #3 bằng ref riêng trước rebase nếu lịch sử squash gây commit trùng.
2. Đổi base PR #3 sang main; đọc diff thực tế. Nếu chỉ retarget đã đúng, không rewrite lịch sử. Nếu PR chứa lại #2 do squash, rebase chỉ các commit sau head #2 cũ lên main với ref đã kiểm tra; chỉ force-with-lease vào nhánh #3 khi được phép rewrite, không force main.
3. Commands để review: `git diff --stat origin/main...HEAD`, `git diff origin/main...HEAD`, `git log --oneline origin/main..HEAD`. Kỳ vọng chỉ quản lý nhóm, migration/tests/docs; không đưa lại TMDB fix #2 hoặc dữ liệu local QA.
4. Chạy full unit/DB/API/build/typecheck ở head mới; redeploy Preview và kiểm tra A/B, permissions, polling, deletion/leave, lỗi mạng fixtures và race DB thật. Dùng `tests/group-management-testing.md`; không dùng password Production cho harness thử nghiệm.
5. Cập nhật báo cáo và request review head mới. Giữ #3 draft/chưa merge nếu còn khác biệt hoặc checks chưa đạt.

### Task 7: Migration bổ sung và phát hành #3

**Files:** Apply chỉ `supabase/migrations/20261010_group_self_management.sql`; Modify `docs/release-execution.md`.

1. Snapshot backup/counts của sáu bảng Production, kiểm tra restore riêng; xác nhận chỉ project Production đúng ref, migration chưa áp dụng. Không chạy lại `schema.sql` trên DB hiện có.
2. Sau quyền migration Production riêng, chạy additive migration trước app #3. Kiểm tra transaction success, counts giữ nguyên, sáu RPC mới execute authenticated/không anonymous, private helper lock và RLS còn bật; ghi migration checksum và thời điểm. Baseline app #2 phải tiếp tục hoạt động.
3. Nếu migration thất bại, kiểm tra trạng thái transaction và catalog; không chạy lại bootstrap. Sửa trên Preview/test rồi review lại trước retry Production.
4. Sau review task 6 và quyền merge #3, kiểm tra lại SHA và merge. Xác minh staged build/current như task 5. Smoke trên dữ liệu mới release-test: member chỉ xóa pending của mình, owner xóa pending bất kỳ, watched không xóa; own rating/comment; rename bảo toàn invite; owner không leave; member leave chặn GET/RPC rồi rejoin không trùng; nhóm riêng B ẩn A.
5. Chỉ promote sau quyền riêng và các smoke đạt. Kiểm tra desktop/mobile, focus, auth/mail, search và errors sau phát hành; dữ liệu người dùng không dùng để thử delete/leave.

### Task 8: Rollback có kiểm soát

**Files:** Read migration và deployment trước; Modify `docs/release-execution.md`.

1. Dừng promotion/đợt kế tiếp khi có leak RLS, mất dữ liệu, auth lỗi diện rộng hoặc mutation không đúng quyền. Ghi SHA/deployment/time và phạm vi, không dump token.
2. Sau quyền rollback, rollback deployment về bản Production đã ghi ở task 1 (#3 → #2; #2 → bản trước), kiểm tra Current/domain và smoke. Git revert riêng sau review để push sau không phát hành lại lỗi; revert không đồng nghĩa deployment rollback.
3. Giữ additive DB schema khi rollback app #3, vì #2 không gọi RPC mới. Nếu cần ngăn writes mới, review revoke EXECUTE đúng sáu chữ ký trong migration, giữ helper khóa chung; không DROP bảng hoặc chạy bootstrap. Xác minh clients cũ nhận denial và baseline đọc/ghi vẫn đạt.
4. Hard delete không có thùng rác: rollback mã không khôi phục phim/điểm/bình luận đã xóa. Chỉ restore dữ liệu được xác nhận từ backup sang DB cách ly trước, review rows bị ảnh hưởng và writes mới; không restore toàn DB đè dữ liệu hiện tại tự động.
5. Lỗi SMTP/redirect: khôi phục cấu hình đã snapshot an toàn, tạo thư mới tới email thử; không tái dùng link đã tiêu thụ/hết hạn. Các secret chỉ nhập vào dashboard/secret store, không tài liệu.
6. Ghi phần phục hồi/chưa phục hồi, không tự bật auto-deploy hay mở lại phát hành. Hoàn tất với báo cáo từng luồng và quyền cho đợt tiếp theo.

## Điều kiện chưa đủ hiện tại

Production chưa có env/project Supabase riêng được xác nhận, sender/domain production chưa sẵn sàng, cơ chế chặn auto-deploy chưa canary, chưa có backup/restore nghiệm thu production và chưa kiểm thử domain chính. Điện thoại vật lý/iOS, kéo dài request vô hạn, stress tải lớn và mọi isolation level không được suy ra từ Preview. Kế hoạch này không cấp quyền thực hiện các bước đó.

## Bộ chuẩn bị đã hoàn tất sau nghiệm thu bổ sung

Xem `docs/release-execution.md`: snapshot/checks, cấu hình dự kiến từng trường, SQL manifest/preflight và rollback privileges. Người dùng chốt nhóm nhỏ/Gmail; đề xuất staged Production sau một lần duyệt toàn phạm vi, không chọn merge-không-build chưa canary. Mobile B Chromium320/375 và 3 ca deadline đã đạt; lỗi request treo đã sửa, 8 ca lỗi mạng chạy lại đạt. Chưa merge, chưa tạo/cấu hình/deploy Production. Production mail/redirect/backup-restore/smoke vẫn là gates thực hiện sau duyệt, không kết luận đã nghiệm thu.

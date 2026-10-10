# Bộ chuẩn bị phát hành #2 → #3 — 10/10/2026

**Trạng thái: chuẩn bị, chưa được duyệt thực hiện.** Không merge, không tạo project Production, không lưu cấu hình Production, không promote. Người dùng chọn phát hành nhóm nhỏ, dùng Gmail hiện có; không mua gói/tên miền. Các mục sau là thay đổi cụ thể dự kiến, không phải kết quả Production đã đạt.

## Snapshot đã đọc trực tiếp

| Thành phần | Hiện trạng | Thay đổi chờ duyệt |
| --- | --- | --- |
| GitHub #2 | Draft/open, head `9eafeabaa5227e5a0655e0ea898d0d6513b603f7`, base main | Merge trước, sau kiểm tra gates |
| GitHub #3 | Draft/open, base nhánh #2; head trước đợt sửa `65d26cec25534a00ecb8b526deb55fc03a16fd61` | Sau #2 đổi base main, review diff thực tế, chạy lại checks/Preview; sau đó merge |
| Vercel | `randomfilmkietgay`, Hobby, repo hoang0an/WEB-random-film; main tự tạo Production, Auto-assign bật | Tắt Auto-assign, đọc lại, dùng staged Production builds rồi promote sau smoke |
| Production hiện tại | Current `4Pya1MYx5D5ABxuZiFQ9JA4wLkLe`, SHA `0d9722c7704a0abd934db81c356bd6f5b1198410` | Giữ làm rollback #2; ghi riêng deployment #2 đạt làm rollback #3 |
| Domain | `randomfilmkietgay.vercel.app` hiện có; www.randomfilm.cc cũng nằm trong project nhưng người dùng không sở hữu | Dùng domain Vercel cho Auth; không DNS hay thêm domain. Promotion có thể cập nhật mọi alias của project, gồm alias cc hiện có; đây là cùng project, không xác minh quyền DNS cc |
| Environment Production | Project: No Environment Variables Added; Shared: No shared variables linked | Chỉ Production: Supabase Production URL/anon key, Google=false, TMDB credential máy chủ |
| Supabase | Org Free hiện liệt kê một project thử `dgivczwqlzxcvxwzpadm` | Project mới `webfilm-production`, Free, không repo integration, không dùng test ref |
| Tạo project | Form tạo mới mở được, không có thông báo hết quota; không submit | Người dùng nhập mật khẩu DB trực tiếp/hoàn tất điều khoản nếu có. Nếu quota/chọn gói trả phí xuất hiện, dừng |
| Email | SMTP thử bật, smtp.gmail.com:465, interval 60s; sender/username và email cap bị dashboard redaction nên không trích giá trị; stored password ẩn; sender name Preview | Gmail account đã nghiệm thu; sender name `Tối nay xem gì?`, secret nhập trực tiếp ở project mới |
| Resend | Logged in, No domains yet | Không dùng sandbox cho người dùng khác; chưa có DNS sở hữu, không mua domain |
| Git hooks | Vercel: không deploy hooks; repo không .github workflows | Không thêm hook hay auto-merge. Git settings đang báo secondary rate limit 403 từ GitHub; cần xác minh hết lỗi và Preview mới đúng SHA trước release |

Mở form mới không chứng minh quota trên mọi org/account; [Supabase Free giới hạn hai project active](https://supabase.com/docs/guides/platform/billing-faq). Không cam kết SLA hoặc backup trả phí. Gmail là lựa chọn đợt nhóm nhỏ đã được người dùng chốt; dashboard cảnh báo deliverability cho personal SMTP. [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Gmail sending limits](https://support.google.com/mail/answer/22839?hl=en). Không coi quota Gmail là số email Auth được đảm bảo.

## Thay đổi cấu hình dự kiến

1. Tạo Supabase riêng, tên `webfilm-production`, Free, ưu tiên Tokyo/ap-northeast-1 nếu form cho chọn, Enable Data API bật, Automatically expose new tables tắt; schema tự bật RLS và cấp quyền tường minh. Không nối GitHub integration để tránh tự chạy schema. Ghi ref thật vào manifest sau tạo; ref phải khác test. Database password chỉ người dùng nhập/lưu vào kho bí mật.
2. Chạy `docs/release/preflight.sql` ở ref xác nhận. Nếu bất kỳ bảng ứng dụng nào tồn tại, **dừng bootstrap**, lập diff/backup riêng. Với DB mới trống, dùng `test-results/release/pr2-baseline.sql`, lấy từ head #2 pinned; không dùng schema PR #3. `node tests/prepare-release.mjs` chuẩn bị offline và đối chiếu `docs/release/manifest.json` (UTF-8/LF); không tự apply.
3. Production env chỉ bốn biến: `NEXT_PUBLIC_SUPABASE_URL=https://<PROD_REF>.supabase.co`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=<public anon key của PROD_REF>`, `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=false`, `TMDB_API_KEY=<v3 key đang dùng được, quyền sử dụng phù hợp>`. Không đặt `TMDB_READ_ACCESS_TOKEN` nếu chọn v3 key, không `CINEMA_QA_BUILD` hay service_role. Nếu value chỉ Preview không thể chuyển scope an toàn mà không lộ secret, người dùng nhập trực tiếp value cho Production. Không ghi key vào báo cáo.
4. Auth email/password bật; confirm email bật, Google tắt. Site URL `https://randomfilmkietgay.vercel.app`; redirect exact `/auth/callback` và `/auth/reset-password`. Với invite query chỉ thêm pattern query ở đúng host/path nếu kiểm thử matcher cho thấy cần, không wildcard host. Staged deployment URL chỉ được biết sau build: bổ sung hai path exact cho URL đó trước smoke, bỏ sau nghiệm thu. Không chuyển project thử vào Production.
5. SMTP custom bật, host `smtp.gmail.com`, port465, interval60s; sender/username là Gmail đã dùng nghiệm thu, sender name bỏ chữ Preview. Người dùng nhập app password trực tiếp ở project mới, không lấy mật khẩu ẩn ra dashboard. Không tắt confirmation. Đề xuất email Auth cap30/h cho đợt nhóm nhỏ; đọc quota thực tế trước lưu, không tăng nếu quota thấp hơn. Email OTP/link expiry3600s nếu hỗ trợ; giữ ConfirmationURL của template mặc định. Gửi thử tới A/B, kiểm tra SPF/DKIM do Gmail đảm nhiệm qua header thư thực tế, không tạo DNS hay tuyên bố đã xác minh trước gửi.

## Cơ chế release được đề xuất để duyệt một lần

Chọn **staged Production build**: sau duyệt mới tắt Auto-assign và đọc lại Current/domain. Merge vẫn tạo deployment Production nhưng chưa phục vụ domain chính; không coi thao tác tắt alias là chặn build. [Vercel staged workflow](https://vercel.com/docs/deployments/promoting-a-deployment). Không cần PR chặn main hoặc canary cấu hình main=false với phương án này. Phương án merge-không-build chưa canary, không được dùng thay thế âm thầm.

Trình tự thực hiện sau một lần duyệt toàn bộ phạm vi:

1. Đọc lại SHA/head/checks/current; nếu thay đổi chưa review, dừng. Xác nhận Git integration tạo Preview đúng head và 403 không còn là blocker. Snapshot cấu hình công khai, secret chỉ secret store.
2. Tạo/cấu hình Supabase mới theo trên và baseline #2. Audit RLS/grants/profile trigger, hai tài khoản release-test. Không nhập khẩu tài khoản/dữ liệu thử nghiệm. Chặn cho người dùng thật tới khi nghiệm thu xong.
3. Lưu env Production và SMTP/redirect đã xác nhận. Tắt Auto-assign; xác minh domain Current giữ nguyên. Backup cấu hình và đường rollback phải tồn tại trước merge.
4. Merge #2; xác minh deployment Staged đúng merge SHA/env; domain Current vẫn bản cũ. Smoke staged: signup/email mới nhất/login/reload/logout/recovery (old password rejected/new accepted), search/add phim, baseline nhóm/rating/comment, hai phiên riêng/API RLS. Người dùng nhập mật khẩu trực tiếp. Không đạt thì dừng, không promote.
5. Promote #2 chỉ khi tất cả đạt, kiểm tra domain chính/env/redirect/email/TMDB, theo dõi errors 15–30 phút. Ghi deployment #2 làm rollback #3.
6. Đổi base #3 về main; review toàn diff, loại commit #2 trùng nếu squash, backup ref trước rebase, force-with-lease chỉ nhánh #3 khi cần. Không force main. Full checks và Preview A/B ở head mới phải đạt.
7. Backup schema/data Production ra nơi ngoài Git (cả Auth nếu cần phục hồi tài khoản); kiểm tra restore trên DB cách ly trước migration. Free không được coi có daily backup/PITR. [Backup Supabase Free](https://supabase.com/docs/guides/platform/backups). Không có dump/restore đạt thì dừng #3.
8. Apply duy nhất additive `supabase/migrations/20261010_group_self_management.sql`, checksum manifest; count sáu bảng giữ nguyên, grants sáu RPC đúng, helper khóa/RLS còn. Không bootstrap lần nữa. Baseline #2 còn hoạt động.
9. Merge #3, build Staged, smoke owner/member/own contributions/watched protection/leave-rejoin/isolation/UI mobile/error recovery trên **dữ liệu release-test**; promote nếu đạt. Theo dõi tiếp 15–30 phút. Giữ Auto-assign tắt để push sau không tự phát hành.

## Rollback cụ thể

- #2 lỗi: rollback domain về deployment Current cũ `4Pya1MYx5D5ABxuZiFQ9JA4wLkLe`; đây là app cũ/demo, tạm ngừng khả năng dùng nhóm thật, DB mới giữ nguyên. Deployment rollback không rebuild env và không phải git revert.
- #3 lỗi: rollback domain về deployment #2 đã smoke đạt (id ghi sau bước5). Giữ additive schema và helper lock; không drop bảng/functions. Nếu có lỗi quyền/write, áp dụng `docs/release/pr3-revoke.sql` chặn đúng sáu RPC mới; baseline vẫn hoạt động. Khôi phục bằng `pr3-regrant.sql` chỉ sau sửa/review và nghiệm thu. Hai SQL đã kiểm tra trên PGlite fresh/upgrade: revoke chặn mọi sáu chữ ký, giữ data/baseline save_rating; regrant authenticated, anon vẫn denial. Chưa chạy trên Production.
- Leak quyền, mất dữ liệu, auth/email/search lỗi diện rộng: dừng promotion/đợt sau, rollback trong phạm vi phê duyệt; lưu incident không token. Git revert riêng sau review để không phát hành lại lỗi khi push mới.
- Rollback app **không khôi phục hard delete**. Restore backup vào DB cách ly, đối chiếu rows/writes mới rồi mới phục hồi chọn lọc theo phạm vi xác nhận; không restore đè toàn DB. Không tự đặt lại mật khẩu hay hạ TLS.
- SMTP/redirect lỗi: khôi phục snapshot cấu hình, gửi thư mới. Không tái dùng link đã tiêu thụ. Giữ project thử nguyên trạng.

## Kết quả chuẩn bị và gates còn chờ

Mobile B trên Preview: 375/320px đạt các ca settings/confirm/focus/edit own comment/cancel own rating delete; không thực hiện leave/delete để kiểm tra kích thước. Lỗi request treo đã sửa, 3 ca deadline + 8 ca hồi quy UI fixture đạt. Unit28/28, database/API checks đạt; build/typecheck/diff whitespace cũng đạt. Preview head cuối ghi bổ sung sau push/Ready.

Chưa xác minh: project Production chưa tồn tại/ref chưa có, secrets chỉ nhập khi tạo/cấu hình sau duyệt; mail/redirect/staged/domain chính chưa test Production; backup/restore Production chưa thực hiện; hai tài khoản phải đăng ký lại ở project mới. Không lấy kết quả Preview thay Production. Điện thoại vật lý/iOS/Safari/full-browser offline/load stress vẫn ngoài bằng chứng hiện có.

Chỉ cần người dùng hỗ trợ sau duyệt khi nhập DB/app passwords/TMDB secret, login/điều khoản và nhập mật khẩu website trong smoke. Nếu xuất hiện gói trả phí hoặc phải mua domain: dừng, không mua. Phạm vi duyệt cuối gồm cấu hình mới, merge #2 rồi #3, migration bổ sung, staged builds/promotions sau gates và rollback khi lỗi theo trên; mọi gate chưa đạt đều giữ bản domain đang dùng.

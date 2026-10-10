# Tài khoản: cấu hình và nghiệm thu — 10/10/2026

## Trạng thái

Mã đăng ký/đăng nhập email, xác nhận email, gửi lại, khôi phục mật khẩu và quản lý phiên đã triển khai. Google tùy chọn, mặc định tắt. Kiểm thử dùng Chromium headless với phản hồi Supabase giả lập và PostgreSQL PGlite, không phải xác nhận một project Supabase/SMTP thật đã chạy.

Repository: `D:\code\a\webfilm`; kế hoạch `docs/plans/2026-10-10-account-auth.md`. Không tạo tài khoản dịch vụ, gửi mail thật, push hay deploy trong đợt này. Khi chưa có URL/key Supabase, website giữ chế độ dùng thử.

## Kết quả tự động

| Kiểm tra | Kết quả | Phạm vi |
| --- | --- | --- |
| `npm test` | 21/21 PASS | Validation, service SDK, redirect/invite, domain phim |
| TypeScript | PASS | Typecheck và build |
| Database | PASS | Tạo profiles/tên/fallback/giới hạn, quyền nhóm, điểm, anon bị chặn |
| API | PASS | Không token/token sai bị từ chối, lỗi upstream và cấu hình |
| Production QA | PASS | `/auth/callback`, `/auth/reset-password` có trong build |
| `test:auth:e2e` | PASS 1440px và 375px | Form, lỗi, resend/cooldown, nhấn đúp, đăng ký có/không session, login/refresh trang/logout local |
| `test:auth:sessions` | PASS 1440px và 375px | SDK xử lý fragment thật với token giả, xác nhận, recovery, reload, link lỗi, không session không đổi password, mật khẩu đổi nhưng logout lỗi, invite |
| Cách ly tài khoản | PASS | Đăng xuất giữa hai tab, đổi A sang B, kết quả tải nhóm A đến chậm không xuất hiện trên B |
| Mạng và phiên | PASS | Mạng lỗi giữ session; API 401 được xác minh lại; refresh thành công/thất bại; reset retry kết nối |
| `test:live-errors` | PASS 1440px và 375px | Hồi quy lỗi tải nhóm/chốt/tìm phim với response giả |
| `test:auth:google` | PASS | Bật nút Google và OAuth redirect có mã mời, không qua provider thật |
| Demo production | PASS | Build, 14 nhóm hồi quy E2E và 24 ca nghiệm thu desktop/mobile; không pageerror |

Ảnh/báo cáo: `test-results/auth/`, `test-results/auth-sessions/`, `test-results/live-failures/`. Không lưu token hay URL fragment vào tài liệu/báo cáo. Browser context riêng, không sửa dữ liệu browser người dùng.

### Chạy lại

```powershell
Set-Location D:\code\a\webfilm
npm test
npm run typecheck
npm run test:db
npm run test:api
```

Terminal QA riêng; không ghi giá trị giả vào `.env.local`:

```powershell
$env:CINEMA_QA_BUILD='1'
$env:NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:54321'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY='qa-public-anon-key'
$env:NEXT_PUBLIC_AUTH_GOOGLE_ENABLED='false'
npm run build
npm run start -- --port 3101
```

Terminal test khác:

```powershell
$env:TEST_URL='http://127.0.0.1:3101'
npm run test:auth:e2e
npm run test:auth:sessions
npm run test:live-errors
```

Test Google: dừng server QA, đổi cờ thành true, build/start lại rồi chạy `npm run test:auth:google`. Không chạy form test yêu cầu Google ẩn trên build Google=true. Đóng terminal QA khi xong. Build thật không đặt `CINEMA_QA_BUILD`; giá trị NEXT_PUBLIC được đưa vào frontend tại lúc build.

## Cấu hình dịch vụ thật

1. Tạo/mở project Supabase do chủ dự án quản lý. Project mới: chạy `supabase/schema.sql` một lần; project đã có schema của website: không chạy lại hoặc xóa bảng. Đợt auth này không cần migration database mới; trigger `profiles` và RLS hiện có đã qua kiểm thử bổ sung.
2. Điền Project URL và publishable/anon key công khai trong `.env.local`, dựa trên `.env.example`. Không dùng service_role/secret key. Để Google=false trước; token TMDB không cần cho luồng tài khoản nhưng cần cho tìm phim.
3. Bật Email/Password và Confirm email; đặt yêu cầu password >=8 phù hợp form. Không tắt Confirm email để bỏ qua vấn đề thư không đến.
4. Site URL là origin website đang chạy. Thêm Redirect URLs cho đúng origin và hai đường dẫn. Ví dụ localhost:

```text
http://localhost:3000/auth/callback
http://localhost:3000/auth/reset-password
http://localhost:3000/auth/callback\?invite=*
http://localhost:3000/auth/reset-password\?invite=*
```

Hai dòng cuối là glob cho query invite; `\?` biểu diễn dấu hỏi literal, `*` chỉ khớp phần mã (không chứa dấu chấm hoặc slash). Dùng domain production chính xác thay localhost khi triển khai. Nếu phát triển với 127.0.0.1 hoặc cổng khác, thêm origin đó riêng. Không dùng wildcard cả domain production. Nghiệm thu link có mã mời để xác nhận dịch vụ/dashboard không đưa về Site URL thay cho callback dự kiến.

5. Giữ link `{{ .ConfirmationURL }}` trong mẫu thư Confirm signup và Reset password. Supabase sẽ xác thực link ở dịch vụ rồi gửi session về trang client qua fragment (implicit flow). Nếu project đang dùng template `token_hash`/`code` cho SSR/PKCE, phục hồi template phù hợp hoặc lập kế hoạch chuyển kiến trúc riêng; website này chưa có endpoint PKCE exchange.
6. Cấu hình SMTP và sender/domain hợp lệ trước khi mời người ngoài thử. Dịch vụ mail mặc định Supabase dành cho thử nghiệm, giới hạn người nhận/tần suất; không coi việc SDK trả thành công là email chắc chắn đã đến. SMTP password chỉ nằm ở dashboard dịch vụ, không đưa vào frontend hoặc Git.
7. Restart dev server hoặc rebuild/redeploy hosting. Trên Vercel: đặt URL/key, cờ Google và TMDB token cho môi trường đúng; redeploy để frontend nhận giá trị. Giữ QA build/cấu hình giả ngoài hosting.
8. Google sau email: bật Google provider, OAuth client/consent và callback URL dịch vụ Supabase, rồi Google=true và rebuild. Google callback của provider và `/auth/callback` của website là hai URL khác nhau; cấu hình đúng vai trò.

Nguồn đối chiếu: [Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Password Auth](https://supabase.com/docs/guides/auth/passwords). Kiểm tra ngày 10/10/2026; giao diện dashboard có thể thay đổi.

## Nghiệm thu dịch vụ thật — chưa thực hiện

Chỉ dùng hai tài khoản/email do chủ dự án kiểm soát. Không dán password/token/link email chứa fragment vào chat hoặc báo cáo. Ghi PASS/FAIL/ngày và môi trường sau khi thực hiện từng ca:

| Ca kiểm tra | Kết quả hiện tại |
| --- | --- |
| Email A đăng ký tên, nhận mail, mở link và vào Nhóm của tôi | Chưa thử |
| Email B đăng ký trên browser/thiết bị khác, xác nhận tên profiles | Chưa thử |
| Sai password/unconfirmed báo đúng; đăng ký email cũ có phản hồi chung | Chưa thử |
| Gửi lại email đến hộp thư; cooldown/rate limit xử lý rõ | Chưa thử |
| Reset mail đến, link mở form, đổi mật khẩu; cũ không login được, mới login được | Chưa thử |
| Link đã dùng/hết hạn không mở dữ liệu riêng và cho xin link mới | Chưa thử |
| Refresh trang giữ phiên; logout giữa tab/đổi tài khoản dọn dữ liệu | Chưa thử |
| A tạo nhóm; B chưa join không đọc được, join bằng mã mới được xem | Chưa thử |
| Invite giữ qua email mở tab mới; chỉ join khi xác nhận | Chưa thử |
| Token hết hạn/làm mới/thu hồi trên dịch vụ thật | Chưa thử |
| Domain hosting thật, redirect/SMTP hoạt động ngoài localhost | Chưa thử |
| Google đăng nhập bằng tài khoản thật, nếu bật | Chưa thử, tùy chọn |

## Quyết định kiến trúc và giới hạn

`useAuth` chỉ cập nhật state trong listener, việc xác minh chạy bên ngoài listener; xử lý response cũ bằng revision. `CinemaWorkspace` được key theo user.id: đổi tài khoản/signout unmount toàn bộ state nhóm, phim, modal, bộ lọc, comment và request cũ. Polling/search dừng theo lifecycle. API tìm phim và RLS tiếp tục kiểm tra token/quyền, không lấy tên metadata làm quyền truy cập.

`reset-password` cần session được Supabase xác minh trước khi gọi updateUser; query `type=recovery` không cấp quyền. Session hợp lệ của tài khoản cũng có thể mở trang này để đặt mật khẩu mới. Khi mạng lỗi không thể xác minh, form bị khóa và có thử lại; không xóa session chỉ vì mất mạng. Sau đổi password thành công, lỗi logout được báo riêng và có nút thử lại.

Không thêm MFA, đổi email, xóa account, trang quản trị hoặc tự nhập demo vào tài khoản thật. Chưa nghiệm thu mail/provider/dịch vụ thật; chưa push/deploy.

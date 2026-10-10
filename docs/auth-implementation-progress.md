# Tiến độ tài khoản — 10/10/2026

Kế hoạch: `docs/plans/2026-10-10-account-auth.md`.

## Đợt 1: Task 1–3 hoàn tất

- Validation đăng ký/mật khẩu mới/nhập lại; đăng nhập chấp nhận mật khẩu cũ không rỗng.
- Thông báo tiếng Việt theo mã lỗi; lỗi lạ không hiển thị chi tiết dịch vụ.
- Dịch vụ Supabase dùng singleton hiện có; Google mặc định tắt qua `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED`.
- Form email riêng: đăng nhập, đăng ký, chờ xác nhận, gửi lại và yêu cầu khôi phục.
- Gửi lại thư có pending và thời gian chờ 60 giây; nhấn đăng ký liên tiếp không tạo hai request.
- Mật khẩu xóa khỏi state khi đổi màn/đăng ký thành công; có hiện/ẩn và label/autocomplete.
- Nút đăng xuất dùng scope local (thiết bị hiện tại).

## Bằng chứng kiểm tra

| Kiểm tra | Kết quả |
| --- | --- |
| Test mới trước triển khai validation/service | FAIL vì chưa có module, đúng kỳ vọng TDD |
| Browser test trước thay UI | FAIL vì Google còn hiện dù cấu hình tắt |
| `npm test` | 19/19 PASS |
| `npm run typecheck` | PASS |
| Build production QA `.next-live-qa` | PASS |
| `npm run test:auth:e2e` | PASS 1440px và 375px; phản hồi Supabase giả lập |
| Build production demo `.next` | PASS |
| Demo `test:e2e` trên cổng 3102 | 14 nhóm kiểm tra PASS, không pageerror |
| `git diff --check` | PASS |

Ảnh và báo cáo test nằm trong `test-results/auth/`, không commit. QA dùng giá trị giả trong môi trường tiến trình, không tạo `.env.local`. Supabase thật chưa cấu hình/kiểm thử trong đợt này.

## Phần còn lại và giới hạn

- Task 4: tạo `/auth/callback` và `/auth/reset-password`, kiểm thử link email qua SDK. Service đã dựng redirect cho các đường dẫn này nhưng **trang chưa có**; chưa triển khai/publish luồng mail hiện tại cho người dùng thật.
- Task 5: hook auth, invite qua tab/link email, dọn toàn bộ dữ liệu cũ khi account thay đổi/phiên kết thúc và xử lý API 401.
- Task 6: kiểm thử hồ sơ/RLS bổ sung; không thay schema khi chưa có lỗi.
- Task 7: hướng dẫn cấu hình, kiểm thử link và phiên mở rộng, SMTP/Supabase thật với hai tài khoản do chủ dự án kiểm soát; Google tùy chọn.

Đây là ghi nhận checkpoint đợt đầu. Các task 4–7 được tiếp tục theo yêu cầu người dùng; xem cập nhật dưới đây.

## Đợt 2: phần mã và kiểm thử Task 4–7 hoàn tất

- Đã có `/auth/callback` và `/auth/reset-password`; xác minh session qua Supabase trước khi cho đổi mật khẩu.
- SDK xử lý liên kết implicit, bắt PASSWORD_RECOVERY; lỗi URL không mở nhóm dù đang có session cũ.
- Invite được validate, giữ trong sessionStorage/query redirect để mở thư ở tab khác; không tự join nhóm.
- `useAuth` quản lý phiên/refresh/network/401; workspace được tạo lại theo user.id nên toàn bộ state cũ bị dọn khi đổi tài khoản.
- Đã kiểm thử logout giữa tab, phản hồi nhóm cũ đến chậm, refresh thành công/thất bại, mất mạng giữ phiên và retry ở màn reset.
- Đã kiểm thử profiles/name/full_name/email fallback, giới hạn tên và quyền anon; không cần sửa schema hoặc migration mới.
- Email và Google mặc định tắt/mở theo cấu hình đúng hợp đồng; đã kiểm thử Google OAuth redirect giả lập.
- Đã cập nhật README và tạo `docs/auth-acceptance.md` với các bước Supabase/SMTP/redirect, cách chạy lại test và danh sách nghiệm thu thật.

Kết quả mới: 21/21 unit tests, typecheck, database và API PASS; auth forms/session/service-errors trên 1440px/375px PASS; build QA và demo production PASS; demo E2E 14 nhóm và nghiệm thu demo 24 ca PASS. Xem báo cáo nghiệm thu để biết phạm vi cuối cùng.

**Chưa cấu hình/nghiệm thu dịch vụ thật:** repository vẫn chưa có `.env.local` chứa URL/key của project thật. Các ca nhận email, mật khẩu cũ/mới ở dịch vụ thật, Google thật và domain hosting giữ trạng thái chưa thử. Không push hoặc deploy.

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

Đây là checkpoint sau ba task theo skill executing-plans, không phải nghiệm thu toàn bộ kế hoạch. Không push hoặc deploy.

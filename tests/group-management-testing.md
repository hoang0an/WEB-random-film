# Chạy lại nghiệm thu quản lý nhóm

Các script này chỉ dành cho dữ liệu thử, không cấu hình trên hosting. Kết quả nằm trong `test-results/` bị Git ignore; không lưu mật khẩu, token, mã mời vào kết quả.

## PostgreSQL thật, hai connection

1. `npm ci` với Node 24. Tải CA từ nút **Download CA certificate** trong Database Settings của Supabase thử nghiệm vào `test-results/group-management/supabase-ca.crt`. Đợt này dùng CA chính thức https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt. Giữ xác minh TLS; không dùng `rejectUnauthorized:false`.
2. Trong terminal, đặt `QA_ACCOUNT_A_EMAIL` và `QA_ACCOUNT_B_EMAIL` bằng hai email thử đã xác nhận; không đưa giá trị vào Git. Chạy `npm run test:groups:postgres`.
3. Mở `http://127.0.0.1:4319`. Người dùng tự nhập **mật khẩu database Supabase** và gửi form. Mật khẩu ứng dụng Google chỉ dành cho SMTP, không dùng ở đây. Script chỉ cho host/user của project thử nghiệm `dgivczwqlzxcvxwzpadm`, session pooler 5432; không đổi sang production hoặc transaction pooler.
4. Xem kết quả sau tải lại. Mong đợi `distinctBackends:true`, `checks:12`, mọi `pass/observedLockWait:true`. Dừng server sau dùng.

Script tạo fixture riêng, giữ transaction đầu, xác nhận contender bị PID đầu chặn qua `pg_blocking_pids`, rồi commit. ROLE authenticated và JWT subject được đặt trong transaction; không giả lập hai đăng nhập Auth bằng mật khẩu. Fixtures được dọn theo chính id vừa tạo; dữ liệu cũ không bị reset. Nếu tiến trình bị ngắt, kiểm tra các nhóm tên `Nghiệm thu race PR3 …`; chỉ dọn id của lần chạy đó cùng comments/ratings trước khi xóa group. Không chạy bootstrap/migration lại.

## UI thật + dịch vụ lỗi giả lập cục bộ

Terminal 1: `npm run test:groups:fault-server`.

Terminal 2, PowerShell:

```powershell
$env:CINEMA_QA_BUILD='1'
$env:NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:54321'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY='qa-public-key'
npx next dev --hostname localhost --port 4320
```

Mở app `http://localhost:4320` và controller `http://127.0.0.1:4318` bằng trình duyệt được kết nối. Nếu chưa có phiên fixture, đăng nhập `qa@example.invalid` / `qa-not-secret` tại UI; đây là thông tin giả, chỉ loopback. Dùng CUA import `tests/group-management-browser.mjs`, chạy:

```javascript
const checks = await import('file:///ABSOLUTE_WORKTREE/tests/group-management-browser.mjs');
const initial = await checks.runGroupFaultChecks(app, controller, {deferMembershipCheck:true});
// Khi UI đã về trang nhóm sau polling, chạy phần còn lại:
const membership = await checks.finishMembershipCheck(app, controller);
const comment = await checks.runCommentRecoveryChecks(app, controller);
const offline = await checks.runOfflineLoadCheck(app, controller);
```

8 ca mong đợi đạt (5 initial, 1 membership, 1 comment, 1 offline). Tách membership thành checkpoint vì tab nền Chromium có thể trì hoãn timer 15 giây; không dùng sleep dài hoặc ép sửa trạng thái ứng dụng. Chạy tiếp khi DOM cho thấy thẻ QA nhóm thứ hai và dialog cũ đã đóng; không reset khi còn RPC held, hãy release trước. Script xác minh record, số RPC và draft, không chỉ toast.

Các chế độ drop/offline bắt đầu HTTP response rồi ngắt body để kiểm thử lỗi dữ liệu/phản hồi mà không bị browser/SDK âm thầm replay transport. Auth fixture vẫn hoạt động. Đây **không** là offline hệ điều hành hay chặn mạng Preview thật. Hold/release mô phỏng request chậm; không phải load test Supabase. Dừng hai server khi hoàn tất; không lưu các biến QA vào `.env.local` hay Vercel.

## Bàn phím và mobile trên Preview

`runGroupKeyboardChecks(preview)` yêu cầu nhóm thử đã mở và dialog đóng; dùng riêng cho A chủ nhóm và B thành viên. Kiểm tra close initial focus, Shift+Tab/Tab trap, Escape và focus trả về Cài đặt nhóm. Có thể chạy cùng helper cho app fixture.

Dùng viewport capability 320×740 / 375×812 để mở settings, phim đã xem, form sửa, confirm xóa điểm hoặc rời nhóm; kiểm tra cuộn và `document.documentElement.scrollWidth === innerWidth`. Hủy thao tác, không xóa dữ liệu thật. Reset viewport cuối. Phone emulation không thay nghiệm thu iOS/Safari hay bàn phím ảo trên thiết bị vật lý.

## Request không phản hồi

Chạy thêm từng chế độ `hold`, `hold-after`, `hold-all` qua CUA:

```javascript
const checkpoint = await checks.startDeadlineCheck(app, controller, 'hold');
const result = await checks.finishDeadlineCheck(app, controller, checkpoint);
```

Chạy hai hàm liền nhau trong cùng lần gọi (timeout công cụ 60 giây) để quan sát toast trước khi hết hiển thị. Có ba ca mới, tổng 11 ca fixture gồm 8 hồi quy. `hold-after` commit trước khi giữ response; `hold-all` giữ cả GET nhóm. Server release phản hồi committed không mutate lần hai. Bài kiểm tra deadline helper nằm trong `npm test` (28 tests). `node tests/prepare-release.mjs` chỉ tạo SQL pinned/checksum trong test-results, không kết nối database.

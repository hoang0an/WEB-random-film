# Nghiệm thu phát hành #2 → #3 — 11/10/2026

Domain chính: https://randomfilmkietgay.vercel.app. Bản hiện hành #3: merge `65e638008bca9005eddb5a1485d903fbc81399d1`, deployment `2QV7deYZEJwuHifdH6afnbWGR984`, promote khoảng09:09 GMT+7. Vercel xác nhận Current/Domains. Thực hiện theo phạm vi người dùng duyệt trong docs/release-execution.md; không mua dịch vụ, sửa DNS hoặc nhập dữ liệu Preview vào Production.

| Luồng/gate | Kết quả thực tế | Phạm vi bằng chứng |
| --- | --- | --- |
| Production riêng/cấu hình | Đạt | Free Supabase yzvcuhlsqyljgermeiby; bốn biến Production, Gmail SMTP; auto-assign domain tắt, staged trước promote |
| Đăng ký/xác nhận email | Đạt A/B | Người dùng đăng ký và bấm thư mới; Auth signup200/verify303, Confirmed at đúng; không đăng ký lại hoặc dùng lại link |
| Password login/logout/recovery | Đạt | Người dùng nhập mật khẩu trực tiếp; cũ bị từ chối/mới thành công trên staged #2; logs user200/logout204/token200. Sau promote #3 thư recovery mới nhận và mở form hợp lệ |
| Giữ phiên | Đạt | Chrome A/Edge B riêng; reload staged và primary trước/sau promote, đọc/ghi đúng tài khoản |
| Thu hồi phiên | Đạt refresh-session | API #2 logout local204, refresh cũ400; không chứng minh access JWT bị vô hiệu tức thì |
| Baseline nhóm/phim/điểm/comment | Đạt | Staged #2 UI và55/55 API; private B ẩn A, join không trùng, TMDB phim thật, realtime, điểm/comment đúng tác giả |
| Backup/restore trước #3 | Đạt9/9 | Consistent snapshot public/auth/private; PostgreSQL18.6 local độc lập;33 bảng counts/full-row hashes/RLS/policies/functions/grants khớp; server dừng |
| Migration #3 | Đạt | Additive đúng checksum, không bootstrap; sáu bảng giữ counts;13 RPC đúng grants, private lock helper và trigger đúng |
| PR3 staged API | Đạt65/65 | Quyền pending/watched/comment/rating/rename/leave/rejoin; trực tiếp DELETE403; non-member GET rỗng và RPC denial; nhóm riêng B ẩn A |
| PR3 staged UI | Đạt | Hai browser riêng; member/owner đúng nút/quyền; xóa own pending/own contributions; rename; leave/rejoin; TMDB; save unlock |
| Primary #3 | Đạt smoke | Reload A/B, private B ẩn A, rename, B rating/comment/edit, A đọc không sửa B, xóa Inception QA, TMDB search, thư recovery đúng domain |
| Mobile/focus | Đạt trong phạm vi đo | Staged A320/375; Preview B320/375 cùng code. Keyboard trap/Escape/focus restore. Lần override primary đo638px, không tính là mobile320/375 |
| Request treo/mạng chậm/chuyển nhóm | Đạt fixture trước release |11 UI fault checks: single RPC/no replay, reconcile commit không chắc chắn, giữ draft/unlock, bỏ phản hồi muộn khi chuyển nhóm |
| Đồng thời PostgreSQL | Đạt trên thử nghiệm |12/12 cặp đã liệt kê; hai kết nối độc lập, observed lock waits, authenticated JWT subject/role, strict TLS, READ COMMITTED |
| Theo dõi sau promote #3 | Đạt đến09:25 | Hơn15 phút từ09:09; Vercel đúng deployment Warning/Error/Fatal0, Auth5xx0; hai phiên reload và dữ liệu đúng.400 refresh-token ghi riêng, không tuyên bố mọi log sạch |

Không phát hiện lỗi ứng dụng mới cần sửa trong đợt release. Công cụ restore local đã sửa lỗi initdb/pg_ctl trên Windows và nghiệm thu lại; không hạ TLS/đổi mật khẩu website tự động. Nhật ký Auth có400 Invalid Refresh Token/Refresh Token Not Found, chưa gán chắc từng request cho client; A/B primary vẫn reload/ghi thành công. Không đồng nhất điều này với SMTP535/500 cũ đã được sửa bằng app-password người dùng nhập trực tiếp.

Rollback #3: deployment `31TCdGLdUmpe3AzAVB21aMz2aToh` (bản #2 đã nghiệm thu). Giữ additive schema; nếu lỗi quyền ghi, dùng đúng sáu chữ ký trong docs/release/pr3-revoke.sql sau đối chiếu. Không drop/bootstrap, không restore đè database. Khôi phục hard delete cần đọc archive cách ly và đối chiếu writes mới trước phục hồi chọn lọc. Backup đã kiểm chứng nhưng không chạy rollback thật khi chưa có incident.

Backup archive SHA256 `8d87514935620199677a99ba68b0294fd0d52b871ed92209a90781a93a083164`; nằm trong thư mục riêng ngoài Git, ACL hạn chế. Không xuất archive Auth vào repo/báo cáo công khai. Backup không bao gồm Storage files hay cấu hình nền tảng/env/SMTP; mật khẩu/secrets không nằm trong báo cáo.

Chưa xác minh: điện thoại vật lý/iOS/Safari, đầy đủ mobile B Production, full-browser offline, tải lớn, mọi race/isolation. Gmail được chọn cho đợt nhóm nhỏ, không chứng minh khả năng gửi quy mô lớn; Google login tắt. Các tài khoản/dữ liệu Release QA mới giữ để đối chiếu, không import dữ liệu Supabase thử nghiệm.

Chi tiết từng timestamp, migration/checksum và bằng chứng sanitized: docs/release-execution.md, docs/release/manifest.json. Bằng chứng thô phù hợp nằm ở test-results/release (ignored); archive và nguồn đối chiếu Auth nằm riêng trong thư mục hạn chế quyền.

Chốt đợt: xem docs/auth-refresh-investigation-2026-10-11.md (8/8 phiên thử riêng, chưa chứng minh lỗi ứng dụng/nguồn từng400 cũ), docs/mobile-pilot-checklist.md và docs/mobile-pilot-feedback.md. PR tài liệu chỉ chứa các bản tổng hợp; không chứa backup, Auth export hay bằng chứng thô. Không merge/deploy thêm trong bước chốt này.

**Kết quả dùng thử người dùng xác nhận sau đó:**3 tài khoản trên Chrome, thực hiện đủ checklist, không phát hiện lỗi. Xem docs/pilot-results-2026-10-11.md. Đây là user-reported acceptance; chưa có thiết bị/hệ điều hành/phiên bản hoặc dữ liệu từng ca, không đổi các giới hạn kiểm chứng độc lập ở trên. Không có lỗi được xác định cần sửa mã/phát hành Production mới.

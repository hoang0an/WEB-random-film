# Nghiệm thu Preview — 10/10/2026

## Phạm vi và kết luận hiện tại

Preview: https://randomfilmkietgay-git-main-hoang0an.vercel.app.
Supabase thử nghiệm: `dgivczwqlzxcvxwzpadm`, được người dùng xác nhận chỉ dùng thử dù dashboard gắn nhãn main Production. Kiểm thử trên trình duyệt và database thật, không mock. Không merge, promote hoặc cập nhật production trong đợt này.

Đã hoàn tất Gmail SMTP thử nghiệm, recovery A, đăng ký/xác nhận B và quyền đọc nhóm trước/sau tham gia. Không phát hiện lỗi ứng dụng cần sửa trong các luồng này. Giữ nhóm thử `Nghiệm thu Preview 10-10` gồm A và B để kiểm tra tiếp; giữ nguyên dữ liệu có trước. Không ghi email, mật khẩu, secret, key hoặc token trong báo cáo.

## Nghiệm thu bổ sung bằng hai phiên độc lập

Đã kết nối Chrome (A) và Edge (B), không dùng hai tab cùng hồ sơ để giả lập hai tài khoản. B đã logout rồi đăng nhập bằng mật khẩu trực tiếp trên Preview; A đăng nhập trong Chrome sau lớp bảo vệ Vercel. Phiên API A/B riêng được tạo bằng password grant qua form kiểm thử tạm tại loopback; mật khẩu và token chỉ giữ trong bộ nhớ tiến trình, không ghi vào file/Git/báo cáo. Kết quả HTTP đã loại bỏ bí mật ở `test-results/live-api-acceptance-results.json`.

| Kiểm tra bổ sung | Kết quả thực tế |
| --- | --- |
| B đăng nhập bằng mật khẩu sau logout | Đạt UI; API login B cũng 200. Chrome vẫn là A, Edge là B. |
| Nhóm riêng B ẩn với A | B tạo `Nghiệm thu riêng B 10-10`, 1 thành viên. A reload không thấy nhóm; GET REST groups theo id nhóm riêng trả 200 với 0 dòng. |
| A không ghi vào nhóm riêng B | RPC add_movie/save_rating/add_comment đều 400 not_member. |
| B thêm phim qua API | 200, trong nhóm thử; thêm trùng 409. Fixture API `Nghiệm thu API 10-10` dùng id thử, không đại diện phim TMDB thật. |
| Chốt / đánh dấu đã xem | B thao tác UI thành công trên fixture `Nghiệm thu — Interstellar`; API select_movie/mark_watched đều 204. |
| Thêm / sửa điểm của mình | UI B 9 → 9.5, A 8; API tương tự 204. GET ratings có đúng 2 dòng, điểm [8,9.5], không nhân đôi hoặc ghi đè người khác. Điểm 8.2 bị API 400; chưa xem bị not_watched. |
| Thêm / đọc bình luận | UI B gửi bình luận thử, A đọc và gửi bình luận riêng; API B add_comment 204. |
| Sửa / xóa trực tiếp dữ liệu bằng quyền chủ nhóm A | PATCH/DELETE ratings, comments, group_movies đều 403 permission denied. Đây là quyền truy cập bảng đang bị chặn; không tính là chức năng sửa/xóa hợp lệ đã triển khai. |
| Chức năng sửa/xóa phim, sửa/xóa bình luận, xóa điểm | Chưa triển khai trong UI hoặc RPC; không nghiệm thu thành công CRUD đầy đủ. Điểm chỉ có upsert của chính người đang đăng nhập. |
| Quyền riêng của chủ nhóm | Schema lưu owner_id nhưng chưa có RPC/UI đổi tên nhóm, quản lý thành viên hoặc kiểm duyệt/xóa nội dung. Chủ nhóm cùng dùng các RPC thành viên; không tự suy diễn chủ nhóm được sửa điểm/bình luận người khác. |
| Thu hồi phiên B | POST logout scope=global 204; refresh token cũ trả 400 refresh_token_not_found. Database B active_sessions=0; A active_sessions=2. B reload về form login, A vẫn đăng nhập. |
| REST với access JWT B còn hạn sau thu hồi | Vẫn 200, đọc 2 nhóm; JWT API còn 3538 giây tại phép thử. Supabase chỉ làm mất khả năng refresh; JWT cũ có thể dùng đến expiry. Chưa kiểm thử REST sau expiry và chưa có hàng rào kiểm tra session_id còn tồn tại trong RLS. Không gọi đây là chặn API tức thì. |

25 phép kiểm HTTP có kỳ vọng đều đạt; một phép quan sát JWT còn hạn được ghi riêng, không tính PASS chặn token. Bộ PostgreSQL cục bộ `node tests/database.mjs` cũng PASS, nhưng không thay thế kết quả dịch vụ thật ở trên.

### Cấu hình tìm phim phát hiện trong lượt bổ sung

Preview ban đầu thiếu TMDB_READ_ACCESS_TOKEN; UI tìm phim báo chưa cấu hình. Người dùng thêm biến kiểu Secret, chỉ Preview. Đã redeploy đúng deployment Preview (không Production), source 0d9722c; deployment `4g4tUg2GoFdVquKbB5fnXUJvosg1` Ready. Sau đó TMDB vẫn báo lỗi upstream; người dùng chỉ có API Key v3 khoảng 32 ký tự được bạn cung cấp. Route cũ gửi key này như Bearer token.

Đã sửa route nhận API Key v3 qua query api_key, giữ Bearer cho Read Access Token. Hỗ trợ biến máy chủ TMDB_API_KEY và tương thích API Key đã lưu trong TMDB_READ_ACCESS_TOKEN. Không reveal hoặc sao chép secret. API contract tests, typecheck và build đều PASS; build lần đầu bị spawn EPERM trong sandbox, chạy lại ngoài hạn chế tạo tiến trình thành công. Chờ nghiệm thu bản sửa trên Preview nhánh riêng, không merge main.

Phim fixture đầu tiên được tạo qua SQL bằng role/claims B thật để tiếp tục UI chấm điểm/bình luận trong lúc TMDB bị chặn. Không tính thao tác SQL này là PASS thêm phim qua UI. Phép API thêm phim độc lập đã đạt.

Nguồn về JWT sau signout: [Supabase signout](https://supabase.com/docs/guides/auth/signout), [Supabase sessions](https://supabase.com/docs/guides/auth/sessions). Giới hạn này được quan sát trực tiếp trong đợt nghiệm thu.

## Kết quả dịch vụ thật — đợt trước

| Luồng | Kết quả | Bằng chứng / giới hạn |
| --- | --- | --- |
| Đăng ký A | Đạt | Auth signup 200; user và profile cùng id ở đợt kiểm tra trước. |
| Xác nhận email A | Đạt | Callback thành công; database email_confirmed=1. |
| Đăng nhập / đăng xuất A | Đạt | Người dùng nhập mật khẩu trực tiếp; UI có tài khoản/nhóm. Logout trả form đăng nhập, Auth 204. |
| Giữ phiên / dữ liệu sau reload A | Đạt | Vẫn đăng nhập, nhóm có trước và nhóm thử còn nguyên. |
| Tạo nhóm A | Đạt | Nhóm thử ban đầu 1 thành viên; reload vẫn còn. |
| Gửi và nhận recovery A | Đạt | Custom Gmail SMTP; POST /recover 200 lúc 16:40:05 GMT+7, thư đến 16:40. |
| Mở recovery mới nhất | Đạt | Link đúng project, type=recovery, redirect Preview /auth/reset-password; GET /verify 303 lúc 16:40:39, form hợp lệ. |
| Đổi mật khẩu A | Đạt | Người dùng tự nhập/gửi; PUT /user 200 user modified lúc 16:42:13. Lần đầu dùng lại mật khẩu cũ bị PUT /user 422 lúc 16:41:57. |
| Cũ bị từ chối / mới đăng nhập | Đạt có giới hạn bằng chứng | Người dùng trực tiếp thử và báo cũ bị từ chối, mới đăng nhập được. POST /token 200 lúc 16:42:20 và UI A được đối chiếu độc lập. Chưa thu được POST /token lỗi tương ứng của lần thử cũ; PUT /user 422 không phải bằng chứng login cũ thất bại. |
| Đăng ký B và tạo hồ sơ | Đạt | Người dùng tự nhập/gửi mật khẩu. POST /signup 200 lúc 16:43:45; database b_confirmed_profile=1. |
| Nhận email / xác nhận B | Đạt | Thư đến 16:43 qua SMTP mới; GET /verify 303 user signedup và login lúc 16:43:59. UI B đăng nhập. |
| Chuyển A → B không lộ nhóm A | Đạt trong luồng quan sát | Đăng xuất A trước đăng ký B; B có 0 nhóm, không thấy nhóm riêng A. Các tab cùng origin dùng chung phiên, không coi là hai phiên độc lập đồng thời. |
| B chưa tham gia không đọc nhóm A | Đạt | UI 0 nhóm; SQL role authenticated với claims B thật trả visible_a_group=0, visible_a_members=0, visible_a_profile=0, b_is_member=false, b_own_profile=1. |
| Mã mời sai | Đạt | Hiện “Mã mời không đúng. Hãy kiểm tra lại với nhóm bạn.”, giữ form và 0 nhóm. |
| B tham gia bằng mã đúng | Đạt | Hiện “Bạn đã vào nhóm”, nhóm có A/B và 2 thành viên. SQL role B trả 1 nhóm, 2 thành viên, 1 hồ sơ A, b_is_member=true. |
| B tham gia lại không trùng | Đạt | Gửi lại cùng mã qua UI; SQL total_members=2, distinct_members=2, b_memberships=1. |
| Reload giữ phiên B và nhóm | Đạt | Vẫn tên Nghiệm thu B, 1 nhóm và 2 thành viên. |

SQL quyền đọc: `supabase/audit-preview-group-access.sql`. Kiểm tra RLS trong database thật bằng role/claims B trong transaction rồi rollback, kết hợp UI B thật; không thay thế kiểm thử HTTP trực tiếp bằng token B.

## Cấu hình hoàn thành

- Schema đã cài/kiểm tra ở đợt trước: 6 bảng RLS, quyền đọc authenticated, RPC cần đăng nhập, trigger tạo profile. Xem `supabase-schema-setup-2026-10-10.md` và `supabase/audit-auth-schema.sql`. Không chạy lại bootstrap.
- Vercel Preview có NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY và NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=false; Preview dùng Supabase thật. Không thay Vercel trong đợt SMTP/B này.
- Custom SMTP bật: smtp.gmail.com, port 465, sender/username Gmail B do người dùng kiểm soát, sender name “Tối nay xem gì? — Preview”, minimum interval 60 giây. Người dùng tự tạo/nhập mật khẩu ứng dụng và lưu. Không đọc hoặc ghi secret vào repo.
- Reload dashboard xác nhận SMTP còn bật. Auth logs ghi limiter từ 2/giờ sang 30/giờ lúc 16:38:24. Recovery A và confirmation B thực sự đến hộp thư.
- Resend đã đăng nhập nhưng Domains: No domains yet. Người dùng không sở hữu tên miền/DNS; các mục Third Party trên Vercel không chứng minh quyền sở hữu. Không mua dịch vụ hoặc sửa DNS. Resend test sender chỉ gửi địa chỉ tài khoản nên không dùng cho cả A/B.

## Lỗi / giới hạn quan sát

- Recovery trước SMTP bị /recover 429 email rate limit exceeded lúc 16:20:25. Đã giải quyết cho nghiệm thu bằng custom SMTP và thử lại thành công.
- B resend quá sớm lúc 16:43:49 bị 429, còn 52 giây chờ. Cooldown hoạt động; thư signup đầu tiên vẫn đến/xác nhận thành công.
- Mở lại link B lúc 16:46:28 báo otp_expired / One-time token not found. Logs xác nhận link signup đã được dùng thành công lúc 16:43:59; database B có email_confirmed và UI có phiên. Không kết luận SMTP làm hết hạn thư mới, không gửi lại khi đã xác nhận.
- Dashboard cảnh báo Gmail phục vụ email cá nhân. Đã nghiệm thu project thử nghiệm, chưa nghiệm thu gửi email production hoặc domain riêng.

## Phần còn thiếu của đợt trước (được cập nhật ở phần bổ sung trên)

- Login lỗi của mật khẩu cũ A chưa được đối chiếu độc lập trong Auth logs; người dùng trực tiếp kiểm tra/báo kết quả.
- B đăng nhập qua callback xác nhận; chưa thử đăng nhập B bằng mật khẩu riêng sau logout.
- Chưa thử ghi trái phép trước khi B tham gia, quyền sửa/xóa của chủ nhóm, phim/điểm/bình luận giữa hai tài khoản, nhóm riêng B ẩn với A hoặc HTTP bằng hai token độc lập. Quyền đọc đạt không bao gồm các phép thử này.
- Chưa thử phiên hết hạn/thu hồi, Google OAuth, tải email lớn, tên miền gửi riêng hoặc production. Không còn blocker SMTP đối với các luồng đã thực hiện.

## Bằng chứng

Ảnh tại `test-results/supabase-setup/`, không đưa vào Git:

- A: password-login-preview.jpg, logout-preview.jpg, group-created-preview.jpg, email-confirmed-preview.jpg.
- SMTP/recovery: gmail-smtp-saved.jpg, recovery-smtp-auth-logs.jpg, recovery-form-ready.jpg, recovery-password-result.jpg.
- B: b-before-join.jpg, b-rls-before-join.jpg, b-invalid-invite.jpg, b-joined-preview.jpg, b-membership-database.jpg, b-after-reload.jpg.

Nguồn cấu hình: [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Resend test domain](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain), [Google app passwords](https://support.google.com/mail/answer/185833).

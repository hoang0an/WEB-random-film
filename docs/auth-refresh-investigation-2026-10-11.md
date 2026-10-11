# Kiểm tra Auth400 refresh-token — 11/10/2026

**Kết luận:** đã tái hiện đúng400 `refresh_token_not_found` bằng token của phiên thử vừa logout local. Refresh hợp lệ và phiên thử thứ hai vẫn hoạt động. Chưa xác định lỗi ứng dụng nên không sửa mã, không đổi cấu hình/deploy Production. Không logout các phiên website đang hoạt động.

## Phạm vi và cách thử

Dùng SDK Supabase cùng phiên bản đang cài trong ứng dụng, kết nối project Production hiện hành, hai client riêng P/Q của cùng tài khoản đã xác nhận. Người dùng nhập mật khẩu trực tiếp vào form loopback; mật khẩu/token chỉ ở bộ nhớ. Client thử có persistSession=false, autoRefreshToken=false và storage key riêng, không lấy cookie/localStorage/token từ Chrome/Edge người dùng. Không gọi bảng/RPC ứng dụng, không gửi email, không đổi mật khẩu, không signOut global/others. Cleanup chỉ signOut(scope=local) P/Q.

| Kiểm tra | Kết quả |
| --- | --- |
| Login P | Đạt,200 |
| Login Q riêng cùng tài khoản | Đạt,200 |
| Refresh P hợp lệ | Đạt,200 |
| Logout chỉ P | Đạt,204, scope local |
| Dùng refresh-token P sau logout | Đạt như mong đợi:400, code refresh_token_not_found |
| Số request refresh lỗi trong thao tác đó | Đúng1; không replay trong lần gọi này |
| getSession P sau lỗi terminal | Session null |
| Refresh Q/getUser Q sau logout P | Đạt,200/200 |

Tổng8/8. Hai phiên thử đã cleanup local; mật khẩu/token không lưu vào report/Git. Kết quả sanitized và chương trình hỗ trợ nằm ở test-results/release (ignored), không đưa vào PR này. Không coi kiểm tra API này là nghiệm thu toàn bộ auto-refresh timer/tab ngủ/race trình duyệt.

## Đối chiếu nhật ký cũ

Auth warning sau promote lúc09:10:54 và09:12:31 có POST /token400, “Invalid Refresh Token: Refresh Token Not Found”, referer domain chính. Lượt thử có chủ ý lúc09:30:25 tạo thêm cùng mã400. Đây là lỗi token không còn tồn tại trong Auth; riêng lượt thử mới đã chứng minh nguyên nhân là logout local trước refresh.400 này không phải lỗi SMTP535/500 hay lỗi migration.

Các cảnh báo cũ chưa gán chắc cho một tab/session: log lỗi đã kiểm tra không có session_id có giá trị hoặc client_id/user-agent hữu ích để liên kết. Có nhiều phiên nghiệm thu/logout/recovery trước đó, nhưng chỉ thời gian/referer không đủ chứng minh chúng gây từng request. Không xuất Auth log/identifier/IP ra repo để suy đoán.

Nguồn đã đọc: lib/auth-service.ts dùng logout scope local; lib/use-auth.ts coi refresh_token_not_found/refresh_token_already_used là lỗi credential và chuyển signedOut, giữ session khi lỗi hạ tầng. Client ứng dụng singleton tại lib/supabase.ts. Chưa thấy đường logout global hay retry tự viết gây lỗi trong phần đã review.10/10 unit Auth/Auth-service/redirect chạy lại đạt. Kết quả này không chứng minh mọi nhánh React/SDK timer đều không lỗi.

## Quyết định và phần còn thiếu

Giữ mã ứng dụng và Production nguyên trạng. Nếu cảnh báo lặp trong một phiên mới đang sử dụng bình thường, cần bước tái hiện trên phiên browser riêng: thời gian GMT+7, thao tác trước lỗi, trạng thái mạng/tab nền và biểu hiện UI. Chỉ khi xác định được lỗi ứng dụng mới lập bản sửa/kiểm thử ở Preview; không tăng logging chứa token hoặc thay chính sách Auth để che400.

Điện thoại thật/tab nền/refresh đồng thời và nguồn chính xác của các400 cũ chưa xác minh. Không gọi chúng là lỗi Production đã được sửa hoặc mọi phiên đều đã được chứng minh an toàn chỉ từ8 ca này.

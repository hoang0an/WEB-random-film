# Sửa xác thực TMDB trên Preview

Nghiệm thu phát hiện Preview thiếu token, sau khi bổ sung biến thì vẫn lỗi vì người dùng chỉ có API Key v3 32 ký tự. Route hiện gửi mọi giá trị như Bearer token.

Giữ hỗ trợ Read Access Token qua header Authorization. Hỗ trợ API Key v3 qua query api_key theo tài liệu TMDB; đọc từ biến máy chủ TMDB_API_KEY, đồng thời nhận dạng key 32 ký tự trong trường TMDB_READ_ACCESS_TOKEN để tận dụng cấu hình Preview đã lưu. Không trả credential cho trình duyệt, không thay Supabase/RLS hay production.

Kiểm thử API contract cho Bearer, key v3, cấu hình tương thích cũ, key không lộ trong JSON; chạy typecheck/build. Push nhánh codex/preview-tmdb-api-key để Vercel tạo Preview riêng; không merge main. Sau deployment Ready, thử tìm/thêm phim bằng hai tài khoản thật và cập nhật báo cáo.

Nguồn: https://developer.themoviedb.org/docs/authentication-application.

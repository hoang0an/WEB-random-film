# Tối nay xem gì Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Triển khai website nhóm bạn thêm, bốc, chốt và đánh giá phim theo kế hoạch 08/10/2026.

**Architecture:** Next.js App Router với giao diện React tiếng Việt. Supabase Auth và PostgreSQL dùng RLS; mọi thay đổi dữ liệu nhóm qua RPC có kiểm tra thành viên. API Next.js xác thực bearer token và gọi TMDB với token máy chủ; chế độ demo riêng lưu localStorage khi chưa có Supabase.

**Tech Stack:** Next.js, TypeScript, React, CSS, Lucide, Supabase, TMDB, Vercel; Node test runner, PGlite và Python Playwright để kiểm tra.

---

## Phạm vi và quyết định
- Giữ toàn bộ tính năng đã chốt; không bộ lọc, bỏ phiếu, gợi ý, thống kê hay thông báo.
- Không xóa phim hoặc nhóm vì tài liệu đánh dấu chưa chốt.
- User đã yêu cầu bản dùng thử trước và hướng dẫn thiết lập dịch vụ.
- Điểm 1–10, bước 0.5. Chốt và Đã xem là hai hành động riêng.
- Chế độ demo có nhãn rõ, dữ liệu mẫu, không mô phỏng đăng nhập Google thành công.
- Mỗi nhóm tối đa một phim đang xem. Thành viên bất kỳ có thể thêm, chốt, đánh dấu đã xem; chỉ tự sửa điểm của mình và thêm bình luận của mình.
- Khi chỉ còn một phim, Bốc lại báo không có phim khác; không bốc lại phim vừa bỏ qua.

### Task 1: Khởi tạo và logic bốc phim
**Files:** `package.json`, `app/layout.tsx`, `app/page.tsx`, `lib/domain.ts`, `lib/demo.ts`, `tests/domain.test.ts`.
1. Khởi tạo cấu hình Next.js/TypeScript, scripts và .env.example.
2. Viết test loại phim đã xem, không lặp ngay, chỉ một phim và điểm trung bình.
3. Viết hàm drawMovie, averageRating và dữ liệu mẫu độc lập nhóm.
4. Chạy `npm test`, kỳ vọng tất cả PASS.

### Task 2: Cơ sở dữ liệu và phân quyền
**Files:** `supabase/schema.sql`, `tests/database.mjs`, `lib/supabase.ts`, `lib/repository.ts`.
1. Tạo profiles, groups, members, group_movies, ratings, comments và khóa duy nhất phim trong nhóm.
2. Bật RLS, thu hồi quyền ghi trực tiếp, hàm kiểm tra thành viên trong schema private.
3. Viết RPC tạo/tham gia nhóm, thêm/chốt/đã xem phim, chấm điểm/bình luận. Dùng auth.uid(), kiểm tra trạng thái và khóa hàng để xử lý thao tác đồng thời.
4. Test bằng PostgreSQL PGlite: người ngoài không đọc/ghi; không giả danh; trùng phim; chốt không đồng nghĩa đã xem; điểm chỉ cho phim đã xem; mã mời.
5. Chạy `npm run test:db`, kỳ vọng PASS. Cần chạy thêm trên Supabase thật sau khi user có tài khoản.

### Task 3: TMDB và đăng nhập
**Files:** `app/api/movies/route.ts`, `lib/supabase.ts`, `components/cinema-app.tsx`.
1. API xác thực Supabase getUser bearer token; không đưa TMDB token ra client.
2. Tìm bằng `language=vi-VN`, `include_adult=false`; chi tiết lấy thời lượng, fallback mô tả tiếng Anh; từ chối adult trong chi tiết.
3. Google OAuth bằng Supabase client và email/password; xử lý xác nhận email, đăng xuất, khôi phục phiên.
4. Kiểm tra API không khóa trả lỗi cấu hình; test mock TMDB, lỗi mạng và xác thực khi phù hợp.

### Task 4: Giao diện và luồng nhóm
**Files:** `components/cinema-app.tsx`, `app/globals.css`, `public/poster-placeholder.svg`.
1. Dùng @ui-ux-pro-max: nền #111315, chữ #f5f3ef, nhấn #edb45b, font hỗ trợ Việt; desktop sidebar, mobile ba tab dưới.
2. Tạo trang nhóm của tôi, tạo/join nhóm, danh sách/thành viên/mã mời.
3. Tìm thêm phim, chống trùng, hiển thị người thêm và trạng thái rỗng/lỗi.
4. Bốc/xáo poster ngắn, bốc lại tránh phim trước, chốt/đã xem; modal chi tiết, điểm, bình luận và trung bình.
5. Dialog có focus trap, Escape, trả focus; loading, nút đủ 44px, reduced-motion và fallback poster.
6. Live mode tải lại dữ liệu sau mutation và định kỳ để thấy thay đổi của nhóm.

### Task 5: Kiểm thử và bàn giao
**Files:** `tests/e2e.py`, `README.md`, `docs/verification.md`.
1. `npm run typecheck`, `npm test`, `npm run test:db`, `npm run build` phải thành công.
2. Dùng @webapp-testing: inspect DOM sau networkidle, Playwright chạy thật các luồng demo, persistence, duplicate, group isolation, empty states và rating/comment.
3. Chụp và kiểm tra 375, 768, 1024, 1440px; kiểm tra overflow, lỗi console, keyboard/dialog.
4. Viết hướng dẫn Node/npm, Supabase SQL/Auth, TMDB token, GitHub/Vercel và hạn chế xác thực live chưa có keys.
5. Khởi chạy server cho user, mở URL và bàn giao kết quả kiểm tra cụ thể. Không tự xuất bản hoặc tạo tài khoản thay user.

## Nguồn kỹ thuật
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/reference/javascript/auth-signinwithoauth
- https://developer.themoviedb.org/reference/search-movie
- https://developer.themoviedb.org/docs/faq

## Checkpoints
Ghi tiến độ từng phần trong docs/verification.md. Theo yêu cầu triển khai toàn bộ ở phiên này, tiếp tục phần tiếp theo sau kiểm tra thành công; chỉ hỏi khi thiếu thông tin bắt buộc.

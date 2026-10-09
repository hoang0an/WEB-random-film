# Kết quả triển khai và kiểm tra

Kiểm tra phát hành ngày 10/10/2026: xem [báo cáo mới nhất](release-readiness-2026-10-10.md). Nội dung dưới đây ghi lại các đợt triển khai trước; trạng thái Git và kiểm thử hiện tại nằm trong báo cáo mới.

Ngày: 09/10/2026 (Asia/Saigon). Mã nguồn dùng để build/test: **D:\code\a\webfilm**.

Nghiệm thu mới nhất sau khi chốt giao diện: [báo cáo QA](qa-2026-10-09.md). Đã sửa việc quay lại màn hình chạy lại hoạt ảnh cũ và việc dữ liệu cập nhật làm kết quả không còn hợp bộ lọc. Bản production qua 24 tình huống nghiệm thu, 8 nhóm hoạt ảnh và 14 nhóm hồi quy; lỗi dịch vụ kiểm tra bằng giả lập, chưa xác minh credentials thật.

## Phần đã hoàn thành

| Phần | Kết quả |
|---|---|
| Kế hoạch chi tiết | `docs/plans/2026-10-09-random-phim.md`; lưu kế hoạch gốc tại `docs/source-plan.md` |
| Logic bốc phim | Loại phim đã xem; bốc lại loại phim trước; không có ứng viên trả null |
| Database | 6 bảng; khóa phim duy nhất trong nhóm; RLS; thu hồi quyền ghi trực tiếp; RPC có kiểm tra thành viên và trạng thái |
| Đăng nhập thật | Code Google OAuth, email/password, xác nhận email, khôi phục phiên và đăng xuất; cần cấu hình để kiểm tra live |
| TMDB | API máy chủ xác thực getUser; tìm vi-VN, adult=false, chi tiết/runtime, fallback en-US; token không đưa ra client |
| Giao diện | Tiếng Việt; tối màu/amber; desktop sidebar; mobile 3 tab; form, dialog, empty/loading/error states, poster fallback, reduced-motion |
| Luồng phim | Thêm/chống trùng, bốc/bốc lại, ghim tối nay, đã xem, điểm cá nhân/điểm trung bình, bình luận |
| Chế độ thử | Nhãn rõ; mẫu độc lập Supabase; lưu localStorage; nhiều nhóm riêng; không giả đăng nhập Google |
| Bàn giao | README từng bước và `Mo-website.cmd`; chưa xuất bản lên mạng |

## Các kiểm tra đã chạy thành công

- `npm run typecheck`: không có lỗi TypeScript.
- `npm test`: **11/11** test logic PASS (5 test nghiệp vụ, 3 test vòng quay và 3 test bộ lọc).
- `npm run test:db`: schema chạy thành công trong **PostgreSQL PGlite**. Kiểm tra người ngoài không thấy nhóm/phim/bình luận, không thể tự thêm membership, mã sai bị từ chối, join không trùng, phim không thêm trùng, chốt chưa đánh dấu đã xem, chỉ chấm phim đã xem, ranh giới điểm và bước 0.5, sửa điểm không thêm dòng, danh tính tác giả lấy auth.uid(), từ chối chỉnh trực tiếp điểm người khác, từ chối phim khác nhóm và người chưa đăng nhập.
- `npm run test:api`: **upstream mock**, kiểm tra thiếu cấu hình 503, thiếu/sai phiên 401, input sai 400, vi-VN/adult=false, loại adult, fallback mô tả tiếng Anh, thời lượng/poster null, không trả token TMDB, rate limit và lỗi mạng.
- `npm run build`: Next.js **16.4.0**, production build thành công; route `/` static, `/api/movies` dynamic.
- `npm run test:e2e`: **14 nhóm kiểm tra PASS**, Chromium headless, server localhost thật, dữ liệu trình duyệt thử riêng.

## E2E đã kiểm tra

1. Vào demo và nhóm mẫu có 6 phim.
2. Bố cục ở **375 / 768 / 1024 / 1440 px**; không tràn ngang; tab mobile ở cuối màn hình.
3. Tìm/thêm Barbie; thêm trùng báo lỗi và không nhân bản.
4. Thiếu poster/thời lượng dùng fallback; Escape đóng dialog.
5. Tìm kiếm không có kết quả.
6. Bốc lại không lặp phim ngay trước; chốt ghim nhưng phim vẫn chưa xem.
7. Đã xem, điểm bước 0.5, sửa điểm, cập nhật trung bình, bình luận. Chuỗi `<script>` hiển thị như chữ, không thực thi.
8. Reload giữ điểm/bình luận; phim đã xem không được bốc lại.
9. Danh sách thành viên và mã mời; từ chối mã sai, chấp nhận mã đúng không phân biệt hoa thường.
10. Tạo nhóm mới trống; dữ liệu độc lập nhóm; chỉ 1 phim thì vô hiệu hóa Bốc lại.
11. Dialog responsive, Tab/Shift+Tab giữ focus trong dialog; hết phim thì vô hiệu hóa bốc.
12. Đăng xuất demo.
13. API chưa có khóa báo 503 rõ ràng.
14. Không ghi nhận JavaScript `pageerror` trong các luồng.

Ảnh đã được mở kiểm tra trực quan, gồm desktop và mobile: `test-results/draw-375.png`, `draw-768.png`, `draw-1024.png`, `draw-1440.png`, `detail-*.png`, `ratings-desktop.png`. Báo cáo máy đọc được: `test-results/e2e-report.json`.

## Hoạt ảnh vòng quay poster — kiểm tra bổ sung

Các thẻ poster xếp quanh tâm với phối cảnh, quay nhanh rồi giảm tốc trong 2,3 giây. Thẻ được chọn tiến ra trước và phóng lớn trong 0,48 giây, sau đó hiện kết quả. Giữ nguyên hàm chọn phim, điều kiện loại phim đã xem và loại kết quả trước khi bốc lại. Bộ thẻ hiển thị tối đa 10 poster nhưng luôn chứa phim được chọn từ toàn bộ ứng viên.

`npm run test:wheel`: **8 nhóm kiểm tra PASS** trên Chromium với chuyển động thật, không bật giảm chuyển động mặc định:

1. Bố cục 375 / 768 / 1024 / 1440 px không tràn ngang.
2. Quan sát 169 khung hình: tốc độ quay đầu khoảng 12,8 rad/s, cuối khoảng 1,01 rad/s; đủ các pha quay, giảm tốc, tiến ra trước và hoàn tất.
3. Poster cuối đúng phim đã chọn; thẻ giữ nguyên qua bước chuyển sang kết quả; chỉ một poster còn hiển thị.
4. Bốc lại loại kết quả trước, loại phim đã xem; bấm liên tục không tạo lượt quay chồng nhau.
5. Đổi sang kích thước điện thoại giữa lúc quay vẫn kết thúc đúng phim, poster nằm trong khung.
6. Bật giảm chuyển động giữa lượt quay hoàn tất đúng kết quả và mở lại thao tác.
7. Danh sách lớn hơn 10 phim vẫn hiện đúng phim được chọn, kể cả phim ngoài 10 thẻ đầu.
8. Một phim/thiếu poster, chốt, đã xem và hết ứng viên vẫn hoạt động; không có JavaScript pageerror.

Đã mở ảnh desktop và kết quả mobile để kiểm tra trực quan. Báo cáo và dữ liệu chuyển động: `test-results/wheel/report.json`, `test-results/wheel/motion-samples.json`. Sau thay đổi, chạy lại 14 nhóm E2E cũ, TypeScript, 8 unit test và production build đều thành công. Các kiểm tra database và API ở trên là kết quả từ đợt triển khai ban đầu; phần đó không thay đổi trong lần sửa hoạt ảnh.

## Polish màn hình bốc phim theo báo cáo critique

Đã xử lý các vấn đề trong `2026-10-09T15-00-42Z__components-cinema-app-tsx.md`: vòng quay lớn và nằm giữa; bộ lọc, poster và nút bốc cùng trục; rút gọn tiêu đề nhóm và nội dung lặp; bỏ dãy poster xem trước, thay bằng Xem danh sách; kết quả tập trung vào tên, năm/thời lượng và Chốt/Bốc lại. Màu tối/amber và hoạt ảnh giảm tốc giữ nguyên.

Người dùng đã đồng ý bổ sung bộ lọc thể loại/thời lượng. Hàm `drawMovie` không đổi; chỉ nhận tập ứng viên sau lọc. Mặc định Tất cả/Bất kỳ bao gồm phim thiếu dữ liệu. Lọc cụ thể loại phim chưa có thông tin tương ứng. Các khoảng thời lượng không chồng nhau: đến 120, 121–150, trên 150 phút. Thay đổi bộ lọc xóa kết quả cũ; khóa bộ lọc khi đang quay; chỉ một ứng viên thì không bốc lại.

Thể loại mẫu bổ sung cho các phim demo đã biết, dữ liệu demo cũ được giữ và chỉ bổ sung metadata. Phim mới TMDB lấy thể loại từ endpoint chi tiết và lưu `genres` trong database. Có migration `supabase/migrations/20261009_movie_genres.sql` cho schema cũ; phim live cũ không được tự tải lại thể loại.

Kiểm tra mới `npm run test:polish`: **7 nhóm PASS** — bố cục 320/375/768/1024/1440 px, nút bốc trong màn hình đầu, Xem danh sách, giao hai bộ lọc chọn đúng phim, khóa khi quay, một ứng viên, rỗng/Xóa lọc, bốc lại trong bộ lọc, dữ liệu cũ/thiếu metadata/phim đã xem và bàn phím. Không có JavaScript pageerror. Ảnh đã mở xem desktop/mobile tại `test-results/polish/`; báo cáo `test-results/polish/report.json`.

Chạy lại **8 nhóm hoạt ảnh**, **14 nhóm E2E**, **11 unit test**, TypeScript và production build thành công. Database PGlite kiểm tra thêm lưu thể loại và migration chạy hai lần; test API mock kiểm tra thể loại trong kết quả chi tiết. Công cụ Impeccable detect không báo lỗi trên hai component sửa. Các kiểm tra dịch vụ thật bên dưới vẫn cần credentials.

## Những phần chưa được xác nhận trên dịch vụ thật

- Supabase hosted: chạy SQL trên project người dùng, email delivery, Google OAuth, phiên đăng nhập thực tế và quan hệ PostgREST trên database hosted.
- TMDB: token của người dùng, kết quả upstream thật và điều kiện tài khoản được cấp API.
- Nhiều tài khoản/thiết bị cùng thao tác: database có khóa hàng và kiểm tra trạng thái; chưa chạy E2E với hai tài khoản Supabase thật.
- Vercel: tài khoản/repository/deploy chưa tạo. README có hướng dẫn.

Đây là **bản dùng thử đã kiểm tra + phần tích hợp dịch vụ đã viết**, chưa phải website production được kiểm tra bằng credentials thật. Dữ liệu demo không được tự nhập vào live database.

## Phạm vi giữ đúng kế hoạch

Không xóa phim hoặc nhóm vì chưa chốt. Không thêm bỏ phiếu, gợi ý phim, thống kê hay thông báo. Bộ lọc thể loại/thời lượng được bổ sung theo yêu cầu tiếp theo của người dùng; kế hoạch gốc được giữ làm tài liệu lịch sử. Chấm điểm và bình luận mở sau Đã xem; chốt và đã xem là hai bước riêng.

## Ghi chú môi trường

Node/npm bị treo tại thao tác tạo cache trong thư mục chat OneDrive. Cài/build/test thành công tại D:. Các tiến trình thử cài ở OneDrive đã được dừng. Bản source ban đầu còn ở thư mục chat; việc ghi đè đồng bộ bằng Copy-Item bị Windows từ chối cả ở lần chạy ngoài sandbox, nên không coi bản đó là bản mới nhất. README ở đó trỏ tới **D:\code\a\webfilm**, là bản hoàn chỉnh đã kiểm tra. Không merge/push/xuất bản và không xóa checkout.

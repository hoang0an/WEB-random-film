# Nghiệm thu quản lý đóng góp và nhóm — 10/10/2026

## Phạm vi và bản được kiểm tra

PR #2: https://github.com/hoang0an/WEB-random-film/pull/2, head `9eafeabaa5227e5a0655e0ea898d0d6513b603f7`. P3 đã sửa: trim từng biến TMDB trước fallback; key trắng không che token/key hợp lệ. Test hồi quy thất bại trước sửa, đạt sau sửa, gồm cả hai biến trắng → 503.

PR #3: https://github.com/hoang0an/WEB-random-film/pull/3, base `codex/preview-tmdb-api-key`, branch `codex/group-self-management`. UI live nghiệm thu ở `46cf19db3a937d33d8b7976664243fce00b8b2a6`; bổ sung sau đó chỉ tách nguyên hàm readableError sang module thuần, thêm test và tài liệu, không đổi quy tắc xử lý.

Preview: https://randomfilmkietgay-git-codex-group-self-management-hoang0an.vercel.app/. Chrome đăng nhập A (chủ nhóm), Edge đăng nhập B độc lập; người dùng tự nhập mật khẩu. Harness API riêng đăng nhập hai tài khoản, giữ token trong bộ nhớ, không đọc token từ browser. Không ghi email, mật khẩu hoặc secret vào báo cáo/Git.

Không merge main, không thay biến/cấu hình Production, không deploy/promote Production. Push nhánh chỉ tạo Preview. Main vẫn `0d9722c7704a0abd934db81c356bd6f5b1198410`. Merge mô phỏng PR #2 với main không có xung đột; merge thực tế vẫn cần kiểm tra lại cấu hình phát hành vì main đang tự tạo deployment Production theo snapshot review trước đó.

## Migration trên Supabase thử nghiệm

Đã chạy **chỉ** `supabase/migrations/20261010_group_self_management.sql` trên project thử nghiệm `dgivczwqlzxcvxwzpadm`, được người dùng xác nhận. Không chạy bootstrap schema.

SQL Editor trả Success. Đếm ngay trước/sau migration, trước khi tạo fixture nghiệm thu:

| Bảng | Trước | Sau |
| --- | ---: | ---: |
| profiles | 2 | 2 |
| groups | 3 | 3 |
| members | 4 | 4 |
| group_movies | 5 | 5 |
| ratings | 4 | 4 |
| comments | 3 | 3 |

Sáu RPC mới đều SECURITY DEFINER; anonymous không có EXECUTE, authenticated có EXECUTE. Migration không DROP/reset bảng; khóa hàng nhóm chung trước các ghi/membership. Kiểm thử cục bộ chạy upgrade từ fixture schema cũ với dữ liệu tạo trước migration, chạy migration hai lần, và cài schema mới: đều đạt. Đây không phải bằng chứng về transaction race trên PostgreSQL thật.

## Kết quả API thật — 65/65 đạt

Các mã 400/403 dưới đây là **từ chối đúng như mong đợi**, không phải lỗi nghiệm thu.

| Luồng | Kết quả thực tế |
| --- | --- |
| Đăng nhập API A/B | 200 cho cả hai |
| Xóa phim chờ | B xóa phim mình thêm: 204; B xóa A: forbidden; A xóa B: 204 |
| Phim đang chốt | Xóa pending đồng thời clear tonight; thêm lại cùng TMDB id được |
| Phim đã xem | Owner delete_movie bị movie_watched |
| Điểm cá nhân | B cập nhật 9 → 9.5; xóa điểm B giữ điểm A |
| Bình luận cá nhân | B sửa/xóa được; trim nội dung, giữ created_at; blank và >1000 bị chặn |
| Quyền chủ nhóm | A sửa/xóa bình luận B bị forbidden; A đổi tên được, B bị forbidden; owner rời bị owner_cannot_leave |
| Đổi tên | Giữ id, owner, mã mời; tên rỗng bị invalid_group_name |
| Ghi bảng trực tiếp | DELETE groups/group_movies/comments/ratings/members đều 403 |
| Nhóm riêng B | A không đọc được; RPC giả group id bị not_member |
| Sau B rời | JWT B vẫn còn hạn: GET năm bảng trả [] cho nhóm đã rời; tám RPC ghi cũ/mới bị not_member |
| Giữ lịch sử | A vẫn đọc điểm/bình luận B sau rời |
| Tham gia lại | Join hai lần vẫn chỉ hai thành viên A/B, không trùng |

Kết quả chi tiết không chứa credentials ở `test-results/group-live-results.json` (Git ignored). Harness loopback chỉ dùng cho phiên nghiệm thu và được dừng sau kiểm thử.

## Kết quả giao diện Preview

| Luồng | Kết quả thực tế |
| --- | --- |
| Quyền xóa phim | B không thấy nút xóa phim A, thấy nút cho phim B; A thấy nút phim B |
| Xác nhận/hủy xóa | Hủy giữ phim; xác nhận B xóa phim B, pending 2 → 1 |
| Đồng bộ phiên | A đang mở chi tiết phim B: sau B xóa, dialog tự đóng và danh sách còn một phim |
| Owner xóa phim B | B tìm Inception qua TMDB thật, thêm Kẻ Cắp Giấc Mơ vào nhóm thử; A xóa thành công, pending 2 → 1 |
| Phim đã xem | Không thấy nút xóa phim cho A/B |
| Sửa/xóa bình luận | B sửa và lưu nội dung mới, rồi xóa qua xác nhận; bình luận A giữ nguyên, không có nút sửa/xóa của B trên bình luận A |
| Xóa/sửa điểm | B xóa điểm: B “Chưa chấm”, trung bình 8.0 chỉ còn A; B lưu lại 9: trung bình 8.5 |
| Đổi tên nhóm | A đổi thành “Nghiệm thu quản lý UI 10-10”, cả hai phiên cập nhật; input trắng vô hiệu hóa Lưu; B không có form đổi tên |
| Chủ nhóm rời | A có lời giải thích, không có nút Rời nhóm; Escape đóng cài đặt, focus về nút mở |
| Thành viên rời | Hủy giữ membership; xác nhận B rời → về trang nhóm, nhóm thử biến mất |
| Tab B khác đang sửa | Tab B bổ sung đang mở form sửa bình luận tự đóng toàn bộ chi tiết/form và về trang nhóm sau polling; không còn nhóm đã rời |
| Lịch sử sau rời | A thấy nhóm một thành viên, điểm/bình luận B vẫn giữ; profile B vẫn đọc được vì A/B còn chung nhóm nghiệm thu cũ |
| Tham gia lại | Mã mời của nhóm sau đổi tên dùng được; B trở lại, nhóm hai thành viên |
| Tải lại B | Vẫn đăng nhập bằng phiên đã có; nhóm riêng B và nhóm tham gia lại xuất hiện đúng |

Ảnh bằng chứng cục bộ (Git ignored): `test-results/group-management/a-history-after-b-left.png`, `b-second-tab-cleared.png`. Chỉ thay đổi dữ liệu trong các nhóm nghiệm thu mới, không sửa dữ liệu nhóm có trước.

## Kiểm thử cục bộ và phần còn thiếu

- **Đạt:** 24/24 unit tests (gồm helper quyền và thông báo lỗi RPC); database cũ + fresh/upgrade/repeated migration; API contract (upstream giả lập, gồm P3); typecheck; build; kiểm tra whitespace diff.
- **Bị chặn:** race có barrier bằng hai connection PostgreSQL thật (delete đối đầu select/mark_watched, leave đối đầu các ghi/join). Công cụ hiện có SQL Editor và REST, chưa có hai connection transaction độc lập. PGlite một connection và API tuần tự không được tính thay cho bài này.
- **Chưa kiểm thử đầy đủ:** mạng mất giữa thao tác, bài stress chuyển nhóm trong lúc request chậm, bàn phím/focus toàn bộ dialog và ma trận kích thước thiết bị. Đã kiểm tra hủy xóa/rời, nút bị khóa lúc xử lý, Escape cài đặt và đồng bộ hai tab; không nhận các mục trên là đạt đầy đủ.
- **Thay cách nghiệm thu so với kế hoạch:** kiểm tra UI trực tiếp bằng công cụ trình duyệt được kết nối; chưa tạo/chạy `tests/group_management_e2e.py` hoặc script `test:groups`. Không tuyên bố đã chạy suite Python mới. Kiểm thử API thật và DB upgrade là phép thử riêng.
- **Ngoài phạm vi:** transfer owner, kick/delete group, moderation, thu hồi access JWT toàn cục tức thì, soft delete/khôi phục nội dung. Rời nhóm chặn quyền dựa trên membership ngay sau commit, không phải logout.

## Dữ liệu thử và rollback

Giữ hai nhóm mới: “Nghiệm thu quản lý UI 10-10” (A/B; một phim chờ A, một phim đã xem, điểm A 8/B 9 và bình luận mỗi tài khoản), “Nghiệm thu quản lý riêng B 10-10” (B). Phim B chờ và Inception thêm trong kiểm thử đã xóa; các nhóm/dữ liệu có trước được giữ. Không đưa mã mời vào báo cáo.

Nếu cần rollback ứng dụng: dùng Preview trước; có thể revoke EXECUTE sáu RPC mới trước khi drop function theo yêu cầu riêng. Không tự chạy rollback. Hard delete không có thùng rác nên rollback mã không khôi phục nội dung đã xóa. PR #3 giữ draft, phụ thuộc #2; chỉ retarget main sau khi #2 được phép merge và diff được review lại.

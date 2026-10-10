# Nghiệm thu quản lý đóng góp và nhóm — 10/10/2026

## Phạm vi và bản được kiểm tra

PR #2: https://github.com/hoang0an/WEB-random-film/pull/2, head `9eafeabaa5227e5a0655e0ea898d0d6513b603f7`. P3 đã sửa: trim từng biến TMDB trước fallback; key trắng không che token/key hợp lệ. Test hồi quy thất bại trước sửa, đạt sau sửa, gồm cả hai biến trắng → 503.

PR #3: https://github.com/hoang0an/WEB-random-film/pull/3, base `codex/preview-tmdb-api-key`, branch `codex/group-self-management`. Nghiệm thu bổ sung UI live ở `bd6cbf0ce58724fcf9e9bc1ba46174c67f0f157a`; bổ sung đợt này là test harness, dev dependency pg và tài liệu, không thay code ứng dụng hoặc migration đã áp dụng.

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

Sáu RPC mới đều SECURITY DEFINER; anonymous không có EXECUTE, authenticated có EXECUTE. Migration không DROP/reset bảng; khóa hàng nhóm chung trước các ghi/membership. Kiểm thử cục bộ chạy upgrade từ fixture schema cũ với dữ liệu tạo trước migration, chạy migration hai lần, và cài schema mới: đều đạt. Đợt bổ sung bên dưới đã kiểm tra race riêng trên PostgreSQL thật; không chạy lại bootstrap/migration trên Supabase.

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

## Bổ sung: PostgreSQL thật — 12/12 đạt

Hai connection pg dùng **Session pooler**, hai `pg_backend_pid` khác nhau. Transaction đầu giữ khóa, transaction thứ hai bắt đầu RPC; script xác nhận `pg_blocking_pids` chứa PID đầu trước khi commit giải phóng. TLS xác minh bằng CA chính thức Supabase. Người dùng nhập mật khẩu database trực tiếp vào form loopback; không dùng mật khẩu ứng dụng Google/SMTP.

| Trình tự đối đầu | Kết quả sau commit đầu |
| --- | --- |
| delete → select; select → delete | Select sau delete bị từ chối; delete sau select xóa pending và clear tonight |
| delete → mark_watched; mark_watched → delete | Mark sau delete bị từ chối; delete sau mark bị movie_watched, giữ phim đã xem |
| leave → add_movie; add_movie → leave | Write sau leave bị not_member; write đã commit trước leave được giữ |
| leave → save_rating; save_rating → leave | Từ chối write sau leave; giữ write trước leave |
| leave → edit_comment; edit_comment → leave | Từ chối edit sau leave; giữ edit trước leave |
| leave → join; join → leave | Kết quả membership theo thứ tự khóa: có một membership khi join cuối, không có khi leave cuối |

**Giới hạn:** ROLE authenticated + JWT subject đặt trong transaction cho A/B thật; không phải hai login Auth/password mới. Bài này kiểm tra RPC/khóa/RLS PostgreSQL dưới isolation mặc định READ COMMITTED, không chứng minh mọi isolation level, tải lớn hoặc mọi cặp thao tác. Auth API thật đã được kiểm tra riêng 65 ca ở trên.

Lần đầu harness dọn group trước comments bị foreign key chặn; đã sửa thứ tự cleanup comments/ratings → group. 12 fixture của lần đạt đã tự dọn. Hai fixture từ các lần lỗi cũ được đọc id/name và dọn trong transaction chỉ giới hạn đúng hai id đó; SQL xác nhận `remaining_race_fixtures=0`. Giữ nhóm/dữ liệu có trước và hai nhóm UI nghiệm thu. Kết quả: `test-results/group-management/concurrency.json`; script chạy lại: `tests/group-concurrency.mjs`, `tests/group-concurrency-server.mjs`.

## Bổ sung: mạng, thao tác chậm và chuyển nhóm — 8/8 ca fixture đạt

UI thực từ code PR #3 chạy build QA riêng, dịch vụ HTTP loopback giả lập có controller. Không thay biến Vercel hay network Production.

| Ca tự động | Quan sát và assertion |
| --- | --- |
| Hủy xóa | Giữ detail và record |
| Mất kết nối trước delete commit | Record giữ; confirm mở lại, nút thử lại được bật; một RPC, không app tự gửi trùng |
| Thử lại sau phục hồi | Xóa một lần; tổng RPC tăng từ 1 lên 2 do lần thử lại chủ động |
| Mất response sau delete commit | Đọc lại state, pending 0, đóng detail cũ; chỉ một RPC delete |
| Hold rename | Nút gửi và chuyển nhóm bị khóa; Enter thêm không tạo RPC thứ hai |
| Nhóm biến mất khi rename held | Polling dọn form/detail; release trả denial; sau mở nhóm thứ hai không xuất hiện lại editor/nhóm cũ |
| Sửa bình luận lỗi mạng | Giữ draft và bản gốc; nút lưu mở lại; retry chủ động lưu một lần rồi đóng editor |
| Lỗi tải nhóm lúc mở trang | Thông báo kết nối và Thử lại; khôi phục dịch vụ rồi retry tải được nhóm, không logout |

Mạng lỗi ở đây được mô phỏng bằng HTTP body ngắt giữa response; Auth fixture vẫn hoạt động. Không phải bật chế độ offline hệ điều hành trên Preview thật. Socket reset trước header có thể bị browser/SDK replay transport nên harness chuyển sang truncate body để tách rõ retry của app. Tab nền Chromium có thể trì hoãn timer polling 15 giây; bài membership được chạy theo hai checkpoint, không nhận thời hạn đồng bộ 15 giây tuyệt đối là đạt.

UI chặn chủ động chuyển nhóm khi mutation còn pending; bài mất membership chứng minh dọn view và phản hồi muộn, không tuyên bố người dùng có thể chuyển nhóm giữa mutation. Request giữ vô hạn/timeout, mất mạng toàn browser và load stress chưa xác minh. Không phát hiện lỗi ứng dụng cần sửa trong các ca đã chạy.

Kết quả ignored: `fault-checks.json` (6), `comment-recovery.json` (1), `offline-load.json` (1) trong `test-results/group-management/`. Test lặp lại có assertion record/count/draft tại `tests/group-management-browser.mjs`; cách chạy `tests/group-management-testing.md`. Không tạo/chạy Python suite mới.

## Bổ sung: bàn phím và phone viewport trên Preview

- A chủ nhóm và B thành viên: close nhận focus đầu, Shift+Tab tới nút cuối (Lưu tên nhóm/Rời nhóm), Tab quay close, Escape đóng settings và focus trả về trigger. Cả hai đạt.
- A 375×812: settings nằm trong viewport, scrollWidth = 375. A 320×740: watched/detail và edit comment không tràn ngang, detail cao hơn khung có scroll nội bộ; Hủy sửa giữ nội dung. Confirm xóa điểm focus close, Shift+Tab giữ trong dialog, Escape hủy về detail, điểm A/B vẫn 8/9.
- B desktop: confirm rời nhận focus close, Shift+Tab tới Xác nhận rời nhóm, Escape hủy về settings, membership giữ. Override 375 px ở Edge không đổi viewport đo được (1699×854), nên không tính ca này là mobile B đạt.
- Ảnh ignored: `owner-mobile-375.png`, `comment-mobile-320.png`, `race-cleanup.png`. Chưa kiểm tra điện thoại vật lý/Safari iOS, bàn phím ảo và toàn bộ dialog/ma trận breakpoint; mobile hiện là Chromium viewport, không phải chứng nhận WCAG toàn diện.

## Kiểm thử cục bộ và phần còn thiếu

- **Đạt:** 24/24 unit tests (gồm helper quyền và thông báo lỗi RPC); database cũ + fresh/upgrade/repeated migration; API contract (upstream giả lập, gồm P3); typecheck; build; kiểm tra whitespace diff.
- Đã chạy lại các lệnh trên sau thêm harness/dependency pg: tất cả exit 0. `pg` là devDependency để lặp lại race; lockfile không nâng các thư viện ứng dụng khác. Đã dừng server QA/fixture sau kiểm thử.
- **Đã gỡ chặn:** race thật 12/12 trên hai connection PostgreSQL, bằng chứng khóa trước commit; không lấy PGlite/API tuần tự thay thế.
- **Đạt bổ sung có giới hạn:** 8 ca UI mạng/request chậm với fixture, keyboard settings A/B và confirm A, viewport 320/375. Phần chưa xác minh được ghi riêng ở các mục trên; không suy ra stress/full-device/full-offline coverage.
- **Thay cách nghiệm thu so với kế hoạch:** kiểm tra UI trực tiếp bằng công cụ trình duyệt được kết nối; chưa tạo/chạy `tests/group_management_e2e.py` hoặc script `test:groups`. Không tuyên bố đã chạy suite Python mới. Kiểm thử API thật và DB upgrade là phép thử riêng.
- **Ngoài phạm vi:** transfer owner, kick/delete group, moderation, thu hồi access JWT toàn cục tức thì, soft delete/khôi phục nội dung. Rời nhóm chặn quyền dựa trên membership ngay sau commit, không phải logout.

## Dữ liệu thử và rollback

Giữ hai nhóm mới: “Nghiệm thu quản lý UI 10-10” (A/B; một phim chờ A, một phim đã xem, điểm A 8/B 9 và bình luận mỗi tài khoản), “Nghiệm thu quản lý riêng B 10-10” (B). Phim B chờ và Inception thêm trong kiểm thử đã xóa; các nhóm/dữ liệu có trước được giữ. Không đưa mã mời vào báo cáo.

Nếu cần rollback ứng dụng: dùng Preview trước; có thể revoke EXECUTE sáu RPC mới trước khi drop function theo yêu cầu riêng. Không tự chạy rollback. Hard delete không có thùng rác nên rollback mã không khôi phục nội dung đã xóa. PR #3 giữ draft, phụ thuộc #2; chỉ retarget main sau khi #2 được phép merge và diff được review lại.

## Phát hành

Kế hoạch có checkpoint: `docs/plans/2026-10-10-release-pr2-pr3.md`. Đã đọc lại Vercel trong đợt bổ sung: main vẫn auto-create Production deployment, Auto-assign bật; Project → Production vẫn No Environment Variables Added. Chưa thay cấu hình. Không merge/promote. #3 phải retarget main và review diff sau #2 merge; migration Production/SMTP/redirect/backup và post-release smoke chỉ là kế hoạch chờ quyền riêng.

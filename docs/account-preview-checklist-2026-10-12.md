# Checklist Supabase thử nghiệm và nghiệm thu Preview

Ngày 12/10/2026. **Migration tài khoản và Storage SQL trên project test đã hoàn tất theo duyệt riêng; chưa nghiệm thu Preview/HTTP ảnh.** Server key đã được người dùng nhập vào form nhưng chưa Save thành công vì nhánh chưa có trên GitHub. Chưa commit/push/deploy hoặc thay đổi Production. Gate 2 phạm vi commit không tự cấp quyền push/deploy.

Project test `dgivczwqlzxcvxwzpadm`: schema/grants 15/15 PASS, Storage cấu hình SQL 9/9 PASS. HTTP permissions/concurrency/CDN và Android vẫn chưa làm; kết quả SQL không thay thế nghiệm thu dịch vụ.

## Vai trò và thứ tự duyệt

**Bạn tự thao tác:** đăng nhập dashboard/2FA, chọn hoặc tạo project Supabase thử nghiệm, chọn Vercel project, nhập key vào nơi lưu bí mật, cấu hình Auth, tạo/xác nhận tài khoản qua email, thử máy Android và duyệt migration/push/Preview. Không gửi secret vào chat.

**Agent chuẩn bị/kiểm tra:** SQL manifest và preflight, diff, hướng dẫn, HTTP/RLS/concurrency tests và tổng hợp evidence sau khi có môi trường/quyền. Bạn không phải tự kiểm thử API bypass bằng SQL Editor. Agent đã được duyệt và thực hiện account migration/Storage SQL trên test; quyền commit/push/deploy chưa được cấp.

**Bạn hoặc agent được duyệt riêng:** chạy migration và Storage setup đúng project; tạo Preview đúng source commit. Nếu agent chưa được cấp quyền dashboard/kết nối, bạn thực hiện các thao tác này theo hướng dẫn. Luôn ghi rõ người chạy và kết quả.

## A. Chuẩn bị Supabase cô lập

- [x] **Bạn:** chọn lại project test `dgivczwqlzxcvxwzpadm`, Production tách riêng `yzvcuhlsqyljgermeiby`; chỉ dữ liệu/tài khoản thử.
- [x] **Bạn + agent:** chọn upgrade từ 6 bảng hiện có, lưu cấu trúc CSV; người dùng xác nhận dữ liệu test không cần giữ. Đây không phải backup đầy đủ/restore verified; chưa cần triển khai Production.
- [x] **Bạn chạy query:** xác nhận helper tồn tại trước khi cài Storage:

```sql
select to_regprocedure('storage.allow_only_operation(text)') as operation_helper;
```

Nếu null: dừng Storage setup, đối chiếu phiên bản dịch vụ. Không tạo helper giả hoặc bỏ điều kiện policy để đi tiếp. Helper phân biệt download/list/sign; có function chưa chứng minh Storage HTTP truyền operation đúng. [Tài liệu helper Supabase](https://supabase.com/docs/guides/storage/schema/helper-functions).

- [x] **Agent sau duyệt riêng:** chạy **chỉ** account migration vào DB test có baseline; không chạy bootstrap. Local fixtures fresh/upgrade và hosted upgrade schema/grants đã đạt; không coi đây là hosted concurrency/HTTP PASS.
- [x] **Agent sau duyệt riêng:** chạy Storage SQL sau migration; file/hash, ref và kết quả ở biên bản dưới.
- [x] **Agent:** kiểm chứng cấu hình SQL hai bucket private/WebP/3 MiB, RLS/grants/RPC và restrictive policies; chặn bypass qua HTTP thật còn ở mục D.

## B. Server key và môi trường Preview

Các URL/key công khai và server key phải cùng project thử nghiệm. Secret/service role bypass RLS nên chỉ sử dụng trên backend; key mới `sb_secret_…` cũng ánh xạ service_role, legacy key còn được hỗ trợ. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).

| Biến hiện được code đọc | Giá trị cần chuẩn bị | Bạn tự thao tác |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL project test | Nhập scope Preview đúng nhánh |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable hoặc anon key project test | Nhập scope Preview đúng nhánh |
| `SUPABASE_SERVICE_ROLE_KEY` | Key đặc quyền project test; tên biến hiện tại giữ nguyên kể cả dùng secret key mới | Lấy trong API Keys, nhập kiểu Secret; không gửi agent giá trị |
| `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` | `false` cho nghiệm thu email trước | Nhập scope Preview |
| `TMDB_READ_ACCESS_TOKEN` hoặc `TMDB_API_KEY` | Key TMDB server nếu kiểm tra thêm phim thật | Nhập Secret, không tiền tố NEXT_PUBLIC |
| `CINEMA_QA_BUILD` | Không đặt trên hosting | Xóa khỏi cấu hình Preview nếu từng đặt |

- [ ] **Bạn:** Vercel project → Environment Variables, chỉ Preview/nhánh feature đã chọn hoặc project Preview riêng. Override đủ URL/public key/server key, tránh fallback biến Production đang có. Server/TMDB key chọn **Secret** (dashboard cũ có thể ghi Sensitive). [Vercel Config/Secret](https://vercel.com/docs/environment-variables/sensitive-environment-variables), [scope theo Preview branch](https://vercel.com/docs/environment-variables).
- [ ] **Agent sau khi Preview được duyệt:** smoke-test loại key đã chọn qua API ảnh. Hosted compatibility chưa được xác minh; không thay SDK/loại key giữa chừng mà không review. Không in key/session JWT vào log/report.
- [ ] **Bạn:** cấu hình Auth Site URL và Redirect URLs cho origin Preview cố định: `/auth/callback`, `/auth/reset-password`, mẫu invite giới hạn theo hướng dẫn `docs/auth-acceptance.md`. Confirm email/SMTP dùng cấu hình test. Google không nằm trong lượt nghiệm thu email này.
- [ ] **Bạn:** cung cấp quyền truy cập Preview cho người kiểm tra/Android nếu Deployment Protection bật. Agent không cần secret bypass trong chat.
- [ ] **Bạn duyệt riêng trước push/deploy:** chốt commit/source hash, nhánh và Vercel project thử. Push branch có thể tự tạo deployment nếu Git integration bật; do đó chưa push khi chưa duyệt deploy. Preview env mới cần deployment build mới; chưa bấm Redeploy trong lượt này.
- [ ] **Người được duyệt deploy:** tạo Preview, ghi source hash/URL/build ID, Node 24/build Node route Sharp thành công. NEXT_PUBLIC được đóng vào build; URL đổi sau build cần rebuild. Không promote Production.

Thiếu server key khiến upload trả 503; thiếu account RPC/migration là lỗi cấu hình, không phải nghiệm thu hoàn tất. URL/key test đủ sẽ kích hoạt live mode; không dùng fake QA keys cho Preview thật.

## C. Dữ liệu và hành vi tài khoản

- [ ] **Bạn:** tạo/xác nhận ba tài khoản thử A (chủ nhóm), B (thành viên), C (ngoài nhóm), mỗi người dùng context/browser riêng. Có thể thêm nhóm thứ hai để kiểm tra phim trùng. Agent hướng dẫn seed nếu cần, không sửa dữ liệu Production.
- [ ] **Agent/browser hoặc bạn:** tài khoản không nhóm vẫn mở panel, email readonly; đổi tên/reload cập nhật tên toàn UI, không ghi đè bằng metadata cũ.
- [ ] **Agent/browser hoặc bạn:** A/B chấm điểm, sửa/xóa trong nhóm, danh sách cập nhật; tạo hơn 20 entry kiểm tra paging không mất/trùng. Cùng phim hai nhóm giữ hai entry.
- [ ] **Bạn/browser + agent kiểm quyền:** B rời mọi nhóm chung với A; own ratings vẫn đọc được, group data bị chặn, không sửa/xóa điểm nhóm cũ; rejoin khôi phục quyền thành viên. A chủ nhóm không được dùng luồng leave nếu quyền cũ cấm.
- [ ] **Agent:** account switch/cross-tab, hai tab CAS, lost response, offline/retry và response muộn không làm lẫn A/B hoặc báo lưu sai.

## D. Matrix Storage HTTP thật

Sau khi A lưu avatar và cover, test bằng JWT **của actor trong từng hàng**, không dùng server key để chứng minh quyền người dùng. Phải kiểm tra HTTP thật; SQL Editor chạy quyền admin không thay thế được.

| Actor với ảnh A đang attached | Avatar download | Cover download |
| --- | --- | --- |
| A | Cho phép | Cho phép |
| B còn chung ít nhất một nhóm | Cho phép | Chặn |
| B rời hết nhóm chung | Chặn request mới | Chặn |
| C ngoài nhóm | Chặn | Chặn |
| Anon/chưa đăng nhập | Chặn | Chặn |

- [ ] **Agent:** sign/signMany/list/public download bị chặn với mọi browser actor, kể cả owner; không nhận được URL ký dùng được. Kiểm tra cả path thật đã biết và path giả/owner khác.
- [ ] **Agent:** browser upload/upsert/move/overwrite/delete vào bucket cuối bị chặn; RPC reserve/cleanup service-only không cho authenticated/anon; forged owner/asset không attach được.
- [ ] **Agent:** pending/retired/deleting không tải được kể cả chủ qua luồng browser; attached cũ bị chặn sau replace/remove. Người đã tải Blob vẫn có thể giữ bản sao; không cam kết thu hồi dữ liệu đã tải.
- [ ] **Agent:** API thật auth/size/MIME/decode/pixel/ảnh động; JPEG có orientation, PNG/WebP, WebP output/crop/metadata, lỗi giữ pointer cũ. Test 3 MiB boundary, request vượt giới hạn host và không lộ lỗi/key nội bộ.
- [ ] **Agent:** concurrent reserve cap ≤20 pending, attach CAS và cleanup race trên PostgreSQL thật; cleanup retry khi Storage.remove lỗi, không xóa ảnh attached. Dùng fixture riêng, có lịch dọn.
- [ ] **Agent:** logout/account switch/CDN không phát lại ảnh người khác, request mới sau leave/replace bị chặn. Ghi status/error/Cache-Control đã che định danh nhạy cảm; không chỉ dựa vào ảnh cũ trong DOM/Blob cache.

## E. Android và nghiệm thu Preview

- [ ] **Bạn tự thử:** iQOO Z10 Turbo Pro, Android/Chrome, ghi phiên bản; dùng A và B lần lượt. Mở Tài khoản, bàn phím/scroll, chọn JPEG/PNG/WebP từ máy, preview, lưu, reload, thay và bỏ cả avatar/cover.
- [ ] **Bạn tự thử:** ảnh quá lớn/không hợp lệ được báo lỗi, hủy picker không mất ảnh; mất mạng khi lưu không báo thành công giả. Ghi case, kết quả, ảnh màn hình đã che email nếu có lỗi.
- [ ] **Agent:** hồi quy nhóm/bốc/chốt/điểm/comments và auth trên Preview với dịch vụ thật; các suite mock hiện có không được tính là hosted PASS.
- [ ] **Bạn + agent:** quyết định cleanup định kỳ; hiện chỉ chạy khi upload, grace một giờ. Ghi người vận hành, lịch, cách retry và cảnh báo dung lượng nếu đưa lên Production.
- [ ] **Agent:** tổng hợp manifest, case/PASS/FAIL/blocked, evidence và giới hạn còn lại; không lưu JWT/key trong artifact. Nếu quyền/ảnh riêng tư sai, dừng nghiệm thu và sửa trước release.
- [ ] **Bạn:** duyệt nghiệm thu Preview. Migration/Production deploy/promote là lượt duyệt riêng; có backup và rollback manifest trước khi chạy.

## Biên bản kết quả để điền sau

| Mục | Giá trị |
| --- | --- |
| Supabase test project ref / baseline | `dgivczwqlzxcvxwzpadm`; 6 bảng nền tảng, helper Storage và RPC leave/rename có; account RPC chưa có trước migration. Preview/Production refs tách riêng theo người dùng kiểm tra |
| SQL files/hashes / người chạy / thời điểm | Agent qua SQL Editor, ngày 12/10/2026: account migration và Storage SQL đều Success; hashes/query IDs ở phần bằng chứng dưới |
| Key type và scope (không giá trị key) | Vercel form Secret / Preview nhánh `codex/project-maintenance-20261011`; người dùng nhập key nhưng Save bị chặn branch-not-found; chưa lưu thành công |
| Preview URL / source commit / deployment ID | Chưa tạo |
| HTTP quyền/CAS/cleanup evidence | Chưa chạy |
| Android OS/Chrome và A/B cases | Chưa chạy |
| Quyết định cleanup vận hành | Chưa chốt |
| Kết luận nghiệm thu / người duyệt | Chưa nghiệm thu |

### Bằng chứng migration đã áp dụng

File `supabase/migrations/20261011_account_features.sql`, SHA256 `41eb817328dc018cba0e57a94c15f6599941fb00a60d19273e8707809a9bf771`.

Người dùng xác nhận dữ liệu test không cần giữ và yêu cầu agent thực hiện thay. Agent chỉ áp dụng migration tài khoản, không reset/xóa dữ liệu. Truy vấn mới: `https://supabase.com/dashboard/project/dgivczwqlzxcvxwzpadm/sql/b3430a6c-3fa2-412a-ad0b-27efb923c832`; SQL đã dán khớp file nguồn, Supabase báo `Success. No rows returned`.

Truy vấn kiểm chứng chỉ đọc: `https://supabase.com/dashboard/project/dgivczwqlzxcvxwzpadm/sql/4b0040ef-5b49-4ce4-bb22-112fee9e369c`. Cả 15 kiểm tra true: avatar_path, RLS settings/assets, 3 RPC cá nhân, authenticated được gọi/anon bị chặn, browser bị chặn reserve/cleanup/đọc registry, service được reserve nhưng không INSERT/UPDATE registry trực tiếp, số hàng cũ không đổi (profiles 2/groups 5/members 7/movies 7/ratings 6/comments 5).

Ảnh: `test-results/account-hosted/migration-verification.png` (ignored). Đây là xác minh schema/grants và số hàng, chưa phải nghiệm thu own-rating projection/Storage HTTP bằng actor JWT. Không thao tác Production `yzvcuhlsqyljgermeiby`, chưa commit/push/deploy.

### Storage setup và bàn giao nhập key

Theo yêu cầu tiếp tục của người dùng, agent đã áp dụng `supabase/storage/account-images.sql` trên project test, SHA256 `0803b4cfe8a42c37d90da2d4720dab18e24b321a8f011b9dbd48c05f6512b416`. Query `f21745d6-4833-42a8-9090-6c151d5c3a1c` báo Success; kiểm chứng query `3f42bb71-9fcb-4d2c-b5fd-49c4967ff623` có 9/9 true: hai bucket private/WebP/3 MiB, helper/read function, download operation policy và bốn restrictive guards. Ảnh `test-results/account-hosted/storage-verification.png`. Chưa chứng minh quyền HTTP thật.

Agent mở Supabase API Keys đúng project test; có secret key default hiện hữu, không tạo/reveal/copy giá trị secret. Vercel form chuẩn bị `SUPABASE_SERVICE_ROLE_KEY`, Type Secret, chỉ Preview branch `codex/project-maintenance-20261011`; Production/Development và Preview toàn bộ không chọn. Ảnh form trống trước bàn giao `test-results/account-hosted/key-entry-handoff.png` là snapshot lịch sử, không ảnh sau nhập key.

Người dùng báo đã nhập key. Agent chỉ đọc lỗi: `Branch "codex/project-maintenance-20261011" not found in the connected Git repository.` Key chưa được Save thành công; lỗi scope nhánh, không phải thông báo key sai. Người dùng chọn giữ scope nhánh: duyệt commit/push để nhánh có trên GitHub rồi tự lưu key theo scope đó; không cấp key cho Preview chung. Không gửi secret vào chat/artifact. Nếu form đã đóng, mở lại và nhập sau khi nhánh tồn tại. Chưa Redeploy.

Trạng thái hiện hành: migration và Storage SQL test đã áp dụng; server key chưa lưu thành công do branch-not-found; chưa commit/push/deploy/Preview mới, chưa nghiệm thu HTTP/Android, không thay đổi Production.

# Checkpoint proxy local — Gate 2 đã duyệt, 12/10/2026

Trạng thái mới nhất: Gate 1 đã duyệt qua yêu cầu triển khai `ecc:plan-orchestrate`. Đã thay browser Storage download bằng GET proxy server, xác minh JWT và RPC quyền đầu/cuối sau buffer; tối đa 3 MiB WebP, deadline server tổng 10 giây, abort và no-store trên mọi response. SQL repair tạo RPC actor hẹp và restrictive policy chặn toàn bộ direct SELECT trong hai account bucket. POST/registry/CAS/cleanup và quyền avatar/cover giữ nguyên.

**Local hoàn tất; hosted CHƯA nghiệm thu.** Bản Preview hiện tại `07ab753` vẫn có bằng chứng cache0 FAIL sau leave. Gate 2 đã được người dùng duyệt để commit/push đúng 11 file tạo Preview. SQL hosted mới chưa được duyệt/chạy; Production giữ nguyên.

Kiểm chứng local:

- Unit 67/67; API và DB đầy đủ PASS, gồm Storage bootstrap/upgrade, repair chạy hai lần không đổi dữ liệu.
- API kiểm JWT pin actor, RPC hai lần, deny trước download, leave/replace/remove trong lúc buffer, grant trước leave theo Council, retry xét lại quyền, malformed/upstream errors, timeout/abort, MIME/magic/size và no-store.
- Client repository 24/24, không gọi Storage, query encode, body timeout/muộn, logout/switch/revoke. Coverage source repository: lines 100%, branches 81.48%, functions 100%.
- API fixtures transpile: GET helper lines 97.54%, branches 92.06%; route lines 92.22%, branches 78.95%. Đây là coverage code thực thi tương đương, chưa remap dòng TypeScript. Không suy ra hosted coverage.
- Typecheck, production build và QA build PASS. Auth E2E và session E2E PASS với mock Supabase.
- Account live UI mock PASS 1440/375: proxy denial fallback, WebP Blob hiển thị, không direct Storage, upload thất bại, lost-response không replay, unmounted late write, cross-tab actor isolation. Report/screenshots ignored: `test-results/account-live/report.json`, `account-1440.png`, `account-375.png`.
- Hai reviewer độc lập security/behavior không thấy blocker code. Sửa fetch mock không restore và chờ ảnh decode; đồng bộ held-route/response actor thay vì networkidle toàn trang. Kiểm thử demo panel không áp dụng server QA live có Supabase config; lần chạy nhầm mode không phải lỗi sản phẩm, không ghi demo panel PASS.

Phạm vi Gate 2 và checklist Supabase test/Preview: [kế hoạch proxy](account-image-proxy-plan-2026-10-12.md), **11 file**, message `fix: gate account image reads through server authorization`. Không lấy maintenance, PLAN, generated files hoặc private fixtures. Gate 2 được duyệt ngày 12/10/2026; chỉ stage đúng manifest này.

Sau duyệt cần riêng SQL test `20261012_account_image_proxy.sql`, phối hợp cutover Preview, kiểm gateway server key/RPC nguồn ghi/final snapshot và actor matrix. Legacy Storage URL đã warm cần purge/hết cache và xác minh cùng URL cũ. Android Chrome cần thử lại Preview mới. Không chạy Production.

---

# Nghiệm thu tài khoản trên Preview — 12/10/2026

**Chưa nghiệm thu xong, chưa cho phép Production.** Policy metadata đã sửa trên Supabase test theo duyệt riêng. Người dùng sau đó duyệt commit/push đúng 6 file: commit `07ab753889ab50022f3d20a543ede8da900463dd`, Preview mới Ready. Ca cache vẫn FAIL sau khi triển khai max-age=0; cần thống nhất hướng tải qua server.

Môi trường: Supabase test `dgivczwqlzxcvxwzpadm`. Lượt đầu Preview `https://randomfilmkietgay-isme3a1jb-hoang0an.vercel.app/`, deployment `FwDTxqevtyGkKXaihELChtkeD15q`. Sau sửa: `https://randomfilmkietgay-9qceluppp-hoang0an.vercel.app/`, deployment `DwJzFn2XeE1cLHvA3Sgw1A6Knwru`, build 24s/source `07ab753`. Production `yzvcuhlsqyljgermeiby` không thay đổi.

## Tài khoản QA và UI đã kiểm chứng

Người dùng tự nhập admin key test vào prompt cục bộ ẩn. Công cụ Admin API tạo A/B/C với mật khẩu ngẫu nhiên và `email_confirm: true`, không gửi email. Run `20261011222114-ec52f333`: cả ba create/confirmed/password login PASS. Không tắt Confirm email cho user thường. Credentials fixture nằm trong thư mục local ACL riêng, ignored; báo cáo không chứa key/password/JWT.

- A đăng nhập Preview, chưa có nhóm vẫn mở được panel; email readonly; trạng thái điểm rỗng đúng.
- Đổi tên thành `QA account A nghiệm thu`, header đồng bộ và giữ qua reload.
- A tạo nhóm fixture `QA account 20261011222114-ec52f333`; nhóm này dành riêng cho A/B/C.
- JPEG avatar và PNG cover upload bằng API thật, chuẩn hóa WebP; sau sửa policy metadata, ảnh tải được qua owner JWT và giữ qua reload. DOM xác minh avatar 512×512, cover 1600×600.

Ảnh ignored: `test-results/account-hosted/qa-a-name-reload.png`, `qa-avatar-cover-reload.png`. Seed report: `test-user-seed-report.json` cùng thư mục.

## Lỗi 1 — CDN metadata bị policy chặn, đã sửa trên test

UI báo lưu avatar thành công nhưng hiển thị initials. Owner HTTP download trả 400/Object not found. SQL xác minh object tồn tại, asset attached, pointer khớp; mô phỏng owner JWT + download operation thấy object qua RLS. Storage logs cho thấy request tải đi qua `/object/info/...`; operation metadata `object.get_authenticated_info` bị policy download-only chặn.

Đối chiếu [operation chính thức](https://github.com/supabase/storage/blob/master/src/http/routes/operations.ts) và [helper normalization](https://supabase.com/docs/guides/storage/schema/helper-functions). Sửa hai SELECT policies để metadata dùng cùng `private.can_read_account_image` với download; không mở sign/list/public-read/write.

Script: `supabase/storage/20261012_account_image_metadata.sql`, SHA256 `3061dcdb18407a2fd159f5f11910854d33c12f783ebde883c406efb29596b65f`. Người dùng duyệt; agent chạy test SQL query `82e06df4-4d4e-46bb-8fa3-65d5ae3e32f8`, Success. Không sửa bucket/object data.

Sau sửa, cùng object/owner download 200 image/webp. Local hồi quy tái hiện RED trước sửa, GREEN sau sửa; bootstrap/upgrade (repair chạy lại hai lần) PASS, owner/current-peer/leaver/outsider/anon và sign/list/write guards giữ đúng trong fixture. Không suy diễn local PASS thành toàn bộ HTTP PASS.

## Lỗi 2 — quyền avatar bị CDN giữ sau leave, bản sửa local chờ triển khai

**Cập nhật sau triển khai:** Đã upload lại avatar và cover trên Preview `07ab753`; HTTP xác minh cả hai `public, max-age=0`. Matrix lại đạt 20 ca đầu rồi FAIL B avatar sau leave. Tái hiện độc lập: B 0 nhóm, same URL 200/CF HIT/max-age=0; fresh query 400/BYPASS và info bị chặn. Vì vậy max-age=0 chưa đóng lỗi. Bằng chứng `storage-actors-cache0-report.json`, `owner-download-cache0-report.json`, `leaver-cache0-report.json`. Đề xuất [kế hoạch server-gated read](account-image-proxy-plan-2026-10-12.md), chưa triển khai/chưa được duyệt. Các đoạn bên dưới là checkpoint trước deploy, không phải trạng thái hiện hành.

Matrix HTTP A/B/C dùng publishable key + actor JWT, không dùng admin key. Đã đạt 20 kiểm tra trước ca leave: owner avatar/cover cho phép; outsider/anon bị chặn; B chung nhóm đọc avatar nhưng không cover; A/B/C không tạo signed URL và list không lộ attached object.

**FAIL:** B leave thành công nhưng URL avatar vừa tải vẫn trả 200. Tái hiện độc lập: B có 0 nhóm; URL cũ trả 200 với `CF-Cache-Status: HIT`, `Cache-Control: public, max-age=60`; thêm query mới trả 400/BYPASS, `.info()` cũng bị chặn. Sau hết khoảng cache, URL cũ bị chặn. Đây là cache grant cũ, không phải membership còn tồn tại. Chưa đạt yêu cầu request mới bị chặn ngay sau leave. Metadata repair không gây cấp quyền outsider mới; nó làm lộ vấn đề cache có sẵn khi download bắt đầu hoạt động.

Bản sửa local chuyển upload object `cacheControl: '60'` sang `'0'`. Test actual Route Handler/Supabase SDK HTTP headers RED với max-age=60, GREEN với max-age=0. **Chưa xác minh CDN thật trên object mới max-age=0**; không tuyên bố lỗi 2 đã đóng. Ảnh cũ còn cacheControl=60: cần reupload bằng bản mới hoặc quy trình purge trước khi nghiệm thu, không chỉ sửa client fetch `no-store`.

Bằng chứng ignored: `storage-actors-first-report.json`, `leaver-cache-report.json`, `owner-download-report.json`; không chứa credentials. Script QA B đã rời nhóm; A vẫn là chủ, C ngoài nhóm. A hiện giữ hai ảnh thử.

## Kiểm tra local bản sửa và phạm vi commit kế tiếp

Unit 61/61, account images API fixture, Storage bootstrap/upgrade, typecheck, production build và whitespace check PASS. Next.js Route Handler guide cục bộ đã đọc trước sửa route. Không đổi kiến trúc, dependency hoặc UI. Chưa stage/commit/push bản sửa này.

Phạm vi đề xuất **6 file**, không lấy maintenance hoặc PLAN:

```text
app/api/account/images/route.ts
supabase/storage/account-images.sql
supabase/storage/20261012_account_image_metadata.sql
tests/account-images-api.mjs
tests/account-storage.mjs
docs/account-preview-acceptance-2026-10-12.md
```

Message đề xuất: `fix: allow account image metadata and disable stale CDN grants`.

Sau duyệt commit/push: tạo Preview từ bản sửa, reupload ảnh fixture để max-age=0 thực sự có hiệu lực, rerun same-URL actor matrix ngay sau leave/replace/remove. Nếu cache vẫn phục vụ grant cũ, dừng nghiệm thu và đánh giá đường tải server recheck/no-store; không nới RLS hoặc đổi sang signed URLs để né ca này.

Chưa làm: own-rating sau leave/paging/phim trùng; hai tab CAS/lost response; hosted direct-write/forged assets; API ảnh lỗi/giới hạn host; real PostgreSQL concurrency/cleanup; Android; full group/auth regression và cleanup vận hành. Tạo QA user xác nhận sẵn không kiểm chứng email delivery/reset.

# Nghiệm thu tài khoản trên Preview — 12/10/2026

**Chưa nghiệm thu xong, chưa cho phép Production.** Preview đang chạy commit `50af8b5`; policy metadata đã sửa trên Supabase test theo duyệt riêng. Bản sửa cache bên dưới chỉ ở local, chưa commit/push/deploy.

Môi trường: Supabase test `dgivczwqlzxcvxwzpadm`, Preview `https://randomfilmkietgay-isme3a1jb-hoang0an.vercel.app/`, deployment `FwDTxqevtyGkKXaihELChtkeD15q`. Production `yzvcuhlsqyljgermeiby` không thay đổi.

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

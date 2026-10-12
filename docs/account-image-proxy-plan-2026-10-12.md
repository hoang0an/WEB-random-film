# Tải ảnh tài khoản qua server — Gate 2 đã duyệt, chờ nghiệm thu hosted

## Vấn đề đã xác minh

Preview `07ab753` upload WebP với `Cache-Control: public, max-age=0` đã đúng; nhưng matrix HTTP actor vẫn FAIL B avatar ngay sau leave (URL đã warm trả 200). Vì vậy metadata repair đã giải quyết ảnh không hiển thị, còn cacheControl 0 **chưa giải quyết quyền đọc ngay sau leave**. Không tiếp tục Production với kết quả này.

Bằng chứng: `test-results/account-hosted/storage-actors-cache0-report.json`, `owner-download-cache0-report.json`, cùng ca tái hiện cache0. Không chứa JWT/key/password. Bản cũ max-age60 cũng đã tái hiện HIT sau leave và BYPASS khi thêm query.

## Phương án khuyến nghị

1. Bổ sung GET vào `/api/account/images`: client gửi Bearer JWT, kind và path; server xác minh user và kiểm tra quyền hiện tại qua RPC boolean hẹp **mỗi request**. Bucket chỉ từ kind avatar/cover, path validate đúng dạng registry. Không nhận URL/bucket tùy ý.
2. RPC chỉ trả true khi `private.can_read_account_image` cho phép: attached/current pointer, cover owner-only, avatar owner/current shared-peer. Chạy RPC bằng chính JWT user, không dùng service_role để chứng minh quyền. Không trả registry hoặc mở quyền đọc nhóm cũ.
3. Chỉ sau quyền true, backend dùng server key tải WebP từ Storage vào buffer; kiểm quyền/current-pointer lần cuối rồi mới trả bytes với `Cache-Control: private, no-store, max-age=0`, `Vary: Authorization`, và no-store cho CDN/Vercel. Giữ size/timeout và lỗi đã sanitize; không trả signed URL hoặc URL Storage trong response.
4. Client account service gọi GET rồi tạo Blob URL; giữ kiểm tra actor/response muộn, hủy request và revoke Blob. Avatar ở header/thành viên dùng cùng đường đọc này.
5. Storage SELECT cho browser actors trong hai bucket bị chặn cả download/metadata/sign/list; chỉ service_role backend đọc được sau quyền RPC. Giữ restrictive guards chống legacy permissive policies, server-only upload/registry/CAS/cleanup như hiện tại. Không đổi membership hay dữ liệu lịch sử điểm.
6. Khi chuyển policy, các URL Storage đã từng được CDN warm trước đó có thể còn cache; cần purge theo khả năng dịch vụ hoặc xác minh cache cũ đã hết trước nghiệm thu. Không ghi PASS chỉ vì request có query nonce bị chặn. Production chưa có ảnh feature được phát hành, nhưng vẫn cần migration/rollout duyệt riêng.

## Giới hạn request đang chạy — Council chốt ngày 12/10/2026

Council chốt semantics; người dùng đã duyệt implementation local qua yêu cầu ecc:plan-orchestrate. Hosted và Gate 2 cần duyệt riêng.

**Mốc cấp quyền là snapshot của lần truy vấn DB cuối**, sau khi tải đủ ảnh vào buffer và ngay trước khi tạo response. Kiểm quyền đầu request dùng để từ chối sớm; không đủ để quyết định gửi bytes. Lần kiểm cuối phải dùng DB nguồn ghi/nguồn nhất quán đã kiểm chứng, không cache kết quả quyền hoặc dùng transaction snapshot cũ/replica trễ.

- Leave commit được nhìn thấy trong snapshot cuối: bỏ buffer, từ chối trả ảnh. Request đến trước leave cũng bị chặn nếu còn chờ tải Storage tại lúc quyền thay đổi.
- Snapshot cuối cấp quyền trước leave commit: request có thể hoàn tất, kể cả byte đầu/cuối tới sau commit. Không cam kết hủy HTTP transmission đã bắt đầu hoặc thu hồi byte/Blob đã nhận.
- Lần kiểm cuối xác nhận cùng actor và chính asset/path bất biến đã tải còn attached/current-pointer; avatar owner/current shared-peer, cover owner-only. Nếu pointer thay/bỏ trước snapshot cuối, không gửi ảnh cũ. Pointer thay sau snapshot cuối được xử lý cùng semantics với leave.
- Deadline tổng 10 giây cho xử lý server từ nhận request đến hoàn tất kiểm cuối/tạo response. Hết deadline thì bỏ buffer/trả thất bại; không dùng kết quả quyền cũ để trả ảnh. Đây không phải bảo đảm mọi byte tới thiết bị trong 10 giây; thời gian truyền mạng sau response có thể dài hơn. Client vẫn có cơ chế abort/response-generation guard.
- Mọi HTTP retry là request mới: xác minh JWT và quyền DB lại, không dùng quyết định lần trước. Không tự loop tải lại vô hạn; nếu pointer đổi, request hiện tại từ chối và client có thể tải hồ sơ rồi tạo request mới.
- Không giữ khóa membership suốt quá trình tải/truyền ảnh. Việc chống cache direct Storage cũ và deny direct reads vẫn là điều kiện riêng, không được coi double-check là đã thu hồi các URL cache cũ.

**Kiểm thử thứ tự có điều khiển:** (1) leave commit trước lần kiểm đầu → deny; (2) kiểm đầu allow, giữ Storage chậm, leave commit, kiểm cuối → deny; (3) kiểm cuối allow rồi leave commit → response được phép hoàn tất; (4) replace/remove ở trước và sau snapshot cuối; (5) timeout/retry phải xét quyền mới. Dùng điểm đồng bộ ở server/DB, không suy luận thứ tự bằng giờ trình duyệt hoặc chỉ test request bắt đầu sau leave.

Council: Architect ban đầu chọn một lần đọc quyền DB có deadline; Skeptic/Pragmatist/Critic độc lập cùng chọn lần đọc cuối sau buffer. Architect đổi khuyến nghị vì double-check loại khoảng chờ Storage mà không giữ khóa dài. Phản biện mạnh nhất với snapshot semantics là yêu cầu không byte nào tới sau leave; điều đó không được cam kết vì vẫn có race snapshot→response và dữ liệu đã gửi không thu hồi được.

## Phạm vi file dự kiến

- `app/api/account/images/route.ts`: GET authorization + binary response; giữ POST upload.
- `lib/account-repository.ts`: thay download Storage trực tiếp bằng API GET pinned actor token.
- `supabase/storage/account-images.sql`: bootstrap RPC authorizer và deny browser SELECT.
- Migration/repair mới dưới `supabase/storage/`: áp RPC/policies lên test hiện có, transaction/idempotent; không chạy Production.
- `tests/account-images-api.mjs`, `tests/account-storage.mjs`, `tests/account-repository.test.ts`: hồi quy boundary/headers/owner-peer-cover/actor switch.
- Báo cáo nghiệm thu và checklist: cập nhật contract server read và bằng chứng; không lấy edits maintenance/PLAN vào feature commit.

## Kiểm thử và thứ tự

1. Tái hiện RED client/server/RPC; implement local, unit/API/Storage/typecheck/build/review.
2. Trình Gate 2 mới với manifest/message cụ thể trước commit/push. Quyền push 6 file `07ab753` không được suy diễn cho thay đổi kiến trúc này.
3. Người dùng duyệt apply RPC/policy test tại bước mở/chặn operation; agent thực hiện sau duyệt, không bỏ RLS/Confirm email hoặc phát secret.
4. Preview đúng commit: ảnh owner/peer được đọc qua server, outsider/anon/cover-peer denied; B đã warm ảnh leave rồi request mới cùng URL API phải denied ngay. Thay/bỏ ảnh: pointer cũ bị chặn. Direct Storage actor request/sign/list/write cũng bị chặn; kiểm cache legacy riêng.
5. Hai tab/logout/response muộn/timeout/invalid path, không leak service key, size/timeouts; rồi tiếp tục lịch sử điểm/concurrency/Android.

Giới hạn giữ nguyên: dữ liệu Blob đã tải có thể được người dùng giữ bản sao; không cam kết xóa bản sao khỏi thiết bị. Mục tiêu là server không cấp thêm ảnh khi quyền hiện tại không cho phép.

**Gate 1 đã duyệt. Code đã triển khai local; chưa commit/push và chưa chạy SQL mới hosted.**

## Tiến độ triển khai và quyền sở hữu file

Ngày 12/10/2026: user yêu cầu triển khai theo kế hoạch, Gate 1 đã duyệt. Root dùng pipeline orch-change-feature, mức lớn vì đổi authorization/API/SQL/client. Ba implementation agent đã bàn giao: server (route/helper/API tests), DB (bootstrap/repair/Storage tests), client (repository/tests). Root tích hợp/browser/build/docs. Hai reviewer độc lập bảo mật/hành vi không thấy blocker code; lỗi test rò fetch mock và chờ decode ảnh đã sửa.

### Manifest Gate 2 — 11 file

```text
app/api/account/images/route.ts
lib/account-image-read-server.ts
lib/account-repository.ts
supabase/storage/account-images.sql
supabase/storage/20261012_account_image_proxy.sql
tests/account-images-api.mjs
tests/account-storage.mjs
tests/account-repository.test.ts
tests/account-live_e2e.py
docs/account-image-proxy-plan-2026-10-12.md
docs/account-preview-acceptance-2026-10-12.md
```

Message: `fix: gate account image reads through server authorization`.
Không lấy PLAN, maintenance/README/.gitignore, generated next-env, private fixtures/test-results hoặc secrets.

### Checklist Supabase test / Preview sau Gate 2

1. Duyệt riêng SQL repair `supabase/storage/20261012_account_image_proxy.sql`, chỉ test `dgivczwqlzxcvxwzpadm`. Ghi hash/query ID. Không chạy bootstrap hoặc metadata repair cũ sau proxy repair vì có thể đổi policy. Repair transaction/idempotent, không sửa object/registry data.
2. Phối hợp cutover với Preview mới: deny direct Storage làm client Preview cũ hiện fallback trong khoảng chuyển tiếp QA. Không mở lại policy cũ để né lỗi. Sau Gate 2 commit/push đúng 11 file nhánh feature; xác minh Preview đúng hash/Ready. Không merge/promote Production.
3. Server key chỉ Preview/feature branch. Nếu thiếu, user tự nhập Vercel rồi Save; agent không reveal/copy key. Public URL/key cùng Supabase test; Production vẫn `yzvcuhlsqyljgermeiby`.
4. A/B/C fixture: owner avatar/cover allow, peer avatar allow/cover deny, outsider/anon deny. API mọi status private/no-store/Vary, không trả Storage URL/secret. Kiểm chứng server key tải WebP trên gateway thật.
5. B warm cùng API URL, leave commit rồi request mới cùng URL deny; replace/remove trước finalcheck deny oldpath. Barrier thứ tự DB thật, RPC fresh đọc writer/source nhất quán. Finalsnapshot grant trước leave có thể hoàn tất theo Council; không hứa thu hồi Blob đã nhận.
6. Browser JWT direct download/info/sign/list/write bị chặn. URL Storage legacy đã warm phải purge hoặc chờ hết rồi kiểm đúng URL cũ. Nonce BYPASS không là bằng chứng. Chưa hết cache thì giữ blocker.
7. Upload/attach/CAS, logout/hai tab/response muộn, lịch sử điểm/paging. User tự kiểm Android Chrome iQOO Z10 Turbo Pro trên Preview mới; kết quả Android cũ không thay nghiệm thu mới.
8. Report sanitized/cleanup QA; không commit credentials/Auth backup/JWT. Production chỉ đề xuất sau đủ bằng chứng và có duyệt riêng.

Gate 2: người dùng duyệt ngày 12/10/2026, commit đúng 11 file và push nhánh feature tạo Preview. SQL test vẫn cần duyệt riêng; không merge hoặc phát hành Production.

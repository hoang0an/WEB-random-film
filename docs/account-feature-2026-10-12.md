# Tính năng tài khoản — kết quả triển khai 12/10/2026

Trạng thái: đã tích hợp và kiểm chứng cục bộ, chưa commit/push/deploy. Migration tài khoản và Storage SQL đã áp dụng trên Supabase test `dgivczwqlzxcvxwzpadm` theo yêu cầu người dùng; chưa thay đổi Production hoặc nghiệm thu HTTP ảnh. Code nằm ở `.worktrees/group-self-management`, branch `codex/project-maintenance-20261011`, baseline `4076612`. Đây không phải báo cáo nghiệm thu Production.

## Hành vi đã triển khai

- Nút **Tài khoản** mở thông tin cá nhân, email chỉ đọc, đổi tên, xem trước/thay/bỏ avatar và ảnh bìa. Tên chuẩn từ `profiles.name` cập nhật header, thành viên, bình luận và đánh giá của chính người dùng; không lấy Auth metadata cũ ghi đè.
- Danh sách phim đã chấm hiển thị điểm hiện tại, có phân trang. Theo phương án B, người dùng vẫn đọc được đánh giá của mình sau khi rời nhóm. Cùng phim ở nhiều nhóm giữ nhiều mục; không có nhật ký mọi lần sửa, ngày chấm giả hoặc cam kết lưu vĩnh viễn.
- RPC cá nhân chỉ trả projection cho chính chủ, không trả ID/tên nhóm hay dữ liệu thành viên khác. Rời nhóm vẫn mất quyền đọc dữ liệu nhóm thông thường; sửa/xóa điểm vẫn yêu cầu thành viên.
- Avatar chỉ chính chủ và người còn chung nhóm được đọc; ảnh bìa chỉ chính chủ. Không tạo thư viện ảnh pending/retired cho peers.
- Demo giữ hồ sơ riêng trong localStorage và ảnh Blob trong IndexedDB; danh sách điểm lấy từ dữ liệu nhóm đã lưu. Demo không gọi hosted Storage.

## Quyết định và lỗi đã giải quyết

Giữ kiến trúc Next.js/React, Supabase Auth/RPC/RLS, store nhóm và polling hiện tại. Bổ sung module AccountService, panel và integration riêng, không xây lại luồng nhóm. Sharp 0.35.5 là dependency trực tiếp cho route Node: JPEG/PNG/WebP tĩnh, tối đa 3 MiB/24 triệu pixel, reencode WebP bỏ metadata, avatar 512×512 và cover 1600×600.

Điều chỉnh đề xuất URL ký ở PLAN mục 10: implementation dùng **download có JWT rồi tạo Blob URL**, không cấp signed URL. Storage policy chỉ cho operation `object.get_authenticated`, chặn signing/listing và browser ghi trực tiếp. Lý do: TTL trong client không ngăn người dùng tự xin URL ký dài hạn. Blob đã tải không thể thu hồi khỏi thiết bị; URL ký tồn tại trước migration cũng không bị thu hồi hồi tố.

Registry được đặt chỗ **trước upload**, qua RPC service-only có khóa chung với account update và giới hạn 20 pending nguyên tử. Cleanup chạy trước reserve, retry cả state deleting, không xóa asset đang được tham chiếu. Đã khắc phục trường hợp bị kẹt vì pending cũ, object upload thiếu registry và cleanup không retry. Service role chỉ SELECT/DELETE registry trực tiếp; reserve đi qua RPC.

Mutation dùng CAS revision, JWT ghim theo actor và guards cho response muộn/đổi tài khoản. Timeout không tự replay; đối chiếu hồ sơ để xác nhận kết quả. Demo rollback khi persist thất bại. Canonical profile overlay ngăn snapshot nhóm cũ làm tên quay lại.

## Bằng chứng kiểm tra

| Kiểm tra | Kết quả và giới hạn |
| --- | --- |
| Unit | 61/61 PASS, gồm 28 test cũ và 33 test tài khoản |
| Coverage logic client mới | 97.37% lines, 82.11% branches, 92.86% functions; V8 trên 5 module `account-demo`, `account-integration`, `account-repository`, `account-types`, `profile-images`; không phải coverage toàn dự án/UI/server/SQL |
| DB | Bootstrap/upgrade/repeat migration, projection/RLS, CAS/registry/cleanup PASS trên PGlite; không chứng minh concurrency PostgreSQL thật |
| Storage SQL | Fixtures owner/peer/leaver/outsider/anon, chặn signing/listing/direct writes, preflight helper PASS; helper được mô phỏng, chưa chứng minh HTTP Storage thật |
| API | Bộ API cũ và ảnh PASS; auth/content/size/normalization, cleanup-before-reserve, cap 429, thiếu key 503; upstream/Storage được mock |
| Account demo E2E | PASS: tên/reload, readonly email, ảnh/reload/remove, ảnh không hợp lệ, paging, focus và mobile overflow |
| Account mock live E2E | PASS tại 1440px và 375px: read retry, lỗi ảnh/upload, lost response không replay, canonical reload, late response và account switch; `test-results/account-live/report.json` |
| Demo hồi quy | 53 kiểm tra PASS: acceptance 24, E2E 14, wheel 8, polish 7 |
| Auth/live hồi quy | Auth forms, sessions và live failures PASS; chỉ thêm mock `get_my_account` tường minh vào fixture cũ, không nới assertion |
| Review độc lập | Code review không ghi nhận finding; security review xác nhận hai finding medium đã đóng, không còn critical/high/medium trong phạm vi source review |

Root chạy lại `npm.cmd test` 61/61, `npm.cmd run typecheck` và `npm.cmd run build` PASS trong lượt review cuối. Build QA cũng PASS ở lượt tích hợp trước, không chạy lại browser trong review cuối. Báo cáo và ảnh E2E nằm trong `test-results/` ignored; không đưa chúng vào commit mặc định. Các test không truy cập database Production.

Để dựng lại từ commit feature: Node 24, `npm.cmd ci`, rồi `npm.cmd test`, `npm.cmd run test:db`, `npm.cmd run test:api`, `npm.cmd run build` và `npm.cmd run typecheck`. Browser tests cần Python/Playwright/Chromium theo README baseline; `test:account:e2e` dùng server demo, `test:account:live` dùng build QA/mock. Không dùng QA giả lập làm bằng chứng hosted PASS.

## Việc còn lại trước nghiệm thu dịch vụ thật

1. Đã chọn Supabase thử nghiệm cô lập, lưu cấu trúc trước migration; người dùng xác nhận dữ liệu test không cần giữ. Migration account đã Success, schema/grants 15/15 PASS; **không chạy bootstrap `schema.sql`** vào DB hiện có. SQL/hash và query URLs nằm trong checklist.
2. Storage SQL đã Success; helper vendor tồn tại và bucket/policies 9/9 kiểm tra SQL PASS. Script fail closed nếu thiếu helper; vẫn phải xác minh operation qua HTTP thật, không tự thay thế helper.
3. Cấu hình `SUPABASE_SERVICE_ROLE_KEY` chỉ server, cùng URL/anon key theo `.env.example`. Không thêm tiền tố NEXT_PUBLIC. Thiếu server key, upload trả 503; không dùng secret thật trong fixture/chat/log.
4. Chạy matrix HTTP thật: owner/current peer/former peer/outsider/anon; avatar/cover, signing/signMany/list/public download, direct overwrite/delete, pending/retired; account switch, concurrent reserve/attach/cleanup và cache/CDN. Kiểm tra giới hạn request host Preview.
5. Cleanup hiện chạy opportunistically khi upload, grace một giờ; nếu không có upload tiếp theo, asset bỏ dở có thể còn lại. Chưa cài scheduler; cần quyết định lịch maintenance cho vận hành.
6. Thử file picker/upload/thay/bỏ ảnh trên iQOO Z10 Turbo Pro Android/Chrome, quyền chủ nhóm và thành viên. Kết quả Android tốt trước đây chưa bao gồm tính năng mới này.

Rollback ưu tiên ẩn UI/endpoint mới và thu hồi execute RPC mới, giữ dữ liệu. Không drop bảng/bucket hoặc nới grants để chữa lỗi quyền. Chưa thực hiện rollback hoặc deploy; chỉ đã nâng cấp SQL project test.

## Phạm vi review trước commit

Feature gồm panel/integration, account modules, API ảnh, schema/migration/Storage policies, test tài khoản và cập nhật env/scripts/Sharp. Mock profile bổ sung vào ba suite hồi quy là thay đổi fixture cần thiết.

Tài liệu bảo trì, `.gitignore`, requirements test và pilot report có thay đổi từ trước feature; giữ riêng khi chọn scope commit. Không `git add .`.

Đề xuất message sau khi người dùng duyệt diff: `feat: add account profiles and personal movie ratings`. Chưa stage hoặc commit. Gate 2 chỉ cho commit sau xác nhận; push/deploy và nghiệm thu hosted là bước riêng.

## Review cuối trước quyết định commit/push

Ba subagent review read-only bản hiện tại, không dựa vào kết luận APPROVE cũ:

| Reviewer | Kết quả |
| --- | --- |
| Client/UI/data | APPROVE; không finding xác nhận được. Đọc lại account panel, integration, RPC token pin, demo CAS/persistence, Blob lifecycle và paging; 33/33 tests riêng PASS |
| Security DB/Storage/API | APPROVE source; không finding xác nhận được. Kiểm tra lại own-only projection, grants, locks/cap/CAS/cleanup, upload validation/secret boundary; account DB/Storage/API fixtures PASS |
| Commit scope/docs | Không thiếu dependency ứng dụng/test trong manifest 34 file. LOW: trạng thái hosted/key lỗi thời và báo cáo build phụ thuộc PLAN ngoài commit; root đã sửa docs cho tự đủ thông tin |

Không sửa code ứng dụng/SQL trong lượt review này. Không có finding code critical/high/medium/low được xác nhận; đây là kết luận trong phạm vi review, không bảo đảm hết mọi lỗi. Còn thiếu bằng chứng HTTP actor permissions/concurrency/cache trên Supabase thật, upload/Sharp/key compatibility trên host và Android. API fixture chưa có test server trực tiếp cho ảnh động/pixel bomb/timeout; source có guards nhưng chưa được gọi là PASS cho các ca đó.

Khuyến nghị: có thể trình Gate 2 cho commit đúng manifest và push nhánh nhằm tạo Preview sau duyệt. Chưa đủ bằng chứng để promote Production. Vercel key phải giữ scope nhánh; lỗi Save branch-not-found sẽ giải quyết khi nhánh đã có trên GitHub.

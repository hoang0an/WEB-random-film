# Bản trình Gate 2 — tính năng tài khoản

Ngày 12/10/2026. **Gate 2 đã được người dùng duyệt: commit đúng 34 file và push nhánh để tạo Preview.** Migration tài khoản và Storage SQL đã áp dụng trên Supabase thử nghiệm theo duyệt riêng của người dùng; chưa thay đổi Production.

Repo thao tác: `D:\code\a\webfilm\.worktrees\group-self-management`, branch `codex/project-maintenance-20261011`, baseline `4076612`. Root Preview cũ không thuộc phạm vi commit. Người dùng đã cho phép commit và push nhánh để tạo Preview; không cho phép merge hoặc promote Production.

## Thay đổi người dùng nhìn thấy

| Trước | Sau |
| --- | --- |
| Không có panel tài khoản | Nút Tài khoản: email readonly, tên, avatar, ảnh bìa, danh sách điểm |
| Tên không có luồng sửa cá nhân | Sửa tên chuẩn, đồng bộ header/thành viên/bình luận/đánh giá và reload |
| Chỉ đọc điểm qua nhóm đang tham gia | RPC own-only đọc điểm hiện tại kể cả sau rời nhóm, phân trang; mỗi entry phim khác nhóm vẫn riêng |
| Avatar chữ cái | Xem trước/thay/bỏ ảnh; initials fallback khi không có hoặc không đọc được ảnh |
| Demo chỉ có store nhóm | Hồ sơ localStorage, ảnh IndexedDB, giữ qua reload |

Phương án B giữ điểm cá nhân; không cấp lại quyền đọc nhóm, không cho sửa/xóa điểm sau leave, không thêm nhật ký mọi lần sửa. Cover owner-only; avatar owner và người còn chung nhóm. Ảnh tải bằng JWT/Blob URL, không cấp signed URL. Upload server decode/reencode WebP; CAS revision và registry reserve/cleanup có khóa bảo vệ pointer.

## Manifest commit đề xuất — 34 file, README chỉ lấy hunk tính năng

### 1. UI và integration (12 file, lấy toàn bộ diff)

```text
app/api/account/images/route.ts
components/account-panel.tsx
components/account-panel.css
components/cinema-app.tsx
lib/account-demo.ts
lib/account-images-server.ts
lib/account-integration.ts
lib/account-repository.ts
lib/account-types.ts
lib/profile-images.ts
lib/domain.ts
lib/repository.ts
```

### 2. Database/Storage và cấu hình (6 file, lấy toàn bộ diff)

```text
supabase/schema.sql
supabase/migrations/20261011_account_features.sql
supabase/storage/account-images.sql
.env.example
package.json
package-lock.json
```

`schema.sql` thêm bootstrap cho project mới; migration riêng dành cho DB hiện có. Storage SQL cài riêng, kiểm tra helper vendor. `.env.example` chỉ giá trị trống. Đã đối chiếu HEAD: toàn bộ diff package.json hiện tại thuộc feature (test scripts + Sharp); package-lock chỉ thêm Sharp trực tiếp và đổi cờ optional liên quan, không nâng version thư viện khác.

### 3. Tests (12 file, lấy toàn bộ diff)

```text
tests/account-contract.test.ts
tests/account-db.mjs
tests/account-demo.test.ts
tests/account-images-api.mjs
tests/account-integration.test.ts
tests/account-live_e2e.py
tests/account-panel_e2e.py
tests/account-repository.test.ts
tests/account-storage.mjs
tests/auth_e2e.py
tests/auth_sessions_e2e.py
tests/live_failure_e2e.py
```

Ba suite cũ chỉ bổ sung mock profile RPC rõ ràng; giữ assertions. Tests live trong tên file là HTTP giả lập, không xác nhận tài khoản/Storage thật.

### 4. Tài liệu (3 file đầy đủ + 1 hunk README)

```text
docs/account-feature-2026-10-12.md
docs/account-gate2-2026-10-12.md
docs/account-preview-checklist-2026-10-12.md
README.md — chỉ đoạn “Tính năng tài khoản mới (chưa phát hành)” trong phần Kết nối dịch vụ thật
```

Không lấy các hunk sửa PowerShell, đường dẫn worktree, release/pilot và hướng dẫn môi trường E2E có trước trong README. Khi stage sau khi được duyệt, chọn patch theo nội dung; không stage cả README.

## Loại khỏi commit tính năng

- `.gitignore`, `docs/pilot-results-2026-10-11.md`: edits bảo trì có trước.
- `docs/android-pilot-2026-10-11.md`, `docs/project-status.md`, `docs/regression-2026-10-11.md`, `requirements-test.txt`, `tests/README.md`: tài liệu/công cụ bảo trì, để scope riêng.
- `PLAN.md`: nhật ký toàn đợt, chứa bối cảnh bảo trì và bàn giao; giữ local ngoài commit feature này.
- Root Preview edits, `.env.local`, credentials, `.next*`, `node_modules`, cache/npm, test-results và generated files: không stage.

## Bằng chứng và giới hạn duyệt

Build demo/QA, typecheck, `npm.cmd test` (61/61), DB/API, account demo/mock live, 53 kiểm tra demo hồi quy và ba auth/live suites đã PASS ở lượt tích hợp trước. Code/security review độc lập đã hoàn tất; không còn finding critical/high/medium trong phạm vi source review. Coverage 5 module logic client mới: lines 97.37%, branches 82.11%; không phải toàn dự án. Bằng chứng chi tiết ở [báo cáo triển khai](account-feature-2026-10-12.md).

Lượt trình Gate 2 chỉ kiểm kê diff/tài liệu, không chạy lại tests vì không đổi code ứng dụng. `git diff --check` sẽ được kiểm tra sau khi cập nhật tài liệu. `next-env.d.ts` không còn diff và index đang trống tại lúc kiểm kê.

Đã xác minh helper tồn tại và cấu hình SQL/grants trên Supabase test (migration 15/15, Storage 9/9); chưa xác minh Storage HTTP/concurrency/CDN, key chạy trong ứng dụng hay Android upload. Vercel Save key bị chặn vì nhánh hiện chỉ có local, chưa có trên GitHub. Cleanup hiện chạy khi upload, grace một giờ; chưa có scheduler. Duyệt commit không có nghĩa duyệt Production release. Các hạng mục này nằm trong [checklist Preview](account-preview-checklist-2026-10-12.md).

Review cuối bằng ba subagent độc lập: client/data/UI và security không finding xác nhận được; scope review phát hiện ghi chú trạng thái cũ mức LOW đã được root sửa trong ba tài liệu account. Root chạy lại unit 61/61, typecheck và production build PASS; subagent chạy lại 33 client tests và account DB/Storage/API fixtures PASS. Chi tiết và giới hạn ở báo cáo triển khai; scope manifest 34 file không đổi.

## Nội dung xin duyệt

Đề xuất **một commit feature** có đủ code/schema/tests/docs ở manifest trên:

```text
feat: add account profiles and personal movie ratings
```

Người dùng xác nhận: “Chấp nhận khuyến nghị: có thể duyệt commit đúng phạm vi 34 file và push nhánh để tạo preview”. Agent stage đúng manifest/hunk, kiểm tra staged diff, commit và push nhánh trên. Không merge/promote Production hoặc chạy migration Production. Hash commit và trạng thái Preview được ghi vào PLAN.md sau thao tác.

Theo [ECC orch-pipeline — Gate 2](C:/Users/quyen/.codex/plugins/cache/ecc/ecc/2.2.3/skills/orch-pipeline/SKILL.md): “do not commit until the user confirms”. Đây cũng là giới hạn người dùng đã đặt.

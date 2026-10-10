# Review PR #2 và phương án merge — 10/10/2026

## Kết luận

PR https://github.com/hoang0an/WEB-random-film/pull/2 vẫn open, draft, merged=false, mergeable=true. Head `84e99e30240f8c3dbf30bd2d5065662143643572`, base main `0d9722c7704a0abd934db81c356bd6f5b1198410`. Đây là snapshot, phải kiểm tra lại SHA trước hành động merge sau này.

Không phát hiện lỗi mức cao trong thay đổi xác thực TMDB. Có một ghi chú P3: ở `app/api/movies/route.ts:8` và điều kiện cấu hình GET, chọn biến bằng `||` trước trim khiến TMDB_API_KEY chỉ có khoảng trắng che token hợp lệ. Đề nghị trim từng biến trước khi fallback, kèm test cấu hình key trắng + token hợp lệ. Đây không phải lỗi đã quan sát ở cấu hình Preview hiện tại. Chưa sửa trong lượt review/lập kế hoạch.

Diff 7 file, 174 dòng thêm / 6 xóa: route, API test, env mẫu, README, thiết kế TMDB, báo cáo nghiệm thu, SQL audit chỉ đọc trong transaction rollback. Không có migration schema hoặc thay đổi RLS sản phẩm trong PR #2. Không có workflow GitHub Actions hoặc vercel.json/vercel.ts trong cây Git hiện tại. Các sửa đổi cục bộ có trước ngoài PR được giữ nguyên.

Kiểm tra lại ở head hiện tại: `npm test` 21/21; `npm run test:api`, `npm run typecheck`, `npm run test:db`, `npm run build`, diff whitespace check đều đạt. Build chạy cục bộ, không phải deploy. Vercel commit status success; deployment mới nhất `DK7MTXWRpZ62AufpCf7Rm94M8uWb` Ready. Nghiệm thu UI trực tiếp trước đó dùng f008ede; 84e99e3 chỉ cập nhật báo cáo, không đổi code. Không chạy lại email/password hoặc tạo dữ liệu thử trong lượt review này.

## Merge có tự deploy production không?

**Có, với cấu hình đã đọc hiện tại.** Dashboard project `randomfilmkietgay` kết nối repository này; Production → Branch Tracking ghi mọi commit trên main tạo Production Deployment. Auto-assign Custom Production Domains đang bật. Domain được gắn gồm randomfilmkietgay.vercel.app và mục www.randomfilm.cc (không xác nhận người dùng sở hữu tên miền ngoài).

Production hiển thị No Environment Variables Added ở tab Project; Preview có cấu hình riêng. Không đọc giá trị bí mật, không thêm biến Production. Production chưa được nghiệm thu; không sao chép Supabase thử nghiệm sang production. Manage projects của repository trong team hiện tại chỉ hiển thị randomfilmkietgay; không bảo đảm không tồn tại tích hợp ngoài team hoặc hệ thống khác.

## Phương án đề xuất khi được phép merge sau này

1. **Hiện tại giữ PR #2 nháp và chưa merge.** Chuẩn bị PR kiểm soát phát hành riêng trước nếu mục tiêu là merge mã mà hoàn toàn không tạo Production Deployment. Nội dung dự kiến vercel.json:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "git": { "deploymentEnabled": { "main": false } }
}
```

   Không thêm wildcard true vì một nhánh khớp cả false và true vẫn được deploy. Các nhánh khác mặc định vẫn tạo Preview. Trước khi đưa bất kỳ commit nào lên main, cần xác minh cơ chế chặn có hiệu lực ngay trên commit đó, cùng mọi integration khác; chưa thực hiện hoặc chứng minh canary trong lượt này. Giữ PR #2 chờ nếu chưa xác minh được. Cấu hình này không chặn người dùng chạy deploy thủ công `--prod`.
2. Phương án khác nếu chấp nhận tạo bản build Production nhưng chưa đưa lên website: tắt Auto-assign Custom Production Domains và Save trước merge, kiểm tra lại toggle. Đây là staged production build, **vẫn tạo Production Deployment**, không đáp ứng yêu cầu tuyệt đối không deploy. Chưa thay toggle trong lượt này.
3. Khi người dùng cho phép bước merge cụ thể: kiểm tra head/base không đổi, review/checks/branch rules; sửa ghi chú P3 nếu quyết định xử lý, chạy lại API tests; xác nhận cơ chế chặn production đã hoạt động. Chọn squash merge để gộp thay đổi TMDB và báo cáo. Không bật auto-merge.
4. Sau merge kiểm tra commit trên main và Vercel: hoặc không có job Production theo phương án 1, hoặc chỉ Staged theo phương án 2, domain Current không thay đổi. Nếu phát hiện job ngoài dự kiến, dừng phát hành; không promote. Không tự khôi phục tự deploy vì có thể gây phát hành ở push kế tiếp.
5. Phát hành production là yêu cầu riêng: có cấu hình Supabase/SMTP/TMDB dành cho production, dữ liệu/schema/redirect được kiểm tra, lưu deployment Current để rollback, rồi chỉ promote khi được cho phép. Revert Git không đồng nghĩa rollback deployment ngay.

Các điều kiện chặn merge hiện tại là quy trình phát hành và phạm vi cho phép, không phải test thất bại. JWT còn hiệu lực sau logout và thiếu CRUD/chủ nhóm là giới hạn đã ghi ở báo cáo nghiệm thu, không được tuyên bố PR #2 đã xử lý.

Nguồn chính thức đã đối chiếu: [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration), [staged deployments và promotion](https://vercel.com/docs/deployments/promoting-a-deployment). Cấu hình project đọc trực tiếp: https://vercel.com/hoang0an/randomfilmkietgay/settings/environments/production.

## Tách công việc mới

Kế hoạch quản lý nội dung/nhóm nằm ở `docs/plans/2026-10-10-group-self-management.md`, worktree riêng, nhánh kế hoạch `codex/group-self-management-plan`. Chưa push kế hoạch hoặc mở PR tính năng vì chưa có implementation. Khi triển khai dùng nhánh `codex/group-self-management`, PR riêng khỏi #2. Nếu #2 chưa merge, base tạm là nhánh #2; sau #2 merge retarget main và kiểm tra diff để không mang lại thay đổi TMDB. Không merge bất kỳ PR nào trong lượt này.

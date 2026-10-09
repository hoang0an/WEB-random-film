# Kiểm tra sẵn sàng phát hành — 10/10/2026

## Kết luận

**Bản dùng thử sẵn sàng xuất bản để xem và trải nghiệm.** Dữ liệu demo lưu riêng trong localStorage; không phải nhóm dùng chung giữa các thiết bị. Tích hợp Supabase/TMDB đã có mã nguồn và kiểm thử giả lập, nhưng chưa thể xác nhận production dịch vụ thật khi chưa có project, tài khoản và khóa của người dùng. Chưa triển khai hosting hay phát sinh đăng ký dịch vụ trả phí trong đợt này.

Mã nguồn đang phát triển: `D:\code\a\webfilm`. Repository đích: [hoang0an/WEB-random-film](https://github.com/hoang0an/WEB-random-film), nhánh phát hành `main`. Giữ lịch sử commit README ban đầu `ed7bf18`; không force push. Bản trong thư mục chat OneDrive là nguồn cũ.

## Kết quả chạy lại

Node 24.20.0, Next.js 16.4.0, Chromium headless. Cài lại thư viện bằng `npm ci --ignore-scripts`, sau đó build và chạy `next start` trên `http://127.0.0.1:3100`. Kiểm tra trình duyệt dùng bản production, không dùng dev server.

| Kiểm tra | Kết quả | Phạm vi |
| --- | --- | --- |
| Cài theo lockfile | PASS | `npm ci`, không thay phiên bản thư viện |
| TypeScript | PASS | `npm run typecheck` |
| Logic | 11/11 | Random, điểm, bộ lọc, ranh giới thời lượng, góc dừng |
| Database | PASS | PostgreSQL PGlite: RLS/RPC, phân quyền nhóm, điểm/bình luận, migration |
| API | PASS | Upstream giả lập: xác thực, đầu vào, token máy chủ, TMDB/error/fallback |
| Production build | PASS | Trang `/`, `/_not-found` và API động `/api/movies` |
| Nghiệm thu | 24/24 | Desktop 1440×900, mobile mô phỏng 375×844 có thao tác chạm |
| Hoạt ảnh | 8/8 nhóm | Giảm tốc, đúng poster/ID, resize, giảm chuyển động, danh sách lớn |
| Hồi quy | 14/14 nhóm | Thêm phim, nhóm/mời, chốt/đã xem, điểm/bình luận, lưu, dialog/bàn phím |
| Bố cục/bộ lọc | 7/7 nhóm | 320/375/768/1024/1440 px, không tràn ngang, giao bộ lọc, Xem danh sách |
| Audit production | 0 advisory | `npm audit --omit=dev`; không phải chứng nhận bảo mật toàn diện |

Luồng lọc → bốc → hoạt ảnh → kết quả → chốt/bốc lại được kiểm tra. Poster cuối khớp ID và đường dẫn ảnh của phim được chọn, ở tâm phía trước. Với poster thiếu/lỗi tải, dùng ảnh thay thế của chính phim đó. Kết quả thuộc tập ứng viên sau lọc; bốc lại loại phim vừa chọn và phim đã xem. Khi chỉ còn một ứng viên, nút Bốc lại bị khóa.

Các trường hợp bổ sung đã đạt: danh sách trống, không có phim phù hợp, xóa lọc, thiếu poster, chặn tải poster, bấm Bốc/Chốt 20 lần, quay lại kết quả, dữ liệu đổi trong/sau vòng quay, lỗi ghi localStorage và thử lại, dữ liệu lưu hỏng và phục hồi. Không có JavaScript pageerror.

Lỗi Supabase/TMDB trên giao diện đã được kiểm tra bằng response giả lập ở đợt QA ngày 09/10: tải nhóm lỗi/thử lại, chốt lỗi/giữ kết quả/thử lại, tải nền lỗi giữ dữ liệu, tìm phim lỗi/phục hồi. Đợt phát hành này chạy lại contract API và database; không chạy lại server giả lập riêng. Xem [báo cáo QA trước](qa-2026-10-09.md).

## Thay đổi trong đợt phát hành

- Hoàn thiện README: clone/cài/chạy, khác biệt demo/live, kết nối Supabase/TMDB, triển khai Vercel, chi phí, nghiệm thu sau triển khai và rollback.
- `.env.example` chỉ có giá trị trống; mô tả rõ public Supabase key và token TMDB máy chủ. Không dùng service role hoặc secret key ở frontend.
- `.gitignore` loại file môi trường thật, thư mục hosting/cache/build, kết quả kiểm thử, khóa và báo cáo nội bộ Impeccable.
- Cố định Node `24.x` trong package và lockfile để hosting khớp môi trường kiểm tra.
- Sửa lệnh kiểm thử Python dùng UTF-8 trên Windows; script bố cục nhận `TEST_URL` để kiểm tra production. Các lỗi này nằm ở công cụ kiểm thử, không phải website.
- Không thay bố cục, CSS, hoạt ảnh hay thuật toán random đã chốt. Hai lỗi trạng thái kết quả từ đợt QA trước đã có bài kiểm tra hồi quy đạt.

Lỗi `spawn EPERM` khi build/cài thư viện trong môi trường hạn chế được giải quyết bằng chạy tác vụ đã cấp quyền, không bỏ qua TypeScript. Build đầy đủ sau đó thành công.

## Bảo vệ khóa trước khi push

Trong thư mục chỉ có `.env.example`, không có file cấu hình chứa khóa thật. Kiểm tra ignore cho `.env.local`, `.env.production`, `.vercel`, build và kết quả kiểm thử. Mã nguồn/API đọc TMDB token từ môi trường máy chủ; không có tiền tố `NEXT_PUBLIC_` cho token này. Test dùng chuỗi giả lập có ghi rõ mục đích.

Kiểm tra danh sách file được stage và quét mẫu token/khóa trước khi commit. Không đưa dữ liệu localStorage, cache, ảnh/báo cáo kiểm thử hoặc file hosting chứa cấu hình tài khoản lên repository. Chỉ `.env.example` được phép nằm trong danh sách `.env*` được theo dõi. Quét mẫu không thay thế việc quản lý/thu hồi khóa nếu sau này vô tình làm lộ.

## Hosting và chi phí

Đề xuất **Vercel Hobby** cho Next.js và route API. Dự án cá nhân/phi thương mại có thể bắt đầu miễn phí trong hạn mức; sử dụng địa chỉ `*.vercel.app`, không cần mua tên miền. Không chọn static export/GitHub Pages vì API hiện tại cần máy chủ. [Vercel Next.js](https://vercel.com/docs/frameworks/full-stack/nextjs), [Hobby](https://vercel.com/docs/plans/hobby).

Nhóm thật có thể bắt đầu với **Supabase Free** ($0/tháng; có hạn mức và tạm dừng sau một tuần không hoạt động). Pro từ $25/tháng và có phí sử dụng. TMDB developer API miễn phí cho phi thương mại có ghi nguồn; thương mại cần cấp phép. SMTP, tên miền riêng và nâng cấp gói có thể phát sinh phí. Điều kiện đã đối chiếu ngày 10/10/2026. [Supabase pricing](https://supabase.com/pricing), [TMDB FAQ](https://developer.themoviedb.org/docs/faq).

Các bước Vercel và cấu hình redirect/biến môi trường nằm trong [README](../README.md#đưa-lên-mạng-bằng-github-và-vercel). Chỉ coi website online sau khi deployment Ready và mở/kiểm tra được domain thực tế.

## Chưa xác minh và việc cần làm sau triển khai

- Supabase hosted: schema/RLS trên project thật, đăng nhập email/Google, gửi thư xác nhận/SMTP, phiên thật.
- Token TMDB thật và dữ liệu tìm kiếm thực tế.
- Hai tài khoản/thiết bị cùng nhóm, chốt/đánh dấu xem và quyền truy cập của người ngoài trên dịch vụ thật.
- Hosting Vercel: build cloud, biến môi trường/redirect production, domain công khai và kiểm tra luồng trên domain đó.
- Điện thoại vật lý, Safari iOS, Firefox và thiết bị yếu. Mobile hiện là Chromium mô phỏng, không phải thiết bị thật.

Trước khi mở nhóm dùng chung, thực hiện danh sách kiểm tra dịch vụ thật trong README. Không tự nhập dữ liệu demo vào Supabase.

## Bằng chứng tại máy và cách chạy lại

Kết quả không commit: `test-results/release-acceptance/report.json`, `flow-1440.png`, `flow-375.png`; `test-results/wheel/report.json`, `motion-samples.json`; `test-results/e2e-report.json`; `test-results/polish/report.json`.

```powershell
npm ci
npm test
npm run test:db
npm run test:api
npm run build
npm run typecheck
npm run start -- --port 3100
```

Mở terminal khác ở thư mục dự án:

```powershell
$env:TEST_URL='http://127.0.0.1:3100'
npm run test:acceptance
npm run test:wheel
npm run test:e2e
npm run test:polish
```

E2E cần Python và Playwright/Chromium theo README. Các bài kiểm tra tạo ngữ cảnh trình duyệt riêng, không sửa dữ liệu demo của người dùng.

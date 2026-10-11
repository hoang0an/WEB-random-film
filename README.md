# Tối nay xem gì?

Website tiếng Việt để nhóm bạn cùng thêm, bốc, chốt và đánh giá phim. Theo [kế hoạch gốc](docs/source-plan.md); phần công việc chi tiết nằm trong [kế hoạch triển khai](docs/plans/2026-10-09-random-phim.md).

**Công nghệ:** Next.js App Router, React, TypeScript, CSS, Supabase Auth/PostgreSQL và TMDB. Node.js **24.x**, phiên bản thư viện được cố định trong `package-lock.json`.

**Mức sẵn sàng:** bản dùng thử đã qua kiểm tra production tại máy; cấu hình dịch vụ thật và bản hosting cần nghiệm thu sau khi có tài khoản/khóa. Xem [báo cáo phát hành](docs/release-readiness-2026-10-10.md).

**Thư mục chạy và phát triển: `D:\code\a\webfilm`.** Bản nguồn ban đầu trong thư mục chat OneDrive được giữ lại; sử dụng bản ở D: vì Node bị treo khi tạo cache trong OneDrive trên máy này.

## Mở xem ngay — không cần tài khoản dịch vụ

Trên máy mới, cài Node.js 24.x, mở Terminal ở nơi muốn lưu dự án rồi chạy:

```powershell
git clone https://github.com/hoang0an/WEB-random-film.git
cd WEB-random-film
npm ci
npm run dev
```

Không cần tạo `.env.local` cho bản dùng thử. Mở http://localhost:3000. Trên máy đang phát triển, dùng thư mục D: như sau:

1. Mở PowerShell hoặc Terminal trong VS Code.
2. Chạy:

```powershell
cd D:\code\a\webfilm
npm run dev
```

3. Mở **http://localhost:3000**. Giữ terminal đang chạy; nhấn Ctrl+C để dừng.
4. Bấm **Khám phá bản dùng thử**, rồi mở **Hội mê điện ảnh**.
5. Chọn **Thể loại / Thời lượng** nếu muốn, rồi **Bốc phim ngay → Bốc lại hoặc Chốt phim này → Đã xem → Lưu điểm / Gửi bình luận**. **Xóa lọc** trở về toàn bộ phim chưa xem; **Xem danh sách** mở danh sách đầy đủ.
6. Tab **Danh sách** tìm được 10 phim mẫu, ví dụ Barbie, Amélie hoặc Inception. Mã nhóm mẫu là `CINEMA2026`.

Cũng có thể nhấp đúp **Mo-website.cmd** trong thư mục dự án. Nếu localhost:3000 đã mở sẵn thì không cần chạy thêm server.

Máy hiện tại đã có Node và đã cài thư viện. Node.js có tại [nodejs.org](https://nodejs.org/en/download); dùng nhánh 24.x theo `engines` của dự án.

**Bản dùng thử:** dữ liệu lưu trong localStorage của trình duyệt này. Nhóm/thành viên và phim ban đầu là dữ liệu mẫu. Tải lại giữ dữ liệu; xóa dữ liệu website hoặc dùng trình duyệt khác sẽ bắt đầu danh sách riêng. Mã mời demo chỉ mở nhóm trên cùng trình duyệt; không chia sẻ dữ liệu giữa thiết bị. Không có đăng nhập Google/email thật khi chưa cấu hình Supabase.

## Kết nối dịch vụ thật

Bạn có thể làm email trước, Google sau. Không cần gửi token bí mật trong chat.

**Tính năng tài khoản mới (chưa phát hành):** đổi tên/avatar/ảnh bìa và xem điểm cá nhân sau khi rời nhóm đã được kiểm chứng cục bộ. Xem [kết quả, migration/Storage và giới hạn nghiệm thu](docs/account-feature-2026-10-12.md). Với database hiện có, dùng migration tài khoản riêng; upload ảnh cần private Storage và key server-only theo tài liệu này. Chưa nghiệm thu Storage thật hoặc Android upload.

### 1. Tạo Supabase và cơ sở dữ liệu

1. Tạo tài khoản tại [Supabase](https://supabase.com/dashboard), chọn **New project**, đặt tên và lưu mật khẩu database ở nơi riêng.
2. Đợi project sẵn sàng. Mở **SQL Editor → New query**.
3. Mở `supabase/schema.sql`, sao chép **toàn bộ** và chạy một lần trên project mới. Script có transaction: nếu lỗi sẽ không tạo dở một nửa. Đừng chạy lại trên project đã có các bảng cùng tên.

   Nếu đã chạy schema phiên bản trước khi có bộ lọc thể loại, chạy riêng `supabase/migrations/20261009_movie_genres.sql`. Phim thêm mới từ TMDB sẽ lưu thể loại; phim cũ chưa có thể loại vẫn nằm trong lựa chọn Tất cả. Migration không tự tải lại dữ liệu phim cũ.
4. Schema gồm `profiles`, `groups`, `members`, `group_movies`, `ratings`, `comments`; RLS đã bật. Chỉ thành viên đọc được dữ liệu của nhóm. Các thay đổi đi qua RPC kiểm tra người đăng nhập và nhóm.
5. Mở phần **Settings / API** (hoặc hộp **Connect**) lấy **Project URL** và **publishable key hoặc anon key**. Không dùng `service_role` hay secret key.
6. **Authentication → URL Configuration**: Site URL là `http://localhost:3000`. Thêm các Redirect URLs theo [hướng dẫn tài khoản](docs/auth-acceptance.md#cấu-hình-dịch-vụ-thật): `/auth/callback`, `/auth/reset-password` và mẫu query mã mời giới hạn ở đúng hai đường dẫn này. Giữ mẫu email mặc định sử dụng `{{ .ConfirmationURL }}` để Supabase xác thực trước khi quay về website; không dùng template PKCE/token_hash của một ứng dụng khác.
7. Trong **Authentication → Providers**, bật Email. Khi Confirm email bật, người đăng ký phải mở thư xác nhận trước khi đăng nhập. Việc gửi email thật có thể cần cấu hình SMTP khi mở cho nhiều người.

Hướng dẫn nguồn: [Supabase Auth](https://supabase.com/docs/guides/auth), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

### 2. Bật đăng nhập Google (tùy chọn)

1. Mở **Authentication → Providers → Google** trong Supabase, lấy **Callback URL** của Supabase.
2. Tại [Google Cloud Console](https://console.cloud.google.com/), tạo project, cấu hình OAuth consent screen và OAuth client loại **Web application**. Khi app còn Testing, thêm tài khoản bạn và bạn bè vào Test users.
3. Authorized JavaScript origins: `http://localhost:3000`, sau này thêm URL Vercel. Authorized redirect URI: **Callback URL của Supabase**, thường là `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Dán Google Client ID / Client Secret vào provider Google trong **Supabase**, bật provider và lưu. Không dán Google secret vào frontend.
5. Đặt `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true` trong cấu hình website rồi restart/rebuild. Mặc định `false`: email/mật khẩu hoạt động độc lập, nút Google không hiện.

Đối chiếu giao diện hiện tại với [hướng dẫn Google OAuth của Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google).

### 3. Lấy TMDB token

1. Đăng ký tại [TMDB](https://www.themoviedb.org/signup).
2. Account Settings → API, đăng ký developer API phù hợp với dự án của bạn.
3. Lấy **API Read Access Token** (chuỗi dài dùng Bearer), hoặc **API Key v3** (32 ký tự).
4. Read Access Token đặt trong `TMDB_READ_ACCESS_TOKEN`; API Key đặt trong `TMDB_API_KEY`. Cấu hình cũ có API Key trong trường token vẫn được hỗ trợ. Không thêm tiền tố `NEXT_PUBLIC_` và không gửi thông tin xác thực lên GitHub.

[TMDB FAQ](https://developer.themoviedb.org/docs/faq) mô tả điều kiện dùng API và ghi nguồn. Website có logo, link và thông báo ghi nguồn trong footer. Nếu dùng dự án cho thương mại, kiểm tra lại điều kiện đăng ký phù hợp.

### 4. Tạo file cấu hình

Chạy:

```powershell
cd D:\code\a\webfilm
Copy-Item .env.example .env.local
```

Mở `.env.local` trong VS Code và điền:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=false
TMDB_READ_ACCESS_TOKEN=YOUR_TMDB_API_READ_ACCESS_TOKEN
```

Nếu `.env.local` đã có khóa, chỉnh file hiện có; đừng chạy lệnh sao chép ghi đè.

Dừng server bằng Ctrl+C, rồi `npm run dev` lại. Khi có đủ URL/key Supabase, nhãn dùng thử biến mất và hiện form email. Google chỉ hiện khi cờ bật. Form tài khoản không cần TMDB token; nếu token thiếu, tìm phim sẽ báo lỗi cấu hình rõ ràng. Dữ liệu demo không tự đưa vào Supabase.

Đã bổ sung đăng ký tên/email/mật khẩu/nhập lại, hiện/ẩn mật khẩu, màn chờ xác nhận, gửi lại thư, quên/đặt lại mật khẩu và thông báo lỗi tiếng Việt. Liên kết email đi qua `/auth/callback` hoặc `/auth/reset-password`; phiên khôi phục chỉ mở form đặt lại. Tải lại giữ phiên; đổi tài khoản hoặc đăng xuất ở tab khác dọn giao diện tài khoản trước. Đăng xuất chỉ kết thúc phiên trên thiết bị hiện tại. Xem [kết quả và danh sách nghiệm thu tài khoản](docs/auth-acceptance.md); kiểm thử giả lập không xác nhận email/Google thật đã hoạt động.

### 5. Tự kiểm tra dịch vụ thật

1. Đăng ký email, xác nhận thư và đăng nhập; thử Google nếu đã bật provider.
2. Tạo nhóm, mở Thành viên nhóm và sao chép mã/link mời.
3. Dùng một trình duyệt/thiết bị khác đăng nhập tài khoản khác và nhập mã. Người ngoài chưa tham gia không thấy nhóm.
4. Tìm/thêm phim; tài khoản thứ hai thấy người đã thêm. Sau thao tác, dữ liệu tải lại ngay; thay đổi từ thiết bị khác được tải lại mỗi 15 giây hoặc khi quay lại cửa sổ.
5. Bốc/chốt, tài khoản khác thấy phim tối nay. Bấm Đã xem, mỗi người chấm một điểm và bình luận; điểm trung bình cập nhật.
6. Đăng xuất, đăng nhập lại và tải lại để kiểm tra phiên/dữ liệu.

Chưa thể xác nhận các bước này với dịch vụ thật ở phiên triển khai ban đầu vì chưa có tài khoản và khóa của bạn. Test API dùng upstream giả lập; test phân quyền dùng PostgreSQL PGlite. Cần kiểm tra thật theo danh sách trên sau khi cấu hình.

## Đưa lên mạng bằng GitHub và Vercel

Phương án đề xuất: **Vercel Hobby** để chạy Next.js và API phía máy chủ. Gói này miễn phí trong hạn mức, dành cho cá nhân/phi thương mại; khi vượt hạn mức có thể bị tạm ngưng tính năng. Chưa cần mua tên miền: dùng địa chỉ `*.vercel.app`. [Điều kiện Hobby](https://vercel.com/docs/plans/hobby).

Khi dùng nhóm thật, **Supabase Free** bắt đầu ở $0/tháng, tối đa hai project hoạt động; project có thể tạm dừng sau một tuần không hoạt động. Pro từ $25/tháng và có phí theo sử dụng. **TMDB developer API** miễn phí cho mục đích phi thương mại có ghi nguồn; dự án thương mại cần liên hệ cấp phép. Tên miền riêng, SMTP hoặc nâng cấp dịch vụ có thể phát sinh phí; không cần chúng để xuất bản demo. [Supabase pricing](https://supabase.com/pricing), [TMDB FAQ](https://developer.themoviedb.org/docs/faq). Giá/điều kiện được kiểm tra ngày 10/10/2026, cần xem lại trước khi đăng ký gói trả phí.

### Xuất bản bản dùng thử trước

1. Đăng nhập [Vercel](https://vercel.com/new) bằng GitHub, dùng tài khoản/gói Hobby cá nhân.
2. Import repository **hoang0an/WEB-random-film**. Nếu không thấy, cấp quyền Vercel GitHub cho repository này.
3. Framework **Next.js**, Root Directory để mặc định (gốc repository); Node.js **24.x**, Install Command `npm ci`, Build Command `npm run build`; Output Directory để mặc định của Next.js. Production Branch chọn **main**.
4. **Không thêm biến môi trường** khi chạy demo. Không thêm `CINEMA_QA_BUILD` trên Vercel.
5. Bấm **Deploy**, đợi trạng thái **Ready**, rồi mở domain production trong Project → Domains/Visit. Địa chỉ thực tế do Vercel cấp, không phải một link đã có sẵn trong tài liệu này.
6. Mở link trong cửa sổ ẩn danh và điện thoại: vào dùng thử, lọc → bốc → kiểm tra poster/tên → bốc lại → chốt. Demo lưu dữ liệu riêng theo trình duyệt; các thiết bị không dùng chung nhóm.
7. Các lần push tiếp theo vào `main` sẽ tạo deployment mới. Nếu lỗi, đọc Build Logs; kiểm tra Node 24, root và biến môi trường. Có thể rollback deployment trước trong Vercel Dashboard.

### Chuyển sang nhóm dùng chung

Sau khi tạo Supabase/TMDB theo hướng dẫn trên:

1. Vercel → Project Settings → Environment Variables, thêm URL/key Supabase, token TMDB và cờ Google (mặc định `false`) trong `.env.example` cho **Production**. Đánh dấu TMDB token là sensitive nếu giao diện hỗ trợ. Các biến `NEXT_PUBLIC_` được đưa vào mã trình duyệt lúc build; chỉ dùng key công khai Supabase và bật RLS. Không đặt khóa trong GitHub, README hoặc mã nguồn.
2. Trong Supabase, Site URL là domain production; thêm callback/reset và mẫu query invite theo `docs/auth-acceptance.md` vào Redirect URLs. Giữ localhost nếu còn phát triển. Preview chỉ dùng khi đã đặt biến và redirect cho môi trường Preview riêng.
3. Nếu bật Google, thêm domain production vào Authorized JavaScript origins; Callback URL vẫn là Supabase.
4. **Redeploy** để frontend nhận URL/key mới. Chạy toàn bộ danh sách kiểm tra dịch vụ thật bên trên với hai tài khoản. Email xác nhận cho người ngoài cần SMTP phù hợp, xem [giới hạn SMTP mặc định](https://supabase.com/docs/guides/auth/auth-smtp).

Vercel hỗ trợ Next.js cùng route `/api/movies`: [hướng dẫn chính thức](https://vercel.com/docs/frameworks/full-stack/nextjs). GitHub Pages không chạy được API phía máy chủ của cấu hình hiện tại. Website chưa được triển khai công khai trong lần kiểm tra này.

## Khóa và dữ liệu riêng

Chỉ commit `.env.example` với giá trị trống. `.gitignore` loại `.env*` thật, thư mục Vercel, cache, kết quả kiểm thử và file khóa. Trước khi push, dùng `git status --short` và `git ls-files '.env*'` (chỉ được có `.env.example`). Không dán token vào URL Git remote. Nếu một khóa từng bị commit, thu hồi/đổi khóa tại dịch vụ trước; xóa file ở commit sau không xóa khóa khỏi lịch sử Git.

## Kiểm thử và cấu trúc

```powershell
npm run typecheck
npm test
npm run test:db
npm run test:api
npm run build
```

E2E cần Python + Playwright (`python -m pip install playwright`, `python -m playwright install chromium`). Khi server đang chạy: `npm run test:e2e` để kiểm tra các luồng sử dụng; `npm run test:wheel` để kiểm tra chuyển động thật, poster kết quả và bốc lại; `npm run test:polish` để kiểm tra bố cục, bộ lọc và dữ liệu cũ. Script tạo trình duyệt kiểm thử riêng, không làm thay đổi dữ liệu demo của bạn. Ảnh và báo cáo nằm trong `test-results/` (không commit).

- `components/cinema-app.tsx`: giao diện và luồng sử dụng.
- `components/movie-wheel.tsx`, `components/movie-wheel.css`: vòng quay poster có chiều sâu, giảm tốc và phóng lớn thẻ được chọn; hỗ trợ điện thoại và giảm chuyển động.
- `lib/movie-wheel.ts`: tính góc dừng và chọn bộ poster hiển thị, giữ nguyên kết quả bốc phim.
- `lib/domain.ts`: bốc không lặp, điểm và kiểu dữ liệu.
- `lib/repository.ts`: đọc dữ liệu/RPC Supabase.
- `app/api/movies/route.ts`: xác thực phiên và gọi TMDB phía máy chủ; tìm vi-VN, loại adult, fallback mô tả en-US.
- `supabase/schema.sql`: database, RLS và các RPC.
- `tests/`: kiểm thử logic, database, API và trình duyệt.
- `docs/verification.md`: kết quả kiểm tra và giới hạn.

Kiểm thử nghiệm thu luồng đầy đủ và tình huống lỗi: `npm run test:acceptance`. Để kiểm tra bản production đang chạy ở cổng 3100, đặt `$env:TEST_URL='http://127.0.0.1:3100'` trước khi chạy. Script dùng desktop và điện thoại mô phỏng có thao tác chạm; kiểm tra poster kết quả, bộ lọc, bốc/chốt liên tục, dữ liệu thay đổi, thiếu/lỗi tải poster và lỗi lưu. Không phải kiểm tra trên điện thoại vật lý.

`tests/live_failure_e2e.py` kiểm tra giao diện với phản hồi Supabase/TMDB giả lập trên bản build riêng `.next-live-qa`. Đây là kiểm thử lỗi dịch vụ, không xác nhận tài khoản thật. Để chạy lại, build và start với `CINEMA_QA_BUILD=1`, `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=qa-public-anon-key`, dùng cổng 3101 rồi chạy `npm run test:live-errors`. Chỉ dùng các giá trị này cho môi trường kiểm thử; không lưu vào `.env.local` và không dùng cho triển khai thật. Bản build mặc định vẫn ở `.next`.

Có thể xóa phim chờ, sửa/xóa bình luận và điểm của mình, rời nhóm và đổi tên nhóm theo quyền dưới đây. Chưa có xóa nhóm, bỏ phiếu, thông báo hay thống kê. Bộ lọc thể loại và thời lượng thu hẹp tập ứng viên, không đổi cách random; bốc lại loại phim vừa chọn. Thời lượng gồm đến 120, 121–150 và trên 150 phút. Phim thiếu dữ liệu vẫn được bốc khi chọn Tất cả/Bất kỳ; khi lọc một điều kiện cụ thể, phim thiếu dữ liệu tương ứng bị loại. Nếu không còn ứng viên khác, nút Bốc lại bị vô hiệu hóa. Điểm từ 1–10 với bước 0.5; mỗi người chỉ có một điểm/phim và có thể cập nhật điểm của mình.

Logo TMDB trong `public/tmdb-logo.svg` là bản không chỉnh sửa của Travis Bell, [nguồn Wikimedia](https://commons.wikimedia.org/wiki/File:Tmdb.new.logo.svg) trỏ đến asset chính thức TMDB, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Poster và dữ liệu thuộc nguồn TMDB, không phải tài sản được tạo mới của website.


## Quản lý đóng góp và nhóm

Với database đã có dữ liệu, áp **chỉ** `supabase/migrations/20261010_group_self_management.sql`; không chạy lại `supabase/schema.sql`. Migration dùng transaction, không reset bảng, có thể chạy lại; bootstrap đã đồng bộ cho cài mới. Kiểm thử upgrade từ schema cũ nằm trong `tests/group-management-db.mjs`.

Thành viên xóa phim chờ mình thêm, sửa/xóa điểm và bình luận của mình, hoặc rời nhóm. Chủ nhóm xóa mọi phim chờ và đổi tên nhóm; không được sửa nội dung cá nhân của người khác hoặc rời nhóm. Phim đã xem được giữ. Xóa phim đang chốt đồng thời bỏ lựa chọn tối nay. Rời nhóm giữ lịch sử nhưng mất quyền đọc/ghi; tham gia lại bằng mã không tạo membership trùng. Mọi quyền được kiểm tra trong RPC/database, bảng vẫn chỉ cho SELECT qua RLS.

Kết quả Preview và giới hạn kiểm thử: [nghiệm thu quản lý nhóm](docs/group-management-acceptance-2026-10-10.md). PR #3 phụ thuộc #2, chưa merge main hoặc phát hành production.

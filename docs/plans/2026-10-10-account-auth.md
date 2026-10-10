# Đăng ký / đăng nhập tài khoản — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> Trong môi trường Codex này, dùng skill `executing-plans` có sẵn thay cho tên plugin `superpowers:executing-plans` nếu plugin đó không được cài.

**Goal:** Hoàn thiện đăng ký và đăng nhập bằng email/mật khẩu cho website “Tối nay xem gì?”, gồm xác nhận email, khôi phục mật khẩu, quản lý phiên và Google tùy chọn.

**Architecture:** Tiếp tục dùng Supabase Auth phía trình duyệt với `@supabase/supabase-js`, PostgreSQL/RLS và API kiểm tra token hiện có. Tách logic tài khoản khỏi `CinemaApp`, bổ sung trang xử lý liên kết email và trạng thái khôi phục; không chuyển sang SSR/cookie trong đợt này. Mật khẩu do Supabase quản lý, tên hiển thị lưu qua trigger `profiles` hiện có.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase JS, Node 24 test runner, Python Playwright, PGlite.

---

## 1. Phạm vi đã chốt và hiện trạng

Người dùng chọn ngày 10/10/2026: **email và mật khẩu là chính, Google tùy chọn**.

Repository thực hiện: `D:\code\a\webfilm`. README của thư mục chat OneDrive chỉ sang bản này; không sửa song song hai bản nguồn. Khi bắt đầu triển khai, đọc lại `AGENTS.md`, kiểm tra thay đổi chưa commit và tài liệu Next.js cài tại `node_modules/next/dist/docs/01-app/02-guides/authentication.md`. Kế hoạch này được viết trực tiếp trong repository vì chỉ bổ sung tài liệu; chưa cần tạo checkout riêng.

Đã đọc mã nguồn, chưa kiểm thử tài khoản dịch vụ thật trong bước lập kế hoạch:

| Phần | Hiện trạng | Công việc |
| --- | --- | --- |
| `components/cinema-app.tsx:67` | State login/signup và các trường form nằm trong component chính | Tách form và luồng tài khoản |
| `components/cinema-app.tsx:97` | `getSession`, `onAuthStateChange` đã có | Trạng thái khởi tạo/lỗi, recovery và dọn dữ liệu khi đổi người dùng |
| `components/cinema-app.tsx:215` | `signUp`, `signInWithPassword` đã có | Validation, xác nhận, resend, lỗi nội tuyến |
| `components/cinema-app.tsx:249` | Email/Google chỉ hiện khi có URL/key Supabase; Google luôn hiện trong live mode | Google mặc định tắt; email là lựa chọn chính |
| `lib/supabase.ts` | Singleton client, `liveMode` theo URL/key | Giữ singleton, thêm cờ Google |
| `lib/repository.ts` | Lỗi auth cơ bản; tìm phim gửi Bearer token | Lỗi có mã và báo hết phiên cho UI |
| `supabase/schema.sql` | `profiles`, trigger tạo hồ sơ, RLS/RPC đã có | Kiểm thử lại, không tạo bảng users/password mới |
| `app/api/movies/route.ts` | `getUser(token)` kiểm tra phía máy chủ | Giữ kiểm tra; kiểm thử không token/token sai |
| `tests/live_failure_e2e.py` | Giả lập dịch vụ với phiên đã đăng nhập | Thêm bộ test đăng ký/đăng nhập riêng |

**Trong phạm vi:** đăng ký tên/email/mật khẩu/nhập lại; đăng nhập; hiện/ẩn mật khẩu; chờ xác nhận email và gửi lại; quên/đặt lại mật khẩu; nhớ phiên theo SDK; đăng xuất thiết bị hiện tại; xử lý phiên hết hạn; giữ mã mời qua xác thực; tiếng Việt và điện thoại.

**Ngoài phạm vi đợt này:** username riêng, số điện thoại, magic link thay mật khẩu, MFA, trang quản trị, đổi email, xóa tài khoản, nhập dữ liệu demo vào tài khoản thật. Google là bước tùy chọn cuối, không chặn nghiệm thu email.

## 2. Phương án và thiết kế

1. **Chọn: hoàn thiện Supabase client hiện có.** Ít thay đổi, hợp luồng tải dữ liệu trên trình duyệt; RLS và xác thực API vẫn quyết định quyền truy cập.
2. **SSR với cookie:** phù hợp khi cần trang riêng được render phía máy chủ; cần thêm `@supabase/ssr`, đổi client/callback/refresh và các test. Để một kế hoạch riêng khi có nhu cầu đó.
3. **Backend tài khoản tự viết:** phải tự quản lý mật khẩu, email và phiên; không có lợi ích cần thiết cho dự án hiện tại.

Trạng thái auth: `initializing`, `signedOut`, `signedIn`, `recovering`, `error`. Chỉ `signedIn` mới hiển thị nhóm; `recovering` hiển thị đặt lại mật khẩu dù SDK đã tạo session. Form có các màn `login`, `signup`, `checkEmail`, `forgotPassword`; mỗi màn có pending/error/status riêng. Callback email có màn đang xử lý, thành công và link không hợp lệ.

Luồng đăng ký: tên hợp lệ → `signUp` → có session thì vào nhóm; không session thì hiển thị “Kiểm tra email” → mở link tại `/auth/callback` → SDK xử lý link → chuyển `/` và khôi phục mã mời. Không kết luận email đã tồn tại từ phản hồi signup bị Supabase làm mờ; hiển thị hướng dẫn kiểm tra email/đăng nhập/quên mật khẩu chung.

Luồng khôi phục: nhập email → `resetPasswordForEmail` với redirect `/auth/reset-password` → thông báo trung tính → mở link → `PASSWORD_RECOVERY`/session hợp lệ → nhập mật khẩu mới hai lần → `updateUser` → đăng xuất cục bộ → quay về đăng nhập. Nếu đăng xuất lỗi sau khi đổi mật khẩu, báo “Mật khẩu đã đổi” và cho thử đăng xuất lại, không báo đổi mật khẩu thất bại.

Giữ implicit flow mặc định của client JS hiện có. `/auth/callback` là **trang client**, không phải route server đổi code PKCE. Nếu đổi sang PKCE/SSR trong triển khai phải sửa cả kiến trúc và test trước; không ghép hai cách xử lý. Không ghi token từ URL fragment vào log; dọn fragment sau khi SDK xử lý.

Mã mời: chỉ lưu giá trị `invite` đã kiểm tra `/^[A-Z0-9]{1,64}$/i` trong `sessionStorage` trước khi bắt đầu xác thực; truyền mã qua query của redirect email/Google để hoạt động khi link mở tab khác. Chỉ dựng redirect từ origin hiện tại và đường dẫn cố định; không nhận URL `next` tùy ý. Sau đăng nhập mở hộp nhập mã, xóa mã tạm khi đã chuyển cho hộp thoại. Không tự động tham gia nhóm.

## 3. Trình tự triển khai

Các bước bên dưới là đơn vị nhỏ khoảng 2–5 phút; mỗi task có thể cần nhiều vòng nhỏ. Dùng TDD cho validation, dịch vụ auth và luồng trình duyệt; không thêm test chỉ kiểm tra tên class CSS. Commit sau khi task pass; không push/deploy chỉ vì kế hoạch có bước commit.

### Task 1: Quy tắc nhập liệu và thông báo lỗi

**Files:** Create `lib/auth-validation.ts`, `lib/auth-errors.ts`, `tests/auth.test.ts`; Modify `package.json`.

1. Viết test: tên chỉ khoảng trắng bị từ chối, tên >80 ký tự bị từ chối, email trim, mật khẩu mới <8 ký tự bị từ chối, mật khẩu nhập lại sai; đăng nhập cho phép mật khẩu không rỗng kể cả <8 để không khóa tài khoản cũ. Không trim mật khẩu.
2. Chạy `node --test-isolation=none --experimental-strip-types --test tests/auth.test.ts`; kỳ vọng FAIL vì module chưa có.
3. Tạo hàm thuần theo hợp đồng sau, dùng chung cho signup/reset:

```ts
export type AuthFields = {
  email: string; password: string; confirmPassword?: string; name?: string;
};
export function validateAuth(mode: 'login' | 'signup' | 'reset', f: AuthFields) {
  if (mode !== 'reset' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()))
    return 'Nhập email hợp lệ.';
  if (!f.password) return 'Nhập mật khẩu.';
  if (mode !== 'login' && f.password.length < 8)
    return 'Mật khẩu cần ít nhất 8 ký tự.';
  if (mode !== 'login' && f.password !== f.confirmPassword)
    return 'Hai mật khẩu chưa khớp.';
  if (mode === 'signup' && (!f.name?.trim() || f.name.trim().length > 80))
    return 'Tên cần từ 1 đến 80 ký tự.';
  return null;
}
```

4. Ánh xạ `invalid_credentials`, `email_not_confirmed`, `weak_password`, `over_email_send_rate_limit`, `over_request_rate_limit`, `otp_expired`; ưu tiên error.code, fallback message và lỗi mạng. Lỗi lạ → “Không thể hoàn tất. Hãy thử lại.” Không đưa nguyên lỗi backend vào form.
5. Thêm file test vào script `test` hiện có, không bỏ các test cũ. Chạy `npm test`, kỳ vọng tất cả PASS. `git add lib/auth-validation.ts lib/auth-errors.ts tests/auth.test.ts package.json`; commit `feat: add account validation and messages`.

### Task 2: Tách dịch vụ tài khoản và cấu hình Google

**Files:** Create `lib/auth-service.ts`, `tests/auth-service.test.ts`; Modify `lib/supabase.ts`, `.env.example`, `package.json`.

1. Viết test bằng client giả truyền vào service: trim email/tên nhưng giữ nguyên password; signup có metadata.name; redirect cố định; resend không chứa mật khẩu; lỗi được trả lại; signout dùng local scope; Google tắt thì không gọi OAuth.
2. Chạy test riêng, kỳ vọng FAIL. Tạo `createAuthService(client)` nhận `SupabaseClient`; không tạo client thứ hai. Hợp đồng gọi SDK:

```ts
// origin lấy từ window.location.origin; invite đã validate trước.
const callback = new URL('/auth/callback', origin);
if (invite) callback.searchParams.set('invite', invite);
await client.auth.signUp({
  email: email.trim(), password,
  options: { data: { name: name.trim() }, emailRedirectTo: callback.href },
});
await client.auth.signInWithPassword({ email: email.trim(), password });
await client.auth.resend({
  type: 'signup', email: email.trim(),
  options: { emailRedirectTo: callback.href },
});
await client.auth.resetPasswordForEmail(email.trim(), {
  redirectTo: new URL('/auth/reset-password', origin).href,
});
await client.auth.updateUser({ password });
await client.auth.signOut({ scope: 'local' });
```

3. Mỗi wrapper kiểm tra `error` và throw khi có; signup trả session để phân biệt chờ email. Thêm `googleEnabled = process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === 'true'` và biến trống/mặc định false trong `.env.example`. Giữ nguyên cách chọn demo/live theo URL/key; bật form email không phụ thuộc token TMDB.
4. Đưa `tests/auth-service.test.ts` vào `npm test`. Chạy `npm test` và `npm run typecheck`, kỳ vọng PASS; commit `refactor: isolate Supabase account operations` với các file của task.

### Task 3: Form đăng nhập / đăng ký / chờ email

**Files:** Create `components/auth-panel.tsx`, `tests/auth_e2e.py`; Modify `components/cinema-app.tsx`, `app/globals.css`, `package.json`.

1. Viết test trình duyệt với Supabase giả lập: chưa có session hiện login; chuyển signup có tên và nhập lại; signup trả session null mở checkEmail; password bị xóa khỏi state sau signup; gửi lại có pending; không gửi trùng khi nhấn nhanh; sai mật khẩu báo nội tuyến; Google ẩn mặc định.
2. Thêm `test:auth:e2e` = `python -X utf8 tests/auth_e2e.py`. Dùng cách build QA ở Task 7; chạy trước sửa UI để chứng minh test thất bại vì thiếu màn checkEmail.
3. Tách markup auth khỏi đoạn một dòng tại `cinema-app.tsx:249`; giữ bố cục rạp phim, bản demo, credit TMDB và nhóm. `AuthPanel` tự giữ field state/pending/error; thông báo quan trọng tồn tại trong form, không chỉ toast tự mất sau 5,5 giây.
4. Signup có tên 1–80 ký tự, email, password mới >=8 và nhập lại; login không dùng minLength=8. Nút hiện mật khẩu có aria-label, type=button; input có label, autocomplete tương ứng; lỗi `role=alert`, status `role=status`; focus về lỗi đầu tiên. Hiện nút Google và separator chỉ khi googleEnabled.
5. Màn checkEmail giữ email để resend; không giữ password. Resend có chờ 60 giây trên UI và xử lý rate limit từ dịch vụ; bộ đếm UI không được coi là giới hạn phía máy chủ. Thông báo quên mật khẩu không tiết lộ địa chỉ có tài khoản hay không.
6. Chạy test auth trên desktop 1440 và mobile 375, typecheck; commit `feat: complete email account forms`.

### Task 4: Liên kết email và đặt lại mật khẩu

**Files:** Create `app/auth/callback/page.tsx`, `app/auth/reset-password/page.tsx`, `components/auth-callback.tsx`, `components/reset-password-panel.tsx`, `lib/auth-redirect.ts`, `tests/auth-redirect.test.ts`; Modify `tests/auth_e2e.py`, `package.json`.

1. Viết test thuần cho mã mời hợp lệ/không hợp lệ, không dựng redirect bên ngoài; thêm test browser cho link xác nhận hợp lệ, link lỗi/hết hạn, link recovery và truy cập reset trực tiếp khi chưa đăng nhập.
2. Chạy riêng các test mới, kỳ vọng FAIL. Tạo trang client callback dùng singleton; chờ SDK hoàn tất khởi tạo, đọc session và xác minh với `getUser()` trước khi chuyển trang. Hiện lỗi URL/dịch vụ rõ ràng, cho quay về login hoặc resend. Không gọi lại `setSession` tự chế từ token, không ghi URL chứa token vào báo cáo.
3. Trang reset đăng ký listener đủ sớm cho `PASSWORD_RECOVERY`; sau reload có thể dùng session đã được SDK khôi phục và `getUser()` để cho phép đổi password. Không coi query `type=recovery` là bằng chứng xác thực. Không có session hợp lệ → hướng dẫn xin link mới; không gọi `updateUser`.
4. Thêm form password mới/nhập lại; kiểm tra bằng validateAuth('reset', ...); updateUser thành công rồi signOut local và về login với thông báo thành công. Xử lý hai thao tác bằng hai trạng thái để lỗi signout không phủ nhận kết quả updateUser.
5. Dùng window.location trong client effect để đọc query/fragment; tránh phụ thuộc useSearchParams ngoài Suspense làm lỗi production build. SDK phải nhận fragment trước khi ứng dụng dọn URL.
6. Chạy unit, auth E2E và production build QA, kỳ vọng PASS; commit `feat: add confirmation and password recovery pages`.

### Task 5: Phiên đăng nhập, mã mời và dọn dữ liệu

**Files:** Create `lib/use-auth.ts`; Modify `components/cinema-app.tsx`, `lib/repository.ts`, `tests/auth_e2e.py`, `tests/auth-redirect.test.ts`.

1. Viết test A đăng nhập → đăng xuất từ tab khác → B đăng nhập: không hiện nhóm/phim/kết quả A trong lúc tải B. Test refresh token thành công giữ phiên; refresh bị từ chối về login; mất mạng chỉ báo lỗi kết nối, không xóa phiên. Test mã mời đi qua signup/confirmation/Google rồi mở hộp join.
2. Chạy E2E, kỳ vọng FAIL đối với dọn dữ liệu ngoài nút logout. Hook quản lý initializing/signedOut/signedIn/recovering/error; unsubscribe listener khi unmount; callback auth chỉ cập nhật state, đưa tải profile/nhóm sang effect riêng.
3. Khi user.id thay đổi hoặc SIGNED_OUT, xóa store live, groupId, modal, detailId, resultId, wheelRun, query, results, score/comment và lỗi cũ; ngừng polling, hủy/loại kết quả bất đồng bộ từ người dùng cũ. Giữ nguyên dữ liệu demo đã lưu khi chỉ chuyển live session.
4. `movieRequest` trả lỗi có status/code khi API 401; UI xác minh lại session với dịch vụ rồi đưa về login nếu token bị từ chối. Với 429/5xx/network không signout. RLS/RPC vẫn là hàng rào quyền; không tin metadata tên để quyết định quyền.
5. Validate và lưu invite trước khi auth; callback khôi phục invite vào URL gốc. Test tài khoản đã login mở link invite; user chỉ tham gia sau bấm xác nhận trong hộp thoại.
6. Chạy auth unit/E2E, test API và demo E2E, kỳ vọng PASS; commit `fix: clear private state across account sessions`.

### Task 6: Hồ sơ và phân quyền

**Files:** Modify `tests/database.mjs`; chỉ sửa `supabase/schema.sql` và thêm `supabase/migrations/20261010_auth_profiles.sql` nếu test chỉ ra lỗi cần sửa.

1. Thêm test tạo auth.users với metadata.name, full_name và email fallback; xác nhận đúng một profiles/user, tên hợp lệ, tạo nhóm được. Test A không đọc nhóm B; anon không đọc profiles/nhóm và không thực hiện RPC; mỗi user chỉ sửa điểm của mình qua RPC.
2. Chạy `npm run test:db`. Test này có thể PASS ngay vì schema đã có trigger/RLS; không cố đổi schema chỉ để tạo FAIL.
3. Nếu cần thay trigger, migration dùng CREATE OR REPLACE và backfill ON CONFLICT DO NOTHING, transaction và quyền tối thiểu. Kiểm thử schema mới và schema cũ + migration, chạy migration hai lần. Không chạy lại schema.sql trên database đã có dữ liệu.
4. Commit `test: verify account profiles and group isolation`. PGlite chỉ kiểm tra database/role giả lập; không coi đây là xác nhận Supabase đã gửi email hay token thật hợp lệ.

### Task 7: Kiểm thử tổng hợp và cấu hình dịch vụ thật

**Files:** Modify `README.md`, `.env.example`, `docs/release-readiness-2026-10-10.md`; Create `docs/auth-acceptance.md`; Complete `tests/auth_e2e.py`.

1. Hoàn thiện mock auth endpoints `/signup`, `/token`, `/resend`, `/recover`, `/user`, `/logout`; mỗi endpoint trả payload tương ứng SDK, không dùng một payload chung. Mock có xác nhận session null/session có giá trị, link lỗi, timeout, rate limit, refresh, signup trùng với phản hồi mờ. Test recovery bằng link/SDK thực sự tạo event, không chỉ tự set biến UI. Context Playwright riêng, không đụng localStorage người dùng.
2. Chạy kiểm tra thông thường:

```powershell
Set-Location D:\code\a\webfilm
npm run typecheck
npm test
npm run test:db
npm run test:api
npm run build
```

Kỳ vọng mỗi lệnh exit 0. Trên server demo chạy riêng: `npm run test:e2e`, `npm run test:acceptance`. Không chạy server QA cùng cổng với server người dùng.

3. Tại terminal QA riêng (chỉ giá trị giả, không lưu vào .env.local):

```powershell
$env:CINEMA_QA_BUILD='1'
$env:NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:54321'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY='qa-public-anon-key'
$env:NEXT_PUBLIC_AUTH_GOOGLE_ENABLED='false'
npm run build
npm run start -- --port 3101
```

Terminal test riêng: `$env:TEST_URL='http://127.0.0.1:3101'; npm run test:auth:e2e`. Script đọc TEST_URL. Kỳ vọng không pageerror, tất cả ca auth pass, ảnh desktop/mobile không tràn ngang. Chạy lại QA build với Google=true để test nút/redirect, không mô phỏng đăng nhập Google thành tài khoản thật.

4. Cấu hình Supabase do chủ dự án cung cấp qua môi trường riêng: bật Email và Confirm email; password tối thiểu 8 phù hợp UI; Site URL là domain thực; allowlist chính xác `/auth/callback` và `/auth/reset-password` trên localhost và production. Kiểm tra redirect có query invite; không dùng wildcard domain production. Cấu hình SMTP phù hợp cho email ngoài nhóm quản lý dự án; xác minh sender/domain. Không tắt Confirm email để che lỗi gửi email.
5. `.env.example` thêm cờ Google; README hướng dẫn cấu hình → restart/rebuild → nghiệm thu. Không cần TMDB để đăng ký/login, nhưng cần token để nghiệm thu tìm phim. Không đưa service_role/SMTP password/OAuth client secret vào NEXT_PUBLIC hoặc Git.
6. Nghiệm thu **dịch vụ thật** với hai địa chỉ email do chủ dự án kiểm soát, trên hai browser context/thiết bị: đăng ký → nhận mail → xác nhận → login → hồ sơ đúng tên → tạo/join nhóm → refresh → logout; đăng nhập sai/unconfirmed; resend; reset → mật khẩu cũ sai/mới đúng; link hết hạn; A không thấy nhóm riêng B; mã mời giữ qua email.
7. Google tùy chọn: bật provider và OAuth consent/client trong dashboard, callback provider theo Supabase; cờ Google=true sau khi cấu hình, rebuild rồi thử một tài khoản Google thật. Nếu chưa bật, email vẫn nghiệm thu độc lập.
8. Ghi từng ca PASS/FAIL/chưa thử và môi trường trong `docs/auth-acceptance.md`; tách mock và live. Nếu chưa có project/SMTP, báo hoàn tất mã/test giả lập, **chưa nghiệm thu dịch vụ thật**. Commit `docs: add account setup and acceptance checklist`.

## 4. Tiêu chí hoàn tất

- Không cấu hình Supabase: bản demo vẫn mở và chọn phim như trước.
- Có URL/key hợp lệ: hiện form email; Google chỉ hiện khi cờ bật.
- Signup có/không session đều có trạng thái rõ; chưa xác nhận không vào nhóm thật.
- Resend và reset có lỗi/pending/chờ; thông báo không làm lộ tài khoản tồn tại.
- Link email hợp lệ vào đúng màn; link lỗi không treo hoặc mở dữ liệu riêng.
- Tải lại giữ phiên; logout/đổi tài khoản không lộ dữ liệu tài khoản trước; mạng lỗi không tự xóa phiên.
- Link invite còn dùng được sau auth; RLS/API tiếp tục chặn người ngoài.
- Unit, DB, API, browser auth và demo regression pass; bản production build thành công.
- Chỉ ghi “tài khoản thật hoạt động” sau nghiệm thu mail/session/RLS thật. Đưa lên hosting là bước riêng sau khi cấu hình và nghiệm thu.

## 5. Ước lượng và bàn giao

Khoảng 1–2 ngày cho code và test tích hợp; thêm thời gian tùy SMTP, email/domain và tài khoản Supabase. Đây là ước lượng, không cam kết thời gian chờ dịch vụ. Làm Task 1–6 và kiểm thử giả lập trước; cấu hình/kiểm thử thật sau khi có môi trường. Google triển khai sau email nếu chưa có OAuth.

Khi triển khai, dùng @executing-plans và bám các checkpoint trong tài liệu. Có thể làm ngay trong chat này theo từng task hoặc mở chat triển khai riêng tham chiếu file này. Không tự tạo chat, subagent, push hoặc deploy chỉ từ yêu cầu lập kế hoạch.

## 6. Nguồn đối chiếu ngày 10/10/2026

- [Supabase password-based auth](https://supabase.com/docs/guides/auth/passwords): signup/signin, implicit flow, resetPasswordForEmail/updateUser, thông báo reset trung tính.
- [Supabase auth state changes](https://supabase.com/docs/reference/javascript/auth-onauthstatechange): sự kiện phiên và recovery.
- [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls): allowlist và error redirect.
- Tài liệu Next.js tại `node_modules/next/dist/docs/01-app/02-guides/authentication.md` và API SDK đang cài trong `node_modules/@supabase/auth-js/src/GoTrueClient.ts`.

Kế hoạch dựa trên mã nguồn và tài liệu, không dựa trên xác nhận một project Supabase/SMTP đang hoạt động.

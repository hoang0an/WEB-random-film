# Group Self Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bổ sung xóa phim thêm nhầm, sửa/xóa bình luận và điểm của chính mình, rời nhóm và đổi tên nhóm với quyền được kiểm tra ở database.

**Architecture:** Giữ quyền bảng chỉ SELECT qua RLS; mọi ghi đi qua RPC SECURITY DEFINER lấy danh tính từ auth.uid(). Dùng khóa hàng nhóm chung để tuần tự hóa thay đổi membership và nội dung, rồi refresh dữ liệu từ Supabase; UI/demo dùng cùng quy tắc quyền nhưng database là nơi quyết định. Migration bổ sung chạy trên Supabase thử nghiệm, PR và Preview riêng khỏi PR #2.

**Tech Stack:** Next.js 16.4 App Router, React 19, TypeScript, Supabase Auth/Postgres/PostgREST, PGlite, Node test runner, bộ kiểm thử trình duyệt hiện có.

---

## Đầu vào và phạm vi

Baseline đã review: PR #2 head 84e99e3; xem `docs/pr-2-final-review-2026-10-10.md` và `docs/preview-acceptance-2026-10-10.md`. Đây là **đề xuất**, chưa được triển khai/nghiệm thu. Không merge, không production, không mua dịch vụ, không đưa secret hoặc mật khẩu vào Git/báo cáo.

Thực thi bằng @executing-plans. Đọc AGENTS.md và hướng dẫn tương ứng trong node_modules/next/dist/docs trước sửa Next/React. Không có skill superpowers namespace được cài; tên trong header là yêu cầu của mẫu writing-plans, sử dụng executing-plans hiện có, không tự tải plugin.

Ba hướng cân nhắc: (1) RPC với hard delete có điều kiện, đề xuất vì hiện phim chưa xem chưa có đánh giá và không cần hệ thống thùng rác; (2) soft delete có khôi phục, thêm trạng thái/unique/index/filter, quá phạm vi lần này; (3) cấp UPDATE/DELETE trực tiếp kèm RLS, khó bảo đảm clear tonight và membership race, không chọn. Dialog xác nhận thao tác xóa trong sản phẩm là yêu cầu UX.

## Quyền đề xuất

| Thao tác | Thành viên | Chủ nhóm | Người ngoài / đã rời |
| --- | --- | --- | --- |
| Thêm, bốc/chốt, đánh dấu đã xem | Giữ hành vi hiện có | Như thành viên | Không |
| Xóa phim chờ xem | Chỉ phim mình thêm | Mọi phim chờ xem | Không |
| Xóa phim đã xem | Không | Không | Không |
| Sửa / xóa điểm | Chỉ điểm của mình, phim đã xem | Chỉ điểm của mình | Không |
| Sửa / xóa bình luận | Chỉ bình luận của mình | Chỉ bình luận của mình | Không |
| Rời nhóm | Có, xác nhận trước | Chặn, kể cả nhóm 1 người | Không |
| Đổi tên nhóm | Không | Có, tên trim 1–80 ký tự | Không |

Chủ nhóm không có quyền sửa/xóa điểm hoặc bình luận của người khác. Chuyển chủ, xóa nhóm, kick thành viên, sửa metadata phim, moderation và thu hồi JWT tức thì nằm ngoài PR này. Lý do chặn chủ rời: hiện không có transfer ownership, tránh nhóm không có người quản lý; UI giải thích rõ.

Xóa phim đang chốt nhưng chưa xem: clear tonight_id và xóa phim trong **cùng transaction**. Phim có ratings/comments bất thường phải bị từ chối, không cascade mất lịch sử. Cho thêm lại cùng tmdb_id sau khi xóa thành công.

Rời nhóm chỉ xóa membership, giữ phim/điểm/bình luận đã đóng góp. Sau commit mất quyền RLS/RPC ngay cả với JWT còn hạn vì quyền dựa trên membership; đây không phải giải pháp thu hồi toàn bộ phiên. Người còn lại thấy tác giả có thể hiện “Thành viên đã rời” khi profile không còn cùng nhóm; không mở rộng policy profiles để lộ người ngoài. Nếu quay lại bằng mã, một membership duy nhất và thấy lại lịch sử của mình.

## Task 1: Chuẩn bị nhánh và phép thử quyền thất bại

**Files:** Modify `tests/database.mjs`; Create `supabase/migrations/20261010_group_self_management.sql` (ở task 2); Modify `package.json` khi thêm unit test.

1. Trong checkout riêng, tạo nhánh `codex/group-self-management` từ baseline PR #2 hoặc main đã có #2. Không mang thay đổi cục bộ ngoài phạm vi. Nếu PR #2 chưa merge, lập PR stacked với base codex/preview-tmdb-api-key, ghi phụ thuộc #2; khi #2 merge mới retarget main.
2. Dùng fixture A chủ nhóm, B thành viên, C ngoài nhóm như tests/database.mjs. Thêm phim pending của cả A/B và fixture watched có điểm/bình luận cả hai. Viết test hành vi, không chỉ assert SQL có chuỗi tên hàm.
3. Thêm một test đầu tiên:

```js
await login(b);
await db.query('select public.delete_movie($1,$2)', [gid, bPending]);
assert.equal((await db.query('select id from public.group_movies where id=$1', [bPending])).rows.length, 0);
await rejects('select public.delete_movie($1,$2)', [gid, aPending], /forbidden/);
```

4. Run `node tests/database.mjs`; kỳ vọng FAIL “function public.delete_movie does not exist”. Viết các case tương tự cho edit/delete comment, delete rating, leave/rename ở đầu mỗi task tương ứng; không cần viết một lần toàn bộ rồi ngưng ở test thiếu function.
5. Commit kiểm thử và fixture: `git add tests/database.mjs` rồi `git commit -m "test: define group self management permissions"`.

## Task 2: Migration khóa nhóm và xóa phim pending

**Files:** Create `supabase/migrations/20261010_group_self_management.sql`; Modify `supabase/schema.sql`, `tests/database.mjs`.

1. Viết test thất bại: thành viên xóa phim của mình; bị chặn phim người khác; chủ xóa phim B; outsider/anon bị chặn; watched không xóa; tonight được clear; thêm lại được; gid/mid khác nhóm bị chặn; ratings/comments bất thường không mất.
2. Run `node tests/database.mjs`, xác nhận FAIL có liên quan.
3. Migration `begin; ... commit;`, không DROP bảng hoặc chạy lại bootstrap. Thay helper hiện có bằng body sau để tất cả RPC cũ gọi require_member cũng tham gia khóa nhóm:

```sql
create or replace function private.require_member(gid uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_member'; end if;
  perform 1 from public.groups where id=gid for update;
  if not found or not private.is_member(gid) then raise exception 'not_member'; end if;
end; $$;

create or replace function public.delete_movie(gid uuid, mid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.group_movies%rowtype; owner uuid;
begin
  perform private.require_member(gid);
  select * into m from public.group_movies where group_id=gid and id=mid for update;
  if not found then raise exception 'invalid_movie'; end if;
  select owner_id into owner from public.groups where id=gid;
  if m.added_by<>auth.uid() and owner<>auth.uid() then raise exception 'forbidden'; end if;
  if m.watched_at is not null then raise exception 'movie_watched'; end if;
  if exists(select 1 from public.ratings where group_id=gid and movie_id=mid)
     or exists(select 1 from public.comments where group_id=gid and movie_id=mid)
  then raise exception 'movie_has_activity'; end if;
  update public.groups set tonight_id=null where id=gid and tonight_id=mid;
  delete from public.group_movies where group_id=gid and id=mid;
end; $$;
revoke all on function public.delete_movie(uuid,uuid) from public,anon;
grant execute on function public.delete_movie(uuid,uuid) to authenticated;
```

4. Cập nhật public.join_group bằng định nghĩa sau để khóa cùng hàng nhóm trước insert membership; create_group tự tạo hàng nhóm trong transaction không cần lock trước. Không đổi hàm private.is_member dùng trong SELECT policy thành hàm khóa.

```sql
create or replace function public.join_group(code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare gid uuid;
begin
  if auth.uid() is null then raise exception 'not_member'; end if;
  select id into gid from public.groups where invite_code=upper(trim(code)) for update;
  if gid is null then raise exception 'invalid_invite'; end if;
  insert into public.members(group_id,user_id) values(gid,auth.uid())
    on conflict do nothing;
  return gid;
end; $$;
```

CREATE OR REPLACE giữ ACL hàm cũ; vẫn kiểm tra revoke PUBLIC/anon trong test privilege.
5. Đồng bộ helper/RPC mới vào schema.sql cho cài mới. Trong tests/database.mjs áp migration mới sau migration genres, áp **lần hai** để kiểm tra rerunnable. Nếu schema đã gồm RPC mới, test riêng migration upgrade từ schema cũ trích Git baseline; không chỉ kiểm tra schema mới + migration trên schema mới. Dùng file fixture schema baseline ở `tests/fixtures/schema-before-group-management.sql` nếu cần.
6. Run `node tests/database.mjs`; kỳ vọng PASS các ca task 2, các RPC cũ vẫn hoạt động. Test race trên Postgres thật ở task 8, PGlite một connection không chứng minh race.
7. Commit migration/schema/tests: `git commit -m "feat: remove pending movies with author and owner checks"`.

## Task 3: Bình luận của mình và xóa điểm của mình

**Files:** Modify migration mới, `supabase/schema.sql`, `tests/database.mjs`.

1. Viết test: B sửa/xóa của B; A kể cả owner không sửa/xóa B; outsider, giả gid, cid khác nhóm đều bị chặn; comment blank/null/>1000 bị chặn; created_at không thay sau edit; edit điểm vẫn dùng save_rating 1–10 bước 0.5; xóa điểm B không mất điểm A, average recalculated/null khi không còn điểm.
2. Run `node tests/database.mjs`; kỳ vọng FAIL RPC thiếu.
3. Thêm RPC dưới đây, đồng bộ vào bootstrap. Không nhận author/user_id từ client.

```sql
create or replace function public.edit_comment(gid uuid, cid uuid, comment_body text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_member(gid);
  if comment_body is null or length(trim(comment_body)) not between 1 and 1000
  then raise exception 'invalid_comment'; end if;
  update public.comments c set body=trim(comment_body)
  where c.group_id=gid and c.id=cid and c.user_id=auth.uid()
    and exists(select 1 from public.group_movies m where m.group_id=gid
      and m.id=c.movie_id and m.watched_at is not null);
  if not found then raise exception 'forbidden'; end if;
end; $$;

create or replace function public.delete_comment(gid uuid, cid uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_member(gid);
  delete from public.comments c where c.group_id=gid and c.id=cid and c.user_id=auth.uid()
    and exists(select 1 from public.group_movies m where m.group_id=gid
      and m.id=c.movie_id and m.watched_at is not null);
  if not found then raise exception 'forbidden'; end if;
end; $$;

create or replace function public.delete_rating(gid uuid, mid uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_member(gid);
  if not exists(select 1 from public.group_movies where group_id=gid and id=mid
    and watched_at is not null) then raise exception 'not_watched'; end if;
  delete from public.ratings where group_id=gid and movie_id=mid and user_id=auth.uid();
  if not found then raise exception 'rating_missing'; end if;
end; $$;
revoke all on function public.edit_comment(uuid,uuid,text), public.delete_comment(uuid,uuid),
  public.delete_rating(uuid,uuid) from public,anon;
grant execute on function public.edit_comment(uuid,uuid,text), public.delete_comment(uuid,uuid),
  public.delete_rating(uuid,uuid) to authenticated;
```

4. Repeat-delete trả lỗi an toàn và UI reload hiện trạng, không ghi toast thành công khi backend thất bại. Không thêm edited_at nếu chưa cần hiển thị; giữ created_at.
5. Run `node tests/database.mjs`; PASS. Commit `git commit -m "feat: edit and delete own comments and ratings"`.

## Task 4: Rời nhóm và đổi tên nhóm

**Files:** Modify migration mới, schema.sql, tests/database.mjs.

1. Viết test: B rời → 0 membership, 0 nhóm/phim/điểm/bình luận nhìn thấy, mọi RPC cũ/mới bị not_member; đóng góp B vẫn còn khi A đọc; B join lại đúng 1 membership. Owner rời kể cả nhóm 1 người bị owner_cannot_leave; B không thể đổi tên; A rename trim valid, giữ id/invite/tonight/members; empty/81/null bị chặn.
2. Run `node tests/database.mjs`, FAIL chức năng thiếu.
3. Thêm và đồng bộ SQL:

```sql
create or replace function public.leave_group(gid uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_member(gid);
  if exists(select 1 from public.groups where id=gid and owner_id=auth.uid())
  then raise exception 'owner_cannot_leave'; end if;
  delete from public.members where group_id=gid and user_id=auth.uid();
end; $$;

create or replace function public.rename_group(gid uuid, group_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_member(gid);
  if not exists(select 1 from public.groups where id=gid and owner_id=auth.uid())
  then raise exception 'forbidden'; end if;
  if group_name is null or length(trim(group_name)) not between 1 and 80
  then raise exception 'invalid_group_name'; end if;
  update public.groups set name=trim(group_name) where id=gid;
end; $$;
revoke all on function public.leave_group(uuid), public.rename_group(uuid,text) from public,anon;
grant execute on function public.leave_group(uuid), public.rename_group(uuid,text) to authenticated;
```

4. Giữ table UPDATE/DELETE bị revoke. Không cấp private.require_member cho authenticated. Không bổ sung quyền đọc profile người đã rời; tác giả fallback là giới hạn UI đã chọn, ghi rõ.
5. Run `node tests/database.mjs`; PASS. Commit `git commit -m "feat: leave membership and rename owner groups"`.

## Task 5: Dữ liệu chủ nhóm, helper quyền và lỗi dễ hiểu

**Files:** Modify `lib/domain.ts`, `lib/repository.ts`, `lib/demo.ts`, `components/cinema-app.tsx` (demo create); Create `lib/group-permissions.ts`, `tests/group-permissions.test.ts`, `tests/repository-errors.test.ts`; Modify `package.json`.

1. Test thuần cho owner/member/outsider, own versus other's pending/watched; fixture Group cần ownerId. Test lỗi RPC thành thông báo Việt, không lộ SQL. Thêm test mới vào npm test.
2. Run `npm test`, FAIL helper thiếu.
3. Add ownerId: string vào Group. loadGroups map `ownerId: g.owner_id`; dữ liệu server thiếu owner không gán người đang đăng nhập làm owner. Demo initialStore ownerId demoUser.id; demo create ownerId user.id; normalize dữ liệu demo v1 cũ bằng ownerId đã có hoặc members[0]?.id, không reset cả store/mất dữ liệu.
4. Helper đề xuất:

```ts
import type { Entry, Group } from './domain';
export const isGroupMember = (g: Group, uid: string) => g.members.some(m => m.id === uid);
export const isGroupOwner = (g: Group, uid: string) => isGroupMember(g, uid) && g.ownerId === uid;
export const canDeleteMovie = (g: Group, e: Entry, uid: string) =>
  isGroupMember(g, uid) && !e.watchedAt &&
  (e.addedBy === uid || isGroupOwner(g, uid));
export const canEditOwn = (g: Group, author: string, uid: string) =>
  isGroupMember(g, uid) && author === uid;
export const canLeaveGroup = (g: Group, uid: string) =>
  isGroupMember(g, uid) && !isGroupOwner(g, uid);
```

5. readableError thêm mapping trước generic: owner_cannot_leave → “Bạn đang là chủ nhóm. Chưa thể rời nhóm trong phiên bản này.”; movie_watched/movie_has_activity → “Không thể xóa phim đã có lịch sử xem hoặc đánh giá.”; forbidden → “Bạn không có quyền sửa hoặc xóa nội dung này.”; invalid_comment → “Bình luận cần từ 1 đến 1000 ký tự.”; invalid_group_name → “Tên nhóm cần từ 1 đến 80 ký tự.”; rating_missing → “Điểm đã được xóa. Danh sách sẽ được cập nhật.”. Xem lại catch/action hiện có để refresh khi bị từ chối.
6. Run `npm test` và `npm run typecheck`, PASS. Commit `git commit -m "feat: model group owners and self management permissions"`.

## Task 6: UI xóa phim, điểm và bình luận

**Files:** Modify `components/cinema-app.tsx`, `app/globals.css`; Create `tests/group_management_e2e.py`; Modify `package.json` script `test:groups`.

1. Viết case UI vào bộ browser test hiện có: nút đúng tác giả, dialog xác nhận/hủy, save bị khóa lúc pending, lỗi không xóa UI giả, focus trả về, keyboard/Escape, mobile. Test demo dùng fixture A/B/C có ownerId; bài Supabase thật giữ riêng task 8.
2. Run `python -X utf8 tests/group_management_e2e.py` trên local server theo harness hiện có; FAIL controls thiếu. Không dùng endpoint giả để tuyên bố RLS đạt.
3. Chi tiết phim pending: nút “Xóa khỏi danh sách” nếu canDeleteMovie. Dialog nêu tên phim và clear chốt nếu đang tonight; xác nhận gọi `rpc('delete_movie', {gid: group.id, mid: detail.entryId})`, await refresh, đóng dialog và xóa detail/result/wheel state liên quan. Demo làm cùng điều kiện rồi persist, không giả gọi service.
4. Phim watched: “Xóa điểm của tôi” chỉ khi có rating user.id; dialog xác nhận, gọi delete_rating(gid,mid); refresh average và người chưa chấm. Sửa điểm tiếp tục dùng save_rating với 19 giá trị 1–10 bước 0.5.
5. Bình luận chỉ tác giả thấy “Sửa”, “Xóa”; sửa inline textarea tối đa 1000, nút Lưu/Hủy, lưu edit_comment(gid,cid,comment_body); xóa dialog gọi delete_comment(gid,cid). Không nhận user_id. Draft đang nhập không mất bởi polling; trường hợp bình luận biến mất từ phiên khác phải đóng edit an toàn và báo đã đổi.
6. Tất cả RPC dùng action lock hiện có, await backend trước toast; không optimistic hard delete. Sau refresh, khi detail hoặc movie wheel không còn hợp lệ phải clear state; không để bốc chọn phim vừa xóa. Phim đã xem không có nút xóa kể cả owner.
7. Run UI test, `npm test`, `npm run typecheck`; PASS. Commit `git commit -m "feat: add movie and own contribution actions"`.

## Task 7: UI quản lý nhóm và rời nhóm

**Files:** Modify `components/cinema-app.tsx`, `app/globals.css`, `tests/group_management_e2e.py`.

1. Test B rời/hủy, A owner không rời, đổi tên chỉ owner; reload/sidebar/breadcrumb/mã mời; invalid name; lỗi/mạng; một phiên B rời khiến tab B khác không còn hiển thị dữ liệu khi focus/poll.
2. Run `python -X utf8 tests/group_management_e2e.py`, FAIL controls thiếu.
3. Thêm “Cài đặt nhóm” vào header nhóm. Owner thấy form đổi tên và thông báo chưa thể rời; member thấy nút rời cùng mô tả lịch sử đóng góp được giữ. Không hiển thị kick/transfer/delete group chưa có.
4. Rename: input maxLength80, trim không rỗng, submit rename_group(gid,group_name), refresh; giữ mã mời và danh sách. Demo cùng quyền.
5. Leave: dialog xác nhận nêu mất quyền truy cập nhưng giữ đóng góp; RPC leave_group(gid), sau thành công reset groupId/detailId/resultId/wheelRun/query/modal và refresh. Nếu group mất khi poll/focus, chủ động reset toàn bộ state nhạy cảm tương tự, không chỉ ẩn group header. Request async cũ phải có guard groupId/user generation để không ghi dữ liệu cũ vào nhóm mới.
6. Run UI test, `npm test`, `npm run typecheck`; PASS. Commit `git commit -m "feat: add owner rename and member leave interfaces"`.

## Task 8: Upgrade thật, race, nghiệm thu hai phiên và PR riêng

**Files:** Create `docs/group-management-acceptance-2026-10-10.md` (đổi ngày khi thực hiện ngày khác); Modify README.md phần migration/quyền; giữ evidence trong test-results/ được Git ignore.

1. Run `npm test`, `npm run test:db`, `npm run test:api`, `npm run typecheck`, `npm run build`, `python -X utf8 tests/group_management_e2e.py`; PASS trước push. Có test fixture baseline upgrade và migration chạy hai lần, quyền anonymous và direct PATCH/DELETE vẫn bị chặn.
2. Review SQL không DROP/reset/cascade; đối chiếu ref Supabase thử nghiệm đã được phép dgivczwqlzxcvxwzpadm. Chạy migration bổ sung ở đó, không chạy bootstrap, không cập nhật production. SQL audit transaction rollback cho privilege/functions; lưu metadata đã che bí mật, không session token.
3. Push nhánh codex/group-self-management để có Preview riêng, cấu hình chỉ Preview tận dụng env đã có; không thêm production env. Mở draft PR riêng, attach artifact, ghi phụ thuộc #2 và migration. Nếu base #2, diff chỉ migration/UI/quyền mới; khi retarget main phải review lại toàn bộ.
4. Dùng Chrome A owner, Edge B member độc lập, user tự nhập mật khẩu nếu cần. Tạo nhóm/records mang tên nghiệm thu riêng, không dùng dữ liệu thật có trước. UI + API bằng hai session chứng minh cả phép cho phép và từ chối, không chỉ nút ẩn. Không đọc token từ browser hidden state; harness API tạm giữ token/password trong memory, bỏ log secret và dừng sau test.
5. A/B kiểm tra xóa phim own/other, owner xóa B, watched từ chối, đang chốt clear tonight, thêm lại cùng TMDB không duplicate. Bình luận own edit/delete và score own update/delete; owner giả cid B/foreign gid đều từ chối. Direct table write 403 giữ nguyên.
6. Rename B từ chối/A đạt; B leave → UI reset, REST groups/movies/ratings/comments gid trả 0 dòng, mọi RPC not_member, điểm/phim/bình luận B vẫn tồn tại khi A đọc; owner leave bị chặn; B rejoin không trùng. Dùng JWT B vẫn còn hạn để chứng minh membership gate thật, không nhầm logout với rời nhóm.
7. Test bằng **hai connection Postgres thật** transaction có barrier: delete_movie đối đầu select_movie/mark_watched; leave_group đối đầu add_movie/save_rating/edit_comment/join_group. Thứ tự khóa chung nhóm→movie, RPC ghi hoàn tất trước leave hoặc bị not_member sau leave, không có ghi commit trái phép sau leave hoặc deadlock. Nếu công cụ không có hai connection, ghi BLOCKED race, không nhận PGlite là chứng minh đủ.
8. Báo cáo từng luồng Đạt/Không đạt/Bị chặn, gắn source SHA/URL, danh sách test data đã giữ/dọn; không ghi email/secret. Chỉ dọn dữ liệu thử được phép. Review lại migration/security diff, giữ draft, không merge/promote. Phương án rollback ứng dụng về Preview cũ và revoke execute RPC mới trước khi drop function nếu cần; không tự rollback dữ liệu đã xóa, vì hard delete không có thùng rác.
9. Commit tài liệu nghiệm thu: `git commit -m "docs: record group self management Preview acceptance"`; push nhánh PR riêng. Kết thúc bằng PR, Preview và báo cáo thực tế, giữ rõ migration đã áp ở test project và phần chưa kiểm tra.

## Tiêu chí hoàn tất

Tất cả phép được cho phép đạt cả UI/API; phép trái quyền bị backend từ chối; migration upgrade không mất dữ liệu và rerunnable; membership race được kiểm tra hoặc ghi bị chặn; không còn state nhóm sau rời/focus/reload; owner không rời được, mã mời không đổi khi rename; không thay production. PR riêng không chứa lại diff TMDB #2. Đây là kế hoạch, không phải tuyên bố đã hoàn thành các chức năng.

## Handoff

Đã chuẩn bị worktree và kế hoạch để thực thi bằng @executing-plans trong lượt sau. Có thể thực thi tuần tự ở chat hiện tại hoặc trong phiên riêng; không tự khởi tạo subagent/phiên mới và không triển khai khi người dùng mới yêu cầu review/lập kế hoạch.

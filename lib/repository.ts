import { supabase } from './supabase';
import type { Group, Movie } from './domain';

function client() { if (!supabase) throw new Error('Chưa cấu hình Supabase.'); return supabase; }
export function readableError(error: unknown) {
  const msg = error instanceof Error ? error.message : String((error as { message?: string })?.message || error);
  if (/duplicate|unique|already_exists/i.test(msg)) return 'Phim này đã có trong danh sách.';
  if (/invalid_invite/i.test(msg)) return 'Mã mời không đúng. Hãy kiểm tra lại với nhóm bạn.';
  if (/not_member|permission|row-level/i.test(msg)) return 'Bạn không có quyền thực hiện thao tác trong nhóm này.';
  if (/not_watched/i.test(msg)) return 'Hãy đánh dấu phim đã xem trước khi chấm điểm hoặc bình luận.';
  if (/invalid_movie|already_watched/i.test(msg)) return 'Phim không còn chờ xem. Danh sách sẽ được cập nhật.';
  if (/not_tonight/i.test(msg)) return 'Phim đang xem đã thay đổi. Hãy tải lại nhóm.';
  if (/Invalid login credentials/i.test(msg)) return 'Email hoặc mật khẩu chưa đúng.';
  if (/Email not confirmed/i.test(msg)) return 'Hãy xác nhận email trước khi đăng nhập.';
  if (/fetch|network/i.test(msg)) return 'Không thể kết nối. Hãy kiểm tra mạng rồi thử lại.';
  if (/rate limit/i.test(msg)) return 'Bạn thao tác quá nhanh. Hãy đợi một chút rồi thử lại.';
  return msg;
}
export async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await client().rpc(name, args);
  if (error) throw error;
  return data;
}
export async function loadGroups(): Promise<Group[]> {
  const { data, error } = await client().from('groups').select('*,members(user_id,profiles(id,name)),group_movies!group_movies_group_id_fkey(*),ratings(*,profiles(name)),comments(*,profiles(name))').order('created_at');
  if (error) throw error;
  return (data || []).map(g => ({ id: g.id, name: g.name, code: g.invite_code, tonightId: g.tonight_id,
    members: g.members.map((m: {user_id: string; profiles: {name: string} | null}) => ({id: m.user_id, name: m.profiles?.name || 'Thành viên'})),
    movies: g.group_movies.map((m: Record<string, unknown>) => ({ id: m.tmdb_id, entryId: m.id, title: m.title, year: m.year, runtime: m.runtime, overview: m.overview, poster: m.poster, backdrop: m.backdrop, genres: Array.isArray(m.genres) ? m.genres : [], addedBy: m.added_by, addedName: g.members.find((p: { user_id: string }) => p.user_id === m.added_by)?.profiles?.name || 'Thành viên', watchedAt: m.watched_at })),
    ratings: g.ratings.map((r: Record<string, any>) => ({ entryId: r.movie_id, userId: r.user_id, name: r.profiles?.name || 'Thành viên', score: Number(r.score) })),
    comments: g.comments.map((c: Record<string, any>) => ({ id: c.id, entryId: c.movie_id, userId: c.user_id, name: c.profiles?.name || 'Thành viên', body: c.body, createdAt: c.created_at })).sort((a: {createdAt: string}, b: {createdAt: string}) => a.createdAt.localeCompare(b.createdAt))
  })) as Group[];
}
export async function movieRequest(query: string | number): Promise<Movie[]> {
  const { data } = await client().auth.getSession();
  const params = typeof query === 'number' ? `id=${query}` : `q=${encodeURIComponent(query)}`;
  const response = await fetch(`/api/movies?${params}`, { headers: { Authorization: `Bearer ${data.session?.access_token || ''}` } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Không thể lấy dữ liệu phim.');
  return result.movies;
}

import { supabase } from './supabase';
import type { Group, Movie } from './domain';
import { withRequestDeadline } from './request-deadline';

export class ServiceError extends Error {
  status: number;
  constructor(message: string, status: number) {super(message); this.status = status;}
}

function client() { if (!supabase) throw new Error('Chưa cấu hình Supabase.'); return supabase; }
export { readableError } from './repository-errors';
export async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await withRequestDeadline(signal=>client().rpc(name, args).abortSignal(signal));
  if (error) throw new ServiceError(error.message, error.code === 'PGRST301' || error.code === 'PGRST303' ? 401 : 400);
  return data;
}
export async function loadGroups(): Promise<Group[]> {
  const { data, error } = await withRequestDeadline(signal=>client().from('groups').select('*,members(user_id,profiles(id,name,avatar_path)),group_movies!group_movies_group_id_fkey(*),ratings(*,profiles(name)),comments(*,profiles(name,avatar_path))').order('created_at').abortSignal(signal),10000);
  if (error) throw new ServiceError(error.message, error.code === 'PGRST301' || error.code === 'PGRST303' ? 401 : 400);
  return (data || []).map(g => ({ id: g.id, ownerId: g.owner_id, name: g.name, code: g.invite_code, tonightId: g.tonight_id,
    members: g.members.map((m: {user_id: string; profiles: {name: string; avatar_path?: string | null} | null}) => ({id: m.user_id, name: m.profiles?.name || 'Thành viên', avatarPath: m.profiles?.avatar_path || null})),
    movies: g.group_movies.map((m: Record<string, unknown>) => ({ id: m.tmdb_id, entryId: m.id, title: m.title, year: m.year, runtime: m.runtime, overview: m.overview, poster: m.poster, backdrop: m.backdrop, genres: Array.isArray(m.genres) ? m.genres : [], addedBy: m.added_by, addedName: g.members.find((p: { user_id: string }) => p.user_id === m.added_by)?.profiles?.name || 'Thành viên', watchedAt: m.watched_at })),
    ratings: g.ratings.map((r: Record<string, any>) => ({ entryId: r.movie_id, userId: r.user_id, name: r.profiles?.name || 'Thành viên', score: Number(r.score) })),
    comments: g.comments.map((c: Record<string, any>) => ({ id: c.id, entryId: c.movie_id, userId: c.user_id, name: c.profiles?.name || 'Thành viên đã rời', avatarPath: c.profiles?.avatar_path || null, body: c.body, createdAt: c.created_at })).sort((a: {createdAt: string}, b: {createdAt: string}) => a.createdAt.localeCompare(b.createdAt))
  })) as Group[];
}
export async function movieRequest(query: string | number): Promise<Movie[]> {
  return withRequestDeadline(async signal=>{
    const { data, error } = await client().auth.getSession();
    if (error) throw error;
    const params = typeof query === 'number' ? `id=${query}` : `q=${encodeURIComponent(query)}`;
    const response = await fetch(`/api/movies?${params}`, { headers: { Authorization: `Bearer ${data.session?.access_token || ''}` },signal });
    const result = await response.json();
    if (!response.ok) throw new ServiceError(result.error || 'Không thể lấy dữ liệu phim.', response.status);
    return result.movies;
  });
}

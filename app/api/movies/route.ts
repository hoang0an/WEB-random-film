import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
export const runtime = 'nodejs';
function tmdbCredential() {
  return process.env.TMDB_API_KEY?.trim() || process.env.TMDB_READ_ACCESS_TOKEN?.trim() || '';
}
async function tmdb(path: string, language = 'vi-VN') {
  const url = new URL(`https://api.themoviedb.org/3/${path}`);
  url.searchParams.set('language', language);
  url.searchParams.set('include_adult', 'false');
  const credential = tmdbCredential();
  const headers: Record<string, string> = {};
  // Existing Preview configurations may contain a v3 key in the token field.
  if (/^[a-f0-9]{32}$/i.test(credential)) url.searchParams.set('api_key', credential);
  else headers.Authorization = `Bearer ${credential}`;
  const result = await fetch(url, { headers, signal: AbortSignal.timeout(10000), cache: 'no-store' });
  if (!result.ok) throw new Error(result.status === 429 ? 'TMDB đang bận. Hãy đợi một chút rồi thử lại.' : 'Không thể lấy dữ liệu TMDB. Hãy kiểm tra cấu hình hoặc thử lại sau.');
  return result.json();
}
function movie(m: Record<string, any>) {
  return { id: m.id, title: m.title || m.original_title, originalTitle: m.original_title, year: (m.release_date || '').slice(0, 4), runtime: m.runtime || null, overview: m.overview || 'Chưa có mô tả cho phim này.', poster: m.poster_path || null, backdrop: m.backdrop_path || null, genres: (Array.isArray(m.genres) ? m.genres : []).map((g: {name?: string}) => g.name).filter((name: unknown) => typeof name === 'string' && name.length > 0) };
}
export async function GET(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !tmdbCredential()) return NextResponse.json({ error: 'Chưa cấu hình dịch vụ tìm phim TMDB.' }, { status: 503 });
  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
    if (!token) return NextResponse.json({error: 'Hãy đăng nhập để tìm phim.'}, {status: 401});
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {auth: {persistSession: false, autoRefreshToken: false}});
    const {data, error} = await sb.auth.getUser(token);
    if (error || !data.user) return NextResponse.json({error: 'Phiên đăng nhập hết hạn. Hãy đăng nhập lại.'}, {status: 401});
    const id = request.nextUrl.searchParams.get('id');
    if (id) {
      if (!/^\d{1,10}$/.test(id) || Number(id) < 1) return NextResponse.json({error: 'Mã phim không hợp lệ.'}, {status: 400});
      const detail = await tmdb(`movie/${id}`);
      if (detail.adult) return NextResponse.json({error: 'Phim này không phù hợp với danh sách nhóm.'}, {status: 400});
      if (!detail.overview) { const english = await tmdb(`movie/${id}`, 'en-US'); detail.overview = english.overview; }
      return NextResponse.json({ movies: [movie(detail)] });
    }
    const q = request.nextUrl.searchParams.get('q')?.trim() || '';
    if (q.length < 2 || q.length > 100) return NextResponse.json({error: 'Nhập tên phim từ 2 đến 100 ký tự.'}, {status: 400});
    const results = await tmdb(`search/movie?query=${encodeURIComponent(q)}`);
    return NextResponse.json({movies: (results.results || []).filter((m: {adult: boolean}) => !m.adult).slice(0, 20).map(movie)});
  } catch (error) {
    return NextResponse.json({error: error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'Kết nối TMDB chậm. Hãy thử lại.'}, {status: 502});
  }
}

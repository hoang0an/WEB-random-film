export type Person = { id: string; name: string };
export type Movie = { id: number; title: string; originalTitle?: string; year: string; runtime: number | null; overview: string; poster: string | null; backdrop?: string | null; genres?: string[] };
export type Entry = Movie & { entryId: string; addedBy: string; addedName: string; watchedAt: string | null };
export type Rating = { entryId: string; userId: string; name: string; score: number };
export type Comment = { id: string; entryId: string; userId: string; name: string; body: string; createdAt: string };
export type Group = { id: string; ownerId: string; name: string; code: string; members: Person[]; movies: Entry[]; tonightId: string | null; ratings: Rating[]; comments: Comment[] };
export type Store = { groups: Group[] };

export function drawMovie(movies: Entry[], previousId?: string | null, random = Math.random): Entry | null {
  const pool = movies.filter(m => !m.watchedAt && m.entryId !== previousId);
  return pool.length ? pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] : null;
}
export function averageRating(ratings: Rating[]): number | null {
  return ratings.length ? ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length : null;
}
export function validScore(score: number) { return Number.isFinite(score) && score >= 1 && score <= 10 && Number.isInteger(score * 2); }
export function inviteCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

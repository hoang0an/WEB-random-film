import type { Entry } from './domain';

export type WheelRun = { id: number; groupId: string; winner: Entry; pool: Entry[] };
export const SPIN_MS = 2300;
export const REVEAL_MS = 480;
export const TAU = Math.PI * 2;

// The draw is already decided. This only calculates where the visual wheel stops.
export function stopAngle(start: number, winnerIndex: number, count: number) {
  const target = -winnerIndex * TAU / Math.max(1, count);
  const distance = ((target - start) % TAU + TAU) % TAU;
  return start + 2 * TAU + distance;
}
export function easeOutCubic(progress: number) {
  return 1 - (1 - Math.max(0, Math.min(1, progress))) ** 3;
}
export function wheelCards(pool: Entry[], winnerId?: string, limit = 10): Entry[] {
  const visible = pool.slice(0, limit);
  const winner = pool.find(movie => movie.entryId === winnerId);
  if (winner && !visible.some(movie => movie.entryId === winnerId)) visible[visible.length - 1] = winner;
  return visible;
}

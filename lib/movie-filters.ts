import type { Entry } from './domain';

export type DurationFilter = 'all' | 'short' | 'medium' | 'long';
export function filterMovies(movies: Entry[], genre: string, duration: DurationFilter): Entry[] {
  return movies.filter(movie => {
    if (genre && !movie.genres?.includes(genre)) return false;
    if (duration === 'all') return true;
    if (!movie.runtime || movie.runtime <= 0) return false;
    return duration === 'short' ? movie.runtime <= 120 : duration === 'medium' ? movie.runtime > 120 && movie.runtime <= 150 : movie.runtime > 150;
  });
}

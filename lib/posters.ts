export const imageUrl = (path: string | null | undefined, size = 'w500') => path && /^\/[a-zA-Z0-9._-]+$/.test(path) ? `https://image.tmdb.org/t/p/${size}${path}` : '/poster-placeholder.svg';

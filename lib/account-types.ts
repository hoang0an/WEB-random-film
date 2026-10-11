export type ImageKind = 'avatar' | 'cover';
export type AccountProfile = {id: string; name: string; avatarPath: string | null; coverPath: string | null; revision: number};
export type RatingsCursor = {title: string; id: string};
export type PersonalRating = {id: string; tmdbId: number; title: string; year: string; poster: string | null; score: number; isCurrentMember: boolean};
export type RatingPage = {items: PersonalRating[]; nextCursor: RatingsCursor | null};
export type AccountUpdate = {expectedRevision: number; name?: string; avatarAssetId?: string | null; coverAssetId?: string | null};
export type AccountService = {
  getProfile(): Promise<AccountProfile>;
  updateProfile(update: AccountUpdate): Promise<AccountProfile>;
  listRatings(cursor?: RatingsCursor | null): Promise<RatingPage>;
  uploadImage(kind: ImageKind, file: File): Promise<{assetId: string}>;
  resolveImage(kind: ImageKind, path: string): Promise<string | null>;
};
export const ACCOUNT_IMAGE_LIMIT = 3 * 1024 * 1024;
export const ACCOUNT_IMAGE_PIXEL_LIMIT = 24_000_000;
export function normalizeAccountName(name: string): string {
  const value = name.trim();
  if (!value || [...value].length > 80) throw new Error('Tên cần từ 1 đến 80 ký tự.');
  return value;
}
export function validateImageInput(file: {size: number; type: string}): void {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Chọn ảnh JPEG, PNG hoặc WebP tĩnh.');
  if (file.size <= 0 || file.size > ACCOUNT_IMAGE_LIMIT) throw new Error('Ảnh cần nhỏ hơn hoặc bằng 3 MiB.');
}

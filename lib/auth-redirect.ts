export const INVITE_STORAGE_KEY = 'cinema-pending-invite';
export function validInvite(value: string | null | undefined): string | null {
  return value && /^[A-Z0-9]{1,64}$/i.test(value) ? value : null;
}
export function authRedirect(origin: string, page: 'callback' | 'reset-password', invite?: string | null) {
  const url = new URL(`/auth/${page}`, origin);
  const code = validInvite(invite);
  if (code) url.searchParams.set('invite', code);
  return url.href;
}
export function homeRedirect(invite?: string | null) {
  const code = validInvite(invite);
  return code ? `/?invite=${encodeURIComponent(code)}` : '/';
}
export function linkError(search: string, hash: string) {
  const parameters = [new URLSearchParams(search), new URLSearchParams(hash.replace(/^#/, ''))];
  return parameters.some(params => ['error', 'error_code', 'error_description'].some(key => params.has(key)))
    ? 'Liên kết đã hết hạn hoặc không hợp lệ. Hãy yêu cầu liên kết mới.' : null;
}
export function rememberInvite() {
  const code = validInvite(new URLSearchParams(window.location.search).get('invite'));
  try {
    if (code) sessionStorage.setItem(INVITE_STORAGE_KEY, code);
    return code || validInvite(sessionStorage.getItem(INVITE_STORAGE_KEY));
  } catch {return code;}
}
export function consumeInvite() {
  const code = rememberInvite();
  try {sessionStorage.removeItem(INVITE_STORAGE_KEY);} catch { /* URL still carries invite. */ }
  return code;
}

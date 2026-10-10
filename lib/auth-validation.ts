export type AuthFields = {
  email: string;
  password: string;
  confirmPassword?: string;
  name?: string;
};

export function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function validateAuth(mode: 'login' | 'signup' | 'reset', fields: AuthFields): string | null {
  if (mode !== 'reset' && !validEmail(fields.email)) return 'Nhập email hợp lệ.';
  if (!fields.password) return 'Nhập mật khẩu.';
  if (mode !== 'login' && fields.password.length < 8) return 'Mật khẩu cần ít nhất 8 ký tự.';
  if (mode !== 'login' && fields.password !== fields.confirmPassword) return 'Hai mật khẩu chưa khớp.';
  if (mode === 'signup' && (!fields.name?.trim() || fields.name.trim().length > 80))
    return 'Tên cần từ 1 đến 80 ký tự.';
  return null;
}

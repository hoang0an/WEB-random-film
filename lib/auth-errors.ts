const messages: Record<string, string> = {
  invalid_credentials: 'Email hoặc mật khẩu chưa đúng.',
  email_not_confirmed: 'Hãy xác nhận email trước khi đăng nhập.',
  weak_password: 'Mật khẩu chưa đáp ứng yêu cầu. Hãy chọn mật khẩu mạnh hơn.',
  over_email_send_rate_limit: 'Bạn thao tác quá nhanh. Hãy đợi một chút rồi thử lại.',
  over_request_rate_limit: 'Bạn thao tác quá nhanh. Hãy đợi một chút rồi thử lại.',
  otp_expired: 'Liên kết đã hết hạn hoặc không hợp lệ. Hãy yêu cầu liên kết mới.',
  same_password: 'Hãy chọn mật khẩu mới khác mật khẩu hiện tại.',
};

export function authErrorMessage(error: unknown): string {
  const value = error as {code?: string; message?: string; name?: string} | null;
  if (value?.code && messages[value.code]) return messages[value.code];
  const message = value?.message || '';
  if (/invalid login credentials/i.test(message)) return messages.invalid_credentials;
  if (/email not confirmed/i.test(message)) return messages.email_not_confirmed;
  if (/rate limit/i.test(message)) return messages.over_request_rate_limit;
  if (/fetch|network|timeout/i.test(message) || value?.name === 'AuthRetryableFetchError')
    return 'Không thể kết nối. Hãy kiểm tra mạng rồi thử lại.';
  return 'Không thể hoàn tất. Hãy thử lại.';
}

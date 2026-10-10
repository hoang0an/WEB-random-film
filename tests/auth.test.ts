import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAuth } from '../lib/auth-validation.ts';
import { authErrorMessage } from '../lib/auth-errors.ts';

const signup = { email: ' ban@example.com ', name: ' An ', password: ' secret12 ', confirmPassword: ' secret12 ' };
test('signup validates name, email, new password and confirmation', () => {
  assert.equal(validateAuth('signup', signup), null);
  assert.equal(validateAuth('signup', {...signup, name: '   '}), 'Tên cần từ 1 đến 80 ký tự.');
  assert.equal(validateAuth('signup', {...signup, name: 'a'.repeat(81)}), 'Tên cần từ 1 đến 80 ký tự.');
  assert.equal(validateAuth('signup', {...signup, email: 'not-email'}), 'Nhập email hợp lệ.');
  assert.equal(validateAuth('signup', {...signup, password: '1234567'}), 'Mật khẩu cần ít nhất 8 ký tự.');
  assert.equal(validateAuth('signup', {...signup, confirmPassword: 'secret12'}), 'Hai mật khẩu chưa khớp.');
});
test('login accepts legacy nonempty passwords; reset needs matching new passwords', () => {
  assert.equal(validateAuth('login', {email: signup.email, password: 'old'}), null);
  assert.equal(validateAuth('login', {email: signup.email, password: ''}), 'Nhập mật khẩu.');
  assert.equal(validateAuth('reset', {...signup, email: ''}), null);
  assert.equal(validateAuth('reset', {...signup, confirmPassword: 'wrong'}), 'Hai mật khẩu chưa khớp.');
});
test('auth errors prefer codes and never expose unknown service errors', () => {
  assert.equal(authErrorMessage({code: 'invalid_credentials', message: 'private detail'}), 'Email hoặc mật khẩu chưa đúng.');
  assert.equal(authErrorMessage({code: 'email_not_confirmed'}), 'Hãy xác nhận email trước khi đăng nhập.');
  assert.equal(authErrorMessage({code: 'weak_password'}), 'Mật khẩu chưa đáp ứng yêu cầu. Hãy chọn mật khẩu mạnh hơn.');
  for (const code of ['over_email_send_rate_limit', 'over_request_rate_limit'])
    assert.equal(authErrorMessage({code}), 'Bạn thao tác quá nhanh. Hãy đợi một chút rồi thử lại.');
  assert.equal(authErrorMessage({code: 'otp_expired'}), 'Liên kết đã hết hạn hoặc không hợp lệ. Hãy yêu cầu liên kết mới.');
  assert.equal(authErrorMessage(new Error('Invalid login credentials')), 'Email hoặc mật khẩu chưa đúng.');
  assert.equal(authErrorMessage(new TypeError('Failed to fetch')), 'Không thể kết nối. Hãy kiểm tra mạng rồi thử lại.');
  assert.equal(authErrorMessage({message: 'database secret'}), 'Không thể hoàn tất. Hãy thử lại.');
});

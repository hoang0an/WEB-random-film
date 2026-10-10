'use client';

import { useEffect, useState } from 'react';
import { supabase, incomingAuthError, incomingRecovery } from '@/lib/supabase';
import { authErrorMessage } from '@/lib/auth-errors';
import { homeRedirect, rememberInvite } from '@/lib/auth-redirect';

export default function AuthCallback() {
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const invite = rememberInvite();
    async function complete() {
      setError('');
      if (!supabase) {setError('Chưa kết nối dịch vụ tài khoản.'); return;}
      if (incomingAuthError) {setError(incomingAuthError); return;}
      try {
        const {data, error} = await supabase.auth.getSession();
        if (error) throw error;
        if (!data.session) {if (active) setError('Liên kết đã hết hạn hoặc không hợp lệ. Hãy yêu cầu liên kết mới.'); return;}
        const result = await supabase.auth.getUser(data.session.access_token);
        if (result.error) throw result.error;
        if (active) window.location.replace(incomingRecovery ? '/auth/reset-password' : homeRedirect(invite));
      } catch (failure) {if (active) setError(authErrorMessage(failure));}
    }
    void complete();
    return () => {active = false;};
  }, [attempt]);
  return <main className="auth-link-page"><section className="auth-card">
    <span className="section-kicker">TỐI NAY XEM GÌ?</span><h1>Xác nhận tài khoản</h1>
    {error ? <><p role="alert" className="error auth-feedback">{error}</p><button className="button secondary full" onClick={() => setAttempt(value => value + 1)}>Thử lại</button><a className="button primary full" href="/">Về đăng nhập / gửi lại email</a></>
      : <p role="status" className="muted">Đang xác nhận liên kết…</p>}
  </section></main>;
}

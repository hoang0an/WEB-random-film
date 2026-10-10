'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/use-auth';
import { supabase } from '@/lib/supabase';
import { authErrorMessage } from '@/lib/auth-errors';
import { validateAuth } from '@/lib/auth-validation';
import { createAuthService } from '@/lib/auth-service';
import { rememberInvite, homeRedirect } from '@/lib/auth-redirect';

export default function ResetPasswordPanel() {
  const auth = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [changed, setChanged] = useState(false);
  const lock = useRef(false);
  const verified = useRef(false);
  const [checking, setChecking] = useState(true);
  const [verificationAttempt, setVerificationAttempt] = useState(0);
  const service = supabase ? createAuthService(supabase) : null;
  const alert = useRef<HTMLParagraphElement>(null);
  useEffect(() => {rememberInvite();}, []);
  useEffect(() => {if (error) alert.current?.focus();}, [error]);
  useEffect(() => {
    let active = true;
    verified.current = false;
    if (!auth.session || !supabase) {setChecking(false); return;}
    setChecking(true);
    void supabase.auth.getUser(auth.session.access_token).then(({error}) => {
      if (!active) return;
      verified.current = !error;
      if (error) setError(authErrorMessage(error));
      else setError('');
      setChecking(false);
    }).catch(failure => {if (active) {setError(authErrorMessage(failure)); setChecking(false);}});
    return () => {active = false;};
  }, [auth.session?.access_token, verificationAttempt]);
  async function finishLogout() {
    await service!.logout();
    const invite = rememberInvite();
    const target = new URL(homeRedirect(invite), window.location.origin);
    target.searchParams.set('passwordUpdated', '1');
    window.location.replace(target.href);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current || !verified.current || !service) return;
    const validation = validateAuth('reset', {email: '', password, confirmPassword});
    if (validation) {setError(validation); return;}
    lock.current = true; setPending(true); setError('');
    try {
      await service.updatePassword(password);
      setChanged(true); setPassword(''); setConfirmPassword('');
      try {await finishLogout();} catch {setError('Mật khẩu đã đổi. Chưa thể đăng xuất; hãy thử lại.');}
    } catch (failure) {setError(authErrorMessage(failure));}
    finally {lock.current = false; setPending(false);}
  }
  async function retryLogout() {
    if (lock.current) return;
    lock.current = true; setPending(true); setError('');
    try {await finishLogout();} catch {setError('Mật khẩu đã đổi. Chưa thể đăng xuất; hãy thử lại.');}
    finally {lock.current = false; setPending(false);}
  }
  return <main className="auth-link-page"><section className="auth-card">
    <span className="section-kicker">TỐI NAY XEM GÌ?</span><h1>Đặt lại mật khẩu</h1>
    {changed ? <><p role="status" className="auth-feedback">Mật khẩu đã đổi.</p><button className="button primary full" disabled={pending} onClick={() => void retryLogout()}>Đăng xuất và về đăng nhập</button></>
      : auth.status === 'initializing' || checking ? <p role="status">Đang kiểm tra liên kết…</p>
      : auth.session && verified.current ? <form onSubmit={submit}>
        <fieldset className="auth-fields" disabled={pending}>
          <label htmlFor="reset-password">Mật khẩu mới<input id="reset-password" type={visible ? 'text' : 'password'} required minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}/></label>
          <label htmlFor="reset-confirm">Nhập lại mật khẩu<input id="reset-confirm" type={visible ? 'text' : 'password'} required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}/></label>
          <button type="button" className="text-button full" aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}</button>
          <button className="button primary full" disabled={pending}>{pending ? 'Đang lưu…' : 'Lưu mật khẩu mới'}</button>
        </fieldset>
      </form> : <><p className="muted">Chưa xác minh được liên kết. Bạn có thể thử lại kết nối hoặc yêu cầu liên kết mới.</p><a className="button primary full" href="/?auth=forgot">Yêu cầu liên kết mới</a>{auth.session && <button className="text-button full" onClick={() => {setError(''); setVerificationAttempt(value => value + 1); void auth.retry();}}>Thử lại kết nối</button>}</>}
    {(error || auth.error) && <p ref={alert} tabIndex={-1} role="alert" className="error auth-feedback">{error || auth.error}</p>}
  </section></main>;
}

'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, Mail } from 'lucide-react';
import { googleEnabled, supabase } from '@/lib/supabase';
import { createAuthService } from '@/lib/auth-service';
import { authErrorMessage } from '@/lib/auth-errors';
import { validateAuth, validEmail } from '@/lib/auth-validation';

type Screen = 'login' | 'signup' | 'checkEmail' | 'forgotPassword';
const titles: Record<Screen, string> = {
  login: 'Chào bạn trở lại', signup: 'Bắt đầu cùng nhóm bạn',
  checkEmail: 'Kiểm tra email của bạn', forgotPassword: 'Quên mật khẩu?',
};

export default function AuthPanel() {
  const [screen, setScreen] = useState<Screen>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [status, setStatus] = useState('');
  const [resendUntil, setResendUntil] = useState(0);
  const [recoverUntil, setRecoverUntil] = useState(0);
  const [now, setNow] = useState(0);
  const lock = useRef(false);
  const alert = useRef<HTMLParagraphElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const mounted = useRef(true);
  const service = supabase ? createAuthService(supabase) : null;
  const resendSeconds = Math.max(0, Math.ceil((resendUntil - now) / 1000));
  const recoverSeconds = Math.max(0, Math.ceil((recoverUntil - now) / 1000));

  useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);
  useEffect(() => {
    if (!resendUntil && !recoverUntil) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [resendUntil, recoverUntil]);
  useEffect(() => {if (error) alert.current?.focus();}, [error]);

  function move(next: Screen) {
    if (lock.current) return;
    setScreen(next); setPassword(''); setConfirmPassword(''); setVisible(false);
    setError(''); setStatus(''); setUnconfirmed(false);
  }
  function invite() {
    const value = new URLSearchParams(window.location.search).get('invite');
    return value && /^[A-Z0-9]{1,64}$/i.test(value) ? value : null;
  }
  async function run(key: string, operation: () => Promise<void>) {
    if (lock.current || !service) return;
    lock.current = true; setPending(key); setError(''); setStatus(''); setUnconfirmed(false);
    try {await operation();}
    catch (failure) {
      if (mounted.current) {
        setError(authErrorMessage(failure));
        const code = (failure as {code?: string})?.code;
        setUnconfirmed(code === 'email_not_confirmed');
      }
    } finally {
      lock.current = false;
      if (mounted.current) setPending('');
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current || !service) return;
    if (!form.current?.reportValidity()) return;
    const validation = screen === 'forgotPassword'
      ? validEmail(email) ? null : 'Nhập email hợp lệ.'
      : validateAuth(screen === 'signup' ? 'signup' : 'login', {email, password, confirmPassword, name});
    if (validation) {setError(validation); setStatus(''); return;}
    void run(screen, async () => {
      if (screen === 'signup') {
        const data = await service.signup({email, password, name}, window.location.origin, invite());
        if (!mounted.current) return;
        setPassword(''); setConfirmPassword(''); setVisible(false);
        if (!data.session) {setEmail(email.trim()); setScreen('checkEmail');}
      } else if (screen === 'forgotPassword') {
        if (Date.now() < recoverUntil) return;
        await service.recover(email, window.location.origin);
        if (!mounted.current) return;
        setStatus('Nếu email này có tài khoản, bạn sẽ nhận được liên kết đặt lại mật khẩu. Hãy kiểm tra cả thư rác.');
        const sentAt = Date.now(); setNow(sentAt); setRecoverUntil(sentAt + 60000);
      } else {
        await service.login(email, password);
        if (mounted.current) {setPassword(''); setConfirmPassword('');}
      }
    });
  }
  function resend() {
    if (Date.now() < resendUntil || !validEmail(email)) return;
    void run('resend', async () => {
      await service!.resend(email, window.location.origin, invite());
      if (!mounted.current) return;
      setStatus('Đã yêu cầu gửi lại email xác nhận. Hãy kiểm tra hộp thư và thư rác.');
      const sentAt = Date.now(); setNow(sentAt); setResendUntil(sentAt + 60000);
    });
  }

  return <>
    <h2>{titles[screen]}</h2>
    <p className="muted auth-intro">{screen === 'checkEmail'
      ? <>Mở thư xác nhận gửi đến <strong className="auth-email">{email}</strong> để kích hoạt tài khoản. Nếu đã có tài khoản, bạn có thể đăng nhập hoặc đặt lại mật khẩu.</>
      : screen === 'forgotPassword' ? 'Nhập email để nhận liên kết đặt lại mật khẩu.'
      : 'Đăng nhập để mở danh sách phim của nhóm bạn.'}</p>
    {screen === 'checkEmail' ? <>
      <div className="auth-mail-note"><Mail size={22}/><span>Chưa thấy thư? Kiểm tra thư rác hoặc gửi lại email xác nhận.</span></div>
      <button type="button" className="button primary full" disabled={!!pending || resendSeconds > 0} onClick={resend}>
        {pending === 'resend' ? 'Đang gửi…' : resendSeconds > 0 ? `Gửi lại sau ${resendSeconds}s` : 'Gửi lại email xác nhận'}
      </button>
    </> : <>
      {googleEnabled && (screen === 'login' || screen === 'signup') && <>
        <button type="button" className="button google-button" disabled={!!pending} onClick={() => void run('google', async () => {
          await service!.google(googleEnabled, window.location.origin, invite());
        })}><span className="google-g">G</span>{pending === 'google' ? 'Đang mở Google…' : 'Tiếp tục với Google'}</button>
        <div className="separator">hoặc dùng email</div>
      </>}
      <form ref={form} onSubmit={submit} noValidate aria-busy={!!pending}>
        <fieldset className="auth-fields" disabled={!!pending}>
          {screen === 'signup' && <label htmlFor="auth-name">Tên của bạn<input id="auth-name" required maxLength={80} value={name} onChange={e => setName(e.target.value)} autoComplete="name"/></label>}
          <label htmlFor="auth-email">Email<input id="auth-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="ban@email.com"/></label>
          {screen !== 'forgotPassword' && <>
            <label htmlFor="auth-password">Mật khẩu</label>
            <div className="auth-password"><input id="auth-password" type={visible ? 'text' : 'password'} required minLength={screen === 'signup' ? 8 : undefined} value={password} onChange={e => setPassword(e.target.value)} autoComplete={screen === 'login' ? 'current-password' : 'new-password'} placeholder={screen === 'signup' ? 'Ít nhất 8 ký tự' : 'Mật khẩu của bạn'}/>
              <button type="button" className="icon-button" aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
            </div>
            {screen === 'signup' && <label htmlFor="auth-confirm">Nhập lại mật khẩu<input id="auth-confirm" type={visible ? 'text' : 'password'} required minLength={8} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password"/></label>}
          </>}
          <button className="button primary full" disabled={!!pending || (screen === 'forgotPassword' && recoverSeconds > 0)}>{pending ? 'Đang xử lý…' : screen === 'signup' ? 'Tạo tài khoản' : screen === 'forgotPassword' ? recoverSeconds > 0 ? `Gửi lại sau ${recoverSeconds}s` : 'Gửi liên kết đặt lại' : 'Đăng nhập'}<ArrowRight size={18}/></button>
        </fieldset>
      </form>
    </>}
    {error && <p ref={alert} className="error auth-feedback" role="alert" tabIndex={-1}>{error}</p>}
    {status && <p className="auth-feedback auth-status" role="status">{status}</p>}
    {screen === 'login' && unconfirmed && <button type="button" className="text-button full" disabled={!!pending || resendSeconds > 0} onClick={resend}>{resendSeconds > 0 ? `Gửi lại sau ${resendSeconds}s` : 'Gửi lại email xác nhận'}</button>}
    {screen === 'login' && <button type="button" className="text-button full" disabled={!!pending} onClick={() => move('forgotPassword')}>Quên mật khẩu?</button>}
    <button type="button" className="text-button full auth-switch" disabled={!!pending} onClick={() => move(screen === 'login' ? 'signup' : 'login')}>
      {screen === 'login' ? 'Chưa có tài khoản? Đăng ký' : screen === 'signup' ? 'Đã có tài khoản? Đăng nhập' : 'Quay lại đăng nhập'}
    </button>
    {screen === 'checkEmail' && <button type="button" className="text-button full" disabled={!!pending} onClick={() => move('forgotPassword')}>Quên mật khẩu?</button>}
  </>;
}

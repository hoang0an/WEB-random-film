'use client';

import {useEffect, useId, useRef, useState} from 'react';
import {X, Star, ImagePlus} from 'lucide-react';
import {ACCOUNT_IMAGE_PIXEL_LIMIT, normalizeAccountName, validateImageInput, type AccountProfile, type AccountService, type AccountUpdate, type ImageKind, type PersonalRating, type RatingsCursor} from '@/lib/account-types';
import {imageUrl} from '@/lib/posters';
import './account-panel.css';

type Props = {service: AccountService; email: string | null; onProfileSaved: (profile: AccountProfile) => void; onProfileLoaded?: (profile: AccountProfile) => void; onClose: () => void; onUnauthorized?: () => void};
type Draft = {file: File; url: string; committedPath?: string};
const kinds: ImageKind[] = ['avatar', 'cover'];
const revoke = (url: string | null | undefined) => {if (url?.startsWith('blob:')) URL.revokeObjectURL(url);};
function message(error: unknown) {
  const value = error instanceof Error ? error.message : String(error);
  if (/timeout|unknown|uncertain/i.test(value)) return 'Chưa xác nhận được kết quả lưu. Hãy tải lại hồ sơ để kiểm tra trước khi lưu tiếp.';
  if (/revision|conflict|stale/i.test(value)) return 'Hồ sơ đã thay đổi ở nơi khác. Hãy tải lại hồ sơ trước khi lưu tiếp.';
  if (/unauthorized|unauthenticated|jwt|session/i.test(value)) return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.';
  if (/quota/i.test(value)) return 'Thiết bị không còn đủ dung lượng để lưu ảnh.';
  if (/fetch|network/i.test(value)) return 'Không thể kết nối. Hãy kiểm tra mạng rồi thử lại.';
  if (/image|decode|pixel|format|asset/i.test(value)) return 'Không thể lưu ảnh này. Chọn ảnh JPEG, PNG hoặc WebP tĩnh, tối đa 3 MiB và 24 triệu điểm ảnh.';
  if (/^[\x00-\x7F]+$/.test(value)) return 'Không thể hoàn tất thao tác. Hãy thử lại sau.';
  return value;
}

export default function AccountPanel({service, email, onProfileSaved, onProfileLoaded, onClose, onUnauthorized}: Props) {
  const headingId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const active = useRef(true);
  const identity = useRef({service, email}); identity.current = {service, email};
  const generation = useRef(0);
  const callbacks = useRef({onProfileSaved, onProfileLoaded, onClose, onUnauthorized}); callbacks.current = {onProfileSaved, onProfileLoaded, onClose, onUnauthorized};
  const selections = useRef<Record<ImageKind, number>>({avatar: 0, cover: 0});
  const locked = useRef(false);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [name, setName] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [ratings, setRatings] = useState<PersonalRating[]>([]);
  const [cursor, setCursor] = useState<RatingsCursor | null>(null);
  const [ratingsLoading, setRatingsLoading] = useState(true);
  const [ratingsError, setRatingsError] = useState('');
  const [busy, setBusy] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [status, setStatus] = useState('');
  const [urls, setUrls] = useState<Record<ImageKind, string | null>>({avatar: null, cover: null});
  const [drafts, setDrafts] = useState<Partial<Record<ImageKind, Draft>>>({});
  const ownedUrls = useRef<Record<ImageKind, string | null>>({avatar: null, cover: null});
  const ownedDrafts = useRef<Partial<Record<ImageKind, Draft>>>({});
  const draftTimers = useRef<Partial<Record<ImageKind, ReturnType<typeof setTimeout>>>>({});
  const valid = (token: number) => active.current && generation.current === token && identity.current.service === service && identity.current.email === email;
  const fail = (error: unknown) => {if (/unauthorized|unauthenticated|auth_required|jwt|session|phiên đăng nhập.*hết hạn|phiên đăng nhập.*thay đổi/i.test(error instanceof Error ? error.message : String(error))) callbacks.current.onUnauthorized?.(); return message(error);};
  const close = () => {
    active.current = false; generation.current++;
    kinds.forEach(kind => {clearTimeout(draftTimers.current[kind]); revoke(ownedUrls.current[kind]); ownedUrls.current[kind] = null; revoke(ownedDrafts.current[kind]?.url);});
    ownedDrafts.current = {}; setUrls({avatar: null, cover: null}); setDrafts({});
    callbacks.current.onClose();
  };
  function clearDraft(kind: ImageKind) {
    clearTimeout(draftTimers.current[kind]); delete draftTimers.current[kind];
    selections.current[kind]++;
    revoke(ownedDrafts.current[kind]?.url); delete ownedDrafts.current[kind];
    setDrafts({...ownedDrafts.current});
  }
  async function loadProfile(token = generation.current) {
    setProfileLoading(true); setProfileError('');
    try {const next = await service.getProfile(); if (!valid(token)) return; setProfile(next); setName(next.name); setNeedsRefresh(false); kinds.forEach(clearDraft); callbacks.current.onProfileLoaded?.(next);}
    catch (error) {if (valid(token)) setProfileError(fail(error));}
    finally {if (valid(token)) setProfileLoading(false);}
  }
  async function loadRatings(nextCursor: RatingsCursor | null = null, token = generation.current) {
    setRatingsLoading(true); setRatingsError('');
    try {const next = await service.listRatings(nextCursor); if (!valid(token)) return; setRatings(previous => nextCursor ? [...previous, ...next.items.filter(item => !previous.some(old => old.id === item.id))] : next.items); setCursor(next.nextCursor);}
    catch (error) {if (valid(token)) setRatingsError(fail(error));}
    finally {if (valid(token)) setRatingsLoading(false);}
  }
  useEffect(() => {
    active.current = true; const token = ++generation.current;
    locked.current = false; setBusy(false); setProfile(null); setName(''); setRatings([]); setCursor(null); setStatus(''); setNeedsRefresh(false);
    kinds.forEach(kind => {revoke(ownedUrls.current[kind]); ownedUrls.current[kind] = null; clearDraft(kind);}); setUrls({avatar: null, cover: null});
    void loadProfile(token); void loadRatings(null, token);
    return () => {active.current = false; generation.current++; kinds.forEach(kind => {clearTimeout(draftTimers.current[kind]); revoke(ownedUrls.current[kind]); ownedUrls.current[kind] = null; revoke(ownedDrafts.current[kind]?.url);}); ownedDrafts.current = {};};
    // Each service instance belongs to one account; every response checks that identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, email]);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLButtonElement>('[aria-label="Đóng tài khoản"]')?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {event.preventDefault(); close();}
      if (event.key === 'Tab') {
        const controls = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]') || [])].filter(element => element.offsetParent !== null);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last?.focus();}
        else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first?.focus();}
      }
    };
    document.addEventListener('keydown', handle);
    return () => {document.body.style.overflow = overflow; document.removeEventListener('keydown', handle); before?.focus();};
  }, []);
  useEffect(() => {
    if (!profile) return;
    const token = generation.current; let cancelled = false; let round = 0;
    async function refresh() {
      const currentRound = ++round;
      await Promise.all(kinds.map(async kind => {
        const path = kind === 'avatar' ? profile!.avatarPath : profile!.coverPath;
        let url: string | null = null;
        try {if (path) url = await service.resolveImage(kind, path);} catch { /* A missing private image uses a local fallback. */ }
        if (cancelled || currentRound !== round || !valid(token)) {revoke(url); return;}
        if (ownedUrls.current[kind] !== url) revoke(ownedUrls.current[kind]);
        ownedUrls.current[kind] = url; setUrls(previous => ({...previous, [kind]: url}));
        // Only an owner-selected transition for this exact committed path is
        // released here. A newer selection must survive a late image response.
        if (path && ownedDrafts.current[kind]?.committedPath === path) clearDraft(kind);
      }));
    }
    void refresh(); const timer = setInterval(() => void refresh(), 45_000);
    return () => {cancelled = true; clearInterval(timer);};
  }, [profile, service, email]);
  async function save(update: Omit<AccountUpdate, 'expectedRevision'>, label: string, imageKind?: ImageKind) {
    if (!profile || locked.current || needsRefresh || profileLoading) return;
    const token = generation.current; const revision = profile.revision;
    kinds.forEach(kind => {selections.current[kind]++;});
    locked.current = true; setBusy(true); setStatus(''); setProfileError('');
    let commitStarted = false;
    try {
      if (imageKind && ownedDrafts.current[imageKind] && !Object.hasOwn(update, imageKind === 'avatar' ? 'avatarAssetId' : 'coverAssetId')) {
        const uploaded = await service.uploadImage(imageKind, ownedDrafts.current[imageKind]!.file);
        if (!valid(token)) return;
        update = {...update, [imageKind === 'avatar' ? 'avatarAssetId' : 'coverAssetId']: uploaded.assetId};
      }
      commitStarted = true;
      const next = await service.updateProfile({...update, expectedRevision: revision});
      if (!valid(token)) return;
      if (imageKind) {
        revoke(ownedUrls.current[imageKind]); ownedUrls.current[imageKind] = null;
        setUrls(previous => ({...previous, [imageKind]: null}));
        const path = imageKind === 'avatar' ? next.avatarPath : next.coverPath;
        const draft = ownedDrafts.current[imageKind];
        if (path && draft) {
          ownedDrafts.current[imageKind] = {...draft, committedPath: path};
          setDrafts({...ownedDrafts.current});
          clearTimeout(draftTimers.current[imageKind]);
          // Local owner preview is transitional, never a cached read grant.
          // Drop it on canonical denial/error, actor change or this deadline.
          draftTimers.current[imageKind] = setTimeout(() => {
            if (valid(token) && ownedDrafts.current[imageKind]?.committedPath === path) {
              clearDraft(imageKind);
              setProfileError('Ảnh đã lưu nhưng tải hiển thị chậm. Đóng và mở lại tài khoản để thử tải ảnh.');
            }
          }, 15_000);
        } else clearDraft(imageKind);
      }
      setProfile(next); setName(next.name);
      callbacks.current.onProfileSaved(next); setStatus(label);
    } catch (error) {if (valid(token)) {setProfileError(fail(error)); if (commitStarted) setNeedsRefresh(true);}}
    finally {if (valid(token)) {locked.current = false; setBusy(false);}}
  }
  async function choose(kind: ImageKind, file: File | undefined) {
    if (!file || busy || needsRefresh) return;
    const token = generation.current, selection = ++selections.current[kind];
    let url: string | null = null;
    try {
      validateImageInput(file);
      url = URL.createObjectURL(file);
      const preview = new Image(); preview.src = url;
      try {await preview.decode();} catch {throw new Error('image_decode');}
      if (!valid(token) || selections.current[kind] !== selection) return;
      if (!preview.naturalWidth || !preview.naturalHeight || preview.naturalWidth * preview.naturalHeight > ACCOUNT_IMAGE_PIXEL_LIMIT) throw new Error('Ảnh cần tối đa 24 triệu điểm ảnh.');
      clearDraft(kind); ownedDrafts.current[kind] = {file, url}; url = null;
      setDrafts({...ownedDrafts.current}); setProfileError(''); setStatus('');
    } catch (error) {if (valid(token) && selections.current[kind] === selection) setProfileError(message(error));}
    finally {revoke(url);}
  }
  const disabled = busy || profileLoading || !profile || needsRefresh;
  const initials = (profile?.name || '?').trim().split(/\s+/).map(part => [...part][0]).slice(0, 2).join('').toUpperCase();
  function imageEditor(kind: ImageKind) {
    const avatar = kind === 'avatar'; const label = avatar ? 'ảnh đại diện' : 'ảnh bìa';
    const url = drafts[kind]?.url || urls[kind]; const path = avatar ? profile?.avatarPath : profile?.coverPath;
    return <section className="account-image-editor" aria-label={avatar ? 'Ảnh đại diện' : 'Ảnh bìa'}>
      <h3>{avatar ? 'Ảnh đại diện' : 'Ảnh bìa'}</h3>
      <div className={`account-image account-image-${kind}`}>
        {url ? <img src={url} alt={`${drafts[kind]?.committedPath ? 'Đang tải ảnh đã lưu:' : drafts[kind] ? 'Xem trước' : 'Đã lưu'} ${label}`} referrerPolicy="no-referrer" onError={() => {if (ownedDrafts.current[kind]?.url === url) {clearDraft(kind); setProfileError('Không thể mở ảnh đã chọn. Hãy chọn ảnh khác.');} else if (ownedUrls.current[kind] === url) {revoke(url); ownedUrls.current[kind] = null; setUrls(previous => ({...previous, [kind]: null}));}}}/> : <span>{avatar ? initials : 'Chưa có ảnh bìa'}</span>}
      </div>
      <label className="account-file-label"><ImagePlus size={16} aria-hidden="true"/> Chọn {label}<input type="file" accept="image/jpeg,image/png,image/webp" aria-label={`Chọn ${label}`} disabled={disabled} onChange={event => {void choose(kind, event.target.files?.[0]); event.target.value = '';}}/></label>
      <div className="account-actions">
        {drafts[kind] && !drafts[kind]?.committedPath && <><button disabled={disabled} onClick={() => void save({}, `Đã lưu ${label}.`, kind)}>Lưu {label}</button><button disabled={busy} onClick={() => clearDraft(kind)}>Hủy ảnh đã chọn</button></>}
        {path && <button disabled={disabled} onClick={() => void save({[avatar ? 'avatarAssetId' : 'coverAssetId']: null}, `Đã bỏ ${label}.`, kind)}>Bỏ {label}</button>}
      </div>
      {drafts[kind] && <p className="account-help">{drafts[kind]?.committedPath ? 'Đã lưu. Đang tải ảnh đã lưu…' : 'Xem trước phần ảnh cắt giữa. Ảnh chưa được lưu.'}</p>}
    </section>;
  }
  return <div className="account-overlay" onMouseDown={event => {if (event.target === event.currentTarget) close();}}>
    <div className="account-panel" ref={ref} role="dialog" aria-modal="true" aria-labelledby={headingId}>
      <header className="account-heading"><div><p className="account-eyebrow">Góc cá nhân</p><h2 id={headingId}>Tài khoản của bạn</h2></div><button className="account-close" aria-label="Đóng tài khoản" onClick={close}><X size={22}/></button></header>
      <p className="account-status" role="status" aria-live="polite">{busy ? 'Đang lưu…' : status}</p>
      <section className="account-info" aria-label="Thông tin tài khoản">
        <h3>Thông tin tài khoản</h3>
        {profileLoading && <p>Đang tải hồ sơ…</p>}
        {profileError && <p className="account-error" role="alert">{profileError}</p>}
        {(!profile || needsRefresh) && !profileLoading && <button disabled={busy} onClick={() => void loadProfile()}>Tải lại hồ sơ</button>}
        <form onSubmit={event => {event.preventDefault(); try {void save({name: normalizeAccountName(name)}, 'Đã lưu tên.');} catch (error) {setProfileError(message(error));}}}>
          <label>Tên hiển thị<input value={name} onChange={event => setName(event.target.value)} disabled={disabled} maxLength={160} autoComplete="nickname"/></label>
          <button disabled={disabled || name.trim() === profile?.name}>Lưu tên</button>
        </form>
        <label>Email<input value={email || 'Bản dùng thử — không có email'} readOnly autoComplete="email"/></label>
        <p className="account-help">Email và mật khẩu được quản lý qua đăng nhập.</p>
      </section>
      <div className="account-images">{imageEditor('avatar')}{imageEditor('cover')}</div>
      <p className="account-help">JPEG, PNG hoặc WebP tĩnh · Tối đa 3 MiB, 24 triệu điểm ảnh. Ảnh bìa chỉ dành cho bạn.</p>
      <section className="account-ratings" aria-label="Điểm của tôi">
        <h3>Điểm của tôi</h3><p className="account-help">Điểm hiện tại của bạn trên từng mục phim. Sửa hoặc xóa điểm trong nhóm đang tham gia.</p>
        {ratingsLoading && <p>Đang tải điểm…</p>}
        {ratingsError && <><p role="alert" className="account-error">{ratingsError}</p><button disabled={ratingsLoading} onClick={() => void loadRatings(ratings.length ? cursor : null)}>Thử tải điểm lại</button></>}
        {!ratingsLoading && !ratingsError && !ratings.length && <p className="account-empty">Bạn chưa chấm điểm phim nào.</p>}
        <ul className="account-rating-list">{ratings.map(item => <li key={item.id} data-rating-id={item.id}>
          <img src={imageUrl(item.poster)} alt="" width={48} height={72} loading="lazy" onError={event => {if (!event.currentTarget.src.endsWith('/poster-placeholder.svg')) event.currentTarget.src = '/poster-placeholder.svg';}}/>
          <div><h4>{item.title}</h4>{item.year && <p>{item.year}</p>}<span className="account-group-label">{item.isCurrentMember ? 'Nhóm đang tham gia' : 'Nhóm đã rời'}</span></div>
          <span className="account-score"><Star size={15} aria-hidden="true"/><span aria-label={`Điểm ${item.score.toFixed(1)} trên 10`}>{item.score.toFixed(1)}<small>/10</small></span></span>
        </li>)}</ul>
        {cursor && !ratingsError && <button disabled={ratingsLoading} onClick={() => void loadRatings(cursor)}>Tải thêm điểm</button>}
      </section>
    </div>
  </div>;
}

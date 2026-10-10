'use client';

import { useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react';
import { Clapperboard, Shuffle, Users, Plus, ArrowRight, ArrowLeft, Check, CheckCheck, Search, X, Copy, LogOut, Film, Star, Clock, Ticket, Play, ChevronRight, LoaderCircle, MessageCircle, ExternalLink } from 'lucide-react';
import { averageRating, drawMovie, inviteCode, validScore, type Entry, type Group, type Movie, type Person, type Store } from '@/lib/domain';
import { catalog, demoUser, initialStore, STORAGE_KEY, withDemoGenres } from '@/lib/demo';
import { liveMode, supabase } from '@/lib/supabase';
import { loadGroups, movieRequest, readableError, rpc, ServiceError } from '@/lib/repository';
import MovieWheel from '@/components/movie-wheel';
import { imageUrl } from '@/lib/posters';
import type { WheelRun } from '@/lib/movie-wheel';
import { filterMovies, type DurationFilter } from '@/lib/movie-filters';
import AuthPanel from '@/components/auth-panel';
import { createAuthService } from '@/lib/auth-service';
import { useAuth } from '@/lib/use-auth';
import { consumeInvite } from '@/lib/auth-redirect';
import ResetPasswordPanel from '@/components/reset-password-panel';
import {canDeleteMovie, canEditOwn, canLeaveGroup, isGroupOwner} from '@/lib/group-permissions';

type Tab = 'draw' | 'list' | 'watched';
type Modal = 'create' | 'join' | 'members' | 'detail' | 'settings' | 'confirm' | null;
type Removal = {kind: 'movie' | 'rating' | 'comment' | 'leave'; id: string; gid: string; label: string};
const fold = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
function Poster({movie, className = ''}: {movie: Movie; className?: string}) {
  return <img className={`poster ${className}`} src={imageUrl(movie.poster)} alt={`Poster ${movie.title}`} loading="lazy" onError={e => { if (!e.currentTarget.src.endsWith('/poster-placeholder.svg')) e.currentTarget.src = '/poster-placeholder.svg'; }} />;
}
function Avatar({name, index = 0}: {name: string; index?: number}) {return <span className={`avatar avatar-${index % 3}`} aria-label={name}>{name.slice(0, 1).toUpperCase()}</span>;}
function Dialog({title, children, onClose, wide = false}: {title: string; children: ReactNode; onClose: () => void; wide?: boolean}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const old = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const selectors = 'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]';
    ref.current?.querySelector<HTMLElement>(selectors)?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
      if (event.key === 'Tab') {
        const items = [...(ref.current?.querySelectorAll<HTMLElement>(selectors) || [])].filter(el => el.offsetParent !== null);
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => {document.body.style.overflow = old; document.removeEventListener('keydown', handler); before?.focus();};
  }, []);
  return <div className="overlay" onMouseDown={e => {if (e.target === e.currentTarget) onClose();}}><div ref={ref} className={`dialog ${wide ? 'dialog-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="dialog-heading"><h2 id="dialog-title">{title}</h2><button className="icon-button" aria-label="Đóng cửa sổ" onClick={onClose}><X size={20}/></button></div>{children}</div></div>;
}

export default function CinemaApp() {
  const auth = useAuth();
  if (!liveMode) return <CinemaWorkspace/>;
  if (auth.status === 'initializing') return <div className="loading-screen"><Clapperboard size={36}/><p>Đang kiểm tra phiên đăng nhập…</p></div>;
  if (auth.status === 'recovering') return <ResetPasswordPanel/>;
  if (auth.status === 'error') return <main className="auth-link-page"><section className="auth-card"><h1>Chưa thể mở tài khoản</h1><p role="alert" className="error">{auth.error}</p><button className="button primary full" onClick={() => void auth.retry()}>Thử lại</button><a className="button secondary full" href="/">Về đăng nhập</a></section></main>;
  const person = auth.session ? {id: auth.session.user.id, name: String(auth.session.user.user_metadata.name || auth.session.user.user_metadata.full_name || auth.session.user.email?.split('@')[0] || 'Bạn')} : null;
  return <CinemaWorkspace key={person?.id || 'signed-out'} liveUser={person} authError={auth.error} onAuthFailure={() => void auth.retry()}/>;
}

function CinemaWorkspace({liveUser = null, authError = '', onAuthFailure}: {liveUser?: Person | null; authError?: string; onAuthFailure?: () => void}) {
  const [ready, setReady] = useState(liveMode);
  const [user, setUser] = useState<Person | null>(liveUser);
  const [store, setStore] = useState<Store>({groups: []});
  const [groupId, setGroupId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('draw');
  const [modal, setModal] = useState<Modal>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [wheelRun, setWheelRun] = useState<WheelRun | null>(null);
  const [genre, setGenre] = useState('');
  const [duration, setDuration] = useState<DurationFilter>('all');
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Movie[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [groupName, setGroupName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [score, setScore] = useState('8');
  const [comment, setComment] = useState('');
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const readSequence = useRef(0);
  const mounted = useRef(true);
  const currentGroup = useRef(groupId); currentGroup.current = groupId;
  useEffect(() => {mounted.current = true; return () => {mounted.current = false; readSequence.current++;};}, []);
  const drawSequence = useRef(0);
  const activeDraw = useRef<WheelRun | null>(null);
  const lock = useRef(false);
  const visibleGroups = store.groups.filter(g => !user || g.members.some(m => m.id === user.id));
  const group = visibleGroups.find(g => g.id === groupId);
  const pending = group?.movies.filter(m => !m.watchedAt) || [];
  const candidates = filterMovies(pending, genre, duration);
  const genres = [...new Set(pending.flatMap(movie => movie.genres || []))].sort((a,b) => a.localeCompare(b, 'vi'));
  const filtered = !!genre || duration !== 'all';
  const canReroll = candidates.some(movie => movie.entryId !== resultId);
  const watched = group?.movies.filter(m => m.watchedAt) || [];
  const result = candidates.find(m => m.entryId === resultId);
  const tonight = pending.find(m => m.entryId === group?.tonightId);
  const detail = group?.movies.find(m => m.entryId === detailId);

  useEffect(() => {
    if (!liveMode) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {const parsed = JSON.parse(raw); if (!Array.isArray(parsed.groups) || !parsed.groups.every((g: Group) => Array.isArray(g.movies) && Array.isArray(g.members) && Array.isArray(g.ratings) && Array.isArray(g.comments))) throw new Error('invalid'); setStore(withDemoGenres(parsed));}
        else setStore(initialStore());
        if (localStorage.getItem('cinema-demo-session')) setUser(demoUser);
      } catch {setStore(initialStore()); setToast('Dữ liệu dùng thử cũ không đọc được. Đã mở lại danh sách mẫu.');}
      setReady(true);
      const sync = (e: StorageEvent) => {if (e.key === STORAGE_KEY && e.newValue) {try {setStore(withDemoGenres(JSON.parse(e.newValue)));} catch { /* preserve current data */ }}};
      window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync);
    }

  }, []);
  useEffect(() => {
    if (!liveMode || !user) return;
    let active = true;
    const load = async () => {try {await refresh(); if (active) setLoadError('');} catch (error) {if (active) {setLoadError(readableError(error)); if (error instanceof ServiceError && error.status === 401) onAuthFailure?.();}}};
    void load();
    const interval = setInterval(load, 15000);
    const focus = () => void load(); window.addEventListener('focus', focus);
    return () => {active = false; clearInterval(interval); window.removeEventListener('focus', focus);};
  }, [user?.id]);
  useEffect(() => {
    if (!ready || !user) return;
    const code = consumeInvite();
    if (code) {setJoinCode(code); setModal('join'); window.history.replaceState({}, '', '/');}
  }, [ready, user]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 5500); return () => clearTimeout(t); }, [toast]);
  useEffect(() => {
    if (activeDraw.current && (!group || !user || tab !== 'draw')) {
      activeDraw.current = null; setWheelRun(null); setBusy(''); lock.current = false;
    }
  }, [group?.id, user?.id, tab]);
  useEffect(() => {
    if (wheelRun && !candidates.some(movie => movie.entryId === wheelRun.winner.entryId && movie.poster === wheelRun.winner.poster)) {
      if (activeDraw.current?.id === wheelRun.id) {activeDraw.current = null; setBusy(''); lock.current = false;}
      setWheelRun(null); setResultId(null);
      setToast('Danh sách phim đã thay đổi. Bốc lại để chọn phim phù hợp với bộ lọc nhé.');
    }
  }, [wheelRun, group?.movies, genre, duration]);
  useEffect(() => {
    let active = true;
    if (query.trim().length < 2) {setResults([]); setSearching(false); setSearchError(''); return;}
    setSearching(true); setSearchError(''); setResults([]);
    const t = setTimeout(async () => {
      try {
        const matches = liveMode ? await movieRequest(query.trim()) : catalog.filter(m => fold(`${m.title} ${m.originalTitle || ''}`).includes(fold(query.trim())));
        if (active) setResults(matches);
      } catch(error) {if (active) {setSearchError(readableError(error)); if (error instanceof ServiceError && error.status === 401) onAuthFailure?.();}}
      finally {if (active) setSearching(false);}
    }, 350);
    return () => {active = false; clearTimeout(t);};
  }, [query, user?.id]);
  useEffect(() => { if (modal === 'detail' && detail && user) {setScore(String(group?.ratings.find(r => r.entryId === detail.entryId && r.userId === user.id)?.score || 8)); setComment('');}}, [detailId, modal]);

  async function action(key: string, task: () => Promise<void> | void) {
    if (lock.current) return;
    lock.current = true; setBusy(key);
    try {await task();} catch(error) {if (error instanceof ServiceError && error.status === 401) onAuthFailure?.(); setToast(readableError(error)); if (liveMode && user) {try {await refresh();} catch { /* keep original error */ }}}
    finally {lock.current = false; setBusy('');}
  }
  function persist(next: Store) {
    try {localStorage.setItem(STORAGE_KEY, JSON.stringify(next));} catch {throw new Error('Trình duyệt không cho lưu dữ liệu. Hãy cho phép lưu trữ rồi thử lại.');}
    setStore(next);
  }
  function demoUpdate(fn: (g: Group) => void) {const next = structuredClone(store); const g = next.groups.find(g => g.id === groupId); if (!g) throw new Error('Không tìm thấy nhóm.'); fn(g); persist(next);}
  async function refresh() {
    if (!liveMode) return;
    const sequence = ++readSequence.current;
    const groups = await loadGroups();
    if (mounted.current && sequence === readSequence.current) setStore({groups});
  }
  function clearGroupView() {
    setGroupId(null); setDetailId(null); setResultId(null); setWheelRun(null);
    activeDraw.current = null; setQuery(''); setResults([]); setModal(null);
    setRemoval(null); setEditingComment(null); setEditBody(''); setComment('');
  }
  useEffect(() => {
    if (ready && groupId && !group) clearGroupView();
    else if (detailId && group && !detail) {setDetailId(null); setModal(null); setRemoval(null);}
    if (editingComment && group && !group.comments.some(c => c.id === editingComment)) {
      setEditingComment(null); setEditBody('');
    }
  }, [ready, groupId, group, detailId, detail, editingComment]);
  function requestRemoval(kind: Removal['kind'], id: string, label: string) {
    if (!group) return;
    setRemoval({kind,id,gid:group.id,label}); setModal('confirm');
  }
  async function confirmRemoval() {
    if (!group || !user || !removal || removal.gid !== group.id) return;
    const target = removal, gid = group.id;
    await action('remove', async () => {
      if (liveMode) {
        const name = {movie:'delete_movie',rating:'delete_rating',comment:'delete_comment',leave:'leave_group'}[target.kind];
        await rpc(name, {gid, ...(target.kind === 'leave' ? {} : target.kind === 'comment' ? {cid:target.id} : {mid:target.id})});
      } else {
        if (target.kind === 'leave') {
          if (!canLeaveGroup(group,user.id)) throw new Error('owner_cannot_leave');
          const next=structuredClone(store); const g=next.groups.find(g=>g.id===gid)!;
          g.members=g.members.filter(p=>p.id!==user.id); persist(next);
        } else demoUpdate(g => {
          if (target.kind==='movie') {
            const m=g.movies.find(m=>m.entryId===target.id);
            if (!m || !canDeleteMovie(g,m,user.id)) throw new Error('forbidden');
            g.movies=g.movies.filter(m=>m.entryId!==target.id); if(g.tonightId===target.id)g.tonightId=null;
          } else if(target.kind==='rating') g.ratings=g.ratings.filter(r=>r.entryId!==target.id||r.userId!==user.id);
          else {
            const c=g.comments.find(c=>c.id===target.id);
            if(!c || !canEditOwn(g,c.userId,user.id))throw new Error('forbidden');
            g.comments=g.comments.filter(c=>c.id!==target.id);
          }
        });
      }
      if (target.kind==='leave' && currentGroup.current===gid) clearGroupView();
      await refresh();
      if (currentGroup.current===gid) {
        setRemoval(null); setModal(target.kind==='movie'?null:'detail');
        if(target.kind==='movie') {setDetailId(null); setResultId(null); setWheelRun(null);activeDraw.current=null;}
      }
      setToast(target.kind==='leave'?'Bạn đã rời nhóm.':'Đã xóa.');
    });
  }
  async function renameGroup(e: FormEvent) {
    e.preventDefault(); if(!group || !user || !isGroupOwner(group,user.id) || !groupName.trim())return;
    const gid=group.id;
    await action('rename',async()=>{
      if(liveMode) await rpc('rename_group',{gid,group_name:groupName.trim()});
      else demoUpdate(g=>{g.name=groupName.trim();});
      await refresh(); if(currentGroup.current===gid)setModal(null); setToast('Đã đổi tên nhóm.');
    });
  }
  async function editComment(e: FormEvent) {
    e.preventDefault(); if(!group || !editingComment || !editBody.trim())return;
    const gid=group.id, cid=editingComment;
    await action('edit-comment',async()=>{
      if(liveMode)await rpc('edit_comment',{gid,cid,comment_body:editBody.trim()});
      else demoUpdate(g=>{const c=g.comments.find(c=>c.id===cid);if(!c||!user||!canEditOwn(g,c.userId,user.id))throw new Error('forbidden');c.body=editBody.trim();});
      await refresh(); if(currentGroup.current===gid){setEditingComment(null);setEditBody('');} setToast('Đã sửa bình luận.');
    });
  }
  function resetFilters(nextGenre = '', nextDuration: DurationFilter = 'all') {setGenre(nextGenre); setDuration(nextDuration); setResultId(null); setWheelRun(null);}
  function openGroup(id: string) {resetFilters(); setGroupId(id); setTab('draw'); setResultId(null); setWheelRun(null); setQuery('');}
  function openDetail(entry: Entry) {setDetailId(entry.entryId); setModal('detail');}
  function enterDemo() {void action('demo', () => {localStorage.setItem('cinema-demo-session', 'yes'); persist(store); setUser(demoUser);});}
  function draw() {
    if (busy || lock.current || !group) return;
    const next = drawMovie(candidates, resultId);
    if (!next) {setToast(pending.length ? 'Chỉ còn phim vừa bốc. Thêm phim khác hoặc chốt phim này nhé.' : 'Danh sách đang trống. Thêm vài bộ phim trước nhé!'); return;}
    lock.current = true; setBusy('draw');
    const run: WheelRun = {id: ++drawSequence.current, groupId: group.id, winner: next, pool: candidates.filter(movie => movie.entryId !== resultId)};
    activeDraw.current = run; setWheelRun(run); setResultId(null);
  }
  function finishDraw(run: WheelRun) {
    if (activeDraw.current?.id !== run.id) return;
    activeDraw.current = null; setBusy(''); lock.current = false;
    if (group?.id !== run.groupId || !candidates.some(movie => movie.entryId === run.winner.entryId && movie.poster === run.winner.poster)) {
      setWheelRun(null); setResultId(null); setToast('Danh sách phim đã thay đổi. Bốc lại để chọn phim đang chờ xem nhé.'); return;
    }
    setResultId(run.winner.entryId);
  }
  async function addMovie(movie: Movie) {
    if (!group || !user) return;
    await action(`add-${movie.id}`, async () => {
      if (group.movies.some(m => m.id === movie.id)) throw new Error('Phim này đã có trong danh sách.');
      if (liveMode) {const [full] = await movieRequest(movie.id); await rpc('add_movie', {gid: group.id, movie: full}); await refresh();}
      else demoUpdate(g => g.movies.push({...movie, entryId: crypto.randomUUID(), addedBy: user.id, addedName: user.name, watchedAt: null}));
      setToast(`Đã thêm “${movie.title}” vào danh sách.`);
    });
  }
  async function pin(entry: Entry) {
    if (!group) return;
    await action('pin', async () => {if (liveMode) {await rpc('select_movie', {gid: group.id, mid: entry.entryId}); await refresh();} else demoUpdate(g => {g.tonightId = entry.entryId;}); setResultId(null); setWheelRun(null); setToast('Đã chốt phim cho tối nay. Chúc cả nhóm xem vui!');});
  }
  async function markWatched() {
    if (!group || !tonight) return;
    const entry = tonight;
    await action('watched', async () => {
      if (liveMode) {await rpc('mark_watched', {gid: group.id, mid: entry.entryId}); await refresh();}
      else demoUpdate(g => {g.movies.find(m => m.entryId === entry.entryId)!.watchedAt = new Date().toISOString(); g.tonightId = null;});
      setResultId(null); setWheelRun(null); setTab('watched'); openDetail(entry); setToast('Đã chuyển phim sang Đã xem. Chấm điểm cùng cả nhóm nhé!');
    });
  }
  function submitGroup(e: FormEvent) {
    e.preventDefault(); if (!user) return;
    void action('group', async () => {
      let id: string;
      if (modal === 'create') {
        if (!groupName.trim()) return;
        if (liveMode) {id = await rpc('create_group', {group_name: groupName.trim()}); await refresh();}
        else {id = crypto.randomUUID(); persist({groups: [...store.groups, {id, ownerId: user.id, name: groupName.trim(), code: inviteCode(), members: [user], movies: [], ratings: [], comments: [], tonightId: null}]});}
        setGroupName(''); setToast('Nhóm mới đã sẵn sàng. Thêm bộ phim đầu tiên nhé!');
      } else {
        if (liveMode) {id = await rpc('join_group', {code: joinCode.trim()}); await refresh();}
        else {const match = store.groups.find(g => g.code === joinCode.trim().toUpperCase()); if (!match) throw new Error('Mã mời không đúng. Trong bản dùng thử chỉ có thể vào nhóm lưu trên trình duyệt này.'); id = match.id;}
        setJoinCode(''); setToast('Bạn đã vào nhóm.');
      }
      setModal(null); openGroup(id);
    });
  }
  async function saveRating(e: FormEvent) {
    e.preventDefault(); if (!group || !detail || !user) return;
    await action('rating', async () => {
      const value = Number(score); if (!validScore(value)) throw new Error('Điểm từ 1 đến 10, mỗi bước 0.5.');
      if (liveMode) {await rpc('save_rating', {gid: group.id, mid: detail.entryId, new_score: value}); await refresh();}
      else demoUpdate(g => {g.ratings = g.ratings.filter(r => !(r.entryId === detail.entryId && r.userId === user.id)); g.ratings.push({entryId: detail.entryId, userId: user.id, name: user.name, score: value});});
      setToast('Đã lưu điểm của bạn.');
    });
  }
  async function sendComment(e: FormEvent) {
    e.preventDefault(); if (!group || !detail || !user || !comment.trim()) return;
    await action('comment', async () => {
      if (liveMode) {await rpc('add_comment', {gid: group.id, mid: detail.entryId, comment_body: comment.trim()}); await refresh();}
      else demoUpdate(g => {g.comments.push({id: crypto.randomUUID(), entryId: detail.entryId, userId: user.id, name: user.name, body: comment.trim(), createdAt: new Date().toISOString()});});
      setComment(''); setToast('Đã gửi bình luận.');
    });
  }
  const brand = <span className="brand"><span className="brand-icon"><Clapperboard size={22}/></span><span>Tối nay xem gì<span className="accent">?</span></span></span>;

  if (!ready) return <div className="loading-screen"><Clapperboard size={36}/><p>Chuẩn bị buổi xem phim…</p></div>;
  return <>
    <header className="topbar"><button className="brand-button" onClick={() => {setGroupId(null); setResultId(null);}} disabled={!!busy}>{brand}</button><div className="header-right">{!liveMode && <span className="demo-pill"><span/>Bản dùng thử</span>}{user && <><span className="user-name">{user.name}</span><Avatar name={user.name}/><button className="icon-button" aria-label="Đăng xuất" disabled={!!busy} onClick={() => void action('logout', async () => {if (supabase) {await createAuthService(supabase).logout();} else localStorage.removeItem('cinema-demo-session'); setUser(null); setGroupId(null); setModal(null); setResultId(null); if (liveMode) setStore({groups: []});})}><LogOut size={18}/></button></>}</div></header>
    {toast && <div className="toast" role="status"><span>{toast}</span><button className="icon-button" aria-label="Đóng thông báo" onClick={() => setToast('')}><X size={16}/></button></div>}
    {!user ? <main className="auth-page"><div className="auth-copy"><div className="eyebrow"><span/> CHO NHỮNG TỐI KHÔNG BIẾT XEM GÌ</div><h1>Ít tranh luận.<br/>Nhiều <span className="accent">phim hay.</span></h1><p>Gom những bộ phim cả nhóm muốn xem.<br/>Để một cú bốc quyết định tối nay.</p><div className="auth-posters">{catalog.slice(0, 3).map(m => <Poster key={m.id} movie={m}/>)}</div><span className="small-note">Một danh sách chung. Những buổi tối đáng nhớ.</span><Credits/></div><section className="auth-card"><span className="section-kicker">HẸN NHAU Ở RẠP NHÀ</span>{liveMode ? <AuthPanel/> : <><h2>Thử một buổi tối điện ảnh</h2><p className="muted">Khám phá đầy đủ luồng chọn phim với một nhóm mẫu.</p><div className="demo-description"><Film size={22}/><div><strong>Hội mê điện ảnh đang chờ bạn</strong><p>6 phim đang chờ xem · thử bốc, chốt và chấm điểm</p></div></div><button className="button primary full" disabled={!!busy} onClick={enterDemo}>Khám phá bản dùng thử<ArrowRight size={18}/></button><p className="demo-disclaimer">Dữ liệu mẫu lưu trên trình duyệt này. Đăng nhập và chia sẻ nhóm thật sẽ hoạt động sau khi kết nối Supabase.</p></>}{(loadError || authError) && <p role="alert" className="error">{loadError || authError}</p>}</section></main> : <div className="app-shell">
      <aside className="sidebar"><div className="sidebar-label">KHÔNG GIAN CỦA BẠN</div><button className={`side-link ${!group ? 'selected' : ''}`} disabled={!!busy} onClick={() => {setGroupId(null); setResultId(null);}}><Users size={18}/>Nhóm của tôi<ChevronRight size={15}/></button><div className="sidebar-label groups-label">NHÓM ĐANG THAM GIA <span>{visibleGroups.length}</span></div><div className="group-links">{visibleGroups.map((g, i) => <button className={`group-link ${g.id === groupId ? 'active' : ''}`} key={g.id} onClick={() => openGroup(g.id)} disabled={!!busy}><span className="group-initial">{g.name.slice(0,1)}</span><span>{g.name}<small>{g.members.length} thành viên</small></span>{g.id === groupId && <span className="active-dot"/>}</button>)}</div><button className="side-link muted" disabled={!!busy} onClick={() => {setGroupName(''); setModal('create');}}><Plus size={18}/>Tạo nhóm mới</button><div className="sidebar-bottom"><Ticket size={24}/><p>Phim hay hơn<br/>khi xem cùng nhau.</p><span>Mang bỏng ngô, tụi mình lo phim.</span></div></aside>
      <main className={`main-content ${group && tab === 'draw' ? 'draw-screen' : ''}`}>
        {(loadError || authError) && <div className="error-banner" role="alert">{loadError || authError}<button className="text-button" onClick={() => void action('reload', async () => {await refresh(); onAuthFailure?.(); setLoadError('');})} disabled={!!busy}>Thử lại</button></div>}
        {!group ? <><div className="home-heading"><div><div className="eyebrow">MỖI NHÓM, MỘT RẠP PHIM NHỎ</div><h1>Nhóm của tôi<span className="accent">.</span></h1><p className="muted">Chọn hội bạn, mở danh sách và tìm bộ phim cho tối nay.</p></div><div className="home-actions"><button className="button secondary" disabled={!!busy} onClick={() => {setJoinCode(''); setModal('join');}}><Users size={17}/>Vào nhóm bằng mã</button><button className="button primary" disabled={!!busy} onClick={() => {setGroupName(''); setModal('create');}}><Plus size={18}/>Tạo nhóm</button></div></div><div className="group-grid">{visibleGroups.map(g => <button className="group-card" key={g.id} disabled={!!busy} onClick={() => openGroup(g.id)}><div className="group-card-top"><span className="group-symbol"><Clapperboard size={25}/></span><ArrowRight size={20}/></div><h2>{g.name}</h2><p>{g.movies.filter(m => !m.watchedAt).length} phim chờ xem · {g.members.length} thành viên</p><div className="group-card-bottom"><div className="avatar-stack">{g.members.slice(0,4).map((p,i) => <Avatar name={p.name} key={p.id} index={i}/>)}</div><span>Mở rạp của nhóm</span></div></button>)}<button className="group-card create-card" disabled={!!busy} onClick={() => {setGroupName(''); setModal('create');}}><Plus size={32}/><h2>Một hội bạn mới?</h2><p>Tạo một không gian phim cho riêng nhóm.</p></button></div>{!visibleGroups.length && <p className="muted">Bạn chưa tham gia nhóm nào. Tạo nhóm hoặc nhập mã mời để bắt đầu.</p>}</> : <>
          <div className="breadcrumb"><button className="text-button" disabled={!!busy} onClick={() => setGroupId(null)}>Nhóm của tôi</button><ChevronRight size={14}/><span>{group.name}</span></div>
          <div className="group-heading"><div><h1>{group.name}</h1><button className="text-button" disabled={!!busy} onClick={()=>{setGroupName(group.name);setModal('settings');}}>Cài đặt nhóm</button></div><button className="member-button" aria-label="Thành viên nhóm" onClick={() => setModal('members')} disabled={!!busy}><span className="avatar-stack">{group.members.slice(0,3).map((p,i) => <Avatar name={p.name} key={p.id} index={i}/>)}</span><span>{group.members.length} thành viên</span><Users size={17}/></button></div>
          <nav className="tabs" aria-label="Các mục trong nhóm">{([{id: 'draw', label: 'Bốc phim', icon: Shuffle, count: null}, {id: 'list', label: 'Danh sách', icon: Film, count: pending.length}, {id: 'watched', label: 'Đã xem', icon: CheckCheck, count: watched.length}] as const).map(t => <button key={t.id} className={tab === t.id ? 'tab active' : 'tab'} aria-current={tab === t.id ? 'page' : undefined} disabled={!!busy} onClick={() => setTab(t.id)}><t.icon size={18}/><span>{t.label}</span>{t.count !== null && <span className="tab-count">{t.count}</span>}</button>)}</nav>
          {tab === 'draw' && <>
            {tonight && <section className="tonight-banner"><div className="tonight-poster"><Poster movie={tonight}/></div><div className="tonight-copy"><span className="section-kicker"><span className="live-dot"/> ĐANG XEM TỐI NAY</span><button className="title-button" onClick={() => openDetail(tonight)}>{tonight.title}</button><p>{tonight.year} · {tonight.runtime ? `${tonight.runtime} phút` : 'Chưa có thời lượng'}</p></div><button className="button primary" disabled={!!busy} onClick={markWatched}><CheckCheck size={18}/>{busy === 'watched' ? 'Đang lưu…' : 'Đã xem'}</button></section>}
            <section className={`draw-hero wheel-panel ${result ? 'result-card' : ''}`} aria-busy={busy === 'draw'} aria-label="Vòng quay chọn phim">
              <div className="wheel-heading"><h2>Tối nay xem gì?</h2><p>Chọn gu của bạn, để vòng quay quyết định.</p></div>
              <div className="draw-filters">
                <label htmlFor="draw-genre">Thể loại<select id="draw-genre" aria-label="Thể loại" value={genre} disabled={!!busy || !genres.length} onChange={e => resetFilters(e.target.value, duration)}><option value="">{genres.length ? 'Tất cả' : 'Chưa có dữ liệu'}</option>{genres.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
                <label htmlFor="draw-duration">Thời lượng<select id="draw-duration" aria-label="Thời lượng" value={duration} disabled={!!busy} onChange={e => resetFilters(genre, e.target.value as DurationFilter)}><option value="all">Bất kỳ</option><option value="short">Đến 120 phút</option><option value="medium">121–150 phút</option><option value="long">Trên 150 phút</option></select></label>
                <div className="filter-summary"><span role="status" aria-live="polite">{candidates.length} / {pending.length} phim phù hợp</span>{filtered && <button className="text-button" disabled={!!busy} onClick={() => resetFilters()}>Xóa lọc<X size={14}/></button>}</div>
              </div>
              <div className="draw-hero-content">
                <MovieWheel key={group.id} movies={candidates} run={wheelRun} settled={!!result} onComplete={finishDraw}/>
                {result ? <div className="result-copy">
                  <h2>{result.title}</h2>
                  <div className="movie-meta"><span>{result.year || 'Chưa có năm'}</span><span><Clock size={16}/>{result.runtime ? `${result.runtime} phút` : 'Chưa có thời lượng'}</span></div>
                  <div className="result-actions">
                    <button className="button primary" disabled={!!busy} onClick={() => pin(result)}><Check size={19}/>Chốt phim này</button>
                    <button className="button secondary" disabled={!!busy || !canReroll} onClick={draw}><Shuffle size={18}/>Bốc lại</button>
                  </div>
                  {!canReroll && <p className="small-note">Không còn phim khác phù hợp để bốc lại.</p>}
                  <button className="text-button" disabled={!!busy} onClick={() => openDetail(result)}>Xem chi tiết phim<ArrowRight size={16}/></button>
                </div> : <div className="hero-copy">
                  {!candidates.length && <p className="draw-empty" role="status">{pending.length ? 'Không có phim phù hợp. Thử xóa hoặc đổi bộ lọc.' : 'Chưa có phim chờ xem. Mở danh sách để thêm phim.'}</p>}
                  <button className="button primary draw-button" disabled={!!busy || !candidates.length} onClick={draw}>
                    {busy === 'draw' ? <LoaderCircle className="spin" size={21}/> : <Shuffle size={21}/>}<span>{busy === 'draw' ? 'Đang quay phim…' : 'Bốc phim ngay'}</span>
                  </button>
                  <span className="hero-note">Chỉ bốc phim chưa xem · Bốc lại không lặp phim vừa chọn.</span>
                </div>}
              </div>
            </section>
            <div className="draw-list-link"><button className="text-button" disabled={!!busy} onClick={() => setTab('list')}><Film size={17}/>Xem danh sách<span className="count-inline">{pending.length}</span><ArrowRight size={17}/></button></div>
          </>}
          {tab === 'list' && <section className="list-section"><div className="section-heading"><div><h2>Danh sách chờ xem<span className="count-inline">{pending.length}</span></h2><p>Gu của mỗi người, niềm vui của cả nhóm.</p></div></div><div className="search-panel"><label htmlFor="movie-search">Thêm một bộ phim vào danh sách</label><div className="search-input"><Search size={20}/><input id="movie-search" placeholder="Tìm tên phim, ví dụ: Interstellar…" maxLength={100} value={query} onChange={e => setQuery(e.target.value)}/>{query && <button className="icon-button" aria-label="Xóa tìm kiếm" onClick={() => setQuery('')}><X size={18}/></button>}</div><p className="small-note">{liveMode ? 'Tìm từ TMDB · Xem poster và năm để chọn đúng phim.' : 'Bản dùng thử tìm trong 10 phim mẫu: Barbie, Amélie, Inception…'}</p>{searching && <p className="search-status" role="status"><LoaderCircle className="spin" size={17}/>Đang tìm phim…</p>}{searchError && <p className="error" role="alert">{searchError}</p>}{!searching && query.trim().length >= 2 && !results.length && !searchError && <p className="search-status">Không tìm thấy phim. Thử tên tiếng Anh hoặc tên khác nhé.</p>}{results.length > 0 && <ul className="search-results">{results.map(m => <li key={m.id}><Poster movie={m}/><div><strong>{m.title}</strong><span>{m.year || 'Chưa có năm'}{m.originalTitle && m.originalTitle !== m.title ? ` · ${m.originalTitle}` : ''}</span></div><button className="button secondary compact" disabled={!!busy} onClick={() => addMovie(m)}>{busy === `add-${m.id}` ? <LoaderCircle className="spin" size={16}/> : group.movies.some(e => e.id === m.id) ? <Check size={17}/> : <Plus size={17}/>}<span>{group.movies.some(e => e.id === m.id) ? 'Đã có' : 'Thêm'}</span></button></li>)}</ul>}</div>{pending.length ? <div className="movie-grid">{pending.map(m => <MovieCard key={m.entryId} movie={m} onClick={() => openDetail(m)}/>)}</div> : <Empty title="Chưa có phim chờ xem" description="Dùng ô tìm kiếm phía trên để thêm lựa chọn đầu tiên."/>}</section>}
          {tab === 'watched' && <section className="list-section"><div className="section-heading"><div><h2>Những phim đã cùng xem<span className="count-inline">{watched.length}</span></h2><p>Mỗi bộ phim, một kỷ niệm. Cả nhóm thấy phim thế nào?</p></div></div>{watched.length ? <div className="movie-grid">{watched.map(m => <MovieCard key={m.entryId} movie={m} average={averageRating(group.ratings.filter(r => r.entryId === m.entryId))} onClick={() => openDetail(m)}/>)}</div> : <Empty title="Buổi chiếu đầu tiên đang chờ" description="Bốc một phim, chốt cho tối nay rồi đánh dấu Đã xem khi xem xong." action={<button className="button primary" onClick={() => setTab('draw')}><Shuffle size={18}/>Bốc phim nào</button>}/>}</section>}
        </>}
        <Credits/>
      </main>
    </div>}
    {modal === 'settings' && group && user && <Dialog title="Cài đặt nhóm" onClose={()=>{if(!busy)setModal(null);}}><p className="muted">{group.name}</p>{isGroupOwner(group,user.id) ? <><form onSubmit={renameGroup}><label htmlFor="rename-group">Tên nhóm<input id="rename-group" value={groupName} onChange={e=>setGroupName(e.target.value)} maxLength={80} required/></label><button className="button primary full" disabled={!!busy||!groupName.trim()}>Lưu tên nhóm</button></form><p className="small-note">Bạn đang là chủ nhóm. Chưa thể rời nhóm trong phiên bản này.</p></> : <><p className="muted">Rời nhóm sẽ mất quyền truy cập. Phim, điểm và bình luận bạn đã đóng góp vẫn được giữ.</p><button className="button secondary full" disabled={!!busy||!canLeaveGroup(group,user.id)} onClick={()=>requestRemoval('leave',group.id,group.name)}>Rời nhóm</button></>}</Dialog>}
    {modal === 'confirm' && removal && group && removal.gid===group.id && <Dialog title={removal.kind==='leave'?'Rời nhóm?':'Xác nhận xóa'} onClose={()=>{if(!busy){setRemoval(null);setModal(removal.kind==='leave'?'settings':'detail');}}}><p className="management-target">{removal.label}</p><p className="muted">{removal.kind==='leave'?'Bạn sẽ mất quyền truy cập nhóm. Lịch sử đóng góp của bạn được giữ.':removal.kind==='movie'?'Phim sẽ bị xóa khỏi danh sách. Nếu đang chốt cho tối nay, lựa chọn đó cũng được bỏ.':'Nội dung của bạn sẽ bị xóa và không thể khôi phục.'}</p><div className="management-actions"><button className="button secondary" disabled={!!busy} onClick={()=>{setRemoval(null);setModal(removal.kind==='leave'?'settings':'detail');}}>Hủy</button><button className="button primary" disabled={!!busy} onClick={()=>void confirmRemoval()}>{busy==='remove'?'Đang xử lý…':removal.kind==='leave'?'Xác nhận rời nhóm':'Xác nhận xóa'}</button></div></Dialog>}
    {(modal === 'create' || modal === 'join') && <Dialog title={modal === 'create' ? 'Tạo rạp phim của nhóm' : 'Vào nhóm bằng mã mời'} onClose={() => {if (!busy) setModal(null);}}><p className="muted">{modal === 'create' ? 'Một cái tên thân thuộc cho hội bạn mê phim.' : 'Nhờ một người trong nhóm gửi mã mời cho bạn.'}</p><form onSubmit={submitGroup}><label>{modal === 'create' ? 'Tên nhóm' : 'Mã mời'}<input autoComplete="off" required maxLength={modal === 'create' ? 80 : 64} value={modal === 'create' ? groupName : joinCode} onChange={e => modal === 'create' ? setGroupName(e.target.value) : setJoinCode(e.target.value)} placeholder={modal === 'create' ? 'Ví dụ: Hội bạn cuối tuần' : 'Nhập mã của nhóm'}/></label><button className="button primary full" disabled={!!busy || !(modal === 'create' ? groupName.trim() : joinCode.trim())}>{busy === 'group' ? 'Đang xử lý…' : modal === 'create' ? 'Tạo nhóm' : 'Vào nhóm'}<ArrowRight size={17}/></button></form>{!liveMode && modal === 'join' && <p className="demo-disclaimer">Dùng mã CINEMA2026 để vào nhóm mẫu. Mã của nhóm dùng thử chỉ hoạt động trên trình duyệt này.</p>}</Dialog>}
    {modal === 'members' && group && <Dialog title="Cả hội ở đây" onClose={() => setModal(null)}><p className="muted">{group.name} · {group.members.length} thành viên</p><div className="invite-box"><span className="section-kicker">MÃ MỜI CỦA NHÓM</span><code>{group.code}</code><button className="button secondary full" onClick={() => void action('copy', async () => {await navigator.clipboard.writeText(group.code); setToast('Đã sao chép mã mời.');})} disabled={!!busy}><Copy size={17}/>Sao chép mã mời</button>{liveMode && <button className="text-button full" onClick={() => void action('copy', async () => {await navigator.clipboard.writeText(`${window.location.origin}/?invite=${group.code}`); setToast('Đã sao chép link mời.');})}>Sao chép link mời<ArrowRight size={16}/></button>}</div>{!liveMode && <p className="small-note">Nhóm mẫu và các thành viên mẫu chỉ dùng để thử giao diện. Chia sẻ giữa nhiều thiết bị cần Supabase.</p>}<ul className="member-list">{group.members.map((p,i) => <li key={p.id}><Avatar name={p.name} index={i}/><span>{p.name}</span>{p.id === user?.id && <span className="member-you">Bạn</span>}</li>)}</ul></Dialog>}
    {modal === 'detail' && detail && group && <Dialog title="Chi tiết phim" wide onClose={() => {if (!busy) setModal(null);}}><div className="detail-intro"><Poster movie={detail}/><div><span className="section-kicker">{detail.watchedAt ? 'ĐÃ CÙNG NHAU XEM' : group.tonightId === detail.entryId ? 'ĐANG XEM TỐI NAY' : 'TRONG DANH SÁCH CHỜ'}</span><h3>{detail.title}</h3><div className="movie-meta"><span>{detail.year || 'Chưa có năm'}</span><span><Clock size={15}/>{detail.runtime ? `${detail.runtime} phút` : 'Chưa có thời lượng'}</span></div><p>{detail.overview}</p><span className="small-note">Được thêm bởi {detail.addedName}</span>{user && canDeleteMovie(group,detail,user.id) && <button className="button secondary management-delete" disabled={!!busy} onClick={()=>requestRemoval('movie',detail.entryId,detail.title)}>Xóa khỏi danh sách</button>}</div></div>{detail.watchedAt ? <><div className="rating-summary"><Star size={22}/><strong>{averageRating(group.ratings.filter(r => r.entryId === detail.entryId))?.toFixed(1) || '—'}<small>/10</small></strong><span>Điểm trung bình của nhóm<br/><small>{group.ratings.filter(r => r.entryId === detail.entryId).length} lượt chấm điểm</small></span></div><div className="individual-ratings">{group.members.map(p => {const r = group.ratings.find(r => r.entryId === detail.entryId && r.userId === p.id); return <span key={p.id}>{p.name}<strong>{r ? `${r.score}/10` : 'Chưa chấm'}</strong></span>;})}</div><form className="rating-form" onSubmit={saveRating}><label htmlFor="movie-score">Điểm của bạn<select id="movie-score" value={score} onChange={e => setScore(e.target.value)}>{Array.from({length:19},(_,i) => 1+i*0.5).map(s => <option key={s} value={s}>{s}/10</option>)}</select></label><button className="button primary" disabled={!!busy}>{busy === 'rating' ? 'Đang lưu…' : 'Lưu điểm'}</button>{user && group.ratings.some(r=>r.entryId===detail.entryId&&r.userId===user.id) && <button type="button" className="text-button" disabled={!!busy} onClick={()=>requestRemoval('rating',detail.entryId,detail.title)}>Xóa điểm của tôi</button>}</form><div className="comments-section"><h3><MessageCircle size={18}/>Góc bàn phim</h3>{group.comments.filter(c => c.entryId === detail.entryId).map(c => <div className="comment" key={c.id}><Avatar name={c.name}/><div><strong>{c.name}</strong><time>{new Date(c.createdAt).toLocaleDateString('vi-VN')}</time>{editingComment===c.id ? <form onSubmit={editComment}><label htmlFor="edit-comment">Sửa bình luận của bạn<textarea id="edit-comment" maxLength={1000} value={editBody} onChange={e=>setEditBody(e.target.value)} rows={3}/></label><div className="management-actions"><button className="button secondary compact" disabled={!!busy||!editBody.trim()}>Lưu bình luận</button><button type="button" className="text-button" disabled={!!busy} onClick={()=>{setEditingComment(null);setEditBody('');}}>Hủy sửa</button></div></form> : <p>{c.body}</p>}{user && canEditOwn(group,c.userId,user.id) && editingComment!==c.id && <div className="management-actions"><button className="text-button" disabled={!!busy} onClick={()=>{setEditingComment(c.id);setEditBody(c.body);}}>Sửa bình luận</button><button className="text-button" disabled={!!busy} onClick={()=>requestRemoval('comment',c.id,c.body)}>Xóa bình luận</button></div>}</div></div>)} {!group.comments.some(c => c.entryId === detail.entryId) && <p className="small-note">Chưa có bình luận. Bạn mở màn nhé?</p>}<form onSubmit={sendComment}><label htmlFor="movie-comment">Bình luận của bạn<textarea id="movie-comment" placeholder="Có đoạn nào làm bạn nhớ mãi?" value={comment} onChange={e => setComment(e.target.value)} maxLength={1000} rows={3}/></label><div className="comment-submit"><span className="small-note">{comment.length}/1000</span><button className="button secondary" disabled={!!busy || !comment.trim()}>{busy === 'comment' ? 'Đang gửi…' : 'Gửi bình luận'}<ArrowRight size={16}/></button></div></form></div></> : <p className="detail-note"><Clock size={17}/>Chấm điểm và bình luận sẽ mở khi cả nhóm đã xem xong phim.</p>}</Dialog>}
  </>;
}

function MovieCard({movie, onClick, average}: {movie: Entry; onClick: () => void; average?: number | null}) {
  return <button className="movie-card" onClick={onClick}><div className="movie-art"><Poster movie={movie}/><span className="movie-year">{movie.year || '—'}</span><span className="movie-open"><ArrowRight size={20}/></span>{average !== undefined && <span className="movie-rating"><Star size={13}/>{average?.toFixed(1) || 'Chưa chấm'}</span>}</div><h3>{movie.title}</h3><p>{movie.watchedAt ? 'Đã xem · ' : 'Thêm bởi '}{movie.watchedAt ? new Date(movie.watchedAt).toLocaleDateString('vi-VN') : movie.addedName}</p></button>;
}
function Empty({title, description, action}: {title: string; description: string; action?: ReactNode}) {return <div className="empty-state"><Film size={34}/><h3>{title}</h3><p>{description}</p>{action}</div>;}

function Credits() {
  return <footer aria-label="Nguồn dữ liệu và ghi công"><span>Một cú bốc, cả nhóm cùng xem.</span><a href="https://www.themoviedb.org" target="_blank" rel="noreferrer"><img className="tmdb-logo" src="/tmdb-logo.svg" alt="TMDB" width="42" height="30"/>Dữ liệu phim từ TMDB<ExternalLink size={12}/></a><p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p><p className="logo-credit">Logo: <a href="https://commons.wikimedia.org/wiki/File:Tmdb.new.logo.svg" target="_blank" rel="noreferrer">Travis Bell</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a> · Không chỉnh sửa.</p></footer>;
}

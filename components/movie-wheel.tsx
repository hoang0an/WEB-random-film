'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Entry } from '@/lib/domain';
import { easeOutCubic, REVEAL_MS, SPIN_MS, stopAngle, TAU, wheelCards, type WheelRun } from '@/lib/movie-wheel';
import { imageUrl } from '@/lib/posters';
import './movie-wheel.css';

type Phase = 'idle' | 'spinning' | 'slowing' | 'revealing' | 'complete';
type Props = { movies: Entry[]; run: WheelRun | null; settled?: boolean; onComplete: (run: WheelRun) => void };

export default function MovieWheel({ movies, run, settled = false, onComplete }: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLDivElement>());
  const callback = useRef(onComplete);
  callback.current = onComplete;
  const angle = useRef(0);
  const renderPose = useRef<(rotation: number, reveal: number) => void>(() => {});
  const geometry = useRef({ radius: 100, height: 33, depth: 42 });
  const frame = useRef<number | null>(null);
  const [phase, setPhase] = useState<Phase>(settled && run ? 'complete' : 'idle');
  const [phaseRunId, setPhaseRunId] = useState<number | null>(settled && run ? run.id : null);
  const [reduced, setReduced] = useState(false);
  const visible = useMemo(() => wheelCards(run?.pool || movies, run?.winner.entryId), [movies, run]);
  const signature = visible.map(movie => movie.entryId).join(',');

  useLayoutEffect(() => {
    const node = stage.current;
    if (!node) return;
    let lastReveal = settled && run ? 1 : 0;
    if (settled && run) angle.current = stopAngle(0, visible.findIndex(movie => movie.entryId === run.winner.entryId), visible.length);
    const paint = (rotation: number, reveal: number) => {
      lastReveal = reveal;
      visible.forEach((movie, index) => {
        const element = cards.current.get(movie.entryId);
        if (!element) return;
        const theta = index * TAU / visible.length + rotation;
        const front = Math.cos(theta);
        let x = Math.sin(theta) * geometry.current.radius;
        let y = front * geometry.current.height;
        let z = front * geometry.current.depth;
        let tilt = -Math.sin(theta) * 12;
        let scale = 0.86 + (front + 1) * 0.07;
        let opacity = 0.38 + (front + 1) * 0.31;
        if (reveal && movie.entryId === run?.winner.entryId) {
          x *= 1 - reveal; y *= 1 - reveal;
          z += (115 - z) * reveal; tilt *= 1 - reveal;
          scale += (1.65 - scale) * reveal; opacity = 1;
        } else if (reveal) {
          opacity *= 1 - reveal; scale *= 1 - reveal * 0.12;
        }
        element.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${z.toFixed(2)}px) rotateY(${tilt.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
        element.style.opacity = String(opacity);
        element.style.zIndex = String(Math.round(z + 200));
      });
    };
    renderPose.current = paint;
    const measure = () => {
      const width = node.clientWidth;
      geometry.current = { radius: Math.max(0, Math.min(220, width * 0.30)), height: width < 400 ? 42 : 72, depth: width < 400 ? 34 : 48 };
      paint(angle.current, lastReveal);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
    // Rebuild only when card identities change, not when the parent refreshes data.
  }, [signature, run?.id, settled]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(media.matches);
    setPhaseRunId(run?.id ?? null);
    let cancelled = false;
    let complete = false;
    const winnerIndex = visible.findIndex(movie => movie.entryId === run?.winner.entryId);
    const start = run ? angle.current : 0;
    const end = run ? stopAngle(start, winnerIndex, visible.length) : 0;
    let zero: number | null = null;
    let currentPhase: Phase = run ? 'spinning' : 'idle';
    const changePhase = (next: Phase) => {
      if (currentPhase !== next) {currentPhase = next; setPhase(next);}
    };
    const finish = () => {
      if (!run || cancelled || complete) return;
      complete = true; frame.current = null;
      angle.current = end; renderPose.current(end, 1); changePhase('complete');
      callback.current(run);
    };
    const tick = (timestamp: number) => {
      if (cancelled || !run) return;
      if (media.matches) {finish(); return;}
      zero ??= timestamp;
      const elapsed = timestamp - zero;
      if (elapsed < SPIN_MS) {
        const progress = elapsed / SPIN_MS;
        changePhase(progress < 0.28 ? 'spinning' : 'slowing');
        angle.current = start + (end - start) * easeOutCubic(progress);
        renderPose.current(angle.current, 0);
      } else {
        changePhase('revealing'); angle.current = end;
        renderPose.current(end, easeOutCubic((elapsed - SPIN_MS) / REVEAL_MS));
      }
      if (elapsed >= SPIN_MS + REVEAL_MS) finish();
      else frame.current = requestAnimationFrame(tick);
    };
    const preferenceChanged = () => {setReduced(media.matches); if (media.matches) {if (frame.current !== null) cancelAnimationFrame(frame.current); finish();}};
    media.addEventListener('change', preferenceChanged);
    if (run && settled) {complete = true; setPhase('complete'); renderPose.current(angle.current, 1);}
    else if (run) {setPhase('spinning'); frame.current = requestAnimationFrame(tick);}
    else {angle.current = 0; setPhase('idle'); renderPose.current(0, 0);}
    return () => {cancelled = true; if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null; media.removeEventListener('change', preferenceChanged);};
    // A frozen run owns its timeline; polling and parent renders cannot restart it.
  }, [run?.id]);

  const displayPhase = (run?.id ?? null) === phaseRunId ? phase : run ? 'spinning' : 'idle';
  return <div ref={stage} className={`movie-wheel movie-wheel-${displayPhase}`} data-phase={displayPhase} data-empty={!visible.length} data-run-id={run?.id} data-winner-id={run?.winner.entryId} data-reduced-motion={reduced}>
    <div className="wheel-aura" aria-hidden="true"/>
    <div className="wheel-orbit" aria-hidden="true"/>
    <div className="wheel-scene" aria-hidden="true">
      {visible.map(movie => <div key={movie.entryId} ref={node => {if (node) cards.current.set(movie.entryId, node); else cards.current.delete(movie.entryId);}} className="wheel-card" data-entry-id={movie.entryId} data-selected={movie.entryId === run?.winner.entryId && (displayPhase === 'revealing' || displayPhase === 'complete')}>
        <img src={imageUrl(movie.poster, 'w342')} alt={`Poster ${movie.title}`} decoding="async" draggable={false} onError={e => {if (!e.currentTarget.src.endsWith('/poster-placeholder.svg')) e.currentTarget.src = '/poster-placeholder.svg';}}/>
        <span className="wheel-card-shine"/>
      </div>)}
    </div>
    <span className="sr-only" aria-live="polite" aria-atomic="true">{displayPhase === 'complete' && run ? `Đã bốc phim ${run.winner.title}.` : displayPhase === 'spinning' ? 'Đang quay poster phim.' : displayPhase === 'slowing' ? 'Vòng quay đang chậm dần.' : ''}</span>
  </div>;
}

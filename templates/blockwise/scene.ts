// Blockwise starter scene. Every frame is a pure function of t: frame(t) must not depend on the previous frame,
// so the renderer can jump to any time, render chunks in parallel and resume after a crash.
// Copy this folder for a new film, then replace the script, the blocks and the beats below.
import {
  W, H, CORAL, g, r, sc, cam, setCam, grid, clamp, lerp, prog, eio, eo, backOut, win, hop,
  loadFonts, BD, texText, makeBlock, poseBlock, rowLayout, type Block, type CamState,
  proj, txt, glow, background, bigWord, vignette, grain, subtitleDraw, out,
} from '@engine/core';
import * as THREE from 'three';

// ---------------------------------------------------------------- timeline (data/timeline.json from build_timeline.py)
type Line = { id: string; text: string; ch: string; start: number; end: number; segs: [number, number][] };
let TL: { lines: Line[]; chapters: Record<string, number>; chapter_titles: Record<string, string>; duration: number };
const LN: Record<string, Line> = {};
const L = (id: string) => LN[id].start;                       // line starts
const E = (id: string) => LN[id].end;                         // line ends
const SG = (id: string, k: number) => { const l = LN[id]; return l.start + l.segs[Math.min(k, l.segs.length - 1)][0]; }; // k-th phrase starts
let DUR = 30;
const COVER = new URLSearchParams(location.search).get('cover') === '1';

// ---------------------------------------------------------------- subtitles: split at punctuation, ≤ 20 chars a screen, snapped to pauses
type Sub = { a: number; b: number; s: string };
const SUBS: Sub[] = [];
function buildSubs() {
  for (const l of TL.lines) {
    const parts = l.text.match(/[^，。：；？！]+[，。：；？！”]*/g) ?? [l.text];
    const chunks: string[] = [];
    for (const p of parts) {
      const last = chunks[chunks.length - 1];
      if (last && last.length + p.length <= 20 && (p.length < 7 || last.length < 7)) chunks[chunks.length - 1] = last + p; else chunks.push(p);
    }
    const sp0 = l.start + l.segs[0][0], sp1 = l.start + l.segs[l.segs.length - 1][1];
    const tot = chunks.reduce((s, c) => s + c.length, 0);
    const gaps = l.segs.slice(1).map((s, i) => l.start + (l.segs[i][1] + s[0]) / 2);
    let acc = 0;
    chunks.forEach((c, i) => {
      let a = i === 0 ? sp0 : lerp(sp0, sp1, acc / tot);
      if (i > 0 && gaps.length) a = gaps.reduce((best, x) => (Math.abs(x - a) < Math.abs(best - a) ? x : best), gaps[0]);
      acc += c.length;
      const prev = SUBS[SUBS.length - 1];
      if (i > 0 && prev && a < prev.a + 0.5) a = prev.a + Math.max(0.5, (sp1 - prev.a) * 0.4);
      SUBS.push({ a, b: 0, s: c.replace(/[，。；：、]+$/u, '').trim() });
    });
  }
  SUBS.forEach((s, i) => {
    const line = TL.lines.find((l) => l.start <= s.a + 0.01 && l.end >= s.a - 0.01)!;
    s.b = Math.min(SUBS[i + 1] ? SUBS[i + 1].a - 0.16 : 1e9, line.end + 0.15);   // never two subtitles on screen
  });
}

// ---------------------------------------------------------------- scene objects
const WORDS = ['一句话', '会先', '被切成', '积木'];
let blocks: Block[] = []; let xs: number[] = [];
function buildScene() {
  const ws = WORDS.map((w) => Math.max(1.2, [...w].length * 0.9));
  ({ xs } = rowLayout(ws, -ws.reduce((a, b) => a + b, 0) / 2 - 0.6));
  blocks = WORDS.map((w, i) => makeBlock(ws[i], texText(ws[i], w), undefined, texText(ws[i], w, { color: CORAL })));
}

// ---------------------------------------------------------------- camera: keyframes on narration times, eased between
function camAt(t: number): CamState {
  if (COVER) return { x: -4.5, y: 0, z: 1.5, zoom: 1.5, el: 32, az: 40 };   // cover: blocks sit right, title gets the left
  const K: [number, CamState][] = [
    [0, { x: 0, y: 0, z: 0, zoom: 1.2, el: 32, az: 40 }],
    [SG('tp_a02', 0), { x: 0, y: 0, z: 0, zoom: 1.6, el: 32, az: 36 }],
    [L('tp_b01'), { x: 1.5, y: 0, z: 0, zoom: 1.4, el: 30, az: 44 }],
    [DUR, { x: 2.5, y: 0, z: 0, zoom: 1.25, el: 30, az: 48 }],
  ];
  let i = 0; while (i < K.length - 2 && t > K[i + 1][0]) i++;
  const [ta, a] = K[i], [tb, b] = K[i + 1]; const k = eio(prog(t, ta, tb));
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k), zoom: lerp(a.zoom, b.zoom, k), el: lerp(a.el, b.el, k), az: lerp(a.az, b.az, k) };
}

// ---------------------------------------------------------------- frame
function frame(t: number) {
  const c = camAt(t); setCam(c); grid.update(c.x, c.z, 22 / c.zoom);
  // beat 1: blocks drop in one per phrase of tp_a02; beat 2: they light up in turn during chapter 1
  blocks.forEach((b, i) => {
    const t0 = SG('tp_a02', 0) + 0.25 + i * 0.32;
    const k = backOut(prog(t, t0, t0 + 0.45));
    const hiT = L('tp_b02') + i * 0.35;
    poseBlock(b, { x: xs[i], y: (1 - k) * 2.5 + hop(t, hiT, 0.35), z: 0, op: prog(t, t0, t0 + 0.15), hi: win(t, hiT, hiT + 1.2, 0.1, 0.4) });
  });
  background();
  bigWord('BLOCKWISE', win(t, L('tp_a01'), E('tp_a02'), 0.8, 0.8), 90, 300, 220);
  r.setClearColor(0, 0); r.render(sc, cam); g.globalAlpha = 1; g.drawImage(r.domElement, 0, 0);
  // 2D overlay anchored to 3D: a label over the last block
  const p = proj(new THREE.Vector3(xs[3], 1.2, -BD / 2));
  const la = win(t, L('tp_b01'), DUR - 1, 0.4, 0.6);
  glow(p.x, p.y + 40, 140, 0.25 * la);
  txt('Token', p.x, p.y - 20, '600 40px BarS', CORAL, 'center', 4, la);
  if (COVER) { vignette(); coverText(); grain(t, 6); return; }
  vignette(); chapterTag(t); subtitles(t); endCard(t); grain(t, 8);
  const fin = prog(t, 0, 0.7) * (1 - prog(t, DUR - 0.8, DUR));
  if (fin < 1) { g.fillStyle = `rgba(0,0,0,${1 - fin})`; g.fillRect(0, 0, W, H); }
}
function chapterTag(t: number) {
  const ids = Object.keys(TL.chapters).filter((id) => id !== 'c0');     // c0 is the cold open: no tag
  ids.forEach((id, i) => {
    const a = TL.chapters[id], b = TL.chapters[ids[i + 1]] ?? DUR;
    const al = win(t, a - 0.2, Math.min(a + 6, b - 0.2), 0.5, 0.8); if (al <= 0) return;
    const sl = eo(prog(t, a - 0.2, a + 0.6));
    txt(String(i + 1).padStart(2, '0'), 72, H - 170 - (1 - sl) * 10, '600 64px BarS', CORAL, 'left', 2, al);
    txt(TL.chapter_titles[id] ?? '', 150, H - 178 - (1 - sl) * 10, '700 34px SansB', '#fff', 'left', 4, al);
    g.save(); g.globalAlpha = al; g.fillStyle = CORAL; g.fillRect(150, H - 166, 46 * sl, 3); g.restore();
  });
}
function subtitles(t: number) {
  for (const s of SUBS) if (t >= s.a - 0.12 && t <= s.b + 0.12) subtitleDraw(s.s, Math.min(prog(t, s.a - 0.12, s.a + 0.06), 1 - prog(t, s.b - 0.04, s.b + 0.12)));
}
function endCard(t: number) {
  const last = TL.lines[TL.lines.length - 1].end, a = eio(prog(t, last + 0.3, last + 1.3)); if (a <= 0) return;
  g.save(); g.globalAlpha = a * 0.62; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.restore();
  txt('片名写在这里', W / 2, H / 2 - 20, '700 64px SansB', '#fff', 'center', 4, a);
  txt('KEYWORD · 关键词', W / 2, H / 2 + 60, '500 30px BarM', CORAL, 'center', 8, a);
  txt('画面中的数值为示意（如有）', W / 2, H - 70, '500 22px SansM', 'rgba(255,255,255,0.5)', 'center', 1, a);
}
function coverText() {
  const lg = g.createLinearGradient(0, 0, W * 0.62, 0); lg.addColorStop(0, 'rgba(8,8,10,0.92)'); lg.addColorStop(1, 'rgba(8,8,10,0)');
  g.fillStyle = lg; g.fillRect(0, 0, W, H);
  g.save(); g.font = '900 124px SansK'; g.fillStyle = '#fff'; g.fillText('大标题', 90, 340); g.fillStyle = CORAL; g.fillText('第二行', 90, 490); g.restore();
  txt('副标题 · 一次讲透', 96, 580, '700 44px SansB', 'rgba(255,255,255,0.85)', 'left', 6);
}

// ---------------------------------------------------------------- boot: the renderer waits for __ready, then calls __frame(t)
const errs: string[] = [];
(window as any).__errors = () => errs.splice(0);
(window as any).__frame = (t: number, q = 0.93) => { try { frame(t); } catch (e: any) { errs.push(String(e?.stack ?? e)); } return out.toDataURL('image/jpeg', q); };
(async () => {
  await loadFonts();
  TL = await (await fetch('/film/data/timeline.json')).json();
  for (const l of TL.lines) LN[l.id] = l;
  DUR = TL.duration; (window as any).__duration = DUR;
  buildSubs(); buildScene();
  frame(parseFloat(new URLSearchParams(location.search).get('t') ?? '5'));
  (window as any).__ready = true;
})().catch((e) => { errs.push(String(e?.stack ?? e)); (window as any).__ready = true; });

// 《AI 回答你的那几秒里，到底发生了什么？》 Token film. film.html — every frame is a pure function of t (window.__frame).
// One continuous isometric world, no hard cuts; stations: S0 question row (x=0), S1 glue/split (x=26), S2 strawberry (x=48),
// vocabulary field behind everything, meaning-space cube above the field, S5 attention rows (x=72).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  W, H, CORAL, CORAL_RGB, g, glc, r, sc, cam, camTarget, setCam, grid, clamp, lerp, prog, eio, eo, ei, backOut, win, hop, rng, fmt,
  loadFonts, BH, BD, GAP, texText, texId, texHalf, makeBlock, poseBlock, rowLayout, type Block, type CamState,
  proj, txt, txtHalo, glow, card, background, bigWord, vignette, grain, subtitleDraw,
} from '@engine/core';

// ---------------------------------------------------------------- data
type Line = { id: string; text: string; ch: string; start: number; end: number; dur: number; segs: [number, number][] };
type Tk = { s: string; id: number; frag: boolean };
let TL: { lines: Line[]; chapters: Record<string, number>; duration: number };
let TK: Record<string, any>;
const LN: Record<string, Line> = {};
const L = (id: string) => LN['tf_' + id].start;
const E = (id: string) => LN['tf_' + id].end;
const SG = (id: string, k: number) => { const l = LN['tf_' + id]; return l.start + l.segs[Math.min(k, l.segs.length - 1)][0]; };
const SGE = (id: string, k: number) => { const l = LN['tf_' + id]; return l.start + l.segs[Math.min(k, l.segs.length - 1)][1]; };
let DUR = 220;
const COVER = new URLSearchParams(location.search).get('cover') === '1';

// subtitles: split at punctuation into ≤ 20-char screens, timed to speech segments
type Sub = { a: number; b: number; s: string };
const SUBS: Sub[] = [];
function buildSubs() {
  for (const l of TL.lines) {
    const parts = l.text.match(/[^，。：；？！]+[，。：；？！”]*/g) ?? [l.text];
    const chunks: string[] = [];
    for (const p of parts) {
      const last = chunks[chunks.length - 1];
      if (last && (last.length + p.length <= 20) && (p.length < 7 || last.length < 7)) chunks[chunks.length - 1] = last + p; else chunks.push(p);
    }
    const sp0 = l.start + l.segs[0][0], sp1 = l.start + l.segs[l.segs.length - 1][1];
    const tot = chunks.reduce((s, c) => s + c.length, 0);
    let acc = 0;
    const gaps = l.segs.slice(1).map((s, i) => l.start + (l.segs[i][1] + s[0]) / 2);
    chunks.forEach((c, i) => {
      let a = i === 0 ? sp0 : lerp(sp0, sp1, acc / tot);
      if (i > 0 && gaps.length) a = gaps.reduce((best, x) => (Math.abs(x - a) < Math.abs(best - a) ? x : best), gaps[0]);
      acc += c.length;
      const prev = SUBS[SUBS.length - 1];
      if (i > 0 && prev && a < prev.a + 0.5) a = prev.a + Math.max(0.5, (sp1 - prev.a) * 0.4);
      SUBS.push({ a, b: 0, s: clean(c) });
    });
  }
  for (let i = 0; i < SUBS.length; i++) {
    const nxt = SUBS[i + 1];
    const lineEnd = TL.lines.find((l) => l.start <= SUBS[i].a + 0.01 && l.end >= SUBS[i].a - 0.01)!.end;
    SUBS[i].b = Math.min(nxt ? nxt.a - 0.16 : 1e9, lineEnd + 0.15);
  }
}
const clean = (s: string) => s.replace(/[，。；：、]+$/u, '').trim();

// ---------------------------------------------------------------- stations / constants
const S1X = 26, S2X = 48, S5X = 72;
const CUBE = new THREE.Vector3(30, 12.5, -22), CUBE_H = 7;
const CELL = 0.95, FZ0 = -3.6;
const tkw = (t: Tk) => (t.frag ? 1 : Math.max(1, [...t.s.trim()].length));

// ---------------------------------------------------------------- scene objects
let slab: THREE.Mesh, slabMat: THREE.MeshStandardMaterial, slabTop: THREE.Mesh, slabCanvas: HTMLCanvasElement, slabTex: THREE.CanvasTexture;
let btn: THREE.Mesh, btnMat: THREE.MeshStandardMaterial;
let beam: THREE.Mesh, beamMat: THREE.MeshBasicMaterial;
let SLAB_W = 12;
let Q: Tk[] = []; let qb: Block[] = []; let qx: number[] = []; let qxTight: number[] = []; let qEnd = 0;
let cuts: THREE.Mesh[] = [];
// S1
let corpus: THREE.Mesh, corpusMat: THREE.MeshBasicMaterial, corpusCanvas: HTMLCanvasElement;
const GLUE = [['苹', '果', '苹果', 32176], ['手', '机', '手机', 10485], ['人', '工', '人工', 47243], ['智', '能', '智能', 60319]] as const;
let glueHalves: Block[][] = []; let glueWhole: Block[] = []; let glueX: number[] = [];
let shu: Block[] = []; let shuX: number[] = []; let shuHalf: Block[] = [];
// S2
const LETTERS = 'strawberry'.split('');
let letters: Block[] = []; let straw: Block;
// field
type Cell = { x: number; z: number; n: number; ph: number; idx: number };
const cells: Cell[] = [];
let field: THREE.InstancedMesh;
const dummy = new THREE.Object3D(); const tmpC = new THREE.Color();
// peaks (S0, chapter 5)
const CAND = [
  { s: '晴', p: 0.31, cx: 1, cz: 4 }, { s: '今天', p: 0.19, cx: -6, cz: 4 }, { s: '我', p: 0.09, cx: 8, cz: 5 },
  { s: '根据', p: 0.07, cx: -12, cz: 6 }, { s: '目前', p: 0.05, cx: 14, cz: 4 }, { s: '抱歉', p: 0.03, cx: -18, cz: 5 },
];
const candPos = CAND.map((c) => new THREE.Vector3(c.cx * CELL, 0, FZ0 - c.cz * CELL));
let peaks: THREE.Mesh[] = []; let peakMats: THREE.MeshStandardMaterial[] = [];
let ring: THREE.Mesh;
// meaning space
let cubeLines: THREE.LineSegments; let cubeMat: THREE.LineBasicMaterial;
type Pt = { label?: string; cl: number; to: THREE.Vector3; from: THREE.Vector3; m: THREE.Mesh; mat: THREE.MeshStandardMaterial; delay: number };
const pts: Pt[] = [];
const CLUSTERS = [
  { name: '水果', off: new THREE.Vector3(-3.4, 2.4, 2.8), words: ['苹果', '香蕉', '葡萄', '西瓜', '橙子'] },
  { name: '动物', off: new THREE.Vector3(3.6, -2.6, 1.6), words: ['猫', '狗', '老虎', '熊猫', '兔子'] },
  { name: '天气', off: new THREE.Vector3(1.2, 3.4, -4.4), words: ['晴', '雨', '雪', '风', '云'] },
];
let hero: Block;
// S5 attention
let row1: Block[] = [], row2: Block[] = []; let r1x: number[] = [], r2x: number[] = [];
const R1: Tk[] = [], R2: Tk[] = [];
const R1Z = -0.4, R2Z = 3.1;
type Arc = { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; count: number; w: number };
let arcs1: Arc[] = [], arcs2: Arc[] = [], arcsAll: { arc: Arc; row: number; j: number }[] = [];
// answer rows
let A: Tk[] = []; let ab: Block[] = []; let ax: number[] = []; let appT: number[] = [];
let B: Tk[] = []; let bb: Block[] = []; let bx: number[] = [];
const BZ = 2.8;
let srcFlash: THREE.Mesh[] = [];
let lookArcs: Arc[] = [];
// chapter 6
let frame6: THREE.Group; let frame6Mat: THREE.LineBasicMaterial; let frame6Glass: THREE.MeshBasicMaterial; const FRAME_LEN = 17;
let hallu: THREE.Mesh[] = []; let halluMat: THREE.MeshStandardMaterial[] = [];
let coins: THREE.InstancedMesh; const MAXCOIN = 46;
// chapter 7 ghost rows
let ghosts: THREE.InstancedMesh; const GROWS = 26, GLEN = 22;
const ghostRows: { x: number; z: number; t0: number; rate: number }[] = [];

// ---------------------------------------------------------------- build
function tex(w: number, s: string, color?: string) { return texText(w, s, { color }); }
function buildScene() {
  Q = TK.q;
  const qws = Q.map(tkw);
  const lay = rowLayout(qws, 0); const tot = lay.end; const X0 = -tot / 2;
  qx = lay.xs.map((x) => x + X0); qEnd = X0 + tot;
  let xx = -qws.reduce((s, w) => s + w, 0) / 2; qxTight = qws.map((w) => { const c = xx + w / 2; xx += w; return c; });
  qb = Q.map((q, i) => makeBlock(qws[i], tex(qws[i], q.s), texId(qws[i], q.id, q.s), tex(qws[i], q.s, CORAL)));
  SLAB_W = tot + 2.8;

  slabMat = new THREE.MeshStandardMaterial({ color: 0x1c1c20, roughness: 0.35, metalness: 0.1, transparent: true });
  slab = new THREE.Mesh(new RoundedBoxGeometry(SLAB_W, 0.34, 2.0, 4, 0.16), slabMat); slab.receiveShadow = true; slab.castShadow = true; sc.add(slab);
  slabCanvas = document.createElement('canvas'); slabCanvas.width = Math.round(SLAB_W * 200); slabCanvas.height = 400;
  slabTex = new THREE.CanvasTexture(slabCanvas); slabTex.colorSpace = THREE.SRGBColorSpace; slabTex.anisotropy = 8;
  slabTop = new THREE.Mesh(new THREE.PlaneGeometry(SLAB_W - 0.2, 1.8), new THREE.MeshBasicMaterial({ map: slabTex, transparent: true, depthWrite: false, toneMapped: false }));
  slabTop.rotation.x = -Math.PI / 2; sc.add(slabTop);
  btnMat = new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.4, emissive: new THREE.Color(CORAL), emissiveIntensity: 0 });
  btn = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 48), btnMat); btn.castShadow = true; sc.add(btn);
  beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(CORAL), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  beam = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 2.6), beamMat); beam.rotation.x = -Math.PI / 2; sc.add(beam);
  for (let i = 0; i < Q.length - 1; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(BD + 0.9, 1.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(CORAL), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    m.rotation.y = Math.PI / 2; sc.add(m); cuts.push(m);
  }

  // S1: corpus floor text + glue pairs + 疑是地上霜
  corpusCanvas = document.createElement('canvas'); corpusCanvas.width = 2600; corpusCanvas.height = 760;
  const corpusTex = new THREE.CanvasTexture(corpusCanvas); corpusTex.colorSpace = THREE.SRGBColorSpace; corpusTex.anisotropy = 8;
  corpusMat = new THREE.MeshBasicMaterial({ map: corpusTex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 });
  corpus = new THREE.Mesh(new THREE.PlaneGeometry(26, 7.6), corpusMat); corpus.rotation.x = -Math.PI / 2; corpus.position.set(S1X, 0.01, -5.4); sc.add(corpus);
  const gl = rowLayout(GLUE.map(() => 2), 0, 0.8); glueX = gl.xs.map((x) => x + S1X - gl.end / 2);
  GLUE.forEach(([a, b, w, id]) => {
    glueHalves.push([makeBlock(1, tex(1, a)), makeBlock(1, tex(1, b))]);
    glueWhole.push(makeBlock(2, tex(2, w), texId(2, id, w), tex(2, w, CORAL)));
  });
  const SH: Tk[] = TK.shuang; // 疑 是 地 上 + two fragments of 霜
  const shTok = [SH[0], SH[1], SH[2], SH[3]];
  const sl = rowLayout([1, 1, 1, 1, 1], 0); shuX = sl.xs.map((x) => x + S1X - sl.end / 2);
  shu = shTok.map((t) => makeBlock(1, tex(1, t.s), texId(1, t.id, t.s)));
  shu.push(makeBlock(1, tex(1, '霜'), undefined, tex(1, '霜', CORAL)));
  shuHalf = [makeBlock(0.5, texHalf(0.5, '霜', 0, SH[4].s.split(' ')[0]), texId(0.5, SH[4].id, '前半')), makeBlock(0.5, texHalf(0.5, '霜', 1, SH[5].s), texId(0.5, SH[5].id, '后半'))];

  // S2
  letters = LETTERS.map((c) => makeBlock(0.62, texText(0.62, c, { font: 'Inter', big: 0.5, color: c === 'r' ? CORAL : '#1b1b1e' })));
  straw = makeBlock(5.2, texText(5.2, 'strawberry', { font: 'Inter', big: 0.5 }), texId(5.2, 101830, ' strawberry'), texText(5.2, '? ? ?', { font: 'Inter', big: 0.5, color: CORAL }));

  // vocabulary field
  const R = rng(7);
  for (let iz = 0; iz < 62; iz++) for (let ix = -48; ix <= 104; ix++) cells.push({ x: ix * CELL, z: FZ0 - iz * CELL, n: Math.pow(R(), 3.2), ph: R(), idx: cells.length });
  const fgeo = new RoundedBoxGeometry(CELL * 0.7, 1, CELL * 0.7, 1, 0.05); fgeo.translate(0, 0.5, 0);
  field = new THREE.InstancedMesh(fgeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), cells.length);
  field.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cells.length * 3), 3);
  sc.add(field);

  const pgeo = new RoundedBoxGeometry(CELL * 0.7, 1, CELL * 0.7, 2, 0.05); pgeo.translate(0, 0.5, 0);
  CAND.forEach((c, i) => {
    const m = new THREE.MeshStandardMaterial({ color: i === 0 ? new THREE.Color(CORAL) : 0xe4e4e8, roughness: 0.55, emissive: new THREE.Color(CORAL), emissiveIntensity: 0 });
    const p = new THREE.Mesh(pgeo, m); p.castShadow = true; p.position.copy(candPos[i]); p.visible = false; sc.add(p); peaks.push(p); peakMats.push(m);
  });
  ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.06, 12, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(CORAL), toneMapped: false, transparent: true }));
  ring.rotation.x = Math.PI / 2; ring.visible = false; sc.add(ring);

  // meaning-space cube
  {
    const h = CUBE_H; const v: number[] = [];
    const c = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
    const e = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (const [a, b] of e) {
      const N = 30;
      for (let k = 0; k < N; k++) for (const kk of [k, k + 1]) v.push(...[0, 1, 2].map((d) => lerp(c[a][d], c[b][d], kk / N) * h + CUBE.getComponent(d)));
    }
    // inner tick grid on the floor of the cube
    for (let i = -3; i <= 3; i++) { v.push(CUBE.x + i * h / 3.5, CUBE.y - h, CUBE.z - h, CUBE.x + i * h / 3.5, CUBE.y - h, CUBE.z + h); v.push(CUBE.x - h, CUBE.y - h, CUBE.z + i * h / 3.5, CUBE.x + h, CUBE.y - h, CUBE.z + i * h / 3.5); }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    cubeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    cubeLines = new THREE.LineSegments(gg, cubeMat); cubeLines.visible = false; sc.add(cubeLines);
  }
  const ptGeo = new RoundedBoxGeometry(0.62, 0.62, 0.62, 2, 0.08);
  const PR = rng(11);
  CLUSTERS.forEach((cl, ci) => cl.words.forEach((w, k) => {
    const a = (k / cl.words.length) * Math.PI * 2 + ci;
    const to = CUBE.clone().add(cl.off).add(new THREE.Vector3(Math.cos(a) * 2.5, (k - 2) * 0.75, Math.sin(a) * 2.5));
    const mat = new THREE.MeshStandardMaterial({ color: 0xe6e6ea, roughness: 0.5, emissive: new THREE.Color(CORAL), emissiveIntensity: 0, transparent: true });
    const m = new THREE.Mesh(ptGeo, mat); m.castShadow = false; m.visible = false; sc.add(m);
    const from = new THREE.Vector3(CUBE.x + (PR() - 0.5) * 30, 0.3, -6 - PR() * 18);
    pts.push({ label: w, cl: ci, to, from, m, mat, delay: PR() });
  }));
  for (let i = 0; i < 46; i++) {
    const to = CUBE.clone().add(new THREE.Vector3((PR() - 0.5) * 12, (PR() - 0.5) * 12, (PR() - 0.5) * 12));
    const mat = new THREE.MeshStandardMaterial({ color: 0x9a9aa2, roughness: 0.6, transparent: true, emissive: new THREE.Color(CORAL), emissiveIntensity: 0 });
    const m = new THREE.Mesh(ptGeo, mat); m.scale.setScalar(0.6); m.visible = false; sc.add(m);
    pts.push({ cl: -1, to, from: new THREE.Vector3(CUBE.x + (PR() - 0.5) * 34, 0.3, -5 - PR() * 22), m, mat, delay: PR() });
  }
  hero = makeBlock(2, tex(2, '苹果'), undefined, tex(2, '苹果', CORAL));

  // S5 attention rows
  R1.push(...TK.eat); R2.push(...TK.apple);
  const l1 = rowLayout(R1.map(tkw), 0), l2 = rowLayout(R2.map(tkw), 0);
  r1x = l1.xs.map((x) => x + S5X - l1.end / 2); r2x = l2.xs.map((x) => x + S5X - l2.end / 2);
  row1 = R1.map((t) => { const w = tkw(t); return makeBlock(w, tex(w, t.s), undefined, tex(w, t.s, CORAL)); });
  row2 = R2.map((t) => { const w = tkw(t); return makeBlock(w, tex(w, t.s), undefined, tex(w, t.s, CORAL)); });
  const mkArc = (ax0: number, az0: number, ax1: number, az1: number, w: number, coral: boolean): Arc => {
    const p0 = new THREE.Vector3(ax0, BH + 0.05, az0), p1 = new THREE.Vector3(ax1, BH + 0.05, az1);
    const d = p0.distanceTo(p1);
    const mid = p0.clone().lerp(p1, 0.5).add(new THREE.Vector3(0, 0.7 + d * 0.32, 0));
    const curve = new THREE.QuadraticBezierCurve3(p0, mid, p1);
    const geo = new THREE.TubeGeometry(curve, 48, 0.02 + 0.06 * w, 6, false);
    const mat = new THREE.MeshBasicMaterial({ color: coral ? new THREE.Color(CORAL) : 0xffffff, transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
    const m = new THREE.Mesh(geo, mat); m.visible = false; sc.add(m);
    return { m, mat, count: geo.index!.count, w };
  };
  // apple (row1 last) looks back at 我 吃 了 一个
  const W1 = [0.25, 1.0, 0.15, 0.4];
  arcs1 = W1.map((w, i) => mkArc(r1x[4], R1Z, r1x[i], R1Z, w, w > 0.9));
  // 发布 and 手机 look back at 苹果
  arcs2 = [mkArc(r2x[4], R2Z, r2x[0], R2Z, 1.0, true), mkArc(r2x[1], R2Z, r2x[0], R2Z, 0.8, true), mkArc(r2x[4], R2Z, r2x[3], R2Z, 0.3, false)];
  const AR = rng(5);
  for (const [row, xs, z] of [[1, r1x, R1Z], [2, r2x, R2Z]] as [number, number[], number][]) {
    for (let j = 1; j < xs.length; j++) for (let i = 0; i < j; i++) {
      const w = 0.12 + AR() * 0.5;
      arcsAll.push({ arc: mkArc(xs[j], z, xs[i], z, w, false), row, j });
    }
  }

  // answer rows (branch A continues the question row; B is the "ask again" ghost branch)
  A = [...TK.ansA, ...TK.more];
  const aws = A.map(tkw); const al = rowLayout(aws, qEnd + GAP); ax = al.xs;
  ab = A.map((t, i) => makeBlock(aws[i], texText(aws[i], t.s, { sub: fmt(t.id) }), undefined, texText(aws[i], t.s, { sub: fmt(t.id), color: CORAL })));
  B = TK.ansB;
  const bws = B.map(tkw); const bl = rowLayout(bws, qEnd + GAP); bx = bl.xs;
  bb = B.map((t, i) => makeBlock(bws[i], t.frag ? texHalf(1, '伞', (i === 7 ? 0 : 1) as 0 | 1, t.s) : texText(bws[i], t.s, { sub: fmt(t.id) })));
  const fm = new THREE.MeshStandardMaterial({ color: new THREE.Color(CORAL), emissive: new THREE.Color(CORAL), emissiveIntensity: 0.5, roughness: 0.5 });
  srcFlash = Array.from({ length: 8 }, () => { const m = new THREE.Mesh(pgeo, fm); m.visible = false; sc.add(m); return m; });
  // "carry the whole sentence": arcs from the newest block back over the row (used at f07)
  for (let i = 0; i < Q.length + 6; i++) {
    const xs = [...qx, ...ax];
    lookArcs.push(mkArc(xs[Q.length + 6], 0, xs[i], 0, 0.05 + (i % 3) * 0.08, i % 4 === 0));
  }

  // chapter 6: context window frame, hallucination peaks, coins
  frame6 = new THREE.Group();
  {
    const bx = new THREE.BoxGeometry(FRAME_LEN, 1.7, 2.1);
    frame6Mat = new THREE.LineBasicMaterial({ color: new THREE.Color(CORAL), transparent: true, opacity: 0 });
    const ln = new THREE.LineSegments(new THREE.EdgesGeometry(bx), frame6Mat);
    frame6Glass = new THREE.MeshBasicMaterial({ color: new THREE.Color(CORAL), transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const gl2 = new THREE.Mesh(bx, frame6Glass);
    frame6.add(ln, gl2); frame6.visible = false; sc.add(frame6);
  }
  for (let i = 0; i < 2; i++) {
    const m = new THREE.MeshStandardMaterial({ color: i === 0 ? new THREE.Color(CORAL) : 0xe8e8ec, roughness: 0.5, emissive: new THREE.Color(CORAL), emissiveIntensity: 0 });
    const p = new THREE.Mesh(pgeo, m); p.castShadow = true; p.visible = false; sc.add(p); hallu.push(p); halluMat.push(m);
  }
  coins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.42, 0.11, 40), new THREE.MeshStandardMaterial({ color: new THREE.Color(CORAL), roughness: 0.35, metalness: 0.3, emissive: new THREE.Color(CORAL), emissiveIntensity: 0.15 }), MAXCOIN);
  coins.castShadow = true; coins.visible = false; sc.add(coins);

  // chapter 7 ghost rows
  const GR = rng(21);
  for (let i = 0; i < GROWS; i++) ghostRows.push({ x: -30 + GR() * 100, z: -6 - GR() * 46, t0: GR() * 2.5, rate: 3 + GR() * 5 });
  ghosts = new THREE.InstancedMesh(new RoundedBoxGeometry(0.85, 0.5, 0.9, 1, 0.06), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, emissive: new THREE.Color(CORAL), emissiveIntensity: 0 }), GROWS * GLEN);
  ghosts.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(GROWS * GLEN * 3), 3);
  ghosts.visible = false; sc.add(ghosts);

  // append schedule for row A
  appT = [];
  const f06 = L('f06');
  appT.push(f06 + 0.25, f06 + 0.85, f06 + 1.35, f06 + 1.85);                    // 晴 天 ， 适 (B mirrors)
  appT.push(SG('f07', 0) + 0.15, SG('f07', 1) + 0.1, SG('f07', 3) + 0.1);          // 合 出 门
  appT.push(SG('f08', 0) + 0.05, SG('f08', 1) + 0.05, SG('f08', 2) + 0.05);        // 一块 一块 又一块
  for (let k = 0; k < 11; k++) appT.push(SG('f08', 3) + 0.1 + k * 0.27 * Math.pow(0.95, k));
  for (let k = 0; appT.length < A.length && L('g04') + 0.25 + k * 0.155 < E('g04') + 0.1; k++) appT.push(L('g04') + 0.25 + k * 0.155);
  while (appT.length < A.length) appT.push(1e9);
}

// ---------------------------------------------------------------- camera
let KEYS: (CamState & { t: number })[] = [];
const K = (t: number, x: number, y: number, z: number, zoom: number, el: number, az: number) => ({ t, x, y, z, zoom, el, az });
function rowEndAt(t: number) { let e = qEnd; for (let i = 0; i < A.length; i++) if (t >= appT[i]) e = ax[i] + tkw(A[i]) / 2; return e; }
function buildKeys() {
  const k: (CamState & { t: number })[] = [];
  k.push(K(0, 0, 0, 0, 1.42, 74, 6), K(L('a04'), 0, 0, 0, 1.5, 72, 8), K(L('a05') + 0.9, 0, 0, 0, 1.52, 70, 10));
  k.push(K(L('a06') + 0.6, 0, 0.3, 0, 1.75, 36, 24), K(E('a07'), 0, 0.3, 0, 1.9, 35, 27), K(L('b02'), 0, 0.3, 0, 2.0, 35, 28));
  k.push(K(L('b03') + 0.6, S1X, 0, -1.6, 1.22, 40, 22), K(E('b04'), S1X, 0, -1.2, 1.32, 39, 24));
  k.push(K(L('b05') + 1.0, S1X, 0, 1.4, 1.42, 38, 24), K(E('b06') + 0.5, S1X, 0, 1.6, 1.5, 37, 25));
  k.push(K(L('b07') + 1.6, S2X, 0.2, 0.4, 1.6, 34, 22), K(E('b09'), S2X, 0.2, 0.4, 1.78, 34, 24));
  k.push(K(L('c01') + 0.8, 37, 0, 0.8, 0.92, 38, 26), K(L('c02') + 0.2, 37, 0, 0.5, 0.95, 38, 27));
  k.push(K(L('c02') + 3.0, 30, 0, -12, 0.36, 40, 30), K(E('c03') + 0.6, 30, 0, -13, 0.38, 40, 31));
  k.push(K(L('d01') + 2.1, CUBE.x + 1.2, CUBE.y - 2.0, CUBE.z + 8, 1.9, 20, 30), K(L('d03') + 0.2, CUBE.x + 2.4, CUBE.y - 1.9, CUBE.z + 8, 2.0, 20, 31));
  k.push(K(SG('d03', 1) + 1.4, CUBE.x, CUBE.y - 1, CUBE.z + 3, 0.62, 19, 33));
  k.push(K(L('d04') + 0.5, CUBE.x, CUBE.y + 0.3, CUBE.z, 0.68, 20, 40), K(E('d06') + 1.5, CUBE.x, CUBE.y + 0.3, CUBE.z, 0.72, 22, 72));
  k.push(K(L('e01') + 2.2, S5X, 0, 1.4, 1.25, 36, 22), K(E('e03'), S5X, 0, 1.4, 1.3, 35, 24), K(E('e06') + 1.2, S5X, 0, 1.4, 1.22, 37, 26));
  k.push(K(L('f01') + 2.3, 1, 1.6, -3.5, 0.58, 30, 28), K(L('f04'), 2, 1.8, -3, 0.6, 30, 28), K(E('f05'), 3, 1.6, -2, 0.62, 30, 28));
  k.push(K(L('f06') + 0.8, 6, 0.4, 0.8, 0.8, 32, 26));
  // follow the growing answer row
  for (let t = L('f07'); t < E('f08') + 0.8; t += 0.9) k.push(K(t, rowEndAt(t) - 5, 0.3, -0.4, 0.95, 33, 25));
  k.push(K(L('g01') + 1.6, rowEndAt(L('g01')) - 14, 0.3, -1.5, 0.5, 38, 26));
  k.push(K(L('g03') + 0.8, rowEndAt(L('g03')) - 7, 0.3, -0.5, 0.82, 34, 25));
  for (let t = L('g04'); t < E('g04') + 0.6; t += 0.8) k.push(K(t, rowEndAt(t) - 7, 0.3, -0.5, 0.82, 34, 25));
  const ge = rowEndAt(L('g05'));
  k.push(K(L('g05') + 0.8, ge - 4, 1.6, -4.5, 0.72, 30, 27), K(E('g07') + 0.4, ge - 4, 1.8, -4.5, 0.75, 30, 28));
  k.push(K(L('g08') + 0.8, ge - 3.5, 0.6, 0.8, 0.86, 34, 24), K(E('g10'), ge - 3.5, 0.6, 0.8, 0.9, 34, 23));
  k.push(K(L('h01') + 2.6, 26, 0, -14, 0.3, 48, 30), K(E('h03'), 26, 0, -16, 0.27, 50, 33), K(DUR, 26, 0, -16, 0.25, 54, 35));
  k.sort((a, b) => a.t - b.t);
  KEYS = k;
}
function camAt(t: number): CamState {
  let i = 0; while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const kk = eio(prog(t, a.t, b.t));
  const o: any = {};
  for (const f of ['x', 'y', 'z', 'zoom', 'el', 'az'] as const) o[f] = lerp(a[f], b[f], kk);
  return o;
}

// ---------------------------------------------------------------- per-frame helpers
const TYPED: { s: string; t0: () => number; t1: () => number; e0: () => number }[] = [
  { s: '帮我写一封请假条', t0: () => 1.15, t1: () => 2.05, e0: () => 2.5 },
  { s: '红烧肉怎么做？', t0: () => 2.85, t1: () => 3.6, e0: () => 4.15 },
  { s: '这段代码哪里错了？', t0: () => 4.6, t1: () => 5.5, e0: () => L('a03') - 0.2 },
  { s: '今天天气怎么样？', t0: () => SG('a04', 0) + 0.25, t1: () => SGE('a04', 1) - 0.1, e0: () => L('a05') + 1.4 },
];
const SEND1 = () => 5.75, SEND2 = () => E('a04') + 0.1;
function drawSlab(t: number) {
  const c = slabCanvas.getContext('2d')!, pw = slabCanvas.width, ph = slabCanvas.height;
  c.clearRect(0, 0, pw, ph);
  const x0 = pw * 0.07;
  c.textBaseline = 'middle'; c.textAlign = 'left';
  let shown = false;
  for (const ty of TYPED) {
    const t0 = ty.t0(), t1 = ty.t1(), e0 = ty.e0();
    if (t < t0 || t > e0 + 0.3) continue;
    shown = true;
    const n = t < e0 ? Math.floor(clamp((t - t0) / (t1 - t0)) * ty.s.length + 0.0001) : Math.max(0, ty.s.length - Math.floor((t - e0) / 0.3 * ty.s.length));
    const s = ty.s.slice(0, n);
    c.globalAlpha = ty.s.startsWith('今天') ? 1 - prog(t, L('a05') + 1.2, L('a05') + 1.9) : 1;
    c.fillStyle = '#f2f2f4'; c.font = `500 ${ph * 0.34}px SansM`; c.fillText(s, x0, ph * 0.52);
    const w = c.measureText(s).width;
    if (t < t1 + 0.6 && Math.floor(t * 2.4) % 2 === 0 || (t > t0 && t < t1)) { c.fillStyle = CORAL; c.fillRect(x0 + w + 6, ph * 0.3, 5, ph * 0.44); }
  }
  // thinking dots after the first send
  const th = win(t, SEND1() + 0.15, L('a03') - 0.3, 0.2, 0.3);
  if (th > 0) {
    c.globalAlpha = 1;
    for (let k = 0; k < 3; k++) {
      const a = 0.35 + 0.65 * Math.max(0, Math.sin(t * 7 - k * 0.9));
      c.fillStyle = `rgba(240,137,106,${a * th})`; c.beginPath(); c.arc(pw * 0.62 + k * 60, ph * 0.52, 14, 0, 7); c.fill();
    }
  }
  if (!shown) { c.globalAlpha = 1; c.fillStyle = 'rgba(255,255,255,0.28)'; c.font = `500 ${ph * 0.26}px SansM`; c.fillText('给 AI 发送消息…', x0, ph * 0.5); }
  slabTex.needsUpdate = true;
}
function drawCorpus(t: number) {
  const c = corpusCanvas.getContext('2d')!, pw = corpusCanvas.width, ph = corpusCanvas.height;
  c.clearRect(0, 0, pw, ph);
  const lines = [
    '今天去超市买了苹果和香蕉，苹果很甜。新出的手机拍照很清楚，手机电池也耐用。',
    '人工智能正在改变世界，人工智能的发展离不开数据。我用手机给你发了张苹果的照片。',
    '这家店的苹果汁很好喝。人工客服说手机明天到。智能音箱能放音乐，也能讲故事。',
    '他把手机放在桌上，桌上还有两个苹果。人工智能会写诗，也会写代码，还会算数学。',
    '周末带孩子去摘苹果，孩子拿着手机拍个不停。智能手机让人工翻译变得更快更方便。',
    '苹果树下有只猫。手机里存着很多人工智能生成的图片，有的很像真的，有的很搞笑。',
  ];
  const sc0 = (t - L('b03')) * 26;
  c.font = '500 64px SansM'; c.textBaseline = 'middle';
  const hiK = prog(t, SG('b03', 1), SG('b03', 1) + 0.6) * (1 - prog(t, L('b05') - 0.4, L('b05') + 0.4));
  lines.forEach((ln, i) => {
    const y = 70 + i * 120;
    let x = 40 - ((sc0 + i * 140) % 400);
    for (const s of [ln + ln]) {
      // draw char by char so we can tint the frequent pairs
      for (let j = 0; j < s.length; j++) {
        const pair = s.slice(j, j + 2);
        const isPair = ['苹果', '手机', '人工', '智能'].includes(pair) || ['苹果', '手机', '人工', '智能'].includes(s.slice(j - 1, j + 1));
        c.fillStyle = isPair ? `rgba(240,137,106,${0.35 + 0.65 * hiK})` : 'rgba(255,255,255,0.32)';
        c.fillText(s[j], x, y); x += 66;
        if (x > pw + 80) break;
      }
    }
  });
  (corpusMat.map as THREE.Texture).needsUpdate = true;
}
function setArc(a: Arc, k: number, op: number) {
  a.m.visible = k > 0.001 && op > 0.01;
  if (!a.m.visible) return;
  const n = Math.floor(a.count * clamp(k) / 36) * 36;
  a.m.geometry.setDrawRange(0, n);
  a.mat.opacity = op * (0.35 + 0.65 * a.w);
}

// ---------------------------------------------------------------- frame
const ov: (() => void)[] = []; // 2D overlay calls queued by the 3D pass
function frame(t: number) {
  ov.length = 0;
  const cs = COVER ? { x: -4.2, y: 0.2, z: -1.0, zoom: 1.55, el: 31, az: 22 } : camAt(t); setCam(cs);
  grid.update(cs.x, Math.min(cs.z, 4), clamp(34 / cs.zoom, 26, 90), 1);

  // ======== chapter 0: input bar → blocks
  {
    const sink = eio(prog(t, L('a05') + 1.4, L('a05') + 2.9));
    slab.visible = t < L('a06');
    slab.position.set(0, -0.17 - sink * 0.5, 0); slabMat.opacity = 1 - prog(t, L('a05') + 1.9, L('a05') + 2.9);
    slabTop.position.set(0, 0.003 - sink * 0.5, 0); slabTop.visible = t < L('a05') + 2.2;
    if (slabTop.visible) drawSlab(t);
    btn.visible = t < L('a06') - 0.2;
    const p1 = prog(t, SEND1(), SEND1() + 0.15) * (1 - prog(t, SEND1() + 0.15, SEND1() + 0.45));
    const p2 = prog(t, SEND2(), SEND2() + 0.15) * (1 - prog(t, SEND2() + 0.15, SEND2() + 0.45));
    btn.position.set(SLAB_W / 2 - 0.75, 0.07 - (p1 + p2) * 0.06 - sink * 0.5, 0);
    const lit = Math.max(win(t, SEND1(), L('a03') - 0.2, 0.1, 0.3), prog(t, SEND2(), SEND2() + 0.1) * (1 - prog(t, L('a05') + 1.2, L('a05') + 2.0)));
    btnMat.emissiveIntensity = 2.0 * lit; btnMat.color.set(lit > 0.05 ? CORAL : '#3a3a40');
    for (const s of [SEND1(), SEND2()]) if (t > s && t < s + 1.0) ov.push(() => {
      const p = proj(new THREE.Vector3(SLAB_W / 2 - 0.75, 0.1, 0)); const k = prog(t, s, s + 0.9);
      g.save(); g.strokeStyle = `rgba(${CORAL_RGB},${(1 - k) * 0.8})`; g.lineWidth = 2; g.beginPath(); g.ellipse(p.x, p.y, 40 + k * 120, (40 + k * 120) * 0.95, 0, 0, 7); g.stroke(); g.restore();
      glow(p.x, p.y, 120, 0.35 * (1 - k));
    });
    const bk = prog(t, L('a05') + 0.25, L('a05') + 1.25);
    beam.visible = bk > 0 && bk < 1; beam.position.set(lerp(-SLAB_W / 2 + 0.6, SLAB_W / 2 - 1.4, eio(bk)), 0.04, 0); beamMat.opacity = Math.sin(bk * Math.PI) * 0.95;
    if (beam.visible) ov.push(() => { const p = proj(beam.position); glow(p.x, p.y, 160, 0.3 * Math.sin(bk * Math.PI)); });

    const rise = eo(prog(t, L('a05') + 1.2, L('a05') + 2.5));
    const cut0 = SG('a06', 0) + 0.55;
    const sep = eio(prog(t, cut0 + 0.6, cut0 + 1.35));
    // question row sinks away when its job is done (after ch5 starts the answer row it stays)
    Q.forEach((q, i) => {
      const h = i < 4 ? SG('a06', i + 1) : SGE('a06', 4) + 0.15;
      const x = lerp(qxTight[i], qx[i], sep);
      const hi = (i === 1 ? win(t, SG('a07', 1), E('a07') + 0.2, 0.2, 0.4) : 0) + win(t, SG('b01', 0) + i * 0.12, SG('b01', 0) + i * 0.12 + 0.6, 0.1, 0.3) * 0.0;
      poseBlock(qb[i], { x, y: lerp(-BH - 0.2, 0, rise) + hop(t, h, 0.5) + hop(t, SG('a07', 0) + 0.2, i === 0 || i === 1 ? 0.35 : 0) + hop(t, L('b01') + 0.3 + i * 0.1, 0.3), z: 0, op: t < L('a05') + 1.1 ? 0 : prog(t, L('a05') + 1.1, L('a05') + 1.6), hi });
    });
    cuts.forEach((m, i) => {
      const c0 = cut0 + i * 0.14; const k = prog(t, c0, c0 + 0.45);
      (m.material as THREE.MeshBasicMaterial).opacity = k > 0 && k < 1 ? Math.pow(1 - k, 1.6) * 0.9 : 0;
      m.visible = k > 0 && k < 1;
      const bxx = qxTight[i] + tkw(Q[i]) / 2;
      m.position.set(lerp(bxx, (qx[i] + tkw(Q[i]) / 2 + qx[i + 1] - tkw(Q[i + 1]) / 2) / 2, sep), BH / 2 + 0.05, 0);
      m.scale.set(1, 0.3 + eo(k) * 0.9, 1);
      if (m.visible) ov.push(() => { const p = proj(m.position); glow(p.x, p.y, 140, (m.material as THREE.MeshBasicMaterial).opacity * 0.4); });
    });
    // a07 seg0: bracket showing where "今天" used to be
    const ka = win(t, SG('a07', 0), SG('a07', 1) + 0.2, 0.25, 0.3);
    if (ka > 0) ov.push(() => {
      const p0 = proj(new THREE.Vector3(qx[0] - 0.5, BH, -BD / 2)), p1 = proj(new THREE.Vector3(qx[1], BH, -BD / 2));
      g.save(); g.globalAlpha = ka; g.strokeStyle = CORAL; g.lineWidth = 2.5;
      const yy = Math.min(p0.y, p1.y) - 60;
      g.beginPath(); g.moveTo(p0.x, p0.y - 20); g.lineTo(p0.x, yy); g.lineTo(p1.x, yy - (p1.y - p0.y) * 0); g.lineTo(p1.x, p1.y - 20); g.stroke(); g.restore();
      txtHalo('“今天”', (p0.x + p1.x) / 2, yy - 16, '700 40px SansB', CORAL, 'center', 1, ka);
      txtHalo('✂', p1.x + 4, p1.y - 34, '700 30px SansB', '#fff', 'center', 0, ka);
    });
    const kb = win(t, SG('a07', 1) + 0.1, E('a07') + 0.6, 0.3, 0.4);
    if (kb > 0) ov.push(() => {
      const p = proj(new THREE.Vector3(qx[1], BH + 0.1, -BD / 2));
      const lx = p.x + 50, ly = p.y - 170;
      g.save(); g.globalAlpha = kb; g.strokeStyle = CORAL; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(p.x, p.y - 10); g.lineTo(lx, ly + 16); g.lineTo(lx + 300 * eo(prog(t, SG('a07', 1) + 0.1, SG('a07', 1) + 0.6)), ly + 16); g.stroke();
      g.fillStyle = CORAL; g.beginPath(); g.arc(p.x, p.y - 10, 4, 0, 7); g.fill(); g.restore();
      txtHalo('“天天”粘在了一起', lx + 6, ly - 4, '700 34px SansB', CORAL, 'left', 1, kb);
      txtHalo('它切词的方式，和人不一样', lx + 6, ly + 52, '500 24px SansM', 'rgba(255,255,255,0.75)', 'left', 1, kb);
    });
    const kn = win(t, SG('a06', 1) - 0.2, L('b02') + 0.5, 0.5, 0.6);
    ov.push(() => txt('分词示例：GPT-4o 分词器（o200k_base）', 72, 96, '500 28px SansM', 'rgba(255,255,255,0.62)', 'left', 1, kn));
    // b01: Token labels under each block
    const kt = win(t, L('b01') + 0.2, L('b03'), 0.4, 0.5);
    if (kt > 0) ov.push(() => {
      Q.forEach((q, i) => {
        const a = kt * prog(t, L('b01') + 0.3 + i * 0.1, L('b01') + 0.6 + i * 0.1);
        const p = proj(new THREE.Vector3(qx[i], 0, BD / 2 + 0.25));
        txtHalo('Token', p.x, p.y + 40, '600 26px BarS', CORAL, 'center', 3, a);
      });
    });
  }

  // ======== chapter 1: glue + split (S1), strawberry (S2)
  {
    const cv = win(t, L('b03') - 0.3, L('b05') + 0.5, 0.8, 0.8);
    corpusMat.opacity = cv * 0.95; corpus.visible = cv > 0.01;
    if (corpus.visible) drawCorpus(t);
    // fuse times: 苹果 at b03 seg2, the others proportional inside b04 seg0
    const b4 = SG('b04', 0), b4e = SGE('b04', 0);
    const fuse = [SG('b03', 2) + 0.1, lerp(b4, b4e, 0.42), lerp(b4, b4e, 0.64), lerp(b4, b4e, 0.85)];
    const away = prog(t, L('d01') + 0.2, L('d01') + 1.6); // S1 blocks leave at chapter 3 (苹果 becomes the hero)
    const flipT = (k: number) => eio(prog(t, L('c01') + 0.5 + k * 0.12, L('c01') + 1.1 + k * 0.12));
    GLUE.forEach((_, i) => {
      const f = fuse[i];
      const appear = prog(t, f - 0.9, f - 0.5);
      const join = eio(prog(t, f - 0.45, f));
      const x = glueX[i];
      const vis = t > f - 0.95;
      for (const s of [0, 1]) {
        const off = (s === 0 ? -1 : 1) * lerp(1.1, 0.5, join);
        poseBlock(glueHalves[i][s], { x: x + off, z: 0.6, y: lerp(1.2, 0, eo(appear)), op: appear * (t < f ? 1 : 0), vis });
      }
      const whole = t >= f;
      const flash = 1 - prog(t, f, f + 0.6);
      poseBlock(glueWhole[i], {
        x, z: 0.6, y: hop(t, f, 0.35) + hop(t, SG('b04', 1), 0.3) + (i === 0 ? 0 : 0), op: whole ? 1 - away : 0, hi: flash > 0.3 ? 1 : 0,
        flip: flipT(i), s: 1 - away * 0.0, vis: whole && away < 1,
      });
      if (whole && flash > 0) ov.push(() => { const p = proj(new THREE.Vector3(x, BH, 0.6)); glow(p.x, p.y, 140, 0.4 * flash); });
    });
    // 疑是地上霜
    const sr = L('b05');
    const crack = SG('b06', 0) + 0.25;
    shu.forEach((b, i) => {
      const a = prog(t, sr + 0.1 + i * 0.12, sr + 0.5 + i * 0.12);
      const hi = i === 4 ? win(t, SG('b05', 1) + 0.4, crack + 0.2, 0.2, 0.1) : 0;
      poseBlock(b, { x: shuX[i], z: 3.3, y: lerp(1.2, 0, eo(a)) + (i === 4 ? hop(t, SG('b05', 1) + 0.6, 0.4) : 0), op: a * (i === 4 && t > crack ? 0 : 1) * (1 - away), hi, flip: i < 4 ? flipT(4 + i) : 0, vis: t > sr });
    });
    const sp = eio(prog(t, crack, crack + 0.6));
    shuHalf.forEach((b, s) => {
      poseBlock(b, { x: shuX[4] + (s === 0 ? -1 : 1) * (0.25 + sp * 0.32), z: 3.3, y: hop(t, crack, 0.25), op: (t > crack ? 1 : 0) * (1 - away), ry: (s === 0 ? 0.12 : -0.12) * sp * (1 - prog(t, crack + 0.6, crack + 1.2)), flip: flipT(8 + s) });
    });
    if (t > crack && t < crack + 0.5) ov.push(() => { const p = proj(new THREE.Vector3(shuX[4], BH, 3.3)); glow(p.x, p.y, 170, 0.5 * (1 - prog(t, crack, crack + 0.5))); });
    const kc = win(t, crack + 0.5, L('b07') + 0.6, 0.4, 0.5);
    if (kc > 0) ov.push(() => {
      const p = proj(new THREE.Vector3(shuX[4] + 0.6, BH + 0.4, 3.3 + BD / 2));
      txtHalo('1 个字 → 2 块', p.x + 90, p.y + 90, '700 38px SansB', CORAL, 'left', 2, kc);
      txtHalo('不常见的字，会被切成更碎的字节', p.x + 90, p.y + 136, '500 24px SansM', 'rgba(255,255,255,0.75)', 'left', 1, kc);
    });

    // strawberry
    const lt = SG('b07', 2) - 0.1;
    const merge = eio(prog(t, L('b08') + 0.25, L('b08') + 1.1));
    const sx0 = S2X - (LETTERS.length * 0.66) / 2 + 0.33;
    letters.forEach((b, i) => {
      const a = prog(t, lt + i * 0.07, lt + 0.35 + i * 0.07);
      const isR = LETTERS[i] === 'r';
      const x = lerp(sx0 + i * 0.66 - 0.0, S2X - 2.6 + 0.26 + i * 0.52, merge);
      poseBlock(b, { x: lerp(x, x, 0), z: 0.4, y: lerp(1.4, 0, eo(a)) + (isR ? hop(t, SG('b07', 3) + 0.05, 0.4) : 0), op: a * (1 - prog(t, L('b08') + 0.9, L('b08') + 1.15)), hi: 0, vis: t > lt && t < L('b08') + 1.2 });
    });
    const sv = t > L('b08') + 0.95;
    const xray = win(t, L('b09') + 0.1, L('c01') + 0.3, 0.4, 0.3);
    poseBlock(straw, { x: S2X, z: 0.4, y: hop(t, L('b08') + 0.95, 0.35), op: sv ? 1 - away : 0, hi: xray > 0.5 ? 1 : 0, flip: flipT(10), vis: sv && away < 1 });
    if (t > L('b08') + 0.95 && t < L('b08') + 1.5) ov.push(() => { const p = proj(new THREE.Vector3(S2X, BH, 0.4)); glow(p.x, p.y, 200, 0.45 * (1 - prog(t, L('b08') + 0.95, L('b08') + 1.5))); });
    const kq = win(t, SG('b07', 1), L('c01') + 0.2, 0.4, 0.5);
    if (kq > 0) ov.push(() => {
      const p = proj(new THREE.Vector3(S2X, BH + 0.8, -BD / 2));
      card(p.x - 300, p.y - 210, 600, 96, kq);
      txt('How many r’s are in strawberry?', p.x, p.y - 150, '500 36px Inter', '#fff', 'center', 0, kq);
    });
    const kx = win(t, L('b08') + 1.2, L('c01') + 0.2, 0.4, 0.4);
    if (kx > 0) ov.push(() => {
      const p = proj(new THREE.Vector3(S2X, 0, 0.4 + BD / 2));
      txtHalo('“ strawberry” = 1 块（编号 101,830）', p.x, p.y + 92, '600 30px SansB', CORAL, 'center', 1, kx);
    });
    const kw = win(t, SG('b09', 1), L('c01') + 0.2, 0.3, 0.4);
    if (kw > 0) ov.push(() => {
      const p = proj(new THREE.Vector3(S2X + 2.6, BH + 0.6, 0));
      card(p.x + 40, p.y - 120, 430, 84, kw);
      txt('strawberry 里有 2 个 r。', p.x + 70, p.y - 66, '600 32px SansB', '#fff', 'left', 0, kw);
      txt('✕', p.x + 420, p.y - 64, '700 36px SansB', CORAL, 'center', 0, kw);
    });
  }

  // ======== chapter 2/3/5/6: vocabulary field
  {
    const revealT = L('c02') + 0.1;
    const on = COVER || t > revealT - 0.2;
    field.visible = on;
    if (on) {
      const fx = cs.x, fz = Math.min(cs.z, FZ0) - 6;
      const RADIUS = clamp(30 / cs.zoom, 36, 60);
      const score5 = eio(prog(t, L('f02') + 0.2, L('f02') + 1.6)) * (1 - eio(prog(t, L('f06') + 0.2, L('f06') + 1.2)));
      const dimCube = (1 - 0.55 * win(t, L('d01'), L('f01') + 1.5, 1.2, 1.5)) * (1 - 0.4 * win(t, L('f07'), L('h01') + 1.5, 1.0, 1.5));
      const ripple = win(t, L('h02'), E('h03'), 0.6, 1.0);
      const look = win(t, SG('c03', 1), E('c03') + 0.4, 0.3, 0.4);
      const LR = rng(Math.floor(t * 8) + 3);
      const lookSet = new Set<number>(); if (look > 0) for (let k = 0; k < 40; k++) lookSet.add(Math.floor(LR() * cells.length));
      for (const c of cells) {
        const dRev = Math.hypot(c.x - 30, c.z + 6);
        const rv = COVER ? 1 : eo(prog(t, revealT + dRev * 0.024, revealT + 0.8 + dRev * 0.024));
        const d = Math.hypot(c.x - fx, c.z - fz);
        const ef = clamp(1 - d / RADIUS);
        let h = 0.32 * rv;
        const near0 = Math.max(0, 1 - Math.hypot(c.x, c.z - FZ0) / 34);
        h += c.n * 1.1 * score5 * near0 + (COVER ? c.n * 0.5 * near0 : 0);
        const wv = ripple > 0 ? Math.exp(-Math.pow(Math.hypot(c.x - 26, c.z + 14) - (t - L('h02')) * 9, 2) / 30) * ripple : 0;
        h += wv * 0.6;
        const sw = rv * Math.min(1, ef * 2.2) + 1e-4;
        dummy.position.set(c.x, 0, c.z); dummy.scale.set(sw, Math.max(h * Math.min(1, ef * 2.2), 1e-3), sw); dummy.updateMatrix();
        field.setMatrixAt(c.idx, dummy.matrix);
        const fade = Math.pow(ef, 1.6);
        const lk = lookSet.has(c.idx) ? look : 0;
        const b = ((0.3 + 0.28 * c.ph) * fade + wv * 0.5 * fade) * dimCube;
        tmpC.setRGB(b + lk * 0.65, b + lk * 0.3, b + lk * 0.2);
        field.setColorAt(c.idx, tmpC);
      }
      field.instanceMatrix.needsUpdate = true; field.instanceColor!.needsUpdate = true;
    }
    // vocab counter
    const kc = win(t, L('c02') + 0.6, E('c03') + 0.4, 0.4, 0.6);
    if (kc > 0) ov.push(() => {
      const n = Math.round(TK.vocab * eo(prog(t, L('c02') + 0.6, L('c02') + 2.6)));
      txtHalo(fmt(n), W / 2, 200, '600 120px BarS', '#ffffff', 'center', 4, kc);
      txtHalo('词表大小 · 积木库里的全部积木', W / 2, 252, '500 28px SansM', 'rgba(255,255,255,0.7)', 'center', 4, kc);
    });
    // id ticker
    const ki = win(t, L('c03') + 0.2, E('c03') + 0.6, 0.4, 0.5);
    if (ki > 0) ov.push(() => {
      const ids = [...Q, ...TK.ansA, ...TK.eat, ...TK.apple, ...TK.more].map((q: Tk) => fmt(q.id));
      const s = ids.join('   ·   ');
      g.save(); g.globalAlpha = ki * 0.7; g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, H * 0.66 - 70, W, 100); g.restore();
      g.save(); g.font = '600 64px BarS'; (g as any).letterSpacing = '4px';
      const off = (t - L('c03')) * 260;
      const y = H * 0.66;
      const grd = g.createLinearGradient(0, 0, W, 0); grd.addColorStop(0, 'rgba(240,137,106,0)'); grd.addColorStop(0.2, CORAL); grd.addColorStop(0.8, CORAL); grd.addColorStop(1, 'rgba(240,137,106,0)');
      g.globalAlpha = ki; g.fillStyle = grd; g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 16; g.fillText(s, W - off, y); g.restore();
    });
  }

  // ======== chapter 3: meaning space
  {
    const cubeA = win(t, L('d03') - 0.2, L('e01') + 1.4, 1.0, 1.2);
    cubeLines.visible = cubeA > 0.01; cubeMat.opacity = cubeA * 0.32;
    // hero block: the 苹果 block from S1 lifts to the front of the cube, then becomes a point in the fruit cluster
    const h0 = L('d01') + 0.2, h1 = L('d01') + 2.2;
    const hk = eio(prog(t, h0, h1));
    const heroFront = CUBE.clone().add(new THREE.Vector3(0, -2.5, 8));
    const fruitTarget = pts[0].to;
    const shrink = eio(prog(t, SG('d03', 1), SG('d03', 1) + 1.3));
    const pHero = new THREE.Vector3(glueX[0], 0, 0.6).lerp(heroFront, hk); pHero.y += Math.sin(Math.PI * hk) * 3;
    pHero.lerp(fruitTarget.clone().setY(fruitTarget.y - BH / 2), shrink);
    poseBlock(hero, { x: pHero.x, y: pHero.y + Math.sin(t * 1.6) * 0.08 * (1 - shrink), z: pHero.z, op: t > h0 && t < SG('d03', 1) + 1.3 ? 1 : 0, s: lerp(1, 0.32, shrink), ry: (1 - hk) * 0.4, vis: t > h0 && t < SG('d03', 1) + 1.3 });
    const kv = win(t, L('d02') + 0.2, SG('d03', 1) + 0.4, 0.3, 0.4);
    if (kv > 0) ov.push(() => {
      const p = proj(heroFront.clone().add(new THREE.Vector3(1.2, 0.8, 0)));
      const nums = ['0.021', '-0.317', '0.884', '0.093', '-0.552', '0.146', '-0.078', '0.630', '-0.205', '0.411'];
      const n = Math.floor(clamp((t - L('d02') - 0.3) / 1.6) * nums.length);
      const s = '[ ' + nums.slice(0, n).join(',  ') + (n === nums.length ? ',  …… ]' : '');
      card(p.x - 20, p.y - 76, 980, 112, kv);
      txt('苹果  →', p.x + 10, p.y - 38, '700 30px SansB', CORAL, 'left', 1, kv);
      txt(s, p.x + 10, p.y + 12, '500 28px Inter', '#fff', 'left', 0, kv);
    });
    const kId = win(t, L('d01') + 0.6, L('d02') + 0.2, 0.3, 0.3);
    if (kId > 0) ov.push(() => {
      const p = proj(heroFront.clone().add(new THREE.Vector3(0, BH + 0.4, 0)));
      txtHalo('编号 32,176 ≠ 意思', p.x, p.y - 30, '700 36px SansB', '#fff', 'center', 2, kId);
    });
    // points fly from the field into clusters
    const fly0 = L('d04') - 0.2;
    pts.forEach((pt, i) => {
      const t0 = i === 0 ? SG('d03', 1) + 1.25 : fly0 + pt.delay * 2.2 + (pt.cl < 0 ? 0.6 : 0);
      const k = eio(prog(t, t0, t0 + 1.2));
      const out = prog(t, L('e01') + 0.2 + pt.delay * 0.6, L('e01') + 1.4 + pt.delay * 0.6);
      pt.m.visible = t > t0 && out < 1;
      if (!pt.m.visible) return;
      const p = i === 0 ? pt.to.clone() : pt.from.clone().lerp(pt.to, k);
      if (i !== 0) p.y += Math.sin(Math.PI * k) * 2;
      p.y -= ei(out) * 14;
      pt.m.position.copy(p);
      const clk = pt.cl >= 0 ? win(t, SG('d05', pt.cl) - 0.05, E('d06') + 0.5, 0.3, 0.5) : 0;
      pt.mat.emissiveIntensity = clk * 0.5; pt.mat.color.set(clk > 0.5 ? CORAL : pt.cl >= 0 ? '#e6e6ea' : '#8c8c94');
      pt.mat.opacity = 1 - out;
      pt.m.rotation.set(t * 0.3 + i, t * 0.4 + i, 0);
      if (pt.label) {
        const la = (i === 0 ? 1 : k) * (1 - out) * prog(t, L('d04'), L('d04') + 0.6) * (pt.cl >= 0 ? 0.55 + 0.45 * clk : 1);
        ov.push(() => { const q = proj(p); txtHalo(pt.label!, q.x, q.y - 24, `700 ${clk > 0.5 ? 30 : 24}px SansB`, clk > 0.5 ? CORAL : '#fff', 'center', 1, la); });
      }
    });
    CLUSTERS.forEach((cl, ci) => {
      const a = win(t, SG('d05', ci), E('d06') + 0.5, 0.35, 0.5);
      if (a > 0) ov.push(() => {
        const c = proj(CUBE.clone().add(cl.off));
        const rr = 150 * eo(prog(t, SG('d05', ci), SG('d05', ci) + 0.5));
        g.save(); g.globalAlpha = a; g.strokeStyle = CORAL; g.lineWidth = 2; g.setLineDash([8, 8]); g.beginPath(); g.ellipse(c.x, c.y, rr * 1.15, rr * 0.8, 0, 0, 7); g.stroke(); g.restore();
        txtHalo(cl.name, c.x, c.y - rr * 0.8 - 18, '700 44px SansB', CORAL, 'center', 4, a);
      });
    });
    const kd = win(t, L('d06') + 0.1, L('e01') + 0.6, 0.4, 0.5);
    if (kd > 0) ov.push(() => {
      txtHalo('示意 · 真实模型的坐标有几千到上万个维度', W - 72, 96, '500 28px SansM', 'rgba(255,255,255,0.7)', 'right', 1, kd);
      const dims = Math.round(lerp(3, 4096, eio(prog(t, L('d06') + 0.2, SGE('d06', 0)))));
      txtHalo(`${fmt(dims)} 维`, W - 72, 170, '600 64px BarS', CORAL, 'right', 2, kd);
    });
  }

  // ======== chapter 4: attention
  {
    const gone = prog(t, L('f01') - 0.2, L('f01') + 1.0);
    const r1a = (i: number) => prog(t, L('e02') + 0.05 + i * 0.12, L('e02') + 0.4 + i * 0.12);
    const r2a = (i: number) => prog(t, L('e03') + 0.05 + i * 0.12, L('e03') + 0.4 + i * 0.12);
    // e01: lone 苹果 at the centre, slides into row1's last slot
    const lone = prog(t, L('e01') + 1.6, L('e01') + 2.2);
    const toSlot = eio(prog(t, L('e02') + 0.2, L('e02') + 0.9));
    row1.forEach((b, i) => {
      const isApple = i === 4;
      const a = isApple ? lone : r1a(i);
      const x = isApple ? lerp(S5X, r1x[4], toSlot) : r1x[i];
      const z = isApple ? lerp(1.4, R1Z, toSlot) : R1Z;
      const hi = isApple ? win(t, SG('e01', 1), L('e02') + 0.3, 0.2, 0.3) + win(t, SG('e02', 1) - 0.1, L('e03'), 0.2, 0.3) : (i === 1 ? win(t, SG('e02', 1) - 0.1, L('e03'), 0.2, 0.3) : 0);
      const look = hop(t, L('e04') + 0.3 + i * 0.55, 0.25);
      poseBlock(b, { x, z, y: lerp(1.0, 0, eo(a)) + look - ei(gone) * 1.2, op: a * (1 - gone), hi: hi > 0.5 ? 1 : 0, vis: a > 0 && gone < 1 });
    });
    row2.forEach((b, i) => {
      const a = r2a(i);
      const hi = i === 0 ? win(t, SG('e03', 0) + 0.8, L('e04'), 0.2, 0.3) : (i === 4 || i === 1 ? win(t, SG('e03', 0) + 1.2, L('e04'), 0.2, 0.3) : 0);
      const look = hop(t, L('e04') + 0.3 + i * 0.55, 0.25);
      poseBlock(b, { x: r2x[i], z: R2Z, y: lerp(1.0, 0, eo(a)) + look - ei(gone) * 1.2, op: a * (1 - gone), hi: hi > 0.5 ? 1 : 0, vis: a > 0 && gone < 1 });
    });
    const k1 = eio(prog(t, L('e02') + 0.9, L('e02') + 1.8)), o1 = win(t, L('e02') + 0.9, L('e04') + 0.2, 0.2, 0.5);
    arcs1.forEach((a, i) => setArc(a, k1, o1));
    const k2 = eio(prog(t, L('e03') + 1.0, L('e03') + 1.9)), o2 = win(t, L('e03') + 1.0, L('e04') + 0.2, 0.2, 0.5);
    arcs2.forEach((a) => setArc(a, k2, o2));
    for (const { arc, j } of arcsAll) {
      const t0 = L('e04') + 0.3 + j * 0.55;
      setArc(arc, eio(prog(t, t0, t0 + 0.6)), win(t, t0, E('e06') + 0.8, 0.2, 0.6) * (1 - gone));
    }
    const tag = (txtS: string, x: number, z: number, a: number) => { if (a > 0) ov.push(() => { const p = proj(new THREE.Vector3(x, BH, z + BD / 2)); txtHalo(txtS, p.x, p.y + 64, '700 34px SansB', CORAL, 'center', 2, a); }); };
    tag('→ 水果', r1x[4], R1Z, win(t, SG('e02', 1), L('e04') + 0.3, 0.25, 0.4));
    tag('→ 公司', r2x[0], R2Z, win(t, SGE('e03', 0) - 0.5, L('e04') + 0.3, 0.25, 0.4));
    // e05: mini "meaning compass" next to each 苹果
    const kc = win(t, L('e05') + 0.1, E('e06') + 0.4, 0.4, 0.5);
    if (kc > 0) ov.push(() => {
      for (const [x, z, toward] of [[r1x[4], R1Z, 0], [r2x[0], R2Z, 1]] as [number, number, number][]) {
        const p = proj(new THREE.Vector3(x, BH, z));
        const cx = p.x + (toward ? -40 : 40), cy = p.y - (toward ? -150 : 230);
        card(cx - 130, cy - 90, 260, 180, kc * 0.95);
        const pts2 = [['水果', -78, -46], ['公司', 78, -46], ['动物', 0, 58]] as [string, number, number][];
        for (const [s, dx, dy] of pts2) txt(s, cx + dx, cy + dy, '600 26px SansB', 'rgba(255,255,255,0.65)', 'center', 0, kc, 'middle');
        const mv = eio(prog(t, SG('e05', 1), SG('e05', 1) + 0.9));
        const [tx, ty] = toward ? [78, -12] : [-78, -12];
        const dx = lerp(0, tx, mv), dy = lerp(14, ty, mv);
        glow(cx + dx, cy + dy, 40, 0.5 * kc);
        g.save(); g.globalAlpha = kc; g.fillStyle = CORAL; g.beginPath(); g.arc(cx + dx, cy + dy, 9, 0, 7); g.fill(); g.restore();
      }
    });
    const kt = win(t, L('e06') + 0.1, L('f01') + 0.4, 0.4, 0.5);
    bigWordQ('ATTENTION', kt, 90 - 30 * prog(t, L('e06'), L('f01')), 290, 230);
  }

  // ======== chapter 5: guess the next block
  {
    const pick2 = SG('f05', 1) - 0.15; // roulette lands on 今天
    peaks.forEach((p, i) => {
      const grow = eo(prog(t, L('f03') + 0.1 + i * 0.07, L('f03') + 1.0 + i * 0.07));
      const fall = eio(prog(t, L('f06') + 0.2, L('f06') + 1.0));
      p.visible = t > L('f02') && fall < 1 && !(i === 0 && t > appT[0] - 0.05);
      p.scale.set(1, 0.32 + CAND[i].p * 15 * grow * (1 - fall), 1);
      peakMats[i].emissiveIntensity = i === 0 ? 0.35 * grow : (i === 1 ? 0.5 * prog(t, pick2, pick2 + 0.2) : 0);
      peakMats[i].color.set(i === 0 || (i === 1 && t > pick2) ? CORAL : '#e4e4e8');
    });
    const kl = win(t, L('f03') + 0.6, L('f06') + 0.4, 0.4, 0.4);
    if (kl > 0) ov.push(() => {
      CAND.forEach((c, i) => {
        const p = proj(candPos[i].clone().setY(peaks[i].scale.y + 0.4));
        const hot = i === 0 || (i === 1 && t > pick2);
        if (hot) glow(p.x, p.y + 20, 150, 0.3 * kl);
        txtHalo(c.s, p.x, p.y - 50, `700 ${i === 0 ? 56 : 40}px SansB`, hot ? CORAL : '#fff', 'center', 1, kl);
        txtHalo(`${Math.round(c.p * 100)}%`, p.x, p.y - 6, `600 ${i === 0 ? 44 : 34}px BarS`, hot ? CORAL : 'rgba(255,255,255,0.75)', 'center', 2, kl);
      });
      txtHalo('概率为示意', W - 72, 96, '500 26px SansM', 'rgba(255,255,255,0.6)', 'right', 1, kl);
    });
    // selector ring: sits on 晴, then spins through candidates and lands on 今天
    const rOn = win(t, L('f04') + 0.2, L('f06') + 0.3, 0.3, 0.3);
    ring.visible = rOn > 0.01;
    if (ring.visible) {
      let idx = 0;
      const sp0 = SG('f05', 0) + 0.2;
      if (t > sp0) {
        const seq = [0, 2, 4, 1, 3, 5, 0, 2, 1, 3, 0, 1];
        const k = clamp((t - sp0) / (pick2 - sp0));
        idx = seq[Math.min(seq.length - 1, Math.floor(Math.pow(k, 0.6) * seq.length))];
        if (t >= pick2) idx = 1;
      }
      ring.position.copy(candPos[idx]).setY(0.05); (ring.material as THREE.MeshBasicMaterial).opacity = rOn;
      ring.scale.setScalar(1 + 0.15 * Math.sin(t * 8));
      ov.push(() => { const p = proj(ring.position); glow(p.x, p.y, 110, 0.35 * rOn); });
    }
    const kAsk = win(t, L('f06'), L('f07') + 0.4, 0.3, 0.4);
      if (kAsk > 0) ov.push(() => {
        const pa = proj(new THREE.Vector3(qEnd + 0.4, 0, BD / 2)), pb = proj(new THREE.Vector3(qEnd + 0.4, 0, BZ + BD / 2));
        txtHalo('第一次问', pa.x - 40, pa.y + 50, '700 32px SansB', '#fff', 'right', 2, kAsk);
        txtHalo('再问一次', pb.x - 40, pb.y + 50, '700 32px SansB', CORAL, 'right', 2, kAsk);
      });
    // answer row A
    const sink6 = (x: number) => { // context-window overflow: blocks left of the frame fall away
      if (t < L('g04')) return 0;
      const left = frameX(t) - FRAME_LEN / 2;
      return x < left ? prog(t, fallStart(x), fallStart(x) + 0.7) : 0;
    };
    ab.forEach((b, i) => {
      const t0 = appT[i]; if (t0 > 1e8) { b.grp.visible = false; return; }
      let from: THREE.Vector3;
      if (i === 0) from = candPos[0].clone().setY(0.32 + CAND[0].p * 15);
      else { const R = rng(i * 13 + 1); from = new THREE.Vector3(ax[i] + (R() - 0.5) * 18, 0.3, FZ0 - 2 - R() * 12); }
      const fl = i === 0 ? 0.7 : (t0 > L('g04') ? 0.3 : 0.42);
      const k = eio(prog(t, t0 - fl, t0));
      const to = new THREE.Vector3(ax[i], 0, 0);
      const p = from.clone().lerp(to, k); p.y += Math.sin(Math.PI * k) * (i === 0 ? 3.0 : 1.8);
      p.y -= Math.sin(Math.PI * prog(t, t0, t0 + 0.3)) * 0.1;
      const fall = sink6(ax[i]);
      const scan = win(t, scanT(ax[i]) - 0.05, scanT(ax[i]) + 0.35, 0.05, 0.2);
      poseBlock(b, { x: p.x, y: p.y - ei(fall) * 3, z: p.z, s: lerp(0.6, 1, eo(k)), ry: (1 - k) * 0.6, op: 1 - fall, hi: (i === 0 && t < appT[0] + 1.2) || scan > 0.5 ? 1 : 0, vis: t > t0 - fl && fall < 1 });
      if (t > t0 && t < t0 + 0.45 && t0 < L('g04')) ov.push(() => { const q = proj(b.grp.position); glow(q.x, q.y, 120, 0.42 * (1 - prog(t, t0, t0 + 0.45))); });
      if (scan > 0.05) ov.push(() => { const q = proj(b.grp.position); glow(q.x, q.y, 90, 0.35 * scan); });
    });
    srcFlash.forEach((m, j) => {
      const i = j + 1; const t0 = appT[i] - 0.42 - 0.18; const k = prog(t, t0, t0 + 0.3);
      m.visible = k > 0 && k < 1 && i < 10;
      if (!m.visible) return;
      const R = rng(i * 13 + 1); m.position.set(ax[i] + (R() - 0.5) * 18, 0, FZ0 - 2 - R() * 12);
      m.scale.set(1, 0.3 + Math.sin(Math.PI * k) * 4, 1);
    });
    // branch B ("ask again")
    const bGone = prog(t, L('f07') + 0.1, L('f07') + 0.9);
    bb.forEach((b, i) => {
      const t0 = i === 0 ? appT[0] + 0.1 : (i < 4 ? appT[i] + 0.1 : 1e9);
      const k = eio(prog(t, t0 - 0.5, t0));
      const from = i === 0 ? candPos[1].clone().setY(0.32 + CAND[1].p * 15) : new THREE.Vector3(bx[i] - 6, 0.3, FZ0 - 4);
      const p = from.clone().lerp(new THREE.Vector3(bx[i], 0, BZ), k); p.y += Math.sin(Math.PI * k) * 2.4;
      poseBlock(b, { x: p.x, y: p.y - ei(bGone) * 1.2, z: p.z, s: lerp(0.6, 1, eo(k)), op: (1 - bGone) * 0.92, vis: t > t0 - 0.5 && bGone < 1 });
    });
    // f07 "carry the whole sentence"
    const kla = win(t, SG('f07', 2) - 0.05, SGE('f07', 2) + 0.5, 0.1, 0.4);
    lookArcs.forEach((a) => setArc(a, eio(prog(t, SG('f07', 2) - 0.05, SG('f07', 2) + 0.5)), kla));
    if (L('f01') < t && t < L('f02') + 1) bigWordQ('NEXT TOKEN', win(t, L('f01'), L('f08'), 0.6, 0.8), 80, 980, 220); else bigWordQ('NEXT TOKEN', win(t, L('f01'), L('f08'), 0.6, 0.8), 80 - 30 * prog(t, L('f01'), L('f08')), 980, 220);
  }

  // ======== chapter 6: context window, hallucination, billing
  {
    const fa = win(t, SG('g03', 1) - 0.2, L('g05') + 0.2, 0.4, 0.5);
    frame6.visible = fa > 0.01;
    if (frame6.visible) {
      frame6.position.set(frameX(t), 0.82, 0); frame6Mat.opacity = fa; frame6Glass.opacity = fa * 0.1;
      ov.push(() => {
        const p = proj(new THREE.Vector3(frameX(t) - FRAME_LEN / 2 + 0.2, 1.7, -1.05));
        txtHalo('上下文窗口', p.x + 10, p.y - 18, '700 36px SansB', CORAL, 'left', 3, fa);
        txtHalo('一次能看的积木有上限', p.x + 10, p.y + 22, '500 24px SansM', 'rgba(255,255,255,0.7)', 'left', 1, fa * prog(t, SG('g03', 1), SG('g03', 1) + 0.6));
      });
    }
    // hallucination: "most plausible" vs "correct"
    const ge = rowEndAt(L('g05'));
    const hp = [new THREE.Vector3(ge - 6, 0, FZ0 - 2 * CELL), new THREE.Vector3(ge - 1.4, 0, FZ0 - 3 * CELL)];
    const hk = eo(prog(t, L('g05') + 0.6, L('g05') + 1.6));
    const hk2 = eo(prog(t, L('g06') + 0.3, L('g06') + 1.8));
    const hOut = prog(t, L('g08') - 0.2, L('g08') + 0.6);
    hallu.forEach((m, i) => {
      m.visible = hk > 0 && hOut < 1;
      m.position.copy(hp[i]); m.scale.set(1.3, (0.3 + (i === 0 ? 4.2 * hk + 1.8 * hk2 : 1.2 * hk)) * (1 - hOut) + 0.01, 1.3);
      halluMat[i].emissiveIntensity = i === 0 ? 0.35 * hk : 0;
    });
    const kh = win(t, L('g05') + 1.0, L('g08') - 0.1, 0.4, 0.4);
    if (kh > 0) ov.push(() => {
      for (let i = 0; i < 2; i++) {
        const p = proj(hp[i].clone().setY(hallu[i].scale.y + 0.3));
        txtHalo(i === 0 ? '最像的' : '对的', p.x, p.y - 30, `700 ${i === 0 ? 44 : 36}px SansB`, i === 0 ? CORAL : '#fff', 'center', 2, kh);
      }
    });
    const kn = win(t, SG('g07', 1) - 0.1, L('g08') + 0.1, 0.25, 0.4);
    if (kn > 0) ov.push(() => { txtHalo('像  ≠  对', W * 0.74, H * 0.42, '700 96px SansB', '#fff', 'center', 10, kn); });
    // billing: coins + counter; the scan light runs along the row
    const ca = win(t, L('g08') + 0.2, L('h01') + 1.0, 0.4, 0.8);
    coins.visible = ca > 0.01;
    let nCoins = 0;
    if (coins.visible) {
      const vis = ab.map((b, i) => (appT[i] < 1e8 && b.grp.visible ? ax[i] : null)).filter((x) => x !== null) as number[];
      nCoins = Math.min(MAXCOIN, vis.filter((x) => t > scanT(x) + 0.1).length + Math.round(5 * prog(t, L('g09'), L('g09') + 0.5)));
      const base = new THREE.Vector3(rowEndAt(L('g08')) + 1.6, 0, 2.4);
      for (let i = 0; i < MAXCOIN; i++) {
        const on = i < nCoins;
        dummy.position.set(base.x + (i % 2) * 0.05, 0.06 + i * 0.115, base.z); dummy.rotation.set(0, i * 0.5, 0);
        const s = on ? ca : 0.0001; dummy.scale.set(s, s, s); dummy.updateMatrix(); coins.setMatrixAt(i, dummy.matrix);
      }
      coins.instanceMatrix.needsUpdate = true;
    }
    const km = win(t, L('g08') + 0.3, L('h01') + 0.6, 0.4, 0.5);
    if (km > 0) ov.push(() => {
      card(W - 470, 60, 400, 150, km);
      txt('本次对话', W - 440, 104, '500 24px SansM', 'rgba(255,255,255,0.6)', 'left', 1, km);
      txt(`${fmt(Q.length)}`, W - 440, 178, '600 64px BarS', '#fff', 'left', 2, km);
      txt('输入', W - 382, 178, '500 24px SansM', 'rgba(255,255,255,0.6)', 'left', 1, km);
      txt(`${fmt(nCoins)}`, W - 250, 178, '600 64px BarS', CORAL, 'left', 2, km);
      txt('输出 Token', W - 180, 178, '500 24px SansM', 'rgba(255,255,255,0.6)', 'left', 1, km);
    });
    // g10: comparison cards
    const kk = win(t, L('g10') + 0.1, L('h01') + 0.5, 0.4, 0.5);
    if (kk > 0) ov.push(() => {
      const rows: [string, number, number][] = [['今天天气怎么样？', 8, 5], ['人工智能', 4, 2], ['疑是地上霜', 5, 6]];
      const x0 = 120, y0 = 290;
      card(x0 - 40, y0 - 70, 760, 340, kk);
      txt('同样几个字，块数不一样', x0, y0 - 18, '700 30px SansB', '#fff', 'left', 1, kk);
      rows.forEach(([s, ch, tk], i) => {
        const a = kk * prog(t, L('g10') + 0.3 + i * 0.35, L('g10') + 0.7 + i * 0.35);
        const y = y0 + 60 + i * 70;
        txt(s, x0, y, '500 32px SansM', '#fff', 'left', 1, a);
        txt(`${ch} 字`, x0 + 360, y, '600 34px BarS', 'rgba(255,255,255,0.7)', 'left', 1, a);
        txt('→', x0 + 450, y, '600 34px BarS', 'rgba(255,255,255,0.5)', 'left', 0, a);
        txt(`${tk} 块`, x0 + 510, y, '600 40px BarS', CORAL, 'left', 1, a);
      });
      txt('以 GPT-4o 分词器为例；不同模型切法、价格都不同', x0, y0 + 250, '500 22px SansM', 'rgba(255,255,255,0.55)', 'left', 1, kk);
    });
  }

  // ======== chapter 7: overview + many conversations at once
  {
    const ga = win(t, SG('h03', 0) - 0.3, DUR, 0.6, 1.0);
    ghosts.visible = ga > 0.01;
    if (ghosts.visible) {
      const t0 = SG('h03', 0) - 0.3;
      ghostRows.forEach((gr, ri) => {
        const n = Math.floor(clamp((t - t0 - gr.t0) * gr.rate, 0, GLEN));
        for (let k = 0; k < GLEN; k++) {
          const id = ri * GLEN + k;
          const on = k < n;
          dummy.position.set(gr.x + k * 1.05, 0.25 + (on && k === n - 1 ? 0.15 : 0), gr.z); dummy.rotation.set(0, 0, 0);
          const s = on ? ga : 0.0001; dummy.scale.set(s, s, s); dummy.updateMatrix(); ghosts.setMatrixAt(id, dummy.matrix);
          const fresh = on && k >= n - 1;
          tmpC.set(fresh ? CORAL : '#d8d8de'); ghosts.setColorAt(id, tmpC);
        }
      });
      ghosts.instanceMatrix.needsUpdate = true; ghosts.instanceColor!.needsUpdate = true;
    }
  }

  // ---------------- compose
  background();
  bigWordQ('TOKEN', win(t, L('b01'), L('b03'), 0.8, 0.8), 90 - 40 * prog(t, L('b01'), L('b03')), 300, 260);
  for (const f of bg2d) f(); bg2d.length = 0;
  r.setClearColor(0, 0); r.render(sc, cam);
  g.globalAlpha = 1; g.drawImage(glc, 0, 0);
  if (COVER) { vignette(); coverText(); grain(t, 6); return; }
  for (const f of ov) f();
  vignette();
  chapterTag(t);
  subtitles(t);
  endCard(t);
  grain(t, 8);
  const fin = prog(t, 0, 0.7) * (1 - prog(t, DUR - 0.8, DUR));
  if (fin < 1) { g.fillStyle = `rgba(0,0,0,${1 - fin})`; g.fillRect(0, 0, W, H); }
}
const bg2d: (() => void)[] = [];
function coverText() {
  // dark wash on the left so the title reads, block row stays on the right
  const lg = g.createLinearGradient(0, 0, W * 0.62, 0); lg.addColorStop(0, 'rgba(8,8,10,0.92)'); lg.addColorStop(0.55, 'rgba(8,8,10,0.55)'); lg.addColorStop(1, 'rgba(8,8,10,0)');
  g.fillStyle = lg; g.fillRect(0, 0, W, H);
  const x = 96;
  g.save(); g.font = '700 38px SansB'; const tw = g.measureText('“今天”被切成了两半').width + 48; g.fillStyle = CORAL; g.beginPath(); (g as any).roundRect(x, 118, tw, 68, 10); g.fill(); g.restore();
  txt('“今天”被切成了两半', x + tw / 2, 166, '700 38px SansB', '#141414', 'center', 0);
  const big = (s: string, y: number, col = '#fff') => {
    g.save(); g.font = '900 124px SansK'; (g as any).letterSpacing = '4px'; g.textAlign = 'left';
    g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 24; g.shadowOffsetY = 6; g.fillStyle = col; g.fillText(s, x - 6, y); g.restore();
  };
  big('AI 是怎么', 340); big('回答你的？', 490, CORAL);
  txt('Token · 词元 · 一次讲透', x, 580, '700 44px SansB', 'rgba(255,255,255,0.85)', 'left', 6);
}
function bigWordQ(s: string, a: number, x: number, y: number, size: number) { if (a > 0.005) bg2d.push(() => bigWord(s, a, x, y, size)); }

// context window frame follows the row end once g04 starts
function frameX(t: number) { const e = rowEndAt(Math.min(t, E('g04') + 0.3)); return Math.max(e - FRAME_LEN / 2 + 0.3, rowEndAt(L('g03')) - FRAME_LEN / 2 + 0.3); }
function fallStart(x: number) {
  // the moment the frame's left edge passes x
  let lo = L('g04'), hi = E('g04') + 0.4;
  if (frameX(hi) - FRAME_LEN / 2 < x) return 1e9;
  for (let k = 0; k < 20; k++) { const m = (lo + hi) / 2; if (frameX(m) - FRAME_LEN / 2 > x) hi = m; else lo = m; }
  return hi;
}
// billing scan: light runs along the visible part of the row during g09
function scanT(x: number) { const a = L('g09') + 0.1, b = SGE('g09', 2); const x0 = frameX(b) - FRAME_LEN / 2 - 2, x1 = rowEndAt(b); return lerp(a, b, clamp((x - x0) / (x1 - x0))); }

const CH_NAMES: Record<string, string> = { c1: '切积木', c2: '编号', c3: '意思空间', c4: '注意力', c5: '猜下一块', c6: '三个怪现象' };
function chapterTag(t: number) {
  const ids = Object.keys(CH_NAMES);
  ids.forEach((id, i) => {
    const a = TL.chapters[id]; const b = TL.chapters['c' + (parseInt(id[1]) + 1)] ?? DUR;
    const al = win(t, a - 0.2, Math.min(a + 6, b - 0.2), 0.5, 0.8);
    if (al <= 0) return;
    const sl = eo(prog(t, a - 0.2, a + 0.6));
    txt(String(i + 1).padStart(2, '0'), 72, H - 170 - (1 - sl) * 10, '600 64px BarS', CORAL, 'left', 2, al);
    txt(CH_NAMES[id], 150, H - 178 - (1 - sl) * 10, '700 34px SansB', '#fff', 'left', 4, al);
    g.save(); g.globalAlpha = al; g.fillStyle = CORAL; g.fillRect(150, H - 166, 46 * sl, 3); g.restore();
  });
}
function subtitles(t: number) {
  for (const s of SUBS) {
    if (t < s.a - 0.12 || t > s.b + 0.12) continue;
    subtitleDraw(s.s, Math.min(prog(t, s.a - 0.12, s.a + 0.06), 1 - prog(t, s.b - 0.04, s.b + 0.12)));
  }
}
function endCard(t: number) {
  const a = eio(prog(t, E('h04') + 0.3, E('h04') + 1.3));
  if (a <= 0) return;
  g.save(); g.globalAlpha = a * 0.62; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.restore();
  const y = H / 2 - 40;
  txt('AI 回答你的那几秒里', W / 2, y - 40, '700 64px SansB', '#ffffff', 'center', 4, a);
  txt('到底发生了什么？', W / 2, y + 50, '700 64px SansB', '#ffffff', 'center', 4, a);
  g.save(); g.globalAlpha = a; g.strokeStyle = 'rgba(240,137,106,0.8)'; g.lineWidth = 1.5;
  const lw = 160 * eo(prog(t, E('h04') + 0.8, E('h04') + 1.8));
  g.beginPath(); g.moveTo(W / 2 - 40 - lw, y + 112); g.lineTo(W / 2 - 40, y + 112); g.moveTo(W / 2 + 40, y + 112); g.lineTo(W / 2 + 40 + lw, y + 112); g.stroke(); g.restore();
  txt('TOKEN · 词元', W / 2, y + 124, '500 30px BarM', CORAL, 'center', 8, a * prog(t, E('h04') + 0.9, E('h04') + 1.6));
  txt('画面中的概率、坐标位置为示意；分词结果来自 GPT-4o 分词器（o200k_base）', W / 2, H - 70, '500 22px SansM', 'rgba(255,255,255,0.5)', 'center', 1, a * prog(t, E('h04') + 1.2, E('h04') + 2.0));
}

// ---------------------------------------------------------------- boot
const errs: string[] = [];
(window as any).__errors = () => errs.splice(0);
(window as any).__frame = (t: number, q = 0.93) => { try { frame(t); } catch (e: any) { errs.push(String(e?.stack ?? e)); } return out.toDataURL('image/jpeg', q); };
import { out } from '@engine/core';
(async () => {
  await loadFonts();
  TL = await (await fetch('/film/data/timeline.json')).json();
  TK = await (await fetch('/film/tokens.json')).json();
  for (const l of TL.lines) LN[l.id] = l;
  DUR = TL.duration;
  (window as any).__duration = DUR;
  buildSubs();
  buildScene();
  buildKeys();
  frame(parseFloat(new URLSearchParams(location.search).get('t') ?? (COVER ? '24.6' : '20')));
  (window as any).__ready = true;
})().catch((e) => { errs.push(String(e?.stack ?? e)); (window as any).__ready = true; });

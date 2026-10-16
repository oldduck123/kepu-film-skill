// Engine core for kepu-film (blockwise style): renderer, isometric camera, lights, block factory, 2D overlay helpers.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const W = 1920, H = 1080;
export const CORAL = '#F0896A';
export const CORAL_RGB = '240,137,106';
const F = '/fonts/';

export const out = document.getElementById('c') as HTMLCanvasElement;
out.width = W; out.height = H;
export const g = out.getContext('2d', { willReadFrequently: true })!;
export const glc = document.createElement('canvas'); glc.width = W; glc.height = H;
export const r = new THREE.WebGLRenderer({ canvas: glc, antialias: true, preserveDrawingBuffer: true, alpha: true });
r.setPixelRatio(1); r.setSize(W, H, false);
r.outputColorSpace = THREE.SRGBColorSpace;
r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 1.05;
r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;

// ---------------------------------------------------------------- math
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const prog = (t: number, a: number, b: number) => (b <= a ? (t >= a ? 1 : 0) : clamp((t - a) / (b - a)));
export const eio = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const eo = (x: number) => 1 - Math.pow(1 - x, 3);
export const ei = (x: number) => x * x * x;
export const backOut = (x: number) => { const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
/** 0→1→0 window: fades in over [a, a+fi], out over [b-fo, b]. */
export const win = (t: number, a: number, b: number, fi = 0.4, fo = 0.4) => Math.min(prog(t, a, a + fi), 1 - prog(t, b - fo, b));
export const hop = (t: number, at: number, h = 0.5, d = 0.42) => (t > at && t < at + d ? Math.sin(Math.PI * (t - at) / d) * h : 0);
export function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
export const fmt = (n: number) => n.toLocaleString('en-US');

export async function loadFonts() {
  const defs: [string, string][] = [['SansK', 'NotoSansSC-Black.otf'], ['SansB', 'NotoSansSC-Bold.otf'], ['SansM', 'NotoSansSC-Medium.otf'],
    ['BarL', 'BarlowCondensed-Light.ttf'], ['BarM', 'BarlowCondensed-Medium.ttf'], ['BarS', 'BarlowCondensed-SemiBold.ttf'], ['Inter', 'Inter.ttf']];
  await Promise.all(defs.map(async ([fam, file]) => { const f = new FontFace(fam, `url(${F}${file})`); await f.load(); (document as any).fonts.add(f); }));
}

// ---------------------------------------------------------------- scene, camera, lights
export const sc = new THREE.Scene();
export const cam = new THREE.OrthographicCamera(-8 * W / H, 8 * W / H, 8, -8, -600, 600);
sc.add(new THREE.HemisphereLight(0xffffff, 0x2a2a30, 1.25));
export const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 6; key.shadow.bias = -0.0008;
{
  const s = key.shadow.camera as THREE.OrthographicCamera; s.left = -26; s.right = 26; s.top = 26; s.bottom = -26; s.near = 0.1; s.far = 140;
}
sc.add(key, key.target);
const rim = new THREE.DirectionalLight(0xffe6dc, 0.55); rim.position.set(-20, 10, -14); sc.add(rim);
const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.ShadowMaterial({ opacity: 0.42 }));
shadowPlane.rotation.x = -Math.PI / 2; shadowPlane.receiveShadow = true; sc.add(shadowPlane);

export type CamState = { x: number; y: number; z: number; zoom: number; el: number; az: number };
export const camTarget = new THREE.Vector3();
export function setCam(c: CamState) {
  const el = c.el * Math.PI / 180, az = c.az * Math.PI / 180;
  camTarget.set(c.x, c.y, c.z);
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  cam.position.copy(camTarget).addScaledVector(dir, 200);
  cam.up.set(0, 1, 0); cam.lookAt(camTarget);
  cam.zoom = c.zoom; cam.updateProjectionMatrix();
  // shadow frustum follows the view and grows when zoomed out
  const s = key.shadow.camera as THREE.OrthographicCamera; const ext = clamp(14 / c.zoom, 14, 70);
  if (Math.abs(s.right - ext) > 0.5) { s.left = -ext; s.right = ext; s.top = ext; s.bottom = -ext; s.updateProjectionMatrix(); }
  key.position.copy(camTarget).add(new THREE.Vector3(-18, 40, 24)); key.target.position.copy(camTarget); key.target.updateMatrixWorld();
}

// faint floor grid: built in tiles so it fades around the camera target (vertex colours are rebuilt rarely)
export const grid = (() => {
  const step = 1.4, R = 140;
  const pos: number[] = [];
  for (let i = -R; i <= R; i += step) {
    for (const [a, b] of [[[i, -R], [i, R]], [[-R, i], [R, i]]] as number[][][]) {
      const N = 100;
      for (let k = 0; k < N; k++) {
        pos.push(lerp(a[0], b[0], k / N) + 30, 0.002, lerp(a[1], b[1], k / N));
        pos.push(lerp(a[0], b[0], (k + 1) / N) + 30, 0.002, lerp(a[1], b[1], (k + 1) / N));
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const col = new Float32Array(pos.length);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  sc.add(m);
  let last = new THREE.Vector2(1e9, 1e9), lastR = -1;
  return {
    update(fx: number, fz: number, radius: number, k = 1) {
      if (Math.hypot(fx - last.x, fz - last.y) < 0.6 && Math.abs(radius - lastR) < 0.5 && k === 1) return;
      last.set(fx, fz); lastR = radius;
      for (let i = 0; i < pos.length; i += 3) {
        const d = Math.hypot(pos[i] - fx, pos[i + 2] - fz);
        const c = 0.15 * k * clamp(1 - d / radius);
        col[i] = col[i + 1] = col[i + 2] = c;
      }
      geo.attributes.color.needsUpdate = true;
    },
  };
})();

// ---------------------------------------------------------------- blocks
export const BH = 0.62, BD = 1.25, GAP = 0.42;
function canvasTex(pw: number, ph: number, draw: (c: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = pw; c.height = ph;
  draw(c.getContext('2d')!);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}
const S = 256;
export function texText(w: number, txt: string, opt: { sub?: string; color?: string; big?: number; font?: string } = {}) {
  const pw = Math.round(w * S), ph = Math.round(BD * S);
  return canvasTex(pw, ph, (c) => {
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const color = opt.color ?? '#1b1b1e';
    let fs = Math.round(ph * (opt.big ?? 0.62) * (opt.sub ? 0.82 : 1));
    const font = opt.font ?? 'SansB';
    c.font = `700 ${fs}px ${font}`;
    while (c.measureText(txt).width > pw * 0.88 && fs > 24) { fs -= 4; c.font = `700 ${fs}px ${font}`; }
    c.fillStyle = color; c.fillText(txt, pw / 2, ph * (opt.sub ? 0.42 : 0.53));
    if (opt.sub) { c.font = `500 ${Math.round(ph * 0.17)}px Inter`; c.globalAlpha = 0.72; (c as any).letterSpacing = '2px'; c.fillText(opt.sub, pw / 2, ph * 0.8); }
  });
}
export function texId(w: number, id: number, s: string, color = '#1b1b1e') {
  const pw = Math.round(w * S), ph = Math.round(BD * S);
  return canvasTex(pw, ph, (c) => {
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const str = fmt(id);
    let fs = Math.round(ph * 0.36); c.font = `600 ${fs}px BarS`;
    while (c.measureText(str).width > pw * 0.86 && fs > 20) { fs -= 2; c.font = `600 ${fs}px BarS`; }
    c.fillStyle = color; c.fillText(str, pw / 2, ph * 0.44);
    c.font = `700 ${Math.round(ph * 0.17)}px SansB`; c.globalAlpha = 0.6; c.fillText(s, pw / 2, ph * 0.78);
  });
}
/** Half of a glyph (a byte-fragment token): side 0 = left half, 1 = right half, with the hex bytes underneath. */
export function texHalf(w: number, ch: string, side: 0 | 1, hex: string, color = '#1b1b1e') {
  const pw = Math.round(w * S), ph = Math.round(BD * S);
  return canvasTex(pw, ph, (c) => {
    c.font = `700 ${Math.round(ph * 0.62)}px SansB`; c.textBaseline = 'middle'; c.textAlign = 'center';
    c.fillStyle = color;
    const cx = side === 0 ? pw : 0;            // glyph centred on the cut edge, the canvas clips the other half
    c.fillText(ch, cx, ph * 0.47);
    c.strokeStyle = CORAL; c.setLineDash([10, 8]); c.lineWidth = 5;
    const ex = side === 0 ? pw - 3 : 3; c.beginPath(); c.moveTo(ex, ph * 0.1); c.lineTo(ex, ph * 0.9); c.stroke();
    c.setLineDash([]); c.font = `500 ${Math.round(ph * 0.15)}px Inter`; c.globalAlpha = 0.65;
    c.fillText(hex, side === 0 ? pw * 0.42 : pw * 0.58, ph * 0.87);
  });
}

export type Block = {
  grp: THREE.Group; body: THREE.Mesh; mat: THREE.MeshStandardMaterial; w: number;
  top: THREE.Mesh; topMat: THREE.MeshBasicMaterial; bot: THREE.Mesh; botMat: THREE.MeshBasicMaterial;
  texA: THREE.Texture; texB?: THREE.Texture; texHi?: THREE.Texture;
};
const geoCache = new Map<string, THREE.BufferGeometry>();
function boxGeo(w: number, h: number, d: number, rad: number) {
  const k = `${w.toFixed(3)}_${h}_${d}_${rad}`;
  if (!geoCache.has(k)) geoCache.set(k, new RoundedBoxGeometry(w, h, d, 3, rad));
  return geoCache.get(k)!;
}
export function makeBlock(w: number, texA: THREE.Texture, texB?: THREE.Texture, texHi?: THREE.Texture, color = 0xdedee2): Block {
  const grp = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0, transparent: true, emissive: new THREE.Color(CORAL), emissiveIntensity: 0 });
  const body = new THREE.Mesh(boxGeo(w - 0.04, BH, BD, 0.07), mat);
  body.castShadow = true; body.receiveShadow = true;
  const topMat = new THREE.MeshBasicMaterial({ map: texA, transparent: true, depthWrite: false, toneMapped: false });
  const top = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, BD - 0.06), topMat);
  top.rotation.x = -Math.PI / 2; top.position.y = BH / 2 + 0.003;
  const botMat = new THREE.MeshBasicMaterial({ map: texB ?? null, transparent: true, depthWrite: false, toneMapped: false });
  const bot = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, BD - 0.06), botMat);
  bot.rotation.x = Math.PI / 2; bot.position.y = -BH / 2 - 0.003; bot.visible = !!texB;
  grp.add(body, top, bot); grp.visible = false; sc.add(grp);
  return { grp, body, mat, w, top, topMat, bot, botMat, texA, texB, texHi };
}
/** Common per-frame block state: position, flip (0..1 around the row axis), opacity, highlight. */
export function poseBlock(b: Block, o: { x: number; y?: number; z: number; flip?: number; op?: number; hi?: number; s?: number; ry?: number; vis?: boolean }) {
  const vis = o.vis ?? true;
  b.grp.visible = vis && (o.op ?? 1) > 0.01 && (o.s ?? 1) > 0.01;
  if (!b.grp.visible) return;
  b.grp.position.set(o.x, (o.y ?? 0) + BH / 2, o.z);
  b.grp.rotation.set((o.flip ?? 0) * Math.PI, o.ry ?? 0, 0);
  const s = o.s ?? 1; b.grp.scale.set(s, s, s);
  const op = o.op ?? 1;
  b.mat.opacity = op; b.topMat.opacity = op; b.botMat.opacity = op;
  b.mat.depthWrite = op > 0.98; b.body.castShadow = op > 0.5;
  const hi = o.hi ?? 0;
  b.mat.emissiveIntensity = hi * 0.22;
  b.topMat.map = hi > 0.5 && b.texHi ? b.texHi : b.texA;
}
export function rowLayout(ws: number[], x0: number, gap = GAP) {
  const xs: number[] = []; let x = x0;
  for (const w of ws) { xs.push(x + w / 2); x += w + gap; }
  return { xs, end: x - gap };
}

// ---------------------------------------------------------------- 2D overlay helpers
export function proj(v: THREE.Vector3) { const p = v.clone().project(cam); return { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H, z: p.z }; }
export function txt(s: string, x: number, y: number, font: string, color = '#fff', align: CanvasTextAlign = 'left', track = 0, alpha = 1, base: CanvasTextBaseline = 'alphabetic') {
  if (alpha <= 0.005) return;
  g.save(); g.globalAlpha = clamp(alpha); g.font = font; g.fillStyle = color; g.textAlign = align; g.textBaseline = base; (g as any).letterSpacing = track + 'px'; g.fillText(s, x, y); g.restore();
}
/** Text with a soft dark halo so it reads on busy 3D backgrounds. */
export function txtHalo(s: string, x: number, y: number, font: string, color = '#fff', align: CanvasTextAlign = 'center', track = 0, alpha = 1) {
  if (alpha <= 0.005) return;
  g.save(); g.globalAlpha = clamp(alpha); g.font = font; g.textAlign = align; (g as any).letterSpacing = track + 'px';
  g.shadowColor = 'rgba(0,0,0,0.85)'; g.shadowBlur = 18; g.fillStyle = color; g.fillText(s, x, y);
  g.shadowBlur = 6; g.fillText(s, x, y); g.restore();
}
export function glow(x: number, y: number, rad: number, a: number, rgb = CORAL_RGB) {
  if (a <= 0.005) return;
  const rg = g.createRadialGradient(x, y, 0, x, y, rad);
  rg.addColorStop(0, `rgba(${rgb},${clamp(a)})`); rg.addColorStop(1, `rgba(${rgb},0)`);
  g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = rg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); g.restore();
}
export function card(x: number, y: number, w: number, h: number, a: number, r0 = 14) {
  if (a <= 0.005) return;
  g.save(); g.globalAlpha = clamp(a);
  g.fillStyle = 'rgba(18,18,22,0.82)'; g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 1.5;
  g.beginPath(); (g as any).roundRect(x, y, w, h, r0); g.fill(); g.stroke(); g.restore();
}
export function background() {
  g.globalAlpha = 1; g.fillStyle = '#0c0c0e'; g.fillRect(0, 0, W, H);
  const rg = g.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.42, W * 0.62);
  rg.addColorStop(0, '#2a2a2f'); rg.addColorStop(0.55, '#16161a'); rg.addColorStop(1, '#0a0a0c');
  g.fillStyle = rg; g.fillRect(0, 0, W, H);
}
export function bigWord(s: string, a: number, x: number, y: number, size: number) {
  if (a <= 0.005) return;
  g.save(); g.globalAlpha = clamp(a); g.font = `italic 600 ${size}px BarS`; (g as any).letterSpacing = '6px';
  g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 2; g.textAlign = 'left'; g.strokeText(s, x, y); g.restore();
}
export function vignette() {
  const rg = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 1.05);
  rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.fillStyle = rg; g.fillRect(0, 0, W, H);
}
let grainSeed = 1;
export function grain(t: number, k = 8) {
  const R = rng(Math.floor(t * 30) * 7919 + grainSeed);
  const id = g.getImageData(0, 0, W, H), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * k; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(id, 0, 0);
}
export function subtitleDraw(s: string, al: number) {
  g.save(); g.globalAlpha = clamp(al);
  g.font = '700 46px SansB'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; (g as any).letterSpacing = '2px';
  const y = H - 78;
  g.lineJoin = 'round'; g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 10; g.shadowOffsetY = 3;
  g.strokeStyle = 'rgba(0,0,0,0.85)'; g.lineWidth = 6; g.strokeText(s, W / 2, y);
  g.shadowColor = 'transparent'; g.fillStyle = '#fff'; g.fillText(s, W / 2, y);
  g.restore();
}

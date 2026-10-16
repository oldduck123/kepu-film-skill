// Headless frame-accurate renderer. Needs the engine dev server running (FILM_DIR=... PORT=5190 NO_HMR=1 npx vite).
// Every frame is (window as any).__frame(t): a pure function of time, so renders are deterministic and resumable.
//   bun scripts/render.ts sheet --times 1,5,9 [--cols 3] [--w 640] --out /abs/wip/x.jpg     contact sheet of stills
//   bun scripts/render.ts still --t 12.5 --out /abs/wip/f.jpg                                one full-size frame
//   bun scripts/render.ts video --from 0 --to 20 [--fps 30] [--crf 16] --out /abs/chunks/seg_000.mp4
//   add --cover to load the page with ?cover=1 (the scene's cover layout)
// Env: PORT (default 5190), CHROME_PATH (default: Playwright's resolution, then /usr/bin/google-chrome).
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const mode = argv[0];
const opt = (k: string, d?: string) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const out = path.resolve(opt('out', '../out/wip/out.jpg')!);
mkdirSync(path.dirname(out), { recursive: true });

const port = process.env.PORT ?? '5190';
const cover = argv.includes('--cover');
const exe = process.env.CHROME_PATH ?? (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);
const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--font-render-hinting=none'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('console', m.text()); });
await page.goto(`http://localhost:${port}/index.html${cover ? '?cover=1' : ''}`, { timeout: 120000 });
await page.waitForFunction(() => (window as any).__ready === true, null, { timeout: 180000 });

async function grab(t: number, q = 0.93) {
  const url: string = await page.evaluate(async ([t, q]) => (window as any).__frame(t, q), [t, q] as const);
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
}
async function errors() {
  const e: string[] = await page.evaluate(() => (window as any).__errors());
  if (e.length) console.error('SCENE ERRORS', e.slice(0, 5));
}

if (mode === 'still') {
  writeFileSync(out, await grab(parseFloat(opt('t', '0')!), 0.95));
  await errors();
  console.log('wrote', out);
} else if (mode === 'sheet') {
  const times = opt('times')!.split(',').map(Number);
  const cols = parseInt(opt('cols', String(Math.min(4, times.length)))!);
  const dir = out.replace(/\.jpg$/, '');
  mkdirSync(dir, { recursive: true });
  const files: string[] = [];
  for (const t of times) {
    const f = path.join(dir, `t${t.toFixed(2).padStart(7, '0')}.jpg`);
    writeFileSync(f, await grab(t, 0.9));
    files.push(f);
  }
  await errors();
  const rows = Math.ceil(files.length / cols);
  const w = parseInt(opt('w', '640')!);
  const inputs = files.flatMap((f) => ['-i', f]);
  const filt = files.map((_, i) => `[${i}:v]scale=${w}:-1[v${i}]`).join(';')
    + ';' + files.map((_, i) => `[v${i}]`).join('') + `xstack=inputs=${files.length}:layout=` +
    files.map((_, i) => `${(i % cols) ? Array.from({ length: i % cols }, () => 'w0').join('+') : '0'}_${Math.floor(i / cols) ? Array.from({ length: Math.floor(i / cols) }, () => 'h0').join('+') : '0'}`).join('|') + `:fill=black[o]`;
  const p = Bun.spawnSync(['ffmpeg', '-y', '-loglevel', 'error', ...inputs, '-filter_complex', files.length > 1 ? filt : `[0:v]scale=${w}:-1[o]`, '-map', '[o]', '-frames:v', '1', '-q:v', '3', out]);
  if (p.exitCode) console.error(p.stderr.toString());
  console.log('wrote', out, rows, 'rows');
} else if (mode === 'video') {
  const fps = parseFloat(opt('fps', '30')!);
  const from = parseFloat(opt('from', '0')!), to = parseFloat(opt('to', '10')!);
  const n = Math.round((to - from) * fps);
  const ff = Bun.spawn(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', 'pipe:0',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', opt('crf', '20')!, '-maxrate', '14M', '-bufsize', '28M', '-g', '60', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', out], { stdin: 'pipe' });
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const t = from + i / fps;
    ff.stdin.write(await grab(t, 0.95));
    if (i % 30 === 0) { await errors(); process.stdout.write(`\r${i}/${n} ${((Date.now() - t0) / 1000 / (i + 1)).toFixed(2)}s/f`); }
  }
  ff.stdin.end();
  await ff.exited;
  console.log(`\nwrote ${out} (${n} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
await browser.close();

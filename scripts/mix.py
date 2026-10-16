"""Mix narration + music + synthesized SFX.  python3 scripts/mix.py <film_dir>
Needs: numpy scipy soundfile librosa   (pip install numpy scipy soundfile librosa)
In:  <film>/data/timeline.json, <film>/vo/*.mp3
     <film>/music.json (optional)  {"level": 0.05, "duck": 0.55, "end_swell": 1.7,
         "cues": [{"file": "music/bgm1.mp3", "start": "5.75", "end": "C('c4')+1", "fade_in": 1.5, "fade_out": 3}, ...]}
         Overlap two cues by their fade lengths to crossfade.  No music.json = narration + SFX only.
     <film>/sfx.json (optional)  [{"sfx": "knock", "at": "SG('tf_a06',1)+0.2", "gain": 0.2, "pan": -0.3,
                                    "args": {"f": 220}, "repeat": 4, "every": 0.14}, ...]
Time expressions may use numbers and L(id) / E(id) line start/end, SG(id,k) / SGE(id,k) speech-segment start/end,
C(ch) chapter start, DUR film length.  Keep these in sync with the moments the scene animates (same helpers in scene.ts).
Out: <film>/out/mix.wav (48 kHz stereo, 24-bit, peak-normalised to -1 dBFS)."""
import os, sys
import numpy as np, librosa, soundfile as sf
from scipy.signal import lfilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import load_json

film = os.path.abspath(sys.argv[1])
SR = 48000
TL = load_json(os.path.join(film, 'data', 'timeline.json')) or sys.exit('build the timeline first')
DUR = TL['duration']; N = int(DUR * SR) + SR
LN = {l['id']: l for l in TL['lines']}
NS = dict(L=lambda i: LN[i]['start'], E=lambda i: LN[i]['end'],
          SG=lambda i, k: LN[i]['start'] + LN[i]['segs'][min(k, len(LN[i]['segs']) - 1)][0],
          SGE=lambda i, k: LN[i]['start'] + LN[i]['segs'][min(k, len(LN[i]['segs']) - 1)][1],
          C=lambda c: TL['chapters'][c], DUR=DUR)
T = lambda x: float(x) if isinstance(x, (int, float)) else float(eval(str(x), {'__builtins__': {}}, NS))
rng = np.random.default_rng(3)

def load(p):
    y, _ = librosa.load(p, sr=SR, mono=False)
    return np.stack([y, y]) if y.ndim == 1 else y

def place(buf, y, t, gain=1.0, pan=0.0):
    if y.ndim == 1: y = np.stack([y * (1 - max(0, pan)), y * (1 + min(0, pan))])
    i = int(t * SR)
    if i < 0: y = y[:, -i:]; i = 0
    n = min(y.shape[1], buf.shape[1] - i)
    if n > 0: buf[:, i:i + n] += y[:, :n] * gain

def movavg(x, w):  # == np.convolve(x, ones(w)/w, 'same') but O(n); direct convolve on 10M samples takes hours
    c = np.concatenate([[0.0], np.cumsum(x, dtype=np.float64)]); n = len(x); h = (w - 1) // 2
    i = np.arange(n); lo = np.clip(i - (w - 1 - h), 0, n); hi = np.clip(i + h + 1, 0, n)
    return (c[hi] - c[lo]) / w

# ------------------------------------------------------------------ SFX palette (all synthesized, no samples to license)
def env(n, a=0.002, d=0.08):
    t = np.arange(n) / SR
    return np.minimum(1, t / a) * np.exp(-t / d)
def click(f=3200, d=0.025, noise=0.6):          # UI tick, typing, counters
    n = int(0.12 * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) * (1 - noise) + rng.standard_normal(n) * noise) * env(n, 0.0005, d)
def knock(f=180, d=0.09):                       # a block landing / snapping into place
    n = int(0.4 * SR); t = np.arange(n) / SR
    fr = f * (1 + 0.6 * np.exp(-t / 0.02))
    return np.sin(2 * np.pi * np.cumsum(fr) / SR) * env(n, 0.001, d) + np.pad(0.25 * click(2400, 0.01, 0.9), (0, n - int(0.12 * SR)))
def blip(f=880, d=0.25):                        # highlight, label pops in
    n = int(0.9 * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.01 * t)) * env(n, 0.003, d)
def onepole(x, k):
    if np.isscalar(k): return lfilter([k], [1, k - 1], x)
    out = np.empty_like(x); zi = np.zeros(1); B = 512
    for s in range(0, len(x), B):
        kk = float(k[s]); out[s:s + B], zi = lfilter([kk], [1, kk - 1], x[s:s + B], zi=zi)
    return out
def whoosh(dur=1.0, up=True, bright=0.25):      # camera move
    n = int(dur * SR); x = rng.standard_normal(n); t = np.linspace(0, 1, n)
    return onepole(x, 0.02 + bright * (t if up else 1 - t) ** 1.5) * np.sin(np.pi * t) ** 1.2 * 2.2
def boom(f=55, d=1.2):                          # big reveal, title
    n = int(2.5 * SR); t = np.arange(n) / SR
    fr = f * (1 + 1.2 * np.exp(-t / 0.05))
    return np.tanh(1.5 * np.sin(2 * np.pi * np.cumsum(fr) / SR)) * env(n, 0.004, d)
def riser(dur=1.4, f0=220, f1=880):             # tension before a reveal
    n = int(dur * SR); t = np.linspace(0, 1, n)
    fr = f0 * (f1 / f0) ** (t ** 1.4)
    s = np.sin(2 * np.pi * np.cumsum(fr) / SR) + 0.3 * np.sin(2 * np.pi * np.cumsum(fr * 1.5) / SR)
    return s * t ** 2 * (1 - np.clip((t - 0.93) / 0.07, 0, 1))
def crack():                                    # something splits
    n = int(0.5 * SR); x = rng.standard_normal(n) * env(n, 0.0003, 0.04)
    kn = knock(110, 0.15); y = lfilter([1, -0.95], [1], x) * 0.8 + np.pad(kn, (0, n - len(kn))) * 0.8
    return y * (1.3 / np.abs(y).max())         # normalised: unscaled it peaks ~3x louder than everything else
def clink(f=2600):                              # coins / cost
    n = int(0.5 * SR); t = np.arange(n) / SR
    return sum(np.sin(2 * np.pi * f * m * t) * env(n, 0.0005, 0.12 / m) for m in (1, 1.52, 2.33)) * 0.4
SFX = dict(click=(click, 0.08), knock=(knock, 0.2), blip=(blip, 0.08), whoosh=(whoosh, 0.06), boom=(boom, 0.2),
           riser=(riser, 0.04), crack=(crack, 0.4), clink=(clink, 0.08))

# ------------------------------------------------------------------ narration
vo = np.zeros((2, N), np.float32)
for l in TL['lines']:
    place(vo, load(os.path.join(film, 'vo', l['id'] + '.mp3')), l['start'])
rms = np.sqrt(np.mean(vo[0][np.abs(vo[0]) > 0.01] ** 2)); vo *= 0.09 / rms

# ------------------------------------------------------------------ music
mus = np.zeros((2, N), np.float32)
MC = load_json(os.path.join(film, 'music.json'))
if MC:
    for c in MC['cues']:
        m = load(os.path.join(film, c['file'])); m *= MC.get('level', 0.05) / np.sqrt(np.mean(m[0, : 60 * SR] ** 2))
        a, b = T(c.get('start', 0)), T(c.get('end', 'DUR'))
        seg = m[:, int(c.get('offset', 0) * SR):][:, : int((b - a) * SR)].copy()
        fi, fo = int(c.get('fade_in', 1.5) * SR), int(c.get('fade_out', 3.0) * SR)
        seg[:, :fi] *= np.linspace(0, 1, min(fi, seg.shape[1])) ** 2
        if fo: seg[:, -fo:] *= np.linspace(1, 0, min(fo, seg.shape[1]))
        place(mus, seg, a)
    e = movavg(np.abs(vo[0]), int(0.25 * SR))     # duck under speech
    duck = 1 - MC.get('duck', 0.55) * np.clip(e / (np.percentile(e[e > 1e-4], 60) + 1e-9), 0, 1)
    mus *= movavg(duck, int(0.15 * SR))
    if MC.get('end_swell'):                       # lift the music once the last line is spoken
        last = TL['lines'][-1]['end']; a, b = int((last + 0.2) * SR), int((last + 1.4) * SR)
        sw = np.ones(N); sw[a:b] = np.linspace(1, MC['end_swell'], b - a); sw[b:] = MC['end_swell']; mus *= sw
    fo0 = int((DUR - 3.5) * SR); mus[:, fo0:] *= np.linspace(1, 0, N - fo0)[None, :] ** 1.5

# ------------------------------------------------------------------ sfx
fx = np.zeros((2, N), np.float32)
for c in load_json(os.path.join(film, 'sfx.json'), []):
    fn, g0 = SFX[c['sfx']]
    t0 = T(c['at'])
    for k in range(int(c.get('repeat', 1))):
        place(fx, fn(**c.get('args', {})), t0 + k * c.get('every', 0.12), c.get('gain', g0), c.get('pan', 0.0))

mix = vo + mus + fx
for name, b in (('voice', vo), ('music', mus), ('sfx', fx)):
    a = np.abs(b).max(0); i = int(a.argmax()); print(f'{name:5s} peak {a[i]:.2f} at {i / SR:.1f}s')
pk = np.max(np.abs(mix)); mix *= min(1, 0.89 / pk)
os.makedirs(os.path.join(film, 'out'), exist_ok=True)
sf.write(os.path.join(film, 'out', 'mix.wav'), mix[:, : int(DUR * SR)].T, SR, subtype='PCM_24')
print('wrote out/mix.wav, duration', DUR, '(if one stem peaks far above the others, lower that cue)')

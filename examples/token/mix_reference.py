"""Token film mix: VO from data/token_film/timeline.json, two Suno BGM cues (crossfade at chapter 4) ducked under speech,
SFX synthesized and timed to the animation in app/src/film/main.ts. Output: out/token_film/mix.wav (48 kHz stereo).
Run: .venv/bin/python scripts/mix_film.py"""
import json, os
import numpy as np
import librosa, soundfile as sf
from scipy.signal import lfilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000
TL = json.load(open(f'{ROOT}/data/token_film/timeline.json'))
TK = json.load(open(f'{ROOT}/data/token_film/tokens.json'))
DUR = TL['duration']; N = int(DUR * SR) + SR
LN = {l['id'][3:]: l for l in TL['lines']}
L = lambda i: LN[i]['start']
E = lambda i: LN[i]['end']
SG = lambda i, k: LN[i]['start'] + LN[i]['segs'][min(k, len(LN[i]['segs']) - 1)][0]
SGE = lambda i, k: LN[i]['start'] + LN[i]['segs'][min(k, len(LN[i]['segs']) - 1)][1]
lerp = lambda a, b, k: a + (b - a) * k
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

def env(n, a=0.002, d=0.08):
    t = np.arange(n) / SR
    return np.minimum(1, t / a) * np.exp(-t / d)

def click(f=3200, d=0.025, noise=0.6):
    n = int(0.12 * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) * (1 - noise) + rng.standard_normal(n) * noise) * env(n, 0.0005, d)

def knock(f=180, d=0.09):
    n = int(0.4 * SR); t = np.arange(n) / SR
    fr = f * (1 + 0.6 * np.exp(-t / 0.02))
    return np.sin(2 * np.pi * np.cumsum(fr) / SR) * env(n, 0.001, d) + np.pad(0.25 * click(2400, 0.01, 0.9), (0, n - int(0.12 * SR)))

def blip(f=880, d=0.25):
    n = int(0.9 * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.01 * t)) * env(n, 0.003, d)

def onepole(x, k):  # time-varying one-pole low-pass via piecewise lfilter
    if np.isscalar(k): return lfilter([k], [1, k - 1], x)
    out = np.empty_like(x); zi = np.zeros(1); B = 512
    for s in range(0, len(x), B):
        kk = float(k[s]); out[s:s + B], zi = lfilter([kk], [1, kk - 1], x[s:s + B], zi=zi)
    return out

def whoosh(dur, up=True, bright=0.25):
    n = int(dur * SR); x = rng.standard_normal(n); t = np.linspace(0, 1, n)
    k = 0.02 + bright * (t if up else 1 - t) ** 1.5
    return onepole(x, k) * np.sin(np.pi * t) ** 1.2 * 2.2

def boom(f=55, d=1.2):
    n = int(2.5 * SR); t = np.arange(n) / SR
    fr = f * (1 + 1.2 * np.exp(-t / 0.05))
    return np.tanh(1.5 * np.sin(2 * np.pi * np.cumsum(fr) / SR)) * env(n, 0.004, d)

def riser(dur, f0=220, f1=880):
    n = int(dur * SR); t = np.linspace(0, 1, n)
    fr = f0 * (f1 / f0) ** (t ** 1.4)
    s = np.sin(2 * np.pi * np.cumsum(fr) / SR) + 0.3 * np.sin(2 * np.pi * np.cumsum(fr * 1.5) / SR)
    return s * t ** 2 * (1 - np.clip((t - 0.93) / 0.07, 0, 1))

def crack():
    n = int(0.5 * SR); x = rng.standard_normal(n) * env(n, 0.0003, 0.04)
    kn = knock(110, 0.15); y = lfilter([1, -0.95], [1], x) * 0.8 + np.pad(kn, (0, n - len(kn))) * 0.8
    return y * (1.3 / np.abs(y).max())

def movavg(x, w):  # same as np.convolve(x, ones(w)/w, 'same'), via cumsum
    c = np.concatenate([[0.0], np.cumsum(x, dtype=np.float64)]); n = len(x); h = (w - 1) // 2
    i = np.arange(n); lo = np.clip(i - (w - 1 - h), 0, n); hi = np.clip(i + h + 1, 0, n)
    return (c[hi] - c[lo]) / w

def clink(f=2600):
    n = int(0.5 * SR); t = np.arange(n) / SR
    return sum(np.sin(2 * np.pi * f * m * t) * env(n, 0.0005, 0.12 / m) for m in (1, 1.52, 2.33)) * 0.4

# ------------------------------------------------------------------ voice
vo = np.zeros((2, N), np.float32)
for l in TL['lines']:
    place(vo, load(f"{ROOT}/assets/vo/{l['id']}.mp3"), l['start'])
rms = np.sqrt(np.mean(vo[0][np.abs(vo[0]) > 0.01] ** 2)); vo *= 0.09 / rms

# ------------------------------------------------------------------ music: cue 1 (ch0–3), cue 2 (ch4–7)
mus = np.zeros((2, N), np.float32)
m1 = load(f'{ROOT}/assets/music_token/bgm1.mp3'); m2 = load(f'{ROOT}/assets/music_token/bgm2.mp3')
for m in (m1, m2): m *= 0.05 / np.sqrt(np.mean(m[0, : 60 * SR] ** 2))
x0 = TL['chapters']['c4'] - 2.0; xf = 3.0
s1 = 5.75  # music enters on the first "send"
seg1 = m1[:, : int((x0 + xf - s1) * SR)].copy()
fi = int(1.5 * SR); seg1[:, :fi] *= np.linspace(0, 1, fi) ** 2
seg1[:, -int(xf * SR):] *= np.linspace(1, 0, int(xf * SR))
place(mus, seg1, s1)
seg2 = m2[:, : int((DUR - x0) * SR)].copy()
seg2[:, : int(xf * SR)] *= np.linspace(0, 1, int(xf * SR))
place(mus, seg2, x0)
fo0 = int((DUR - 3.5) * SR); mus[:, fo0:] *= np.linspace(1, 0, mus.shape[1] - fo0)[None, :] ** 1.5
e = np.abs(vo[0]); w = int(0.25 * SR); e = movavg(e, w)
duck = 1 - 0.55 * np.clip(e / (np.percentile(e[e > 1e-4], 60) + 1e-9), 0, 1)
duck = movavg(duck, int(0.15 * SR))
mus *= duck
sw = np.ones(mus.shape[1]); a = int((E('h04') + 0.2) * SR); b = int((E('h04') + 1.4) * SR)
sw[a:b] = np.linspace(1, 1.7, b - a); sw[b:] = 1.7; mus *= sw

# ------------------------------------------------------------------ sfx
fx = np.zeros((2, N), np.float32)
def typing(t0, t1, n, g=0.09):
    for i in range(n): place(fx, click(4200 + 300 * (i % 3), 0.018, 0.75), lerp(t0, t1, i / max(1, n)), g, pan=0.15)
# ch0
typing(1.15, 2.05, 8); typing(2.85, 3.6, 7); typing(4.6, 5.5, 9)
typing(SG('a04', 0) + 0.25, SGE('a04', 1) - 0.1, 8)
SEND1, SEND2 = 5.75, E('a04') + 0.1
for s in (SEND1, SEND2): place(fx, blip(988, 0.22), s, 0.15)
for k in range(5): place(fx, click(1800, 0.03, 0.2), SEND1 + 0.3 + k * 0.32, 0.03)
place(fx, whoosh(1.1), L('a05') + 0.2, 0.08)
place(fx, knock(90, 0.25), L('a05') + 1.9, 0.33)
cut0 = SG('a06', 0) + 0.55
for i in range(4): place(fx, click(5200, 0.03, 0.4), cut0 + i * 0.14, 0.16, pan=-0.3 + i * 0.2)
for i in range(4): place(fx, knock(220 + 25 * i, 0.07), SG('a06', i + 1) + 0.2, 0.2, pan=-0.4 + 0.2 * i)
place(fx, knock(320, 0.07), SGE('a06', 4) + 0.35, 0.2, pan=0.4)
place(fx, click(6000, 0.04, 0.3), SG('a07', 0) + 0.15, 0.12)
place(fx, blip(1174, 0.25), SG('a07', 1) + 0.1, 0.08)
# ch1
for i in range(5): place(fx, click(5000, 0.01, 0.6), L('b01') + 0.3 + i * 0.1, 0.06)
for i in range(5): place(fx, knock(300, 0.05), L('b01') + 0.45 + i * 0.1, 0.12)
place(fx, whoosh(2.0, bright=0.12), L('b03') - 0.4, 0.05)
b4, b4e = SG('b04', 0), SGE('b04', 0)
fuse = [SG('b03', 2) + 0.1, lerp(b4, b4e, 0.42), lerp(b4, b4e, 0.64), lerp(b4, b4e, 0.85)]
for i, f in enumerate(fuse):
    place(fx, click(4000, 0.01, 0.6), f - 0.85, 0.05); place(fx, knock(160 + 20 * i, 0.12), f, 0.32, pan=-0.3 + 0.2 * i)
    place(fx, blip(1318 + 80 * i, 0.12), f, 0.04)
for i in range(4): place(fx, knock(280, 0.05), SG('b04', 1) + 0.15, 0.06 + 0.0 * i)
for i in range(5): place(fx, knock(240 + 15 * i, 0.06), L('b05') + 0.35 + i * 0.12, 0.17, pan=-0.3 + 0.15 * i)
place(fx, blip(880, 0.2), SG('b05', 1) + 0.45, 0.07)
place(fx, crack(), SG('b06', 0) + 0.25, 0.42)
lt = SG('b07', 2) - 0.1
for i in range(10): place(fx, click(4800 + 120 * i, 0.012, 0.6), lt + 0.25 + i * 0.07, 0.07, pan=-0.4 + 0.08 * i)
for k in range(3): place(fx, blip(1568, 0.1), SG('b07', 3) + 0.05 + k * 0.0, 0.05)
place(fx, whoosh(0.7, bright=0.3), L('b08') + 0.3, 0.06)
place(fx, knock(120, 0.2), L('b08') + 0.95, 0.4)
place(fx, whoosh(0.9, up=False), L('b09') + 0.1, 0.05)
place(fx, blip(220, 0.25), SG('b09', 1) + 0.05, 0.12)
# ch2
for k in range(11): place(fx, knock(260 + 6 * k, 0.05), L('c01') + 0.5 + k * 0.12 + 0.55, 0.14, pan=-0.5 + 0.1 * k)
for _ in range(480):
    t = L('c02') + 0.1 + rng.beta(1.6, 2.6) * 2.8
    place(fx, click(rng.uniform(2500, 7000), 0.006, 0.8), t, rng.uniform(0.008, 0.03), pan=rng.uniform(-0.8, 0.8))
place(fx, boom(48, 0.9), L('c02') + 0.1, 0.22)
place(fx, whoosh(1.4, bright=0.2), L('c03') + 0.1, 0.05)
for k in range(24): place(fx, click(rng.uniform(3000, 6000), 0.008, 0.7), SG('c03', 1) + k * 0.09, 0.03, pan=rng.uniform(-0.6, 0.6))
# ch3
place(fx, whoosh(1.8), L('d01') + 0.2, 0.07)
for k in range(10): place(fx, click(3600, 0.012, 0.5), L('d02') + 0.3 + k * 0.16, 0.06)
place(fx, riser(1.4, 165, 660), L('d03') - 0.3, 0.04)
place(fx, blip(1046, 0.3), SG('d03', 1) + 1.3, 0.09)
for _ in range(70):
    place(fx, click(rng.uniform(2000, 5000), 0.01, 0.6), L('d04') - 0.2 + rng.uniform(0, 3.2), rng.uniform(0.02, 0.05), pan=rng.uniform(-0.7, 0.7))
for ci in range(3): place(fx, blip([784, 988, 1175][ci], 0.35), SG('d05', ci), 0.09)
place(fx, riser(1.8, 220, 1320), L('d06') + 0.2, 0.035)
# ch4
place(fx, knock(200, 0.08), L('e01') + 1.65, 0.25)
for i in range(5): place(fx, knock(230 + 18 * i, 0.06), L('e02') + 0.2 + i * 0.12, 0.17, pan=-0.4 + 0.2 * i)
place(fx, whoosh(0.9, bright=0.35), L('e02') + 0.9, 0.06)
for i in range(5): place(fx, knock(230 + 18 * i, 0.06), L('e03') + 0.2 + i * 0.12, 0.17, pan=-0.4 + 0.2 * i)
place(fx, whoosh(0.9, bright=0.35), L('e03') + 1.0, 0.06)
for j in range(1, 5): place(fx, whoosh(0.5, bright=0.4), L('e04') + 0.3 + j * 0.55, 0.035, pan=-0.4 + 0.2 * j)
place(fx, blip(660, 0.3), SG('e05', 1), 0.07)
place(fx, boom(52, 1.0), L('e06') + 0.1, 0.12)
# ch5
place(fx, whoosh(2.2, bright=0.15), L('f01') - 0.3, 0.06)
place(fx, riser(1.4, 110, 440), L('f02') + 0.2, 0.04)
place(fx, riser(1.2, 196, 784), L('f03') + 0.1, 0.05)
sp0 = SG('f05', 0) + 0.2; pick2 = SG('f05', 1) - 0.15
seq_n = 12; last = -1
for s in np.linspace(0, 1, 400):
    idx = min(seq_n - 1, int((s ** 0.6) * seq_n))
    if idx != last: place(fx, click(2400, 0.02, 0.3), lerp(sp0, pick2, s), 0.07); last = idx
place(fx, blip(1318, 0.35), pick2, 0.12)
f06 = L('f06')
appT = [f06 + 0.25, f06 + 0.85, f06 + 1.35, f06 + 1.85, SG('f07', 0) + 0.15, SG('f07', 1) + 0.1, SG('f07', 3) + 0.1,
        SG('f08', 0) + 0.05, SG('f08', 1) + 0.05, SG('f08', 2) + 0.05]
appT += [SG('f08', 3) + 0.1 + k * 0.27 * 0.95 ** k for k in range(11)]
nA = len(TK['ansA']) + len(TK['more'])
k = 0
while len(appT) < nA and L('g04') + 0.25 + k * 0.155 < E('g04') + 0.1: appT.append(L('g04') + 0.25 + k * 0.155); k += 1
place(fx, whoosh(0.7), appT[0] - 0.7, 0.06)
for i, t in enumerate(appT):
    g = 0.34 if i == 0 else (0.12 if t > L('g04') else 0.22)
    place(fx, knock(140 if i == 0 else 240 + 9 * (i % 8), 0.06 if i else 0.2), t, g, pan=0.1 * ((i % 7) - 3))
    if 0 < i < 10: place(fx, click(6000, 0.01, 0.7), t - 0.6, 0.04)
for i in range(4): place(fx, knock(300, 0.05), appT[i] + 0.1, 0.12, pan=0.5)   # branch B
place(fx, whoosh(0.8, bright=0.3), SG('f07', 2) - 0.05, 0.06)
# ch6
place(fx, blip(523, 0.4), SG('g03', 1) - 0.2, 0.09)
for k in range(10): place(fx, knock(90, 0.12), L('g04') + 1.0 + k * 0.25, 0.06)
place(fx, riser(1.4, 110, 330), L('g05') + 0.6, 0.05)
place(fx, riser(1.6, 147, 587), L('g06') + 0.3, 0.04)
place(fx, boom(46, 1.1), SG('g07', 1) - 0.05, 0.22)
place(fx, clink(2400), L('g09') + 0.0, 0.1)
for k in range(5): place(fx, clink(2600 + 60 * k), L('g09') + 0.1 * k, 0.05)
nC = 28
for k in range(nC): place(fx, clink(rng.uniform(2300, 3200)), lerp(L('g09') + 0.2, SGE('g09', 2), k / nC), 0.045, pan=0.4)
for i in range(3): place(fx, click(3000, 0.02, 0.3), L('g10') + 0.3 + i * 0.35, 0.08)
# ch7
place(fx, whoosh(2.4, bright=0.12), L('h01') + 0.2, 0.06)
place(fx, whoosh(3.0, bright=0.1), L('h02'), 0.04)
for _ in range(160):
    place(fx, click(rng.uniform(2500, 6500), 0.006, 0.7), SG('h03', 0) - 0.3 + rng.beta(1.3, 2.0) * 6, rng.uniform(0.01, 0.03), pan=rng.uniform(-0.8, 0.8))
place(fx, boom(41, 1.8), E('h04') + 0.3, 0.3)
place(fx, blip(659, 1.0), E('h04') + 0.35, 0.06)

mix = vo + mus + fx
pk = np.max(np.abs(mix)); mix *= min(1, 0.89 / pk)
os.makedirs(f'{ROOT}/out/token_film', exist_ok=True)
sf.write(f'{ROOT}/out/token_film/mix.wav', mix[:, : int(DUR * SR)].T, SR, subtype='PCM_24')
print('peak', round(float(pk), 3), 'dur', DUR)

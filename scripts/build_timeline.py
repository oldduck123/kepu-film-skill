"""Lay narration lines on a timeline.  python3 scripts/build_timeline.py <film_dir>
In:  <film>/data/vo.json, <film>/vo/*.mp3, optional <film>/timing.json:
     {"lead": 1.0, "chapter_gap": 1.4, "end_hold": 4.5, "extra": {"line_id": 0.6, ...}}
     'extra' adds breathing room after a line so a visual beat can land before the next sentence.
Out: <film>/data/timeline.json = {lines:[{id,text,ch,start,end,dur,segs}], chapters:{c0: t, ...}, chapter_titles, duration}
     segs = speech segments inside the line (silencedetect), used to time animation to individual phrases."""
import os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import load_json, save_json

film = os.path.abspath(sys.argv[1])
vo = load_json(os.path.join(film, 'data', 'vo.json')) or sys.exit('run a tts script first')
cfg = load_json(os.path.join(film, 'timing.json'), {})
LEAD, CH_GAP, END_HOLD = cfg.get('lead', 1.0), cfg.get('chapter_gap', 1.4), cfg.get('end_hold', 4.5)
EXTRA = cfg.get('extra', {})

def segs(path):
    err = subprocess.run(['ffmpeg', '-i', path, '-af', 'silencedetect=n=-35dB:d=0.12', '-f', 'null', '-'], capture_output=True, text=True).stderr
    ss = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', err)]
    se = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', err)]
    dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]))
    sp, cur = [], 0.0
    for a, b in sorted(zip(ss, se + [dur] * (len(ss) - len(se)))):
        if a - cur > 0.05: sp.append([round(cur, 3), round(a, 3)])
        cur = b
    if dur - cur > 0.05: sp.append([round(cur, 3), round(dur, 3)])
    return sp or [[0.0, round(dur, 3)]]

t, lines, chapters, titles, prev = LEAD, [], {}, {}, None
for m in vo:
    ch = m['ch']
    if prev is not None and ch != prev: t += CH_GAP
    if ch not in chapters: chapters[ch] = round(t, 3); titles[ch] = m.get('ch_title', '')
    lines.append(dict(id=m['id'], text=m['text'], ch=ch, start=round(t, 3), dur=round(m['dur'], 3), end=round(t + m['dur'], 3),
                      segs=segs(os.path.join(film, 'vo', m['id'] + '.mp3'))))
    t += m['dur'] + (0.5 if m['text'][-1] in '。？！”' else 0.3) + EXTRA.get(m['id'], 0)
    prev = ch
dur = round(t + END_HOLD, 2)
save_json(dict(lines=lines, chapters=chapters, chapter_titles=titles, duration=dur), os.path.join(film, 'data', 'timeline.json'))
print('duration', dur, 's; chapters', chapters)

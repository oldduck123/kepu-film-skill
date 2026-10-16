"""Shared helpers: script parsing and film-dir paths."""
import json, os, subprocess

def read_script(film):
    """script.txt -> list of dict(id, spk, emo, text, ch, ch_title).
    Format: '[c0 开场]' starts a chapter; 'id|speaker|emotion|text' is one narration line; '#' lines are comments."""
    out, ch, title = [], 'c0', ''
    for l in open(os.path.join(film, 'script.txt'), encoding='utf-8'):
        l = l.strip()
        if not l or l.startswith('#'):
            continue
        if l.startswith('['):
            parts = l[1:-1].split(maxsplit=1)
            ch, title = parts[0], (parts[1] if len(parts) > 1 else '')
        elif l.count('|') >= 3:
            i, s, e, t = l.split('|', 3)
            out.append(dict(id=i.strip(), spk=s.strip(), emo=e.strip(), text=t.strip(), ch=ch, ch_title=title))
    return out

def duration(path):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]))

def load_json(path, default=None):
    return json.load(open(path, encoding='utf-8')) if os.path.exists(path) else default

def save_json(obj, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(obj, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

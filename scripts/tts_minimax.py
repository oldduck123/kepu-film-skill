"""Narration via MiniMax TTS (paid).  python3 scripts/tts_minimax.py <film_dir> [--force id1 id2 ...]
Env:  MINIMAX_API_KEY  (required)   MINIMAX_BASE (default https://api.minimaxi.com ; international: https://api.minimax.io)
Out:  <film>/vo/<id>.mp3 and <film>/data/vo.json.  Existing mp3s are reused, so re-running never pays twice.
Voices: <film>/voices.json maps the speaker letter to [voice_id, speed]; default N = male-qn-jingying at 1.06."""
import json, os, sys, time, urllib.request, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import read_script, duration, load_json, save_json

film = os.path.abspath(sys.argv[1])
force = set(sys.argv[sys.argv.index('--force') + 1:]) if '--force' in sys.argv else set()
KEY = os.environ.get('MINIMAX_API_KEY') or sys.exit('set MINIMAX_API_KEY (see references/apis.md)')
BASE = os.environ.get('MINIMAX_BASE', 'https://api.minimaxi.com').rstrip('/')
MODEL = os.environ.get('MINIMAX_TTS_MODEL', 'speech-2.8-hd')
VOICES = load_json(os.path.join(film, 'voices.json'), {'N': ['male-qn-jingying', 1.06]})
os.makedirs(os.path.join(film, 'vo'), exist_ok=True)

def tts(ln):
    out = os.path.join(film, 'vo', ln['id'] + '.mp3')
    if os.path.exists(out) and ln['id'] not in force:
        return dict(ln, dur=duration(out))
    vid, spd = VOICES[ln['spk']]
    vs = {'voice_id': vid, 'speed': spd, 'vol': 1, 'pitch': 0}
    if ln['emo'] not in ('', 'neutral'):
        vs['emotion'] = ln['emo']
    body = {'model': MODEL, 'text': ln['text'], 'stream': False, 'voice_setting': vs, 'language_boost': 'Chinese',
            'audio_setting': {'sample_rate': 44100, 'bitrate': 256000, 'format': 'mp3', 'channel': 1}, 'output_format': 'hex'}
    req = urllib.request.Request(BASE + '/v1/t2a_v2', json.dumps(body).encode(),
                                 {'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json'})
    for k in range(6):  # 1002 = rate limited: back off; anything else is reported, never silently retried
        d = json.load(urllib.request.urlopen(req, timeout=180))
        if d['base_resp']['status_code'] != 1002:
            break
        time.sleep(10 * (k + 1))
    if d['base_resp']['status_code'] != 0:
        raise RuntimeError(f"{ln['id']}: {d['base_resp']}")
    open(out, 'wb').write(bytes.fromhex(d['data']['audio']))
    return dict(ln, dur=duration(out))

if __name__ == '__main__':
    L = read_script(film)
    with cf.ThreadPoolExecutor(2) as ex:
        res = list(ex.map(tts, L))
    save_json(res, os.path.join(film, 'data', 'vo.json'))
    print(len(res), 'lines,', round(sum(r['dur'] for r in res), 1), 's of narration')

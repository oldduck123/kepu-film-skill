"""Free narration fallback via Microsoft Edge TTS (pip install edge-tts).  python3 scripts/tts_edge.py <film_dir> [--force id ...]
Same outputs as tts_minimax.py: <film>/vo/<id>.mp3 and <film>/data/vo.json.
Voices: <film>/voices_edge.json maps speaker letter -> [voice, rate]; default N = zh-CN-YunxiNeural at +6%.
Quality is noticeably flatter than MiniMax; fine for drafts and for people without a paid TTS key."""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import read_script, duration, load_json, save_json
import edge_tts

film = os.path.abspath(sys.argv[1])
force = set(sys.argv[sys.argv.index('--force') + 1:]) if '--force' in sys.argv else set()
VOICES = load_json(os.path.join(film, 'voices_edge.json'), {'N': ['zh-CN-YunxiNeural', '+6%']})
os.makedirs(os.path.join(film, 'vo'), exist_ok=True)

async def main():
    res = []
    for ln in read_script(film):
        out = os.path.join(film, 'vo', ln['id'] + '.mp3')
        if not os.path.exists(out) or ln['id'] in force:
            voice, rate = VOICES[ln['spk']]
            await edge_tts.Communicate(ln['text'], voice, rate=rate).save(out)
        res.append(dict(ln, dur=duration(out)))
    save_json(res, os.path.join(film, 'data', 'vo.json'))
    print(len(res), 'lines,', round(sum(r['dur'] for r in res), 1), 's of narration')

asyncio.run(main())

# 外部接口

两个付费接口都是**可选**的。没有的话，配音用免费的 Edge TTS，配乐留空或者用用户自己提供的音频。

## 1. MiniMax 语音合成（配音，付费）

- 国内站：<https://platform.minimaxi.com>（注册、充值、在“接口密钥”里创建 API Key），接口域名 `https://api.minimaxi.com`
- 国际站：<https://www.minimax.io>，接口域名 `https://api.minimax.io`
- 计费：按字符数收费，一条 3–4 分钟的片子约 800 字

**调用逻辑**（`scripts/tts_minimax.py` 已实现）：

```
POST {MINIMAX_BASE}/v1/t2a_v2
Authorization: Bearer {MINIMAX_API_KEY}
{
  "model": "speech-2.8-hd",
  "text": "一句旁白",
  "voice_setting": {"voice_id": "male-qn-jingying", "speed": 1.06, "vol": 1, "pitch": 0},
  "language_boost": "Chinese",
  "audio_setting": {"sample_rate": 44100, "bitrate": 256000, "format": "mp3", "channel": 1},
  "output_format": "hex"
}
→ data.audio 是 hex 编码的 mp3，base_resp.status_code == 0 表示成功，1002 表示被限流，等一会儿再试
```

- 每句旁白单独请求、单独保存成一个文件（`vo/<id>.mp3`）。改了某一句，只重新生成那一句：`--force <id>`。
- 范例用的音色是 `male-qn-jingying`（精英青年男声），语速 1.06。其他音色可以在 MiniMax 控制台试听，然后写进 `<film>/voices.json`：`{"N": ["音色ID", 1.06]}`。
- 使用方式：`export MINIMAX_API_KEY=...`（以及可选的 `MINIMAX_BASE`）。**不要把 key 写进任何文件。**

## 2. Suno 配乐（付费，国内站 suno.cn）

- 网址：<https://www.suno.cn>。注册后在网站上购买积分。
- 官方提供一个可以给 Agent 用的 skill：**Suno.cn AI 音乐助手**（`suno-cn-music`），在 suno.cn 网站上获取，按它自带的 INSTALL.md 安装。授权走网页登录，不需要手动复制 key。

**调用逻辑**（通过它的命令行 helper，不要自己拼 HTTP 请求）：

```bash
node scripts/suno-client.mjs auth verify          # 首次使用：返回一个授权链接，用户在浏览器里登录确认
node scripts/suno-client.mjs request POST /mcp/api/generate '{
  "prompt": "minimal ambient tech electronica for a calm science explainer narration: sparse felt piano single notes, soft warm analog synth pad, subtle ticking pulse, gentle sub bass, curious and clean, no drums drop, no vocals, steady low intensity, 90 bpm",
  "instrumental": true,
  "title": "Explainer BGM",
  "tags": "minimal ambient, electronica, felt piano, soft pulse, documentary"
}'
node scripts/suno-client.mjs request GET '/mcp/api/task/<任务编号>?wait=45'   # 轮询直到成功，拿到音频链接
```

- 每次生成会扣积分，一次通常出两首。**不要静默重试**：结果不明确时，先查任务列表，确认到底有没有提交成功。
- 配乐要求：纯音乐、低强度、不能有鼓点爆发（drop），不能抢旁白的风头。3–4 分钟的片子，准备两段配乐，在中间某一章交叉淡入淡出（写在 `music.json` 里）。
- 下载后放在 `<film>/music/` 里，在 `music.json` 里引用。

## 3. 免费替代

| 用途 | 方案 | 说明 |
|---|---|---|
| 配音 | Edge TTS：`pip install edge-tts`，然后运行 `scripts/tts_edge.py` | 默认音色 `zh-CN-YunxiNeural`，可用于样片和试做，听感比 MiniMax 平 |
| 配乐 | 用户自己提供免版权音乐（例如 Pixabay Music），或者不加配乐 | 一定要确认授权允许在视频里使用 |
| 音效 | `scripts/mix.py` 里内置的 8 种合成音效 | 全是代码合成的，不涉及任何版权 |

## 4. 其他条件

- 渲染需要 Chrome 或 Chromium。设置 `CHROME_PATH` 环境变量指向它，不设置时用系统默认的 `/usr/bin/google-chrome`。
- 字体都是 SIL OFL 开源字体（思源黑体、Barlow Condensed、Inter），可以免费商用，由 `scripts/fetch_fonts.sh` 下载。
- 网络：MiniMax 国内站和 suno.cn 在国内可以直接访问；Edge TTS 需要能连上微软的服务。

---
name: kepu-film
description: 制作 3–5 分钟的中文科普原理片（讲清一个抽象机制，如 AI 原理、计算机原理、金融机制），全程代码生成画面：脚本 → 配音 → 时间轴 → 3D 动画 → 分段渲染 → 混音 → 成片与封面。当用户想做“××原理是什么”的讲解视频、概念片、知识区动画，或提到 blockwise / 积木风格时使用。内置第一种风格 blockwise（深灰底、白色积木、单一强调色、等轴测一镜到底），以后可在 references/styles/ 下增加别的风格。
---

# kepu-film：科普原理片制作

用代码逐帧生成一条完整的科普原理片。画面是 three.js 场景加 2D 叠层，**每一帧都是时间 t 的纯函数**，所以能精确对齐配音、分段渲染、崩了从断点继续。

范例：`examples/token/` 是一条完整的 3 分 40 秒成片《你天天说的 Token，到底是什么？》的脚本和全部动画代码。动手前先读它，它是这个风格的质量标准。

## 适用与不适用

**适合**：讲一个看不见的机制（Token、注意力、RAG、ETF 申赎、哈希……），冷静旁白，一个视觉比喻贯穿全片，横屏 1920×1080，3–5 分钟。

**不适合**：拆解实物（需要写实建模）、人物故事或剧情、数据新闻图表、真人出镜、需要实拍素材的题材。遇到这些，直接告诉用户这个 skill 不合适。

## 风格

目前只有一种风格，动画之前必须读完它的规范：

| 风格 | 规范 | 一句话 |
|---|---|---|
| blockwise 积木 | `references/styles/blockwise.md` | 深灰底、白色哑光积木、珊瑚橙强调、等轴测、一镜到底 |

新增风格的方法写在 `references/styles/README.md`。

## 环境要求

开工前逐项检查，缺什么先告诉用户：

- **Node 18+ 和 Bun**（渲染脚本用 Bun 运行），**Python 3.10+**，**ffmpeg/ffprobe**
- **Chrome 或 Chromium**：用作无头渲染。没有 GPU 也能跑（走 SwiftShader 软件渲染），约 1.5 秒一帧
- Python 包：`numpy scipy soundfile librosa`；用免费配音时还要 `edge-tts`
- 只装一次：`cd engine && bun install`，然后 `bash scripts/fetch_fonts.sh`（下载开源字体）

**付费接口（可选）**：配音用 MiniMax，配乐用 Suno（国内站 suno.cn）。没有也能做：配音退回免费的 Edge TTS，配乐可以不加，或者用户自己提供免版权音乐。**做之前先问用户有没有这两个接口。** 申请方式和调用逻辑见 `references/apis.md`。

## 工作流程

每一步的细节、命令和参数见 `references/workflow.md`。

1. **定题和钩子**：确定一个反直觉的开头现象，再选一个贯穿全片的例子。读 `references/narrative.md`。**事实必须实测或查证**，比如分词结果要真的用分词器跑出来，不能编。
2. **写脚本**：在 `<film>/script.txt` 里按章节写旁白，每句一行。写完先给用户看，等确认后再生成配音（MiniMax 是按字数收费的）。
3. **配音**：`python3 scripts/tts_minimax.py <film>` 或 `python3 scripts/tts_edge.py <film>`。已经生成过的句子会跳过，重跑不会重复付费。
4. **时间轴**：运行 `python3 scripts/build_timeline.py <film>`，生成每句话的起止时间和句内的停顿点。
5. **画面**：复制 `templates/blockwise/` 作为起点写 `scene.ts`，动画节点一律挂在配音时间上（`L()`、`E()`、`SG()`），不要写死秒数。引擎接口见 `references/engine.md`。
6. **先出样片**：先渲关键帧联系表，再渲 20–30 秒样片，**停下来给用户看**，确认后再做全片。
7. **全片渲染**：运行 `scripts/render_chunks.sh <film>`，可以断点续跑。
8. **混音**：在 `sfx.json` 里写音效、在 `music.json` 里写配乐，然后运行 `python3 scripts/mix.py <film>`。
9. **成片**：运行 `scripts/finalize.sh <film> <片名>`，响度标准化到 -14 LUFS。封面用 `render.ts still --cover` 渲染。
10. **质检**：按 `references/qc.md` 逐项检查。必须用 `scripts/qc_sheet.sh` 把全片抽帧看一遍，再交付。

## 硬规则

- 不要把任何 API key 写进项目文件或仓库，只能通过环境变量传入。
- 付费请求（配音、配乐）不能静默重试，也不能在脚本没确认前就批量生成。
- 画面里的示意数值（概率、坐标等）必须在片尾或画面上注明“示意”。
- 渲染期间不要和别的重任务抢 CPU，否则速度会掉到三分之一。
- 交付前如实报告：时长、响度、没检查到的地方、你自己听不到声音这件事（AI 无法试听，要请用户听）。

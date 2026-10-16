# kepu-film-skill · 科普原理片制作 Skill

让 AI Agent（Claude Code、Codex、WorkBuddy 等支持 Skill 的工具）**用代码从零做出一条 3–5 分钟的中文科普原理片**：脚本、配音、3D 动画、字幕、音效、配乐、封面，一条命令链跑完。

第一种风格是 **blockwise（积木）**：深灰底、白色哑光积木、单一珊瑚橙强调色，等轴测视角一镜到底。用它做出的范例片是《AI 回答你的那几秒里，到底发生了什么？》（讲 Token），完整源码在 `examples/token/`。

> 画面全部是代码逐帧生成的，没有 AI 生图，也没有素材库。每一帧都是时间的纯函数，所以能和配音精确对齐，也能分段渲染、断点续跑。

## 能做什么样的片子

- ✅ 讲一个看不见的机制：AI 原理（Token、注意力、RAG、MoE……）、计算机原理、金融机制等
- ✅ 冷静的旁白解说，一个视觉比喻贯穿全片，横屏 1080p，3–5 分钟
- ❌ 拆解实物（需要写实建模）、剧情片、真人出镜、数据新闻图表

## 安装

把整个仓库放进你的 Agent 的 skills 目录：

```bash
# Claude Code
git clone https://github.com/oldduck123/kepu-film-skill ~/.claude/skills/kepu-film
# Codex
git clone https://github.com/oldduck123/kepu-film-skill ~/.codex/skills/kepu-film
# 其他工具：放到它的 Skill 目录，或者直接让 Agent 读 SKILL.md
```

然后安装依赖（只需一次）：

```bash
cd ~/.claude/skills/kepu-film/engine && bun install
bash ../scripts/fetch_fonts.sh                    # 下载开源字体（约 26 MB）
pip install numpy scipy soundfile librosa edge-tts
```

**需要的环境**：Node 18+、[Bun](https://bun.sh)、Python 3.10+、ffmpeg、Chrome 或 Chromium（无头渲染用，不需要显卡）。

## 用法

直接对 Agent 说：

> 用 kepu-film 做一条 3 分钟的片子，讲 RAG 是怎么让 AI 读你的文件的。

Agent 会照 `SKILL.md` 的流程：定钩子 → 写脚本给你确认 → 配音 → 先出 30 秒样片给你看 → 全片渲染 → 混音 → 成片 + 封面 → 质检。

## 付费接口（可选）

| 用途 | 服务 | 没有的话 |
|---|---|---|
| 配音 | **MiniMax 语音合成**，国内站 [platform.minimaxi.com](https://platform.minimaxi.com)，按字数计费 | 用免费的 Edge TTS（`scripts/tts_edge.py`），听感平一些 |
| 配乐 | **Suno 国内站** [suno.cn](https://www.suno.cn)，配合官方的 Agent skill「Suno.cn AI 音乐助手」，网页登录授权 | 不加配乐，或者自己提供免版权音乐 |

调用逻辑、参数和范例里实际用过的提示词都在 [`references/apis.md`](references/apis.md)。API key 只通过环境变量传入，**不要写进任何文件**。

## 目录

```
SKILL.md                      Agent 读的主文件：适用范围、环境、流程、硬规则
references/
  styles/blockwise.md         积木风格规范：色彩、镜头、积木、叠层、字幕、节奏、封面、禁忌
  narrative.md                叙事模板和写脚本的方法
  workflow.md                 每一步的命令、产物和检查点
  engine.md                   引擎接口
  apis.md                     MiniMax / Suno / 免费替代方案
  qc.md                       质检清单和踩过的坑
engine/                       渲染引擎（three.js + Vite + Playwright）
scripts/                      配音、时间轴、分段渲染、混音、成片、联系表
templates/blockwise/          可以直接跑通的起步模板（约 28 秒）
examples/token/               完整范例片的脚本、数据和全部画面代码
```

## 快速试跑模板

```bash
K=~/.claude/skills/kepu-film
cp -r $K/templates/blockwise ~/films/demo
python3 $K/scripts/tts_edge.py ~/films/demo           # 免费配音
python3 $K/scripts/build_timeline.py ~/films/demo
PORT=5190 bash $K/scripts/render_chunks.sh ~/films/demo 10
python3 $K/scripts/mix.py ~/films/demo
bash $K/scripts/finalize.sh ~/films/demo demo         # → ~/films/demo/out/demo.mp4
```

## 说明

- 做出来的效果很依赖 Agent 用的模型：画面代码每条片子都要现写，模型越强，越接近范例的质量。
- 软件渲染约 1.5 秒一帧，一条 3.5 分钟的片子要渲染约 3 小时。
- 字体使用 SIL OFL 开源授权（思源黑体、Barlow Condensed、Inter）；音效全部由代码合成；仓库里不包含任何付费生成的音频。
- 代码以 MIT 协议开源。用它做出来的片子，版权归你。

欢迎提交新的风格（参考 `references/styles/README.md`）。

# 范例：《你天天说的 Token，到底是什么？》

![封面](../../docs/images/cover_16x9.jpg)

一条完整成片的源文件：3 分 40 秒，8 章，53 句旁白。片中的结尾卡写的是制作时的工作标题“AI 回答你的那几秒里，到底发生了什么？”，发布时改用了现在这个标题。

| 文件 | 内容 |
|---|---|
| `script.txt` | 完整旁白脚本 |
| `tokens.json` | 用 tiktoken `o200k_base`（GPT-4o 的分词器）实测的分词结果和编号 |
| `data/timeline.json` | 根据原配音生成的时间轴（每句起止、句内停顿） |
| `scene.ts` | 全部画面代码，约 1000 行：一个连续的世界，6 个站点，镜头一镜到底 |
| `mix_reference.py` | 原片的混音脚本，音效时间点逐个手写，可以参考它怎么让音效对齐画面（路径是原项目的，不能直接运行） |

仓库里**没有**放配音、配乐和成片（这些是付费生成的素材）。不过 `data/timeline.json` 在，画面可以直接渲染出来：

```bash
cd engine && FILM_DIR=../examples/token PORT=5190 NO_HMR=1 npx vite &
PORT=5190 bun scripts/render.ts sheet --times 8,20,40,52,62,95,115,140,175,215 --cols 5 --out /tmp/token_sheet.jpg
```

想完整复现，就用 `scripts/tts_*.py` 重新配音、跑 `build_timeline.py`（时长会和原片略有不同，画面会自动跟着对齐），再按正常流程渲染和混音。

值得重点看的写法：

- `SG('a06', k)`：每个积木出现的时刻，都挂在旁白第 k 段语音上；
- 第 6 章“上下文窗口”：积木被挤出窗口的时刻，用二分查找算出来（`fallStart()`），而不是写死秒数；
- 封面模式：`?cover=1` 时走 `coverText()`，和正片共用同一个场景。

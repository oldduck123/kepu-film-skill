# 制作流程（命令、产物、检查点）

下面 `<film>` 指一条片子的工作目录，`$K` 指本 skill 的根目录。

## 0. 建工作目录

```bash
cp -r $K/templates/blockwise ~/films/rag      # 起点：模板（能直接跑通）
cd $K/engine && bun install && bash $K/scripts/fetch_fonts.sh   # 只需一次
```

工作目录结构：

```
<film>/
  script.txt        旁白脚本（按章节）
  timing.json       留白参数：lead / chapter_gap / end_hold / extra{句子id: 秒}
  voices.json       可选，MiniMax 音色映射
  scene.ts          画面代码（每帧是 t 的纯函数）
  sfx.json          音效时间表
  music.json        可选，配乐时间表
  music/            可选，配乐文件
  vo/               配音（生成）
  data/             vo.json、timeline.json，以及题材需要的数据（比如实测的分词结果）
  out/              chunks/、mix.wav、成片、qc/
```

## 1. 定题 → 2. 脚本

照 `narrative.md` 写 `script.txt`。**写完先停下来给用户看**，脚本确认后才进入付费环节。

## 3. 配音

```bash
export MINIMAX_API_KEY=...                       # 有 MiniMax 时
python3 $K/scripts/tts_minimax.py <film>
python3 $K/scripts/tts_edge.py <film>            # 没有 MiniMax 时（免费）
```

产物：`vo/<id>.mp3` 和 `data/vo.json`。已存在的文件会跳过，只想重做某几句用 `--force id1 id2`。

## 4. 时间轴

```bash
python3 $K/scripts/build_timeline.py <film>
```

产物 `data/timeline.json`：每句的 `start`、`end`，句内各段语音的区间 `segs`（用静音检测切出来的，对应逗号处的停顿），每章的开始时间，以及总时长。改了 `timing.json` 或者重新配了音，就重跑这一步。

## 5. 画面

```bash
cd $K/engine && FILM_DIR=<film> PORT=5190 npx vite     # 开发服务器；浏览器打开 http://localhost:5190/index.html?t=12.5 可以看任意一帧
```

- 在 `scene.ts` 里，用 `L(id)`、`E(id)` 取一句话的开始和结束，用 `SG(id, k)` 取这句话第 k 段语音的开始。**所有动画都挂在这些时间上**，以后改了配音，画面会自动跟着对齐。
- 世界布局：每章一个站点，沿 x 轴排开；镜头用关键帧在站点之间插值（见模板里的 `camAt()`）。
- 题材数据（比如实测的分词结果）放在 `<film>/data/` 里，用 `fetch('/film/data/xxx.json')` 读取。

关键帧联系表（不需要渲整片，用来快速检查构图）：

```bash
cd $K/engine && PORT=5190 bun scripts/render.ts sheet --times 3,8,15,22 --cols 2 --out <film>/out/wip/sheet.jpg
PORT=5190 bun scripts/render.ts still --t 15 --out <film>/out/wip/f15.jpg     # 全尺寸单帧
```

## 6. 样片（必须做）

先渲开头 20–30 秒，配上声音给用户看。**用户确认风格和节奏后，再做全片。**

## 7. 全片渲染

```bash
PORT=5190 bash $K/scripts/render_chunks.sh <film> 20
```

- 每 20 秒一段，输出 `out/chunks/seg_XXX.mp4`；中途断了重跑这条命令，会从断点继续。
- 改了某一段的画面，只删掉对应的 seg 文件重渲那一段，其他段不受影响。
- 速度：软件渲染约 1.5 秒一帧，一条 3.5 分钟的片子（6600 帧）约 3 小时。**不要和别的重任务同时跑**。日志里能看到每帧耗时，实测和别的渲染任务抢 CPU 时，会慢到约 4.8 秒一帧。

## 8. 混音

```bash
python3 $K/scripts/mix.py <film>
```

- 音效写在 `sfx.json` 里，时间用和画面相同的表达式（比如 `"SG('rag_b02',1)+0.2"`），这样声音和画面永远对得上。
- 配乐写在 `music.json` 里，参考 `templates/blockwise/music.json.example`。说话时音乐会自动压低（ducking），最后一句说完后音乐抬起来（end_swell），片尾 3.5 秒淡出。
- 脚本会打印人声、音乐、音效三条轨各自的峰值。如果某个音效峰值远高于其他（比如超过 0.8），把它的 gain 调低，否则整条混音会被压小。

## 9. 成片和封面

```bash
bash $K/scripts/finalize.sh <film> 片名
cd $K/engine && PORT=5190 bun scripts/render.ts still --cover --t 20 --out <film>/out/封面.jpg
```

`finalize.sh` 会打印最终的响度（目标 -14 LUFS 左右）和真峰值（应该 ≤ -1.5 dBTP）。

## 10. 质检

照 `qc.md` 逐项检查，然后再交付。

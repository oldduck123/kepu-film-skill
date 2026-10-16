# 引擎接口（`engine/src/core.ts`，场景代码里用 `import ... from '@engine/core'` 引入）

## 运行约定

- 画布 1920×1080（`W`、`H`）。three.js 先渲染到离屏画布 `glc`，再画到 2D 画布 `g` 上，2D 叠层画在它上面。
- 场景要在 `window` 上暴露三样东西：`__ready = true`（加载完成）、`__frame(t)`（画出时间 t 的那一帧，返回 JPEG 的 dataURL）、`__errors()`（返回运行中收集到的报错）。模板最后几行已经写好，照抄即可。
- **`frame(t)` 只能依赖 t**，不能依赖上一帧的状态（不要用“上一帧位置 + 速度”这种写法），否则分段渲染、跳帧预览都会出错。随机数用 `rng(seed)`，并且固定种子。

## 数学和缓动

| 函数 | 作用 |
|---|---|
| `clamp(x, a=0, b=1)`、`lerp(a, b, k)` | 截断、线性插值 |
| `prog(t, a, b)` | 把 t 映射到 0→1：在 a 之前是 0，到 b 之后是 1。**最常用** |
| `win(t, a, b, fi, fo)` | 0→1→0 的窗口：在 a 开始淡入、到 b 淡出完毕。用于标签、卡片的出现和消失 |
| `eio` / `eo` / `ei` / `backOut` | 缓入缓出 / 缓出 / 缓入 / 带回弹的缓出 |
| `hop(t, at, h, d)` | 在 `at` 时刻小跳一下 |
| `rng(seed)` | 可复现的伪随机数生成器 |
| `fmt(n)` | 数字加千分位逗号 |

## 镜头和场景

| 接口 | 作用 |
|---|---|
| `sc`、`cam`、`r` | three.js 的 Scene、正交相机、渲染器 |
| `setCam({x, y, z, zoom, el, az})` | 设置等轴测镜头：看向的点、缩放、俯角、方位角；阴影范围会自动跟着调整 |
| `grid.update(x, z, radius)` | 地面网格只在镜头附近显示，向外淡出 |
| `loadFonts()` | 加载字体（`SansK`/`SansB`/`SansM`/`BarL`/`BarM`/`BarS`/`Inter`），启动时调用一次 |

## 积木

| 接口 | 作用 |
|---|---|
| `texText(w, 文本, {sub, color, big, font})` | 积木顶面的文字贴图；`sub` 是下面一行小字 |
| `texId(w, 编号, 说明)` | 编号样式的贴图（数字用 Barlow 字体） |
| `texHalf(w, 字, 0或1, hex)` | 半个字的贴图，配珊瑚橙虚线切口，用来表现一个字被切成两半 |
| `makeBlock(w, texA, texB?, texHi?, color?)` | 创建一块积木：`texA` 正面，`texB` 背面（翻转后可见），`texHi` 强调时显示的正面 |
| `poseBlock(b, {x, y, z, flip, op, hi, s, ry, vis})` | **每帧调用**，设定这块积木的状态：位置、翻转（0–1）、透明度、强调（0–1）、缩放、绕竖轴旋转 |
| `rowLayout(宽度数组, 起点x, gap)` | 把一排宽度不同的积木排开，返回每块中心的 x 坐标 `xs` 和这排的末端 `end` |
| `BH`、`BD`、`GAP` | 积木的高、深、间距 |

## 2D 叠层

| 接口 | 作用 |
|---|---|
| `proj(Vector3)` | 3D 坐标投影到屏幕坐标 `{x, y}` |
| `txt(文本, x, y, 字体, 颜色, 对齐, 字距, 透明度)` | 画文字 |
| `txtHalo(...)` | 带暗色光晕的文字，在复杂背景上也能读清 |
| `card(x, y, w, h, 透明度)` | 深色半透明的数据面板 |
| `glow(x, y, 半径, 强度)` | 珊瑚橙的柔光 |
| `background()`、`vignette()`、`grain(t, k)` | 背景、暗角、胶片颗粒（每帧按这个顺序调用：背景最先，暗角和颗粒最后） |
| `bigWord(文本, 透明度, x, y, 字号)` | 背景里的斜体描边大字 |
| `subtitleDraw(文本, 透明度)` | 画一条字幕 |
| `CORAL`、`CORAL_RGB` | 强调色 |

## 一帧的标准顺序

```ts
setCam(camAt(t)); grid.update(...);
/* 每块积木 poseBlock(...) */
background(); /* 背景大字 */
r.render(sc, cam); g.drawImage(r.domElement, 0, 0);
/* 2D 叠层：标签、卡片 */
vignette(); chapterTag(t); subtitles(t); endCard(t); grain(t, 8);
/* 片头片尾淡入淡出 */
```

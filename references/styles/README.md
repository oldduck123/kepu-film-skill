# 风格目录

每种风格是一份规范文档，配一个能直接跑的模板：

```
references/styles/<风格名>.md     规范：色彩、镜头、主体元素、2D 叠层、字幕、节奏、封面、禁忌
templates/<风格名>/                模板：script.txt、timing.json、scene.ts、sfx.json，可以直接渲染
```

## 新增一种风格

1. 复制 `blockwise.md`，按同样的 8 个小节重写；
2. 复制 `templates/blockwise/`，改写 `scene.ts`；要换配色或材质，就在 `engine/src/` 里新建一个 core 文件（比如 `core_paper.ts`），不要直接改 `core.ts`；
3. 用模板渲一张联系表、渲一遍全片，确认能跑通；
4. 在 `SKILL.md` 的风格表里加一行。

字幕切分、时间轴、渲染、混音这几层是所有风格共用的，新风格只需要换画面这一层。

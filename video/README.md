# askJEV 宣传片 V9

[观看 1080p 成片](exports/askjev-motion-1080p.mp4)

[![视频封面](cover.png)](exports/askjev-motion-1080p.mp4)

本目录保存 V9 可编辑工程与制作素材。画面 1920×1080、25 fps、50.48 秒，保留当前产品内容和音乐，增加镜头推拉、错峰入场、结果聚合以及 8 处场景过渡。

进入 `studio/` 后执行：

```bash
npm ci
npm run dev
npm run lint
npm run render
```

主合成为 `AskJEV-Motion`，源文件在 `studio/src/v9/`。生成的中间文件与依赖不提交。成片是基于真实记录重新排版的产品演示，不是全程未剪辑录屏；完整来源见 [evidence.json](evidence.json)。

[制作与时序](MOTION-V9.md) · [交付说明](DELIVERY-V9.md) · [验证记录](validation-v9.json)

字体许可随素材提供；品牌与音乐沿用既有视频工程。独立视频工程不会加入 askJEV CLI 安装包。

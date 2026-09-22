# askJEV Agent 介绍视频

60 秒，1920×1080，30 fps，中文配音，深色底与荧光绿重点。六个独立 Remotion 场景：测试动机、执行流程、真实前端样例、多轮自动测试、DGX Spark 推理、技能安装。画面展示产品名 askJEV Agent。

这是产品介绍与真实证据的可视化，不是屏幕录制。前端数字来自 `docs/evidence/frontend-1.3.json`；三轮新验收见 `docs/evidence/campaign-1.5.json`。不会将评分可靠性、混合选测或独立复核宣传为已完成能力。

![视频封面](public/poster.jpg)

## 预览与输出

```bash
cd video
npm ci
npm run dev -- --no-open --port=3115
npm run lint
npx remotion render AskJEV-Intro out/askjev-agent-intro-1080p.mp4
```

成片位于 `out/askjev-agent-intro-1080p.mp4`。Remotion Studio 也提供六个独立 Scene composition，便于单独调色、修改文字与动效。所有动画由帧驱动；默认 Chrome 渲染，不依赖云端 GPU。

## 声音与素材

`public/voice-1.wav` 至 `voice-6.wav` 为本机中文合成语音；`public/music.wav` 为项目脚本生成的原创简洁合成器底乐。重新生成需要 macOS `say`、中文 Tingting 音色及 ffmpeg：

```bash
python3 scripts/audio.py
```

生成脚本固定乐音与时间，未下载外部版权音乐。配音文本保存在脚本中。字体使用系统 PingFang SC / Microsoft YaHei，未打包商用字体文件；跨系统导出需重新检查字体布局。视频依赖单独锁定，不加入 CLI 安装包。

## After Effects 交接

`scripts/import-to-ae.jsx` 为 AE 导入脚本：在 AE 中选择「File → Scripts → Run Script File」，再选择成片；会建立 60 秒主合成、六个场景子合成、段落标记及默认隐藏的可编辑标题层，便于继续加特效或重剪。

本环境未安装 AE，脚本按 ExtendScript 接口编写，尚未在 AE 中执行；没有声称交付已验证的 `.aep`。Remotion 组件保留完整可编辑动画源，AE 中导入的基础画面是已合成的视频。

Remotion 渲染接口：[官方文档](https://www.remotion.dev/docs/renderer/render-media)。依赖授权以 [Remotion 的条款](https://www.remotion.dev/license) 为准。

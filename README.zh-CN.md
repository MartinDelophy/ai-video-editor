# Timeline Studio — 浏览器 AI 视频编辑器

[English](README.md) | **中文** | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [ไทย](README.th.md) | [Tiếng Việt](README.vi.md) | [Русский](README.ru.md)

[![在线体验](https://img.shields.io/badge/在线体验-Timeline_Studio-35ead9?style=flat-square)](https://video-editor.ai-creator.top/)
[![GitHub Release](https://img.shields.io/github/v/release/MartinDelophy/ai-video-editor?style=flat-square)](https://github.com/MartinDelophy/ai-video-editor/releases)
[![MIT License](https://img.shields.io/github/license/MartinDelophy/ai-video-editor?style=flat-square)](LICENSE)

Timeline Studio 是一个本地优先、直接运行在浏览器中的 AI 视频编辑器。它把接近剪映/CapCut 的多轨时间线，与浏览器 AI 配音、自动字幕、智能画面、数字人和确定性离线导出结合在一起。

[打开在线编辑器](https://video-editor.ai-creator.top/) · [观看演示](https://youtu.be/mUXduGpBmwE) · [Hugging Face Space](https://huggingface.co/spaces/haixin/timeline-studio)

![Timeline Studio 编辑器](docs/screenshots/editor-timeline.png)

## AI 能力

- **多语言 AI 配音：** 中文 Piper/VITS ONNX、英文 Kokoro 82M，以及德语、西班牙语、法语、意大利语和巴西葡萄牙语的浏览器 Piper 声音。
- **自动字幕：** Whisper small q8 ONNX，结合音频能量修正时间戳，并对中文识别结果做克制的高置信纠错。
- **智能画面：** YOLOS tiny 主体检测与 MODNet 人像抠图，用于图片和完整视频的智能裁切、字幕避让与背景移除。
- **AI 人声分离：** 在浏览器工作流中提取人声，并把伴奏放入音乐轨。
- **数字人：** JoyVASA 音频驱动 + LivePortrait 神经渲染，支持 WebGPU、256px 快速预览与 512px 高质量路径。
- **本地优先推理：** 大模型按需加载、锁定版本并由 Service Worker 缓存；受支持的流程不需要把项目素材上传到编辑后端。

## 剪辑与导出

- 连续主画面轨，以及可自由定时的画中画图层。
- 在画布中直接选择、移动、等比缩放和旋转，并支持遮罩、滤镜、效果、动画、速度与显式关键帧。
- 字幕、贴纸、配音、分离后的视频原声和背景音乐使用独立时间轨。
- 支持磁吸、全轨对齐线、右键菜单、切分/复制/删除、双指缩放、撤销重做和可移植 `.timeline` 项目。
- 播放预览使用原生媒体路径保证流畅；导出使用独立的确定性离线渲染路径。
- WebCodecs MP4/WebM 合成统一处理画面、音频混音、字幕、画中画、效果与变换，并提供 MediaRecorder 兼容回退。
- 支持安装为 PWA，缓存应用外壳，并提供多语言界面。

## Agent Skill

仓库包含 Codex 兼容的 [`edit-timeline-studio`](skills/edit-timeline-studio/SKILL.md) Skill，用于规划、执行和验证可继续编辑的视频时间线。

它可以帮助 Agent：

- 检查素材并保留用户的原始剪辑意图；
- 使用稳定片段 ID 和明确秒数描述可撤销的编辑计划；
- 通过浏览器兼容路径操作在线版或本地编辑器；
- 使用 `skills/edit-timeline-studio/scripts/validate_edit_plan.mjs` 校验声明式编辑计划；
- 验证轨道位置、转场、字幕、画中画、实际可听音频和最终导出文件；
- 始终保留可编辑的 `.timeline` 项目，而不是只交付不可逆的视频成片。

当前 Skill 会明确说明能力边界：现阶段已经可以通过浏览器驱动编辑；Skill 中的版本化无头命令协议是下一阶段自动化层，不会把尚未实现的 CLI 描述成现成功能。

## 快速启动

建议使用 Node.js 20+ 和现代 Chromium 浏览器；运行大型 AI 模型时推荐 WebGPU。

```bash
git clone https://github.com/MartinDelophy/ai-video-editor.git
cd ai-video-editor
npm install
npm run dev
```

打开 Vite 输出的本地地址即可。首次使用某项 AI 能力时可能需要下载模型，后续会复用浏览器缓存。

## 验证与构建

```bash
npm test
npm run build
npm run preview
```

运行完整仓库检查：

```bash
npm run check
```

## 部署

仓库中的 [`netlify.toml`](netlify.toml) 会执行 `npm run build`、发布 `dist`、配置 SPA 回退，并启用浏览器 AI/媒体 Worker 所需的跨域隔离响应头。

```bash
npx netlify-cli deploy --prod --dir=dist
```

## License

[MIT](LICENSE)

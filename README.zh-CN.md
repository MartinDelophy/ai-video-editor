# Timeline Studio — 浏览器 AI 视频编辑器

[English](README.md) | **中文** | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [ไทย](README.th.md) | [Tiếng Việt](README.vi.md) | [Русский](README.ru.md)

[![在线体验](https://img.shields.io/badge/在线体验-Timeline_Studio-35ead9?style=flat-square)](https://video-editor.ai-creator.top/)
[![GitHub Release](https://img.shields.io/github/v/release/MartinDelophy/ai-video-editor?style=flat-square)](https://github.com/MartinDelophy/ai-video-editor/releases)
[![MIT License](https://img.shields.io/github/license/MartinDelophy/ai-video-editor?style=flat-square)](LICENSE)
[![skills.sh](https://skills.sh/b/MartinDelophy/ai-video-editor)](https://skills.sh/MartinDelophy/ai-video-editor)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md) [![LINUX DO](https://shorturl.at/ggSqS)](https://linux.do)

## 深度合成使用声明

本工具基于深度合成技术，仅用于技术研究与学习。

使用者应确保：

- 仅使用本人或已取得合法授权的人脸图像/视频；
- 不制作、不传播任何违法、侵权、虚假或误导性内容；
- 不将生成内容冒充为真实影像，不在未经同意的情况下冒用他人身份。

因违反上述要求导致的任何法律责任，由使用者自行承担。

## 项目动态

- **2026 年 8 月 31 日 — 大视频准备提速：** 本地导入会按电脑性能生成自适应的首轮时间线缩略图，不再固定承担 480 帧解码；素材库在线视频先显示真实下载进度，再进入抽帧准备，并选用体积受控的剪辑版本、准确补齐开头首帧。解码器直接复用原始视频 Blob；精确缩略图优先补齐当前视口，再按中点分治顺序覆盖视口外时间，播放头单元始终跟随预览真实画面。
- **2026 年 8 月 29 日 — 本地生成连接器：** 插件区新增彼此独立的 ComfyUI 与 Stable Diffusion WebUI/Forge 连接器。ComfyUI 可配置本机回环地址、执行 API Format 工作流并导入声明的图片或视频输出；WebUI 通过真实 txt2img/img2img API 生成图片。完成结果会自动进入 My assets，无法可靠回传素材的通用 Hugging Face Spaces 嵌入已移除。
- **2026 年 8 月 28 日 — 浏览器本地智能降噪：** 画面 → AI 修复现以 DRUNet 视频降噪作为首项能力，支持当前帧对比、四档强度、保留源音频和新素材可逆应用。整段处理现以源帧率流式经过 WebCodecs，并行衔接下一帧解码与当前帧推理，持续复用 WebGPU Session、画布、张量和像素缓冲区，对低变化相邻帧保守复用降噪残差，同时保留 PNG/FFmpeg 兼容回退；桌面与移动端均可使用，并完成 11 种界面语言本地化。
- **2026 年 8 月 28 日 — 高保真视频时间线准备：** 新上传的视频会在读取元数据和解析真实 PTS 缩略帧期间保持明确的加载状态，不再出现单帧拉伸的大色块。时间线使用更清晰的 180px 源缩略帧、随缩放变化的可读密度、播放头下方的精确源时间映射，以及无黑边的竖屏居中裁切铺满。
- **2026 年 8 月 28 日 — Chrome 内置模型实时下载进度：** 自动剪辑现在分别显示画面理解模型与字幕翻译模型的 Chrome 实际进度、完成状态和尝试次数。Chrome 连续 45 秒没有产生进度时，界面会明确提示下载停滞并提供需用户点击的“重试下载”，既保留 Chrome 已有的中断下载状态，也满足模型下载所需的点击授权。

在公开 [Roadmap](ROADMAP.md) 查看计划与 TODO，在 [Releases](https://github.com/MartinDelophy/ai-video-editor/releases) 查看已发布功能，在 [Issues](https://github.com/MartinDelophy/ai-video-editor/issues) 跟踪具体任务和缺陷。

## 它能制作什么？

查看可复现的前后对比示例与剪辑配方：

→ [AI Video Editing Skills Handbook](https://github.com/MartinDelophy/timeline-studio-handbook)

<p align="center">
  <a href="https://trendshift.io/repositories/77422?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-77422" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/77422/daily?language=JavaScript" alt="MartinDelophy%2Fai-video-editor | Trendshift" width="250" height="55"/></a>
  <a href="https://trendshift.io/repositories/77422?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-77422" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/77422/weekly?language=JavaScript" alt="MartinDelophy%2Fai-video-editor | Trendshift" width="250" height="55"/></a>
</p>

Timeline Studio 是一个本地优先、直接运行在浏览器中的 AI 视频编辑器。它把接近剪映/CapCut 的多轨时间线，与 WebGPU AI 音乐和修复、多语言配音、自动字幕、数字人和确定性离线导出结合在一起。

[打开在线编辑器](https://video-editor.ai-creator.top/) · [观看演示](https://www.youtube.com/watch?v=chdRPG2ndMs) · [Hugging Face Space](https://huggingface.co/spaces/haixin/timeline-studio)

## 视频演示

### 自动剪辑

画面分析、关键帧、字幕与导出。

https://github.com/user-attachments/assets/e8327caa-429e-40ff-a7fe-a59e6cf7a464

### AI 修复

分时段水印移除与前后对比。

https://github.com/user-attachments/assets/aea9f5b4-c720-4b0c-9067-5ec124eef982

### AI 配音

https://github.com/user-attachments/assets/304a744e-d620-4380-9c17-19af3726f5a4

![Timeline Studio 编辑器](docs/screenshots/editor-timeline.png)

## AI 能力

- **多语言 AI 配音：** 中文及中英混合使用 Hojo TTS Light 80M FP16 的晴岚、若溪两条内置参考女声，自回归生成走 WebGPU、稳定波形解码走 WASM；英文使用 Kokoro 82M，德语、西班牙语、法语、意大利语和巴西葡萄牙语使用浏览器 Piper 声音。
- **本地 AI 音乐：** Stable Audio 3 Small Q4 ONNX 通过 WebGPU 在浏览器运行，支持自由提示词自动翻译、30/60/90/120 秒选项、长音乐波形感知循环、模型持久缓存，并在完成后自动加入“我的素材”。
- **自动字幕：** Whisper small q8 ONNX，结合音频能量修正时间戳，并对中文识别结果做克制的高置信纠错。
- **智能画面：** YOLOS tiny 主体检测与 MODNet 人像抠图，用于图片和完整视频的智能裁切、字幕避让与背景移除。
- **AI 修复：** 浏览器本地 MI-GAN 支持多区域、可分时段的水印/物体移除；NanoVSR 644K 通过 WebGPU 为图片和视频提供 4× 高清修复，并支持同步前后对比。
- **AI 人声分离：** 在浏览器工作流中提取人声，并把伴奏放入音乐轨。
- **数字人：** JoyVASA 音频驱动 + LivePortrait 神经渲染，支持 WebGPU、256px 快速预览与 512px 高质量路径。
- **本地优先推理：** 大模型按需加载、锁定版本并由 Service Worker 缓存；受支持的流程不需要把项目素材上传到编辑后端。

## 稳定的双线路模型交付

浏览器 AI 模型同时镜像在 Hugging Face 和 ModelScope。Timeline Studio 会在首次请求时进行轻量连通性竞速，记住当前运行环境中更快且可用的线路；网络发生变化或下载失败时会自动切换另一条线路。两家平台共用同一缓存标识，因此切换线路不会重复下载相同版本。

- Stable Audio：[Hugging Face](https://huggingface.co/haixin/stable-audio-3-small-music-onnx) · [ModelScope](https://www.modelscope.cn/models/martindelophy/stable-audio-3-small-music-onnx/files?version=main)
- 语音模型：[Hugging Face](https://huggingface.co/haixin/timeline-studio-voice-models/tree/074a57bc4dac9c58568b031898ea79da6f36b282) · [ModelScope](https://www.modelscope.cn/models/martindelophy/timeline-studio-voice-models/files?version=9cb5ab964c014b182701153bd00f7a2202f5dce8)（含不同上游许可证，详见模型仓库说明）
- Timeline Studio ONNX 模型：[Hugging Face](https://huggingface.co/haixin/timeline-studio-onnx-models) · [ModelScope](https://www.modelscope.cn/models/martindelophy/timeline-studio-onnx-models/files?version=main)
- Depth Anything V2 Small Q4F16：[Hugging Face](https://huggingface.co/haixin/timeline-studio-onnx-models/tree/a0806c6fb9484894dcb78df523156d244461515d/depth-anything-v2-small) · [ModelScope](https://www.modelscope.cn/models/martindelophy/timeline-studio-onnx-models/files?version=4cc757f80330e22cb8f82b628c53ceca6307fd12&subpath=depth-anything-v2-small)（Apache-2.0）
- 人声分离模型：[Hugging Face](https://huggingface.co/haixin/timeline-studio-vocal-remover) · [ModelScope](https://www.modelscope.cn/models/martindelophy/timeline-studio-vocal-remover/files?version=main)

## 剪辑与导出

- 连续主画面轨，以及可自由定时的画中画图层。
- 在画布中直接选择、移动、等比缩放和旋转，并支持遮罩、滤镜、效果、动画、速度与显式关键帧；PC 端另提供四分区色轮，色温、色调、饱和度以及各色轮的色相、饱和度、明度均可添加关键帧。
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

通过公开的 [skills.sh](https://skills.sh/MartinDelophy/ai-video-editor) 目录安装（当前 CLI 要求 Node.js 22.20.0 或更高版本）：

```bash
npx skills add MartinDelophy/ai-video-editor --skill edit-timeline-studio
```

也可以使用 GitHub CLI 2.90.0 或更高版本安装：

```bash
# Claude Code
gh skill install MartinDelophy/ai-video-editor edit-timeline-studio --agent claude-code --scope user

# Codex
gh skill install MartinDelophy/ai-video-editor edit-timeline-studio --agent codex --scope user
```

如需安装已经验证过的固定版本，而不是跟随最新 Release，请在命令末尾添加 `--pin v1.0.0`。安装前可以先预览 Skill：

```bash
gh skill preview MartinDelophy/ai-video-editor edit-timeline-studio
```

## 路线图

- **当前：** 加固确定性离线导出并提高时间线编辑可靠性。
- **下一步：** 发布供 Agent 驱动剪辑使用的版本化无头命令执行器，并让可复用项目模板更易分享。
- **未来：** 增加协作审阅流程、插件扩展能力，以及更多经过本地验证的 AI 模型。

路线图优先级会在 [GitHub Discussions](https://github.com/MartinDelophy/ai-video-editor/discussions) 中共同讨论。欢迎提交功能建议和真实工作流反馈。

## 期待你的参与

我们正在寻找对浏览器媒体、WebCodecs、WebGPU/ONNX、时间线交互、本地化或文档感兴趣的贡献者。

- 体验[在线编辑器](https://video-editor.ai-creator.top/)，并在 [Issues](https://github.com/MartinDelophy/ai-video-editor/issues) 中提交可复现的问题。
- 加入 [Discussions](https://github.com/MartinDelophy/ai-video-editor/discussions)，提出功能建议、分享作品或帮助确定路线图优先级。
- 尤其欢迎聚焦的小型修复、翻译、文档和示例项目贡献。

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

## 支持与反馈

如果这个项目对你有帮助，欢迎点亮 ⭐ Star；遇到问题请[提交 Issue](https://github.com/MartinDelophy/ai-video-editor/issues)。

欢迎加入我们的 [Discord 社区](https://discord.gg/uq2uvUTBr)，提问、分享反馈，并与其他用户和贡献者交流。

## License

Timeline Studio 的原创源代码采用 [MIT License](LICENSE)。

本仓库的 MIT License **不自动适用于**第三方模型、模型权重、数据集、字体、图库媒体或其他随仓库提供及运行时远程下载的资源。无论这些资源存放在哪里，也无论项目通过下载脚本、缓存、镜像或集成方式使用它们，均应继续遵守各自的上游许可证和使用条款。重新分发或商业使用前，请查阅 [MODEL_LICENSES.md](MODEL_LICENSES.md)。

# Anna 合入 main 工作记录 · 2026-09-15

本轮将 `main` 的 `317c16d` 合入 `codex/anna-validation`，Anna 合并前 HEAD 为 `3c3953c`；范围为 main 新增的 9 个提交、94 个文件。全部合并冲突已解决，本地静态检查、Anna 构建、严格校验和本轮运行验证通过。按用户要求优先保留 Anna 独立适配，构建已上传工作草稿 r17 并安装；线上加载的新入口与本地一致，原工程恢复成功。没有冻结新版本或改动 alpha.5 审核候选。

## 保留与整合范围

- 保留 Anna 当前工程自动保存与恢复：工程和素材存入本机 IndexedDB，仅支持同一浏览器、同一 Anna 账号重新打开；Anna scoped KV 只保存随机 namespace，不是跨设备云同步。已保存提示等待事务完成，保存失败或恢复冲突不覆盖已有工程；浏览器数据清理和未完成的保存无法保证恢复。
- 保留 Anna 原生窗口手动拖动、缩放与编辑器内部响应式布局，不恢复 App 对外层窗口的自动 `window.resize` 或相关监听，不扩大窗口权限。
- 保留专用 Anna 入口与构建：`npm run dev:anna` 使用独立 Vite 配置，`npm run build:anna` 通过 `scripts/build-anna.mjs` 生成 `anna/bundle`；普通站点构建与 Anna 适配保持分离。保留 Anna 模型 CDN 配置和可选缓存失败时成功下载响应的保护。
- 整合 main 的紧凑时间线标记、独立标记栏、吸附与范围编辑、工程持久化，以及标记命令和 WebMCP 的审阅后应用流程。WebMCP 的 15 个工具涵盖工程检查、字幕/音频/标记/画面编辑、已有素材与画中画插入、真实导出进度与结果。
- 整合 main 的工程导入真实进度、媒体恢复后编辑、后台缩略图细化、播放与音频分轨性能改进，以及纯色背景/透明度导出修复、失败重试和应用裁剪、速度、音量、淡入淡出、空间效果的 WAV/MP3 音频导出。

11 份根 README、Hugging Face Space README 和 Skill README 的项目动态冲突按上述范围整合，每份保留最多五条、日期明确且最新在前；根 README 使用各自原语言。Anna 下载修复合入同日修复条目，保留 Anna 自动恢复与手动窗口尺寸说明；main 非冲突功能正文及路线图、版本、问题链接保留。按照项目约定，未合入 main 首次语言页新增的推广徽章。

## 本轮验收与测试草稿

| 项目 | 状态 |
| --- | --- |
| 全仓冲突处理 | 全部合并冲突已解决 |
| 静态检查 | `npm run lint`：0 errors、71 warnings；typecheck 通过 |
| Anna 构建 | `build:anna` 完成，170 文件、约 200.7 MiB；入口 `editor-B7jCIuYf.js`、样式 `editor-hiwZQ3Ye.css` |
| CLI 严格校验 | 官方 CLI `0.1.52` strict validate PASS，dispatcher `0.22.0` |
| 本地回归检查 | 14 项导出合同检查及存储回归检查通过 |
| 独立真实浏览器音频导出 | WAV/MP3 裁剪 2–4 秒得到 2 秒音频，40% 音量正确；2 倍速输出 1 秒并保持 880 Hz，所有输出均经 ffmpeg 成功解码。此结果来自本地开发环境，不是生产 Anna 宿主验收 |
| 主流程运行验证 | 独立真实 Chromium 中 6 项检查通过：3 秒视频及中文字幕导出为 .timeline，再经真实 Worker 导入、自动保存和销毁/重建 iframe 恢复；15 秒标记保留，媒体时长仍为 3 秒，视频播放时间实际前进。延迟握手、空闲及重开均无 `window.resize` 请求，页面运行异常为 0 |
| 测试草稿上传与安装 | 使用 `apps push --if-match 16` 更新为 r17；回读 bundle ready，dirty_vs_latest_cut=true。官方 CLI 哈希算法复算与云端内容哈希一致；控制台安装成功，刷新 Dashboard 后实际入口为 `editor-B7jCIuYf.js`，新增标记入口可见，原视频/音频/中文字幕工程恢复，自动保存就绪；640×360 视频 readyState=4，无媒体错误 |
| 审核及发布边界 | 云端 alpha.5（version id 776）仍为 `pending_review`；仅更新工作草稿，未冻结新版本、未替换审核候选、未执行公开 Release，未推送 Git 远端 |

r17 内容哈希：`60b37ac624e60a9c3380a9427b7045d9d8d38d2a95995a87dedf6bdec33bb790`；实际包大小 210,422,364 bytes，170 个文件。最终线上回读时间：2026-09-15 09:55:45 UTC。本轮未重新覆盖所有大型 AI 模型或所有导出格式的生产端完整验收，音频编码精度结论来自隔离的本地 Anna 配置浏览器。

合并时特别补齐：Anna 导入同步忙状态保护；标记的 session 快照、恢复、历史签名和新建清空；字幕预设撤销接线；Anna 渲染强制视频/MP4 合同；异步文件接收完成与无效接收器提前失败保护。Anna manifest、CSP、模型镜像和窗口 host_api 保持原配置。

本轮开始前的 alpha.5 审核状态见 [窗口修复送审记录](anna-review-window-fix-20260915.md)；已有平台适配、恢复与窗口边界见 [Anna 接入说明](anna-integration.md)、[当前工程恢复记录](anna-session-recovery-20260915.md)和[窗口稳定性记录](anna-window-stability-20260915.md)。这些是历史基线，不替代本轮验收。

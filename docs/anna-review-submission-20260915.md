# Anna 当前工程自动恢复重新送审记录 · 2026-09-15

**历史记录：** 此后的窗口稳定性修复已随 alpha.5（版本 `776`）重新提交，并替换本页记录的 alpha.4 候选。当前审核状态见 [alpha.5 送审记录](anna-review-window-fix-20260915.md)。本页保留工程恢复修复的原始验收与提交证据。

已按用户要求将通过生产验收的 r15 冻结为 **`0.1.0-alpha.4`（版本 `775`）**，逐文件核对后重新提交审核。服务端确认 **`pending_review`、`review_candidate_version: 0.1.0-alpha.4`**；alpha.3 已不再是本轮审核目标。新版本尚未公开发布，审核批准后可能立即上架。

| 项目 | 已确认结果 |
| --- | --- |
| 应用 | Timeline Studio，app ID `254` |
| 分支及已验收代码 | `codex/anna-validation`；`c83bb6c` |
| 来源草稿 | r15，ready，已安装并完成本轮生产样本验收；169 文件、210,065,880 字节 |
| 草稿内容哈希 | `4fbb994430f8bb84311868c04f4da71996635339697d6251c9f256072c546941` |
| 新冻结版本 | `0.1.0-alpha.4` |
| 新版本 ID、创建时间 | `775`；`2026-09-15T08:54:20.388078`（服务器时间） |
| 冻结包 ID、就绪状态 | bundle `736`；`bundle_ready` |
| 冻结包文件清单 SHA-256 | `4da4eb6e736133ccd85beab6c5e461955ed153701bd4d8326919d6ae34a9dd7a`；169 文件的 SHA-256 和字节数逐一与本地 r15 相符 |
| 提交读回 | `2026-09-15T08:56:28.427Z`：`pending_review`，候选 `0.1.0-alpha.4` |
| 原候选 | alpha.3 / `759` 保留历史记录，已被 alpha.4 替换 |
| 公开发布 | `is_published: false`，alpha.4 `published_at: null`；尚待官方审核，获批可能立即上架 |

## 本次修复与生产验证

本轮恢复范围为**同一浏览器、同一 Anna 账号**。当前工程及素材 Blob 存在浏览器 IndexedDB，Anna scoped KV 只保存用于定位本机记录的随机 namespace 及格式版本，不保存工程或素材，也不提供跨设备云同步。顶栏只有在写事务完成后才显示“已自动保存到此浏览器”；保存失败保留已有记录，恢复期间新编辑或记录修订冲突暂停覆盖，由用户选择恢复上次工作或保留当前工作。浏览器清理数据、存储被回收或保存未完成时无法保证恢复。

| 验证 | 已记录结果 |
| --- | --- |
| r15 生产第一次关闭重开 | 在真实 Anna 容器恢复 640×360、3 秒合成视频、1.5 秒音轨及中文字幕；窗口 ID 已改变。视频 `readyState=4`，音频播放时间实际推进，无媒体错误。 |
| r15 生产第二次关闭重开 | 恢复后继续修改字幕，等待已保存状态，再关闭至 iframe 数量为 0 后重开；最新字幕、视频和音轨恢复，可继续编辑。最终浏览器 warning/error 查询为空。 |
| 本地恢复与账号隔离 | 真实 Chromium 中的 iframe 销毁重开、整页刷新、模拟 Anna 账号 A/B 隔离通过；新建空工程后重开保留空时间线与素材库。 |
| 本地并发与失败保护 | 真实 IndexedDB 的跨页面 Blob 字节恢复、并发 CAS 仅一方成功、事务中止后 current/previous 均保持原内容通过；恢复期间编辑保护及空工程未保存关闭保护通过隔离验证。 |
| 本地构建检查 | Anna 构建、typecheck、定向 ESLint 和官方 CLI `0.1.52` strict 校验通过；ESLint 为 0 errors，App 保留 7 条既有 unused-variable warnings。 |

生产样本使用临时合成视频和正弦音频，没有重新运行付费生成或全部 AI 模型。关联原音、视觉分析记录、增强前后媒体及音色原音的恢复依据本地 Blob 字节和状态验证，不等于对应 AI 推理在生产环境重新通过。完整结果见 [自动恢复实现与验收记录](anna-session-recovery-20260915.md)；QA 脚本和测试媒体留在仓库外临时目录。

## 保留的既有验收范围

前次 r14 的下载修复与晴岚中文配音验证仍为对应版本的历史证据：同页两次生成约 3.79 秒和 2.54 秒音轨，播放均推进至结尾；第二条短句耗时在 154–205 秒之间，中文生成明显偏慢。本轮自动恢复验证没有重新验收其它音色、全部 AI 模型、刷新后的语音模型持久缓存、主观音质或浏览器触发的音频文件实际落盘。详见 [9 月 14 日语音修复验收](anna-voice-download-fix-20260914.md)。

此前权限弹窗 `manifest does not declare agent.session.auto` 问题仍保留为待平台排查事项；本次不宣称它已修复，也不通过添加无用 Agent-session 权限绕过。详见 [权限保存复现](anna-permission-save-repro-20260911.md)。

## 实际提交的版本说明

```text
Fixes current-project loss when the Anna app window is closed. Supersedes alpha.3 with the recovery fix verified in working draft r15.

The current project, imported media, audio clips and captions now autosave to IndexedDB and restore automatically when the same Anna account reopens the app in the same browser. No manual checkpoint selection is required. Save status becomes successful only after the current snapshot transaction commits; startup reads before writing, concurrent edits are protected, and failed writes preserve the previous record. Media URLs are recreated for each window. This restores the current project, not the undo/redo stack, and does not provide cross-device sync or automatically upload media to the cloud.

Production validation on r15: imported a 3-second 640x360 video, a 1.5-second audio clip and Chinese captions; closed the Anna window and reopened it with a new window ID; confirmed restored tracks, video decoding and audio playback. Edited the restored caption, waited for autosave, closed until no app iframe remained, then reopened again and confirmed the latest edit. Final browser warning/error log query was empty. Local real-browser checks covered page refresh, simulated account isolation, new/empty project recovery, concurrent revision conflicts and transaction rollback. Build, typecheck, targeted lint (no errors) and strict CLI 0.1.52 validation passed. Code: c83bb6c on codex/anna-validation.

Suggested review: import media, add a caption and audio clip, wait for the top-bar Autosaved to this browser status, close the app window, reopen Timeline Studio, then edit and repeat. Clearing browser site data or closing before a save finishes can prevent recovery; explicit project export/cloud save remains available for independent backups.

The earlier voice-download fix is retained. This round did not rerun every AI model or resolve the previously reported platform Permissions dialog issue; it adds no unused Agent-session permission. Existing diagnostics: https://forum.anna.partners/t/timeline-studio-production-wasm-csp-blocker-and-strict-validator-false-positive-minimal-reproductions/296
```

## 冻结、提交与部署结果

使用固定官方 CLI `0.1.52` 的已安装官方客户端。冻结前核对 app `254` 的工作草稿仍为 r15、ready 且内容哈希匹配；`cut` 返回版本 `775`、bundle `736`。重新读取冻结包，对所有 169 个文件逐一比较 SHA-256 和字节数，确认与已验收的本地 r15 完全一致，随后重新提交审核。

`2026-09-15T08:57:44.728Z` 的独立 GET 确认候选已换为 alpha.4、状态 pending_review，版本 published_at 为 null。控制台另行确认显示 `In review: v0.1.0-alpha.4`。此轮没有删除旧版本、执行 Release 或推送 Git 远端，也没有变更已验收的运行时代码。此前 r15 安装验收仍适用于逐文件一致的 alpha.4 冻结包；本轮未重新运行全部模型。

旧 alpha.3 的 [9 月 14 日送审记录](anna-review-submission-20260914.md) 保留为历史。

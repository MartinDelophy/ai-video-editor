# Anna 窗口稳定性修复重新送审记录 · 2026-09-15

用户明确要求将窗口稳定性修复替换为新的审核候选。已从验收通过的 **r16** 冻结 **`0.1.0-alpha.5`（版本 `776`，bundle `737`）**，核对冻结内容后重新提交。服务端确认 **`pending_review`、`review_candidate_version: 0.1.0-alpha.5`**，旧 alpha.4 已被替换。本次未公开发布，没有执行 Release 或推送 Git 远端。

| 项目 | 已确认结果 |
| --- | --- |
| 应用 | Timeline Studio，app ID `254` |
| 分支及修复代码 | `codex/anna-validation`；`798bc7d` |
| 来源草稿 | r16 ready，已安装并完成本轮窗口样本验证；169 文件、210,063,979 字节 |
| 草稿内容哈希 | `7d70b75e504a28c65096fa65d3a27ed9c3f9ab9b0ac815490764ea7eb9120c30` |
| 新冻结版本 | `0.1.0-alpha.5`，版本 ID `776` |
| 创建时间 | `2026-09-15T09:30:18.717246`（服务器时间） |
| 冻结包 | bundle `737` |
| 包文件清单 SHA-256 | `a0b4308820c424d9019c6b5a045e2c4b6f848093caee788a112312ecb9d69525` |
| 冻结内容核对 | 169 个文件的路径、SHA-256 和字节数均与本地已验收包相符 |
| 冻结 manifest | 控制台 View 已核对 Window API 仅为 `ready`、`set_title`，不含 `resize` |
| 提交及独立读回 | `2026-09-15T09:33:22.985Z`：状态 `pending_review`，`review_candidate_version` 与 `submitted_candidate` 均为 `0.1.0-alpha.5` |
| 控制台审核面板复核 | 明确显示 `v0.1.0-alpha.5 is pinned for this review` 和 `In review: v0.1.0-alpha.5` |
| 原候选 | alpha.4 / `775` 保留历史记录，已被 alpha.5 替换 |
| 公开发布 | `is_published: false`，`published_at: null`；未执行 Release，审核批准可能立即上架 |

固定官方 CLI `0.1.52` 完成冻结与重新提交。核对冻结 manifest 及逐文件清单后提交，并以独立服务端读回确认候选已替换；提交结果记录在仓库外 `/tmp/anna-alpha5-submit-result-20260915.json`。命令成功与待审状态不表示审核已通过或已公开上架。

## 修复行为与验证边界

移除 App 对 Anna 外层窗口的自动 `window.resize` 调用、宿主几何监听，以及不再使用的 manifest `resize` 声明。窗口尺寸和位置由用户及 Anna 原生窗口操作管理；编辑器保留对实际 iframe 视口的内部响应式布局，没有扩大权限。此前按照当前位置剩余空间计算宽高的逻辑，可能在连接、移动或视口变化后把用户手动设置的桌面窗口延迟缩小。

本地真实 Chromium 同源夹具 **13 项检查通过**，涵盖延迟握手、空闲、拖动、焦点/样式、宿主尺寸变化、最小化恢复动画、620↔1440 宽度及关闭重开后字幕恢复和视频播放；`window.resize` RPC 为 0，页面错误为 0。Anna build、ESLint（0 errors、71 条既有 warnings）、typecheck 和 CLI strict 校验通过。

真实 Anna 已安装 r16 并核对入口 `editor-DiIF98Hp.js`，工程及字幕恢复。用户确认手动调整窗口后，两次 DOM 读回相隔 **93.025 秒**，均为 **1394×828、位置 (140,39)**，iframe 为 1392×790，中文字幕和已自动保存状态仍在。这是该次手动调整后的稳定性样本，不代表覆盖全部宿主事件。完整根因、证据与限制见 [窗口稳定性纠正记录](anna-window-stability-20260915.md)。

当前工程自动恢复继续限定于**同一浏览器、同一 Anna 账号**：工程和素材留在本机 IndexedDB，Anna scoped KV 只存随机 namespace 及格式版本，不提供跨设备同步。此前 r15 的恢复和失败保护验证见 [自动恢复记录](anna-session-recovery-20260915.md)。本轮没有重新运行全部 AI 模型，也不扩大此前语音、文件下载落盘或主观音质的验收范围；平台权限弹窗问题仍按 [既有复现](anna-permission-save-repro-20260911.md) 保留，不能宣称已解决。

## 已提交的版本说明

以下文本来自本次提交使用的 `/tmp/anna-alpha5-changelog-20260915.txt`。

```text
Fixes the Anna window unexpectedly shrinking after opening or manual adjustment. Replaces the alpha.4 review submission with the tested r16 window-stability fix, while retaining current-project autosave and recovery.

Removed the app's automatic window.resize calls and host-geometry observers. The previous fit-to-remaining-space calculation could shrink a desktop window into mobile layout after the SDK connected, the window moved, or the viewport changed. Window position and size now remain under Anna's native controls and the user's manual actions; the editor still adapts internally to the actual iframe size. The unused window.resize manifest declaration was removed. No new permissions were added.

Validation: 13 local Chromium checks passed, including delayed handshake, idle, movement, focus/style changes, viewport changes, minimize/restore animation, 620/1440px manual sizes, and project recovery with captions and video playback. No app window.resize requests or page errors were recorded. The production r16 bundle was installed and its editor entry verified; the project and captions restored. After the user manually adjusted the real Anna window to 1394x828, two DOM observations 93 seconds apart confirmed unchanged size and position. Build, lint (0 errors), typecheck and strict CLI 0.1.52 validation passed. Code: 798bc7d on codex/anna-validation.

Suggested review: manually enlarge or move the app, wait, and confirm it keeps the chosen size; import media and add captions/audio, wait for Autosaved to this browser, then close and reopen. Current-project recovery remains local to the same browser and Anna account. This update does not provide cross-device sync, rerun all AI models, or claim to resolve the previously reported platform Permissions dialog issue.
```

旧 alpha.4 的 [自动恢复送审记录](anna-review-submission-20260915.md) 保留为历史。此次重新送审替换候选，不删除旧版本或将待审状态写成公开发布。

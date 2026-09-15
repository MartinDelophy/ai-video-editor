# Anna 默认云端自动保存重新送审记录 · 2026-09-15

默认云端自动保存已随 r19 测试草稿安装，当前工程和素材保存到 Anna 账号，移除手动开启步骤及 X 社区链接。确认真实云端保存、重开恢复与最终界面后，将 r19 冻结为 **`0.1.0-alpha.6`**，逐一核对全部 170 个文件再提交。服务端与控制台均确认 alpha.6 已替换 alpha.5 为当前审核候选；**待审核，尚未公开发布**。

| 项目 | 已确认结果 |
| --- | --- |
| 应用 | Timeline Studio，app ID `254` |
| 来源草稿 | r19；170 文件、210,464,151 字节 |
| 内容哈希 | `4baaee14e1348a751be2f54db7ef9d9c6f3f0d82e465531d295097dd0aa2b973` |
| 冻结版本与包 | `0.1.0-alpha.6`，版本 `777`，bundle `738` / `bundle_ready` |
| 冻结核对 | 170 个文件的 SHA-256 和大小逐一与验收包相符 |
| 生产样本 | r18 保存后关闭重开仍为 19:42，无额外保存；r19 最终 cloud saved 19:42、9:16、00:07.59，1080×1920 / 7.6 秒视频 `readyState=4`、error null；状态区按钮 0，社区入口仅 Discord/GitHub |
| 静态与构建 | lint 0 errors、71 条既有 warnings；typecheck、Anna build、CLI strict 通过 |
| 独立服务端回读 | `2026-09-15T11:55:14.098Z`：`pending_review`，review/submitted candidate 均为 `0.1.0-alpha.6` |
| 控制台复核 | `In review: v0.1.0-alpha.6`，pinned candidate 为 alpha.6 |
| 发布状态 | `is_published=false`，`published_at=null`；没有公开上架 |
| 本地提交 | 见包含本记录的 Git 提交 |

[官方发布文档](https://anna.partners/developers/apps/app-publish.md) 明确允许在 `PENDING_REVIEW` 时冻结新版本并再次 `submit-review`，将审核候选切换到最新冻结版本并重新预检；预检失败保留旧候选，相同候选重复提交为幂等操作。本轮按该流程替换候选，不把待审状态当作审核通过。

证据：独立提交回读 `/tmp/anna-alpha6-submit-result-20260915.json`；默认流程的隔离验证 `/tmp/anna-default-cloud-editor-20260915/QA-summary.md`；[完整架构与验收记录](anna-autosave-retry-20260915.md)。隔离故障注入记录了既有 Puter SDK 全局监听器产生的额外 pageerror，不宣称零异常；首次云端指针创建非原子，未扩大为所有工程规模、所有 AI 模型或实际播放时间推进的验收。[alpha.5 记录](anna-review-window-fix-20260915.md)保留为历史。

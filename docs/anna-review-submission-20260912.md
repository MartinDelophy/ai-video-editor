# Anna 再次送审记录 · 2026-09-12

用户在 r13 窗口适配验收和本地提交完成后，明确要求“接着送审看看”。已通过登录中的官方 Developer Console 执行冻结和审核提交，没有推送 Git 远端。

| 项目 | 已确认结果 |
| --- | --- |
| 应用 | Timeline Studio，app ID `254` |
| 本地实现 | `codex/anna-validation`，`ccb3f7c` |
| 来源草稿 | r13，ready |
| 冻结版本 | `0.1.0-alpha.2`，版本 ID `750` |
| 冻结详情显示的创建时间 | `2026/9/12 07:37:51` |
| 内容哈希 | `03c07eb3fa6ad46b75c415e3fed380700961df562537e3d2fd2388e9167e484b` |
| 审核状态 | 控制台显示 `In review: v0.1.0-alpha.2`、`review candidate` 和 `Submitted for review.` |
| 发布状态 | `Unpublished`；没有执行独立 Publish/Release 操作 |

通过 **Working draft → Cut version…** 冻结 r13，未使用仍预填旧清单的 New version 表单。随后在新版本的 View 详情确认完整内容哈希，以及 `min_size: 360×480`、`window.resize`、`'wasm-unsafe-eval'`、Commons 域名和 `agent.session.auto: false / fixed: null`。审核按钮明确指向 alpha.2 后才提交。

提交点击期间浏览器控制发生超时，未重试提交。重新连接后，同一页面明确显示候选已锁定为 alpha.2，并显示提交成功。版本表中的通用 `Unpublished` 提示仍有“尚未送审”措辞，但专门的审核区域和候选标识均明确为审核中；此处不将该通用提示当成未提交。

审核区域说明，新切版本不会自动替换正在审核的候选，除非再次提交。页面亦明确提示批准会立即发布到 App Store；此次送审不保证获批后仍私有。

## 已提交的版本说明

```text
Validation preview based on tested working draft r13.

Changes since alpha.1: added product screenshots; fixed Wikimedia library access; made Auto Edit changes visible and disabled Apply for unchanged plans; adopted CLI 0.1.52 / SDK 0.16.1 and single-threaded WASM resources; updated cloud-storage conditional writes and cached executable response headers; added desktop-window fitting and short-viewport layouts.

Production checks passed across the updated drafts: stock search and video preview, Anna AI trimming, cloud project save/restore with media, real Piper French speech, and MP4 export with source audio. The 8-second 720p H.264/AAC export was retrieved via the official storage API and independently decoded and compared with source audio (21.333 ms AAC delay). r13 additionally passed window fitting in an 851x914 host and restoration of the saved 8-second project. Strict CLI validation and both builds passed.

Review follow-up: the Permissions dialog still fails with "manifest does not declare agent.session.auto" for our app with no Agent-session declarations. Clearing hidden grants worked temporarily; the subsequent draft push/install sequence restored them. Please investigate this platform grant-reset/save behavior. Browser-triggered file delivery and the remaining local AI models are not yet fully verified. Retained all local AI features with honest capability/error states.

Existing engineering report: https://forum.anna.partners/t/timeline-studio-production-wasm-csp-blocker-and-strict-validator-false-positive-minimal-reproductions/296
```

完整复测见 [平台更新适配](anna-rollout-adaptation-20260911.md)、[窗口适配验收](anna-window-layout-20260912.md) 和 [权限保存复现](anna-permission-save-repro-20260911.md)。版本说明已随候选提交；没有另行发送邮件、Discord 消息或论坛回复。

# Anna 下载修复重新送审记录 · 2026-09-14

用户明确要求撤销旧审核并重新提交本次修复。官方 CLI 支持重新提交后将候选绑定到最新冻结版本，因此通过 `apps cut` 与 `apps submit-review` 替换了 alpha.2 的审核目标，没有删除旧版本或丢弃草稿。网页登录失效后使用现有已授权 CLI 凭证完成操作。

| 项目 | 已确认结果 |
| --- | --- |
| 应用 | Timeline Studio，app ID `254` |
| 分支及已验收代码 | `codex/anna-validation`；修复 `ccb543a`，验收记录 `83b7902` |
| 来源草稿 | r14，ready，169 文件、210,030,022 字节 |
| 草稿内容哈希 | `6f8e3f360b312875e5e001895b90c598f4dfa04363e3ade10f032477a725afdb` |
| 新冻结版本 | `0.1.0-alpha.3`，版本 ID `759` |
| 创建时间 | `2026-09-14T04:54:10.344047`（服务器时间） |
| 冻结包 | bundle `720`，`bundle_ready` |
| 包文件清单 SHA-256 | `74a04df0f5083abd8c513943ec00bffb8b84065ae155afe449a28c1a40014cca` |
| 提交读回 | `pending_review`，`review_candidate_version: 0.1.0-alpha.3` |
| 原候选 | alpha.2 / `750` 保留记录，已不再是本轮审核目标 |
| 公开发布 | 未发布，没有执行 Publish/Release；审核批准后可能立即上架 |

使用固定官方 CLI `0.1.52`。先执行 cut 的 dry-run 确认 app `254`，冻结后读取服务器 working draft、版本列表及 `getBundle(254,759)`。冻结包的 `connect-src` 和 `external_origins` 均包含精确的 `https://cdn-lfs-cn-1.modelscope.cn`；`script-src` 保留 `'wasm-unsafe-eval'`、没有一般 `'unsafe-eval'`。冻结包中 `model-cache-sw.js` 为 15,371 字节，SHA-256 `2c984d3a785c46e0ff14dbe320507a0e1d104047a23f3396dfd0462225619bbb`，与 r14 已验收构建一致。

确认冻结包后执行 `apps submit-review timeline-studio`，CLI 成功返回 alpha.3 为新的审核候选。 北京时间 12:56:19 的独立 GET 复核再次确认候选为 alpha.3 / 759，应用仍 `pending_review`，该版本的 `published_at: null`。没有调用独立撤销/删除操作，也没有推送 Git 远端。此次只冻结和重新提交已验收的相同构建，没有修改运行时代码或把原有验证扩大到其它模型。

## 已提交的版本说明

```text
Supersedes alpha.2 with the voice-download fix verified in working draft r14.

Fixes: allow the exact ModelScope shard redirect origin https://cdn-lfs-cn-1.modelscope.cn in the bundle policy; preserve valid model fetch responses when optional cache operations fail; remove the service worker's blind second fetch of the same failed URL. Pinned owned model revisions, mirror-equivalent cache identities, and existing permissions are unchanged.

Production validation on r14: Chinese captions with the built-in Qinglan voice completed two consecutive generations in the Anna container, producing approximately 3.79-second and 2.54-second audio clips. Both clips were added at their respective caption start times and timeline playback advanced to each end. The reported Failed to fetch did not recur, and the final browser warning/error query was empty. The production service-worker bytes match the built bundle and the actual CSP includes the required redirect origin. Build, typecheck, targeted lint, isolated service-worker fault checks, and strict CLI 0.1.52 validation passed.

Remaining review notes: Chinese inference is slow in this test environment (the second short sentence completed between 154 and 205 seconds). This is not a claim that every voice/model, refreshed persistent-cache reuse, subjective audio quality, or browser-triggered file delivery has been verified. The previously reported Permissions dialog error for agent.session.auto remains under investigation; this app does not request unused Agent-session permissions.

Existing engineering report: https://forum.anna.partners/t/timeline-studio-production-wasm-csp-blocker-and-strict-validator-false-positive-minimal-reproductions/296
```

两次晴岚真实生成、播放及性能限制见 [下载修复与验收记录](anna-voice-download-fix-20260914.md)。权限弹窗问题见 [权限保存复现](anna-permission-save-repro-20260911.md)。未另行发送邮件、Discord 消息或论坛回复。

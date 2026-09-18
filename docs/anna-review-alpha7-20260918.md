# Anna alpha.7 送审 · 2026-09-18

用户授权提交后，在 `codex/anna-validation` 上传已构建并严格校验通过的工作草稿 r20，冻结为 `0.1.0-alpha.7`，逐一核对 170 个文件的 SHA-256 与大小后提交审核。独立服务端回读确认候选已由 alpha.6 替换为 alpha.7，状态 `pending_review`，尚未公开发布。

- app ID：254；version ID：815；bundle ID：772。
- 文件数：170；总字节数：210456584。
- 工作草稿 content_hash：`e258c1c48552035032d058a6c1b50edae0debf73355205ad49a6af5af2ad2cea`。
- 冻结包 sha256_manifest：`818738a370e988f4316ee8dae52d5e70a75c35ee1ca101d6970f1e127587f490`。
- 移除 Discord 入口、Anna 插件标签、数字人和智能像框卡片。保留语音、音乐和默认云端自动保存。
- 本地功能提交：`8fd6af3`；生产语音与音乐复测记录提交：`3072ab7`。复测在 alpha.6 完成，详见 [复测记录](anna-voice-music-retest-20260918.md)，不扩大为 alpha.7 再次完整端到端验收。
- 构建通过，改动文件 ESLint 0 errors（24 条既有警告），官方 CLI 0.1.52 strict validate 通过。
- 自动审核跟进切换至 alpha.7 / 815，旧 alpha.6 不再是自动发布目标。未推送 Git。

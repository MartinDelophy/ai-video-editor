# Anna 首发材料与验收清单

日期：2026-09-07。**本地工作稿，未发布、未提交审核、未发送给平台。** 对应 `codex/anna-validation` 的维护版本，不代表云端 r3 已包含这些功能。

## 商店介绍候选

**名称：**Timeline Studio

**短描述：**Turn your editing brief into a reviewable plan, then refine and export your video.

**英文介绍：**Import your media into an editable timeline, describe the changes you want, and ask Anna AI for a plan. Review the proposed ordering and simple video trims before applying them. Continue editing captions, audio and visuals, then generate an MP4 using the browser's available encoder. Save a full local project checkpoint and restore it explicitly after reopening the app; up to two pre-restore backups help you return to your previous work.

The planning step uses your brief and clip metadata. It does not watch your video or listen to its audio. Local-model features depend on the container's capabilities and display an explanation when unavailable. Cloud media transfer is unavailable in this validation build pending platform verification. Desktop Anna windows are the initial validation target.

该文案不承诺智能理解画面、不承诺所有模型可运行、不将 grant 或有效使用认定写为产品保证。只有最终候选版本满足下列验收后，才将与实际版本一致的文案写入商店资料。

## Anna 专用数据说明草案

这份说明记录应用自身的数据流，还需要在正式隐私页面中补充维护者联系方式及核对后的平台政策链接。

- **媒体与本地工程：**用户导入的媒体用于浏览器编辑和导出。点击保存草稿会把含素材的工程归档保存在浏览器 IndexedDB；刷新不会自动恢复时间轴。恢复前会保存当前工程，最多保留两份恢复备份。草稿和恢复备份有分别下载、删除的操作。清除浏览器站点数据也可能使本地工程丢失。
- **AI 剪辑规划：**只有点击生成方案时，应用才把输入要求、输出语言以及片段 ID、名称、类型、时长和裁剪许可发送给 Anna 平台模型。此步骤不上传媒体字节，也不分析视频帧或音轨。模型结果先展示供用户审阅，明确应用后才改变时间轴。取消前端等待不能保证远端计算立即停止。
- **云端文件：**当前维护版关闭工程上传、云端恢复及通过 Anna 下载视频的媒体传输入口。未来启用前必须完成真实往返验收并同步说明：上传工程包含其媒体；Host 下载视频需先上传成片。已有云端文件可通过平台元数据接口列出，用户可明确选择删除或修复最新工程引用；文件删除与引用更新不是一个事务，异常状态会如实显示。
- **模型与连接：**支持的本地模型可能向明确声明的模型镜像下载运行文件。Anna 身份与平台 AI 调用依赖宿主 SDK；应用不要求用户在前端填写开发者密钥。其它可选生成连接器的授权与数据流仍须按实际启用功能披露。
- **保留政策边界：**不承诺 Anna 模型输入不被保留或不用于训练；不承诺删除会立即清除平台备份。平台模型、对象存储及备份保留规则必须核对官方政策后再补充。浏览器下载成功通知不等于已经检查文件保存完成。

## 审核候选必须补齐的证据

- [ ] 本地实际下载的 12 秒和 60 秒 MP4：全量解码、切点前后画面、字幕、源音频/配音/音乐及首尾时长。
- [ ] Anna 生产窗口的实际下载和播放器复查，不能以本地容器代替。
- [ ] 平台修复后，真实工程上传、重新打开、恢复与媒体播放；再解除云端传输开关。
- [ ] 真实文件列表、分页、条件删除、引用修复、版本冲突和首次写入 CAS 验证；失败时不丢失当前工程、不重复上传。
- [ ] 生产 WASM 能力复测；若继续受限，逐项确认模型入口说明和可用导出路径。
- [ ] 保留真实 AI 的一次“要求 → 方案 → 应用 → 时间轴调整 → 导出”完整演示，注明规划的元数据边界。
- [ ] 与候选版本一致的截图、商店文案、可访问的 Anna 隐私说明、维护者联系方式和平台政策说明。
- [ ] 核对该候选构建、manifest、版本号和审核状态后，再冻结版本、提交审核；获批后才发布。

目前仍遵守用户的**只做本地提交、不推送远端**要求。清单中的云端步骤不应被理解为本轮已授权执行推送或公开发布。

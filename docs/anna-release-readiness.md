# Anna 首发材料与验收清单

日期：2026-09-07。**发布准备工作稿，尚未提交审核或公开上线。** 对应 `codex/anna-validation` 的维护版本；实际云端草稿修订号及复测结果以 [集成记录](anna-integration.md) 为准。

本轮用户已授权 Anna 生产端云存储和 WASM 复测，以及把变更更新到 Anna 私有工作草稿。这替代此前对 Anna 云端更新的“仅本地”限制；没有授权 Git 远端推送、提交商店审核或公开上线。以下审核命令是流程记录，不代表已经执行。

## 官方审核流程核对

核对日期为 2026-09-07。当前 `app.json` 的 `0.1.0-alpha.1` 是候选 SemVer；工作草稿修订号 `rN` 和安装用的 `0.0.0-draft` 不是已冻结的发行版本。审核前必须以服务器返回的版本列表确认是否已有该版本，不能仅依据本地文件判断。

| 阶段 | 命令或控制台入口 | 结果与验收点 |
| --- | --- | --- |
| 本地验证 | `npm run build:anna`、`npm run anna:validate` | 核对 manifest 与实际 bundle。当前严格扫描的 SDK 字符串误报须单独记录，不能通过扩大权限规避。 |
| 更新私有草稿 | `anna-app apps push --cwd anna --manifest manifest.json --bundle-dir bundle --if-match REVISION` | 更新一个可变工作草稿；先读取服务器当前 revision，再条件推送，冲突时停止覆盖。没有冻结版本或上架。 |
| 生产安装复测 | Developer Console → Timeline Studio → Versions → Working draft → Install & test | 确认新草稿 bundle 已 ready，重新打开后验收实际功能并记录修订号和构建哈希。 |
| 冻结候选 | `anna-app apps cut VERSION --cwd anna --slug timeline-studio --changelog CHANGELOG` | 将已验收草稿和依赖冻结为不可变版本。版本必须大于服务器已有最大 SemVer；不支持 `+build` 后缀。 |
| 首次商店审核 | Settings → Submit for review；或 `anna-app apps submit-review timeline-studio --cwd anna` | 首发从 `DRAFT`/`REJECTED` 进入 `PENDING_REVIEW`。记录返回的 `review_candidate_version`，核对它就是验收版本。 |
| 审批与发行 | 检查 Console、`anna-app apps status timeline-studio --json`、`anna-app apps versions timeline-studio --json` | 管理员可能批准并同时上线；若仅达到 `APPROVED`，后续 `anna-app apps release VERSION --cwd anna --slug timeline-studio` 是上线动作。 |
| 后续版本更新 | 新草稿 → 新 cut → `apps release VERSION` | 已上架应用的每个新版本仍需轻量 release review；待审期间原线上版本继续服务。检查 `release_review_state`、`is_latest` 与 `published_at`，不能凭命令退出成功判断已上线。 |

这些命令应通过项目固定的官方 CLI 版本运行；表中的 `REVISION`、`VERSION` 和 `CHANGELOG` 是待核实的参数，不是可直接复制的值。`apps publish` 是 `push` 与 `cut` 的组合，只形成发行候选，**本身不会公开上架**。工作草稿与冻结流程见 [官方 CLI 参考](https://anna.partners/developers/reference/cli.md)，SemVer 约束见 [版本文档](https://anna.partners/developers/apps/app-versioning.md)。

首发审核至少要求：完整商店资料、一个可用版本、验证成功、UI bundle 已完成 finalize，以及开发者亲自跑通端到端流程。审核会重新检查 manifest、执行工具目录、文案与截图的真实性；声明移动端的应用还须逐项通过移动适配清单。本项目目前只声明 desktop。官方未承诺审核时限，也没有审核邮件通知，应主动读取控制台状态。[发布文档，更新于 2026-08-26](https://anna.partners/developers/apps/app-publish.md)

**官方资料存在更新不同步。** 4 月的版本文档仍把发布描述为直接切换 `is_latest`；Anna 团队 8 月 17 日已明确说明，beta.124 起已上架应用每个新版本都需要 release review，beta.129 修复了审核队列及“获批但未上线”问题。本机官方 CLI `0.1.51` 的 release 实现也会识别 `release_review_state: pending` 并提示等待批准，应采用这个较新的流程。新 cut 不会自动替换当前 `review_candidate_version`，审核期间有修改时必须先核对控制台候选，不能假定新包已进入本轮审核。[官方逐版本审核答复](https://forum.anna.partners/t/is-review-now-required-for-every-new-app-version-i-couldn-t-find-this-change-in-the-changelog/224)

**提交审核有获批即上线的可能。** 发布文档允许管理员以 `publish: true` 批准；因此“提交私有草稿”和“提交商店审核”是不同动作。在用户确认可以面向公众发行且下方证据齐全前，不执行 `submit-review` 或 `release`。

## 当前 app.json 与商店材料差距

以下是对本地 `anna/app.json` 的核对，不代替服务器 Listing 的实际状态。官方 schema 必填项只有 `name`、创建时的 `slug` 和 `category`；其余字段虽是可选，仍应按产品数据流准备足够的审核材料。[商店字段文档](https://anna.partners/developers/apps/app-listing.md)

| 字段或材料 | 当前状态 | 后续处理 |
| --- | --- | --- |
| `name`、`slug`、`category` | `Timeline Studio`、`timeline-studio`、`productivity`，均满足格式与长度 | 维持现有身份；当前分类是合法值，`creative` 也是允许值，但不是必须修改项。 |
| `tagline`、`description` | 均低于 160 和 20,000 字符限制 | 本轮已补充两份恢复备份、模型限制提示、云端样本往返通过，以及文件生命周期和下载交付仍待验证的边界。 |
| `logo_file` | 已有 512px PNG，170,151 字节，小于 2 MB | 核对云端 logo 已上传且可见。官方上传会生成 256px WebP；本地文件不等于服务器已存在。 |
| `homepage_url`、`support_url` | 已提供项目首页和 GitHub Issues | 正式提交前验证公众可访问，并明确维护者支持渠道；不凭 URL 存在宣称可用。 |
| `privacy_url` | 缺失 | 编写并部署与 Anna 版真实数据流一致的可访问说明，再填入 URL；不能用此文档的本地路径代替。 |
| `screenshots`、`cover_url` | 均缺失 | 首发准备真实生产窗口截图，建议覆盖 AI 方案审阅、时间轴/导出、草稿恢复三步；screenshots 最多 6 个。Cover 可选，不能用概念图冒充实际功能。 |
| 版本 changelog 与演示 | 本文有草案，尚未冻结审核候选 | 为最终候选写准确 changelog，保存完整真实 AI 演示和验收记录；changelog 属于版本，不属于 Listing。 |

Listing 是所有版本共享的资料，不属于 `manifest.json`。修订前可运行 `anna-app apps sync-meta --cwd anna --manifest manifest.json --dry-run --json` 查看差异；实际同步也应确认文案与即将提交的构建一致。CLI `0.1.51` 的 `apps push` 会同步所提供的商店字段，因此即使只推私有草稿，也应先检查 `app.json`。不要把隐私地址、截图或价格编造为已准备完成。

## 商店介绍候选

候选版本变更说明（冻结时核对实际构建后使用）：

- 增加 Anna 容器能力提示，并阻止受限本地模型启动。
- 增加完整工程的显式云保存/恢复、文件列表及最新引用修复；保留并发条件与真实错误状态。
- 增加两份恢复前备份、分别下载和删除确认；工程解码完成后再提交，避免失败时部分覆盖。
- 原声读取失败时停止 Anna 导出，用户仍可明确选择无音频；普通独立站行为保持原样。
- 新增界面文案完整覆盖 13 种语言。桌面验证版仍保留本机下载、首次 CAS 等验收缺口。

**名称：**Timeline Studio

**短描述：**Turn your editing brief into a reviewable plan, then refine and export your video.

**英文介绍：**Import your media into an editable timeline, describe the changes you want, and ask Anna AI for a plan. Review the proposed ordering and simple video trims before applying them. Continue editing captions, audio and visuals, then generate an MP4 using the browser's available encoder. Save a full local project checkpoint and restore it explicitly after reopening the app; up to two pre-restore backups help you return to your previous work.

The planning step uses your brief and clip metadata. It does not watch your video or listen to its audio. Local-model features depend on the container's capabilities and display an explanation when unavailable. Explicit cloud-save and host-download actions upload the project archive, including its media, or exported video to Anna storage. Cloud project upload and restoration have passed a production sample check; broader file lifecycle and download delivery remain under validation. Desktop Anna windows are the initial validation target.

该文案不承诺智能理解画面、不承诺所有模型可运行、不将 grant 或有效使用认定写为产品保证。只有最终候选版本满足下列验收后，才将与实际版本一致的文案写入商店资料。

## Anna 专用数据说明草案

这份说明记录应用自身的数据流，还需要在正式隐私页面中补充维护者联系方式及核对后的平台政策链接。

- **媒体与本地工程：**用户导入的媒体用于浏览器编辑和导出。点击保存草稿会把含素材的工程归档保存在浏览器 IndexedDB；刷新不会自动恢复时间轴。恢复前会保存当前工程，最多保留两份恢复备份。草稿和恢复备份有分别下载、删除的操作。清除浏览器站点数据也可能使本地工程丢失。
- **AI 剪辑规划：**只有点击生成方案时，应用才把输入要求、输出语言以及片段 ID、名称、类型、时长和裁剪许可发送给 Anna 平台模型。此步骤不上传媒体字节，也不分析视频帧或音轨。模型结果先展示供用户审阅，明确应用后才改变时间轴。取消前端等待不能保证远端计算立即停止。
- **云端文件：**9 月 7 日生产样本上传、刷新后恢复及素材播放通过后，本轮开启媒体传输入口。上传工程包含其媒体；Host 下载视频需先上传成片。已有云端文件可通过平台元数据接口列出，用户可明确选择删除或修复最新工程引用；文件删除与引用更新不是一个事务，异常状态会如实显示。样本往返不代表首次并发写入、删除或本机落盘等全部路径均完成验收。
- **模型与连接：**支持的本地模型可能向明确声明的模型镜像下载运行文件。Anna 身份与平台 AI 调用依赖宿主 SDK；应用不要求用户在前端填写开发者密钥。其它可选生成连接器的授权与数据流仍须按实际启用功能披露。
- **保留政策边界：**不承诺 Anna 模型输入不被保留或不用于训练；不承诺删除会立即清除平台备份。平台模型、对象存储及备份保留规则必须核对官方政策后再补充。浏览器下载成功通知不等于已经检查文件保存完成。

## 审核候选必须补齐的证据

- [ ] 本地实际下载的 12 秒和 60 秒 MP4：全量解码、切点前后画面、字幕、源音频/配音/音乐及首尾时长。
- [ ] Anna 生产窗口的实际下载和播放器复查，不能以本地容器代替。
- [x] 真实工程上传、重新打开、恢复与媒体播放。2026-09-07，生产 r3 的 2 秒合成工程往返及恢复后播放通过；r4 开启显式云传输后，云端恢复回归亦通过。
- [x] 已有引用的条件保存、真实文件列表与最新引用修复。2026-09-07，r4 使用现有引用 etag 保存成功，列出四份工程及一份成片，并可重设已保存工程为最新引用而不重传媒体。
- [ ] 多页列表、条件删除、版本冲突和首次写入 CAS 验证；失败时不丢失当前工程、不重复上传。本轮未实际删除云端文件，不能以列表或引用修复成功代替这些验收。
- [x] 生产 WASM 能力复测。2026-09-07，真实编译/实例化仍被 CSP 阻止；这是已确认的限制，不是 WASM 兼容性通过。
- [x] 本地模型受限提示及 r5 原声失败保护、明确静音路径的生产样本。r4 已验证 Smart 卡片与 AI 音乐限制说明；r5 顶栏和 Anna 面板均停止不可读原声的导出，选择静音后生成 2 秒 1080p 预览。不能将这一结果写为 WASM 可用、带声交付或全部模型入口已逐项验收。
- [ ] 其它受限模型入口逐项核对，以及带声、复杂混合素材和长视频在生产容器中的完整导出验收。
- [ ] 保留真实 AI 的一次“要求 → 方案 → 应用 → 时间轴调整 → 导出”完整演示，注明规划的元数据边界。
- [ ] 与候选版本一致的截图、商店文案、可访问的 Anna 隐私说明、维护者联系方式和平台政策说明。
- [ ] 先冻结已验收的构建，再核对 manifest、SemVer、bundle 状态和 `review_candidate_version`；取得面向公众发行的授权后提交审核，并接受可能获批即上线的流程。

本轮可以继续生产复测并更新 Anna 私有草稿。上面的未勾选项目仍是首发证据缺口；草稿更新成功、SDK 调用返回成功或预览可播放都不能替代这些验收，也不表示已通过商店审核。

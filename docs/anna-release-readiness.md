# Anna 首发材料与验收清单

更新日期：2026-09-09。**首次送审后的修复与再次提交准备清单。** 应用 `254` 已于 9 月 7 日从 r5 冻结不可变版本 **`0.1.0-alpha.1`（版本 ID `684`）** 并提交首次审核；9 月 8 日 Anna Dev 邮件告知初检未通过并列出五项问题。9 月 9 日已按用户授权更新为 **working draft r6 ready**，仍未公开上架。

本轮通过官方 CLI `0.1.51` 的 `apps push --if-match 5` 上传了计划应用、素材库修复及两张截图。**已更新草稿，未冻结新版本、未再次送审、未推送 Git 远端**。用户保留全部本地 AI 功能入口、等待平台正式修复 WASM 后再提交的决定保持不变。完整历史验证和 9 月 9 日更新证据见 [修复记录](anna-review-feedback-20260908.md)。

## 2026-09-09 草稿与截图更新

重新执行 `build:anna` 和官方默认校验通过。r6 为 **159 文件、170,906,925 字节**，其中 152 文件复用、仅 7 文件上传；服务器 `content_hash` **`895b1a892beefd96dc479142234e107adf1f7bfd4d4ca88e17720d6d9c330bb5`** 与本地官方 `bundleHash` 一致，入口为 `editor-B61QoiTy.js`。服务器已读回 Commons 三个精确域名和两张截图 URL；截图 CDN HEAD 均为 HTTP 200、`image/webp`，详情见 [截图来源记录](../anna/listing/NOTES.md)。

更新后服务器仍为 `rejected`，`review_candidate_version: null`；唯一不可变版本仍为 `684` / `0.1.0-alpha.1`、`published_at: null`。草稿 ready 与图片可访问不等于新生产运行验收、权限弹窗或 WASM 已修复，也不构成重新送审。

## 2026-09-09 生产 r6 复测结果

已通过真实 Anna 的 **Working draft → Install & test** 安装 `0.0.0-draft`，运行脚本为 `assets/editor-B61QoiTy.js`，对应已核对的 r6。默认 Agent 显示 Cloud 休眠、使用时唤醒；当前应用没有 Executa，因此这不是 Linux 工具链执行通过的证据。完整步骤与数据见 [生产复测记录](anna-cloud-retest-20260909.md)。

**本轮通过：**Commons `nature` 返回 24 条真实结果并成功播放预览；本地上传同一样本完成素材准备；真实 Anna AI 将 35.886 秒素材裁为源 5–15 秒的 10 秒工程，Apply、一次 Undo、Redo 和第二次真实 no-op 均符合预期；6.41 MiB 工程完成云保存、整个 dashboard 刷新、显式恢复及媒体播放。720p 静音 H.264 成片生成并在浏览器中显示为 10 秒、1280×720、无媒体错误；Anna 文件列表新增 5.91 MiB MP4。

**仍受阻：**WASM 报 `host_error`，AI Voice 显示容器无法运行所需本地模型；仅含 `llm.complete` 的权限弹窗保存仍报 `manifest does not declare agent.session.auto`；另一个经独立检查确有 AAC 原声的 12 秒 H.264 视频，在选择“混合全部启用轨道”后导出报 `ANNA_SOURCE_AUDIO_UNAVAILABLE` 并停止，没有新成片或下载链接。源文件检查不等于导出成片验收。

**仍未证实：**MP4 本机实际落盘及独立全量解码。点击静音成片下载后，浏览器工具等待下载事件超时；这不足以判定 Anna 下载失败。素材库原生导入、复杂混音和长视频导出亦未在这轮生产检查中通过。strict-validator 的既有误报本轮没有重跑。没有冻结新版本、重送审或推送 Git 远端；保留全部本地 AI、等待平台修复的决定不变。

收尾时再次从 Anna 恢复至已保存的 10 秒工程；官方只读查询仍为 r6 ready、同一哈希、`rejected`、`review_candidate_version: null`，唯一不可变版本 `684` / `0.1.0-alpha.1` 的 `published_at: null`。本轮静音成片只核实了浏览器解码就绪和时长/尺寸，没有观察其播放时间推进；素材搜索结果的缩略图也没有逐项验收。

## 2026-09-08 初检反馈与当前阻塞

| 官方反馈 | 当前处理 | 再次提交前 |
| --- | --- | --- |
| 缺少产品截图 | 两张本地 Anna 版真实截图已于 9 月 9 日上传并关联应用；两个 CDN URL 均返回 HTTP 200 | 核对与最终候选一致，补生产 AI 操作截图；本地截图不冒称生产截图 |
| 权限保存报 `manifest does not declare agent.session.auto` | r6 生产权限页仅显示已声明的 `llm.complete`，保存同样报错；已有授权下真实 AI 调用成功，未添加无用权限 | 平台修正权限保存逻辑后，以同一 LLM-only 配置重新验证保存与调用 |
| Video 素材搜索 `nature` 失败 | 已补精确域名并随 r6 上传；9 月 9 日生产搜索及播放预览通过，本地上传同一样本亦通过；9 月 8 日本地库内视频和音乐轨道导入证据保留 | 补 r6 生产素材库原生导入/拖入及音乐流程；不能把本地上传写成库内导入 |
| AI Voice 被容器阻止 | r6 生产 WASM 与 AI Voice 仍受限，保留全部功能入口；有效带声样本导出亦明确停止 | 等待支持的生产 WASM 配置，定位原声读取失败，复测真实语音、本地模型及带声导出 |
| AI 方案应用后没有可见变化 | r6 生产真实 LLM 裁剪、Apply/Undo/Redo 与真实 no-op 已通过，无变化方案禁用应用 | 对未来实际送审候选保留对应生产演示及构建身份 |

此前 Anna 与独立站构建均通过，普通校验及重点 ESLint 通过；当时的严格扫描为已上报 SDK 字符串误报，本轮生产 UI 复测未重跑它。浏览器集成验收、构建哈希与截图来源已记录于修复文档。9 月 8 日官方 CLI 只读查询确认服务器为 **`rejected`，未上架**，唯一版本仍为 `684`，没有新候选；9 月 9 日更新时再次核对了这一状态。最新生产样本结果见上节，不能扩大为全部验收通过。

## 官方审核流程核对

流程文档核对日期为 2026-09-07。`app.json` 的 `0.1.0-alpha.1` 现已是不可变版本 `684`，不能覆盖；修复后须在读取服务器版本列表后选用更高 SemVer。工作草稿修订号 `rN` 和安装用的 `0.0.0-draft` 与冻结版本不同，不能仅依据本地文件判断审核候选。

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

首发审核至少要求：完整商店资料、一个可用版本、验证成功、UI bundle 已完成 finalize，以及开发者亲自跑通端到端流程。审核会重新检查 manifest、执行工具目录、文案与截图的真实性；声明移动端的应用还须逐项通过移动适配清单。本项目目前只声明 desktop。官方未承诺审核时限；本次已收到 Anna Dev 初检邮件，仍应结合控制台返回值核对当前状态。[发布文档，更新于 2026-08-26](https://anna.partners/developers/apps/app-publish.md)

**官方资料存在更新不同步。** 4 月的版本文档仍把发布描述为直接切换 `is_latest`；Anna 团队 8 月 17 日已明确说明，beta.124 起已上架应用每个新版本都需要 release review，beta.129 修复了审核队列及“获批但未上线”问题。本机官方 CLI `0.1.51` 的 release 实现也会识别 `release_review_state: pending` 并提示等待批准，应采用这个较新的流程。新 cut 不会自动替换当前 `review_candidate_version`，审核期间有修改时必须先核对控制台候选，不能假定新包已进入本轮审核。[官方逐版本审核答复](https://forum.anna.partners/t/is-review-now-required-for-every-new-app-version-i-couldn-t-find-this-change-in-the-changelog/224)

**提交审核有获批即上线的可能。** 发布文档允许管理员以 `publish: true` 批准；因此“提交私有草稿”和“提交商店审核”是不同动作。9 月 7 日首次提交已有用户授权；9 月 8 日最新决定是保留完整本地 AI 并等待平台修复，当前不执行新的 `submit-review` 或 `release`。

## 当前 app.json 与商店材料差距

以下是对本地 `anna/app.json` 的核对，不代替服务器 Listing 的实际状态。官方 schema 必填项只有 `name`、创建时的 `slug` 和 `category`；其余字段虽是可选，仍应按产品数据流准备足够的审核材料。[商店字段文档](https://anna.partners/developers/apps/app-listing.md)

| 字段或材料 | 当前状态 | 后续处理 |
| --- | --- | --- |
| `name`、`slug`、`category` | `Timeline Studio`、`timeline-studio`、`productivity`，均满足格式与长度 | 维持现有身份；当前分类是合法值，`creative` 也是允许值，但不是必须修改项。 |
| `tagline`、`description` | 均低于 160 和 20,000 字符限制；现有文案对应此前 r5/首次候选 | 9 月 7 日已补充恢复备份、模型限制、云端样本及交付边界；新修复部署前核对文案与新包一致。 |
| `logo_file` | 已有 512px PNG，170,151 字节，小于 2 MB | 核对云端 logo 已上传且可见。官方上传会生成 256px WebP；本地文件不等于服务器已存在。 |
| `homepage_url`、`support_url` | 已提供项目首页和 GitHub Issues | 正式提交前验证公众可访问，并明确维护者支持渠道；不凭 URL 存在宣称可用。 |
| `privacy_url` | 缺失 | 编写并部署与 Anna 版真实数据流一致的可访问说明，再填入 URL；不能用此文档的本地路径代替。 |
| `screenshots`、`cover_url` | `listing/editor-library.jpg`、`listing/export-settings.jpg` 已于 9 月 9 日上传，服务器已关联两个 CDN URL，HEAD 均为 HTTP 200；Cover 仍未配置 | 补最终生产 AI 方案审阅、工程恢复等真实流程；screenshots 最多 6 个。核对已上传本地截图与最终候选一致。Cover 可选。 |
| 版本 changelog 与演示 | 已冻结首次候选 `0.1.0-alpha.1`（`684`）；本轮新修复尚无新版本 | 为未来更高版本写准确 changelog，并保存真实 AI 演示与验收证据；changelog 属于版本，不属于 Listing。 |

Listing 是所有版本共享的资料，不属于 `manifest.json`。修订前可运行 `anna-app apps sync-meta --cwd anna --manifest manifest.json --dry-run --json` 查看差异；实际同步也应确认文案与即将提交的构建一致。CLI `0.1.51` 的 `apps push` 会同步所提供的商店字段，因此即使只推私有草稿，也应先检查 `app.json`。不要把隐私地址、截图或价格编造为已准备完成。

## 商店介绍候选

此前 r5/首次候选的变更说明基线（保留历史；未来新版本须另写本轮修复内容）：

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

## 再次提交前必须补齐的证据

- [x] 9 月 7 日冻结不可变版本 `0.1.0-alpha.1`（`684`）并首次提交审核；9 月 8 日收到初检未通过的五项反馈。此项仅记录流程，不能解释为审核通过。
- [ ] 根据五项反馈完成截图、权限保存、素材库、WASM 本地 AI 与方案应用的最新生产验收；本地代码修复不等于现有版本已更新。
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
- [ ] 待平台修复和上述验收完成后，再将新构建推进到草稿并冻结更高版本；核对 manifest、SemVer、bundle 状态和 `review_candidate_version`，遵守用户等待后再提交的决定。

本轮修复已更新至 r6 ready，截图已上传；没有冻结新版本或再次送审。上面的未勾选项目仍是交付及审核证据缺口；草稿更新成功、SDK 调用返回成功或预览可播放都不能替代这些验收，也不表示已通过商店审核。全部本地 AI 入口继续保留，等待平台提供正式 WASM 支持后再验证和提交。

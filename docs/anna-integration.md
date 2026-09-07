# Timeline Studio Anna Edition 开发与验证

更新日期：2026-09-07。当前工作位于 `codex/anna-validation` 分支，属于 Anna 适配验证。已注册应用为 **`@martindelophy/timeline-studio`（app ID `254`）**，最后确认的私有 working draft 为 **revision `3` ready**。9 月 5 日生产私有容器的核心五步——素材导入、视频播放、一项真实 AI 剪辑、MP4 生成预览和刷新后恢复完整草稿——已通过；方案应用、撤销和重做也已验证。当天发现 **R2 存储桶 CORS 未配置**和**生产 CSP 阻止 WASM**两项平台兼容性阻塞，9 月 7 日没有重新访问生产容器确认其状态。下面的新维护改动仅在本地，未推送 Git 远端或 Anna 草稿。实际下载与云端恢复仍待验证；尚未冻结版本、提交审核或上线，不能描述为全功能兼容或已具备送审条件。

独立站继续使用根目录 `index.html`、`vite.config.mjs` 和既有部署入口。Anna 构建直接进入同一编辑器，单独启用平台适配，不改变独立站 `/` 的直接编辑体验。

## 2026-09-07 本地维护结果（未推送）

- **能力入口：**Anna 启动时实际编译并实例化最小 WASM 模块。受限时，依赖本地模型的音乐、语音、字幕、视觉分析等入口显示原因与重试操作，并阻止启动模型组件。手动编辑和平台剪辑方案仍保留。这个探针不代表模型下载、GPU 推理或所有导出回退均可用。
- **云端传输：**`ANNA_CLOUD_TRANSFERS_VERIFIED = false` 是明确的发布策略，不是假探针；真实文件往返验收前，工程上传、云端恢复和 Host 下载均不可点击，运行时入口也拒绝传输。元数据文件管理与媒体传输分开。
- **恢复保护：**显式草稿旁增加下载、删除确认，以及最多两份含素材的恢复前备份。配额失败不覆盖旧备份；恢复过程中检测工程变更。导入器先完成归档读取与全部音频解码，再同步检查并提交状态；失败会释放新建 URL，原工程继续可用。零音量和旧版配音起点也得到保留。
- **云端文件生命周期：**新增限定应用目录的分页列表、带版本条件的删除、最新工程引用修复。文件已上传而引用失败时可仅修复引用，不重复上传；删除结果不确定时不声称成功或自动清理。首次引用写入使用 `if_match: ""`，仍需真实平台验证其缺失行语义。文件与引用是两次远端操作，不承诺事务性删除。
- **错误与重连：**身份、权限、配额、网络、超时、冲突和存储错误有可读说明；重连丢弃旧握手，避免重放请求。用户取消导出不会变成导出失败。新增文案在全部 13 种界面语言中直接提供。

本地验证使用官方 `--no-llm` 容器，未调用真实 AI、执行云端文件操作或改变云端草稿：

| 验证 | 2026-09-07 结果与边界 |
| --- | --- |
| 12 秒混合素材 | 三段视频、一张图片、四段字幕、配音及音乐导入；生成 MP4 后 DOM 解码为 1920×1080、12.032 秒、readyState=4 |
| 60 秒混合素材 | 视频源复用、图片、七段字幕、两段配音与音乐；从恢复备份找回后生成 MP4，DOM 为 1920×1080、60.032 秒、readyState=4 |
| 恢复前备份 | 保存 12 秒草稿；导入 60 秒工程；恢复草稿得到 12 秒；再恢复之前工程得到 60 秒，列表保留两份带日期及大小的备份 |
| 刷新与误删保护 | 保存完整 60 秒草稿；刷新后时间轴为空，显式恢复后五段主视觉、七段字幕、两段配音及音乐重新出现，播放推进至 0.64 秒。删除草稿先显示作用范围，取消后草稿仍保留；本轮未通过 UI 实际删除 |
| 受限模型入口 | 临时本地服务器使用 `script-src 'self'; worker-src 'self' blob:`；真实 WASM 编译被阻止，Smart 卡片显示“本地模型受限”，AI 音乐面板显示原因与重试按钮。此服务器不是生产容器 |
| 云端入口 | 本地 UI 显示待平台支持的原因，上传与恢复按钮禁用；没有进行真实云端传输 |
| 文件落盘 | IAB 中本机下载和媒体下载操作已触发，但工具未返回文件路径，也未在下载/临时目录发现成片。Chrome 补验因扩展未允许本地文件访问而无法导入。**实际 MP4 文件的全量解码、切点和音轨频谱验收仍未通过** |
| 代码检查 | 全量 ESLint 0 errors / 71 warnings；typecheck、独立站构建、Anna 构建及官方普通 validate 通过。Anna 包 159 文件、163.0 MiB；严格扫描的已知 SDK 文本误报仍保留 |
| 临时故障检查 | 15 项模拟 Host 文件生命周期、4 组 SDK 重连、13 项草稿/配额/并发保护、5 项真实归档的原子导入、7 项编辑 Hook 检查通过；不替代真实云端或浏览器落盘验证 |

合成媒体、验证脚本和临时工作区均留在仓库外。下一步是补齐实际下载文件验收、平台文件往返与版本冲突验证，以及生产受限入口复测。发布材料草案见 [`anna-release-readiness.md`](anna-release-readiness.md)。以下章节保留 9 月 5 日的生产基线，不能把其远端 revision 或耗时套用于本地新构建。

## 四个阶段与当前证据

| 阶段          | 已完成                                                                                                                                              | 待验证或完成                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1. 兼容性验证 | 本地及生产私有容器已导入视频；生产 IndexedDB、Cache Storage、Worker、Service Worker、WebGPU、H.264 探针通过；MP4 可预览，刷新后显式恢复完整草稿成功 | 生产 WASM 被 CSP 阻止，页面未跨源隔离；实际下载仍待复测              |
| 2. 首发任务   | 本地真实模式修复后时长 3→2→3→2 秒，第二次请求 447 tokens；生产私有容器的真实 AI 计划应用、撤销和重做也已通过                                        | 下载及云端保存恢复等完整交付流程仍待验证                             |
| 3. Anna 适配  | SDK、manifest、独立构建与缓存隔离完成；普通校验通过；`upload_init` 返回的精确 R2 origin 已随 revision 3 推送，生产 CSP 已确认生效                   | R2 未配置 CORS，生产 CSP 阻止 WASM；`--strict` 另有一条 SDK 文本误报 |
| 4. 提交审核   | 用户已完成注册激活及 CLI 登录授权；应用 254 的私有 working draft r3 已 ready，且已通过 Working draft → Install & test 安装 `0.0.0-draft`            | 尚未冻结远端版本、提交审核或发布；待解决平台阻塞并补全发布材料       |

2026-09-05 首次打包基线为 **158 个文件、162.8 MiB**；最大文件 `ffmpeg-core` WASM 为 **32,232,419 字节**。该初始包通过官方 CLI 严格校验。历史 revision 1 为 **159 个文件、170,809,266 字节**；revision 2 已完成上述生产核心流程验证。当前 **revision 3 为 159 个文件、170,810,875 字节**，服务器已确认 ready，状态为 `draft`，bundle hash 为 `254899bacc35669c3357189a77a28eb6b1e148988a419cbea4fb3e53f36c2837`。接入完整 SDK 后，普通校验仍通过，严格扫描出现下述一条已定位的文本误报，不能把最终包描述为严格校验全部通过。后续修改编辑器后必须重新构建，以新构建输出和验证结果为准。

最终 Anna 构建通过，耗时约 1 分 28 秒；普通独立站构建通过，耗时约 3 分 28 秒。全量 ESLint 为 0 errors、71 warnings；现有 TypeScript 覆盖范围的 typecheck 通过。这些构建检查不能替代浏览器与平台功能验收。

新增构建脚本通过 ESLint，产物模型 Worker 通过语法检查。临时执行的缓存边界检查确认了嵌套 scope 的资源匹配、不同镜像统一模型身份，以及不删除宿主或独立站缓存。检查脚本、媒体和测试工作区未加入仓库。

### 浏览器与平台验收记录

此表保留实际观察，不能用接口存在或本地页面能打开替代完整操作成功。

| 操作                         | 本地独立预览         | 官方本地容器                                                                                          | 真实 Anna 生产容器                                                  |
| ---------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 导入视频并播放               | 待记录               | 3 秒测试视频导入成功，播放时间正常推进                                                                | 已导入 3 秒视频；裁剪后恢复的 2 秒工程播放进度从 0.15 秒推进至 2 秒 |
| 缩略图、定位、拖动时间轴     | 待记录               | 完整交互仍待记录                                                                                      | 待验证                                                              |
| 真实 Anna AI 计划及错误处理  | 无平台连接时不可验证 | 5182 的 Gemini 3 Flash preview 两次真实请求成功，首次 504 tokens，第二次 447 tokens；异常分支仍待验证 | 真实 AI 方案已成功；异常分支待验证                                  |
| 查看变更、应用并撤销计划     | 待记录               | `musicSegments` props 缺失修复后，应用、撤销、重做均通过，时长依次 3→2→3→2 秒                         | 应用、撤销、重做通过                                                |
| MP4 生成与结果预览           | 待记录               | 默认设置导出完成，结果视频已解码；后台导出耗时约数分钟                                                | 已生成，1920×1080，duration=2，readyState=4                         |
| 下载 MP4 并核对实际文件      | 待记录               | 待验证                                                                                                | 待验证                                                              |
| 保存完整草稿、刷新后显式恢复 | 待记录               | 保存后刷新为空；点击恢复草稿后，3 秒时间轴和素材均成功恢复                                            | 显式保存 2 秒归档，刷新为空后恢复；2 秒时间轴、素材及播放均通过     |
| 显式云端保存、重新打开工程   | 无平台连接时不可验证 | `upload_init` 返回真实 R2 地址；OPTIONS 预检 403，明确报存储桶未配置 CORS，文件往返阻塞               | revision 3 生产 CSP 已含精确 R2 origin；待 CORS 修复后验证文件往返  |

上述容器验证使用官方 CLI **0.1.51** 和 Python 本地运行时 **0.2.0a23**。实际 iframe 的 `sandbox` 为 `allow-scripts allow-same-origin allow-forms allow-popups allow-downloads`，没有 `allow` 属性。容器内探测显示 **WASM、WebGPU、IndexedDB、Cache Storage、Worker、H.264 编码和 Service Worker 均通过**；**SharedArrayBuffer 不可用，页面未跨源隔离**。这些结果只证明本次官方本地容器的能力，不能直接代表已发布的生产 iframe。

在生产私有容器中，**WebGPU、IndexedDB、Cache Storage、Worker、Service Worker 和 H.264 探针通过**。revision 3 复测时 H.264 已通过，首次超时仅作为历史观察保留，不代表不支持。WASM 仍因生产 CSP 的 `script-src 'self' 'self'` 报 `host_error`；SharedArrayBuffer 因页面未跨源隔离报 `isolation_unavailable`。同一生产容器实际已经生成并解码 MP4，视频 DOM 为 **1920×1080、duration=2、readyState=4**。这个成片结果证明了本次使用的导出路径，不证明依赖 WASM 的本地 AI 和其他回退导出路径均可用。

本地容器导入素材为 **3 秒、640 × 360、24 fps 的 H.264/AAC MP4**。其默认导出结果的视频 DOM 报告 **1920 × 1080**、`duration = 3.029333`、`readyState = 4`。导出期间 IAB 存在多个标签页并进行过其他页面操作，后台完成耗时约数分钟；尚未完成同设置的前台对照，因此不能据此宣称导出流畅，也不能确认后台节流是唯一原因。

浏览器草稿复用包含素材字节的 `.timeline` 工程归档，只在用户明确点击时保存或恢复。启动时仅检查是否存在草稿；刷新后的空时间轴是当前显式恢复流程，不能称为自动恢复。本地容器已恢复 3 秒工程；生产私有容器已显式保存 2 秒归档，刷新后恢复了 2 秒时间轴与媒体，播放进度从 0.15 秒推进至 2 秒。revision 3 刷新后恢复再次通过。这些结果证明浏览器 IndexedDB 路径，不是 Anna 云端持久化验证。

## 首发任务的准确边界

首发 AI 以用户要求和当前主视觉片段的 ID、名称、类型、时长及是否允许裁剪为输入。**它没有获得视频帧、音轨或转写，不分析画面内容**。素材名称是不可信标签，不能作为系统指令。AI 请求仅在用户要求生成计划时发送这些信息。

- 一次最多处理 80 个主视觉片段，每个现有片段必须恰好出现一次；可以重排，不能省略、复制或虚构素材。
- 图片的偏移必须为零，时长保持原值。
- 视频计划只接受合法范围内的裁剪，片段时长至少 0.5 秒。`sourceStart` 是相对于当前片段的偏移，应用时再转换为源文件时间。
- 改变裁剪范围只适用于 1×、无速度曲线、无倒放、无变换关键帧及无相关复杂处理的片段；复杂片段的裁剪会被拒绝，不会被静默简化。
- 模型结果经过结构与素材校验，再转成现有命令引擎的重排、裁剪操作。先展示时间、时长及顺序变更，用户明确应用后才改变时间轴。
- 应用前核对工程指纹；计划生成后发生编辑、撤销或涟漪模式变化时，不能把旧计划直接套到新状态。
- 遵守主视觉和已关联源音频的轨道锁。时长变化沿用项目的涟漪编辑规则。
- 此版本不让模型新增特效、变速、配音、字幕或自动发布视频。仍可由用户在完整编辑器内手动调整并使用现有导出功能。

LLM 取消会停止前端等待；目前不能保证平台端计算同时取消。成功将下载交给浏览器，也不代表文件已被用户保存，状态文案必须保持这个区别。

实现入口：[`annaRuntime.js`](../src/lib/annaRuntime.js)、[`annaEditPlan.js`](../src/lib/annaEditPlan.js)、[`useAnnaDraft.js`](../src/hooks/useAnnaDraft.js)。

## 构建与本地启动

当前核对版本：Node.js **22.14.0**；官方 CLI **`@anna-ai/cli@0.1.51`**（要求 Node ≥ 22）；CLI schema **`@anna-ai/app-schema@0.22.0`**；应用 SDK **`@anna-ai/app-runtime@0.16.0`**，已固定在项目依赖中。

在仓库根目录执行：

```sh
npm run build:anna
npm run anna:validate
npm run anna:dev -- --no-watch
```

`build:anna` 生成 `anna/bundle`；`anna:validate` 使用固定 CLI 版本执行官方默认校验，当前包已通过；`anna:validate:strict` 单独保留严格扫描，仍有下述已知 SDK 文本误报，不能称为全部通过。`anna:dev` 在 5180 端口运行官方开发容器，并明确传入 `--no-llm`。这个默认入口用于检查容器与浏览器能力，不会产生真实 AI 结果。

### 官方严格扫描器的已知误报

2026-09-05 再次核对 npm，CLI 最新版本仍为 `0.1.51`，SDK 最新版本仍为 `0.16.0`。SDK 的异步工具等待功能中，有一段超时诊断文本包含 `recover via anna.tools.getJob({jobId})`。CLI 的 `scanHostApiCalls` 对完整文本做正则匹配，不区分字符串与实际 JavaScript 调用，因此对这段错误消息报出 `calls anna.tools.getJob ... does not grant it`。

Timeline Studio 没有调用该方法。源码与产物核对已确认命中的是 SDK 错误文本。Manifest 的 `ui.host_api.tools` 接受的是已声明的 Executa ID，不能把 `getJob` 填入当作方法授权；本项目也不应为了消除误报引入无用 Executa 或扩大权限。当前保留原 SDK 文本和固定版本；使用 `npm run anna:validate:strict` 可单独复现严格扫描结果，没有屏蔽该错误。

同一最终包执行普通 `anna-app validate --manifest anna/manifest.json --bundle anna/bundle` 已通过，证明该命令执行的 schema 与静态 UI/CSP 检查通过；它不能替代未通过的严格扫描。正式提交前需要平台修正扫描器，或由平台明确确认该可复现误报的处理方式。SDK 当前只提供整包入口；官方另有宿主提供的 `/static/anna-apps/_sdk/latest/index.js`，但它不固定版本，本项目没有为了改变扫描范围而改走该入口。[官方 SDK 文档](https://anna.partners/developers/apps/app-ui-sdk)

仅迭代界面时可用 `npm run dev:anna`，端口为 5181。它是直接运行的 Vite 编辑器预览，没有 Anna 宿主，不足以验证 Host SDK、生产沙箱权限或平台计费。正常独立站仍使用原来的 `npm run dev` 和 `npm run build`。

### 官方开发容器依赖

本机 `anna-app doctor` 检查通过：`uv 0.6.14` 已可用。CLI 已通过 `uvx` 获取并运行固定版本 **`anna-app-runtime-local@0.2.0a23`** 的 `anna-app-bridge`，官方本地容器已实际完成上表中的浏览器操作。无需克隆 Anna Nexus 仓库，也无需增加无实际用途的 Executa。

CLI 会在首次运行时生成用户目录中的 `~/.anna-app/dev.key`，要求权限为 `0600`；该文件不是发布包或仓库文件。Python 运行时下载、用户缓存和开发签名密钥均留在工具自己的用户/临时位置，不复制进项目。

用户已完成账号注册激活，并通过官方设备登录流程授予 CLI 90 天访问授权。带真实 LLM 和 APS 的开发容器已在 **5182** 端口启动。Gemini 3 Flash preview 的首次真实计划请求报告 504 tokens；第二次请求报告 447 tokens，并在修复 `musicSegments` props 后验证了 0.5–2.5 秒裁剪的应用、撤销和重做，时长依次为 **3→2→3→2 秒**。这些结果不代表 APS 文件上传、云端恢复或生产容器已完整通过。启动形式如下，`HOST` 必须替换为实际登录的 Anna host，不能原样使用：

```sh
npx --yes @anna-ai/cli@0.1.51 dev --cwd anna --manifest manifest.json --bundle bundle --slug timeline-studio --port 5182 --no-watch --llm-account HOST --storage aps
```

真实模式省略 `--no-llm`。CLI 明确拒绝将 `--storage aps` 与 `--no-llm` 或 `--mock-llm` 混用。默认 `legacy` 存储只是开发容器的内存状态，不能用来证明服务重启后的持久化。开发容器也不能替代审核前在实际 Anna App 窗口中的完整操作验证。参见[官方本地开发](https://anna.partners/developers/apps/local-dev)与[真实 LLM/PAT 配置](https://anna.partners/developers/apps/local-dev-llm)。

## 包结构、资源与缓存

- [`anna/app.json`](../anna/app.json) 存放 slug、名称、预发布版本及商店介绍；[`anna/manifest.json`](../anna/manifest.json) 只声明运行合同。当前为 schema 2 的 bundle-only 应用，`required_executas` 和 `optional_executas` 为空。
- [`vite.anna.config.mjs`](../vite.anna.config.mjs) 使用 `base: "./"` 与 `VITE_ANNA_EDITION === "true"`，替换 Anna 构建的 HTML，并通过 AST 将编辑器根资源路径改为 bundle 路径；Worker 的资源以其所在 bundle 为基准。
- [`scripts/build-anna.mjs`](../scripts/build-anna.mjs) 保留实际编辑器资产、图标和浏览器运行时，过滤独立站 SEO 页、PWA 清单和未被产品引用的本地模型目录；不修改这些输入文件。
- `anna/bundle` 和 `anna/.anna` 已忽略。构建脚本检查官方 CLI 的 1 GiB 总包、50 MiB 单文件、2,000 文件上限，并检查 HTML 是否仍有站点根资源地址。
- Anna 产物的 Service Worker 只处理模型及 scope 内的运行资源，不安装独立站 PWA shell、不拦截页面导航。其缓存前缀包含 `timeline-studio-anna` 和当前注册 scope，只清理该 scope 的旧缓存。镜像版本仍使用原有统一模型身份，不改变模型权重来源。
- 当前仅声明桌面容器；编辑器本身已有移动布局，不等于 Anna 移动容器已经通过验证或审核。

结构与限制依据：[App Manifest](https://anna.partners/developers/apps/app-manifest)、[UI Manifest](https://anna.partners/developers/apps/app-ui-manifest)、[CLI 参考](https://anna.partners/developers/reference/cli)。

## 尚需真实平台确认的事项

本地真实模式与生产私有容器都已通过 LLM 方案应用、撤销和重做；生产 MP4 生成预览及完整浏览器草稿的刷新后显式恢复也已成功。当前明确的平台阻塞是 APS 上传的存储桶 CORS 配置，以及生产 CSP 对 WASM 的限制。实际下载和云端恢复仍待验证，不能用模拟响应或绕过浏览器安全机制补齐记录。

1. **平台 LLM：**本地真实模式与生产私有容器的成功方案、应用、撤销和重做已验证；继续验证授权与用量错误、超时，以及用户中止后平台是否仍继续处理。剪辑与 MP4 预览通过仍不等于下载与云端恢复整条流程成功。
2. **浏览器计算权限：**生产 WASM 探针已实际触发 CSP 拒绝。当前官方 schema 不接受把 `wasm-unsafe-eval` 填入 `script-src` 覆盖项，因此没有添加非法 CSP 或 `unsafe-eval`。需要平台提供正式支持 WASM 的 CSP 配置方式，才可继续验证依赖 WASM 的功能。本地容器的 WASM 成功不覆盖生产限制；生产 H.264 独立探针在 revision 3 复测已通过，实际 MP4 也已成功。SharedArrayBuffer 仍因缺少跨源隔离而不可用。[官方 UI CSP](https://anna.partners/developers/apps/app-ui-manifest)
3. **文件 API 与精确域名：**`files.upload_init` 已返回实际存储 origin `https://5244841125c1e42784f5bda924751be6.r2.cloudflarestorage.com`。对该上传地址的只读 OPTIONS 预检返回 **403 Unauthorized**，明确提示 **“CORS not configured for this bucket”**。该精确 origin 已加入 `manifest.ui.bundle.external_origins` 并随 revision 3 推送；生产 GET 响应已确认 `connect-src` 和 `img-src` 含该 origin；这只能允许应用发起连接，不能替代存储桶的 CORS 配置。需要 Anna 存储维护方按实际 iframe origin、上传/读取方法及请求头配置 CORS 后，再验证 PUT、finalize、下载和工程恢复。未添加通配域名、未关闭浏览器安全限制，也未记录任何预签名 URL 查询参数。[Files API](https://anna.partners/developers/reference/host-api-files)
4. **持久恢复：**官方本地容器和生产私有容器均已验证 IndexedDB 保存完整草稿后刷新、再显式恢复时间轴和素材；没有自动恢复行为。仍需在 CORS 修复后验证用户显式保存到 Anna 的工程恢复。云端文件字节、大小及版本身份需要一致；内存存储或仅保存文件名称不算工程恢复成功。
5. **模型下载：**模型用途的 `external_origins` 为 `https://huggingface.co`、`https://us.aws.cdn.hf.co`、`https://www.modelscope.cn`；第二项来自自有镜像文件的实际重定向。另有上述已观察到的 Anna R2 存储 origin。继续验证其他模型是否出现不同 CDN；仅按实际用途补精确 origin，不加通配。
6. **有效使用认定：**本地视频处理怎样计入 Qualified App Run，以及独立站并行运营安排，仍需平台方确认。工程成功保存、视频下载或本地模型完成不能直接被描述成有效 MAU 已认定。[Builder Program 原文](https://forum.anna.partners/t/turn-your-ai-agents-apps-into-recurring-monthly-grants-join-the-anna-ai-os-founding-builder-program-up-to-80k-month-pool/205)

当前 CSP 另外只允许 `connect-src blob:` 和 `font-src blob:`，供用户本地媒体读取及镜像字体使用；R2 仅声明实际返回的精确 origin，没有扩大到任意云端生成服务或任意对象存储域名。revision 3 的生产响应头已确认该精确 origin 生效，`script-src` 仍为 `'self' 'self'`。

已准备英文问题记录 [`anna-platform-issues.md`](anna-platform-issues.md)，用于与平台对接 CORS、WASM CSP 和严格扫描误报；目前尚未发送给 Anna。

## 验证完成后的审核流程

已注册应用 `@martindelophy/timeline-studio`（app ID `254`）的私有草稿 **revision `3` 已 ready**。尚未执行 `cut` 版本冻结、审核或 release。

私有草稿的正确试用入口为 **Developer Console → 应用 → Versions → Working draft → Install & test**。该路径已成功安装保留版本 `0.0.0-draft`，**不需要先执行 `cut`**。应用列表上的普通 Install 曾提示“暂无可用发布版本”，原因是那个入口面向发布版本，不能把它当作草稿试用失败或冻结版本的前置要求。草稿上传、安装成功仍不能替代生产窗口的逐项功能验收。

继续准备真实操作截图、准确商店介绍和适用于 Anna 数据流的隐私说明，确认必要开发者资料并完成平台内完整试用，再推进冻结与审核。现有独立站隐私页不能未经核对就代表 Anna LLM 和显式云端保存的数据流。

### 发布前的隐私说明核对

当前 `anna/app.json` 没有 `privacy_url`。官方 Listing 字段表把它列为可选字段，并未说明所有草稿都必须提供；开发者条款要求介绍、权限与实际行为一致，且不得隐蔽收集数据。因此此处记录的是当前产品说明需要补全的事实，不把它编造成平台上传草稿的硬性前置要求。[Listing 字段](https://anna.partners/developers/apps/app-listing)、[开发者条款](https://anna.partners/developers/reference/developer-terms)

现有 [`public/privacy/index.html`](../public/privacy/index.html) 描述本地编辑、模型下载、浏览器偏好和导出，尚未覆盖 Anna Edition 的以下数据流。公开发布前建议准备可访问的 Anna 专用说明或独立站隐私页中的 Anna 章节，核对后再填写 `privacy_url`：

- 点击生成计划时，将用户要求、输出语言、片段 ID、名称、类型、时长及裁剪许可发送给 Anna 平台 LLM。这个规划步骤不发送媒体字节，也不分析画面或音轨；不能把这条边界扩大成整个 Anna 应用永不上传媒体的承诺。
- 本地草稿是包含素材字节的工程归档，按用户明确操作保存在浏览器 IndexedDB。说明与模型缓存、界面偏好不同，以及真实可用的清除方式。
- 明确选择保存工程到 Anna 时，会上传含素材的完整归档；选择通过 Anna 下载时，会先上传导出视频。说明 Anna/其存储服务参与这些处理，且它们与浏览器本地导出是不同操作。
- 云端归档保留多久，以及平台 LLM 的保留或训练政策，需要按 Anna 当前政策确认。9 月 7 日本地版本已有文件列表、删除确认和引用修复入口，但尚未推送，且删除仅做过模拟 Host 检查。现阶段没有证据支持“立即删除”“永不保留”或“不会用于训练”等承诺，也不能把本地实现写成已获生产验收的功能。

界面已有“保存到 Anna 会上传工程及全部素材”和 Host 下载上传提示。规划区域的隐私提示现已在所有 **13 种界面语言**中明确限定为**生成计划这一步不上传素材**，避免被理解为覆盖后面的显式云端操作；该文案改动已随 revision 3 构建推送，生产界面已确认显示。以上仍有待补全的公开隐私说明，本轮没有修改或发布隐私网页。

流程为 **`push` 草稿 → `publish` 冻结版本 → `submit-review` 提交审核 → 审核通过 → `release` 上线**。其中 `apps publish` 本身是 `push + cut` 的组合；已经推送好的工作草稿也可以直接用 `apps cut VERSION` 冻结，避免重复推送。`publish` 不代表应用已在商店公开。[官方发布说明](https://anna.partners/developers/apps/app-publish)

`apps push` 已将私有草稿推进到 revision `3`。以下保留重新推送、冻结和提交审核的命令参考；`apps publish` 与 `apps submit-review` 本轮尚未执行，版本、商店介绍及审核候选须与当时验证过的构建一致：

```sh
npx --yes @anna-ai/cli@0.1.51 apps push --cwd anna --bundle-dir bundle
npx --yes @anna-ai/cli@0.1.51 apps publish --cwd anna --bundle-dir bundle
npx --yes @anna-ai/cli@0.1.51 apps submit-review --cwd anna
```

`apps publish` 使用 `anna/app.json` 的预发布版本；如果已经冻结过同一版本，需要按平台版本规则更新版本号。审核获批后，才通过 `apps release VERSION --cwd anna` 发布实际批准的版本，并检查平台返回状态。后续更新也需遵守当时的版本审核规则，不能把首次通过理解为永久免审。[版本说明](https://anna.partners/developers/apps/app-versioning)、[官方版本审核讨论](https://forum.anna.partners/t/is-review-now-required-for-every-new-app-version-i-couldn-t-find-this-change-in-the-changelog/224)

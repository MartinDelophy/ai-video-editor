# Timeline Studio Anna Edition 开发与验证

## 2026-09-15 窗口稳定性纠正（r16 私有草稿已安装）

本轮移除 App 对 Anna 外层窗口的自动 `resize` 调用及相关监听，保留用户通过宿主原生拖动、缩放设置的窗口尺寸。编辑器内部仍按实际视口响应式排布预览、时间轴与面板，不再根据窗口当前位置剩余的右侧或底部空间自动缩小外层窗口。

此前自动适配监听窗口几何变化并延迟重算，手动拖动或放大后仍可能触发收缩，造成窗口稍后自行变小。[官方 Window Host API](https://anna.partners/developers/reference/host-api-window) 提供 `resize`，没有公开的 `move`；缩小宽高不能替代窗口重定位。越界窗口的位置和大小继续由 Anna 原生窗口操作处理。Manifest 已删除不再使用的 `window.resize` 声明。

本地真实 Chromium 同源夹具的 **13 项检查通过**，`window.resize` RPC 为 0、页面错误为 0，覆盖延迟连接、空闲、拖动、焦点样式、宿主尺寸变化、最小化动画、620↔1440 宽度变化，以及关闭重开后中文字幕恢复和视频实际播放。ESLint 为 0 errors、71 条既有 warnings；typecheck、Anna 构建（169 文件、约 200.3 MiB）和 CLI strict 校验通过。

**r16 ready 已成功安装**，内容哈希 `7d70b75e504a28c65096fa65d3a27ed9c3f9ab9b0ac815490764ea7eb9120c30`；生产加载 `editor-DiIF98Hp.js`，工程和字幕恢复。用户确认手动调整为 1394×828 后，真实容器两次 DOM 读回相隔 93 秒，尺寸和位置保持不变。本轮仅更新私有测试草稿，未 cut 新版本、未替换当前 `pending_review` 的 alpha.4 候选。详见 [9 月 15 日窗口稳定性记录](anna-window-stability-20260915.md)。下方 9 月 12 日的外层自动收缩描述保留为已被本轮行为取代的历史记录。

## 2026-09-15 alpha.4 已替换审核候选

自动恢复修复已从验收通过的 r15 冻结为 **`0.1.0-alpha.4`（版本 `775`，bundle `736`）**，169 个冻结文件的哈希和字节数均与本地验收构建一致。重新提交后，服务端确认 **`pending_review`、候选 `0.1.0-alpha.4`**；alpha.3 已被替换。当前尚未公开发布，审核批准可能立即上架。详见 [9 月 15 日送审记录](anna-review-submission-20260915.md)。下方“候选仍为 alpha.3”的内容是本次重新送审前的历史状态。


## 2026-09-15 当前工程本机自动恢复（r15 生产样本验收通过）

本轮补充同一浏览器、同一 Anna 账号下的当前工程自动保存与重新打开恢复。工程和素材存入浏览器 IndexedDB；Anna scoped KV 仅保存随机 namespace 及格式版本以定位本机记录，**不构成跨设备云同步**，不会自动上传工程或素材。

“已自动保存到此浏览器”须等 IndexedDB 写事务完成后显示。保存失败保留已有记录和当前编辑；恢复等待期间的新编辑或修订冲突不能自动覆盖当前工程，由用户明确选择恢复上次工作或保留当前工作。浏览器清理数据、存储被回收或保存尚未完成时无法保证恢复。

**r15 已上传、安装并通过真实 Anna 两次关闭重开验收**：视频、音轨和中文字幕自动恢复，恢复后可继续编辑并再次保存。构建、typecheck、定向 ESLint 和严格校验通过；本地刷新、账号隔离、清空和事务中止/并发验证通过。169 文件、210,065,880 字节；正式审核仍锁定 alpha.3，未更换候选。详见 [9 月 15 日自动恢复说明](anna-session-recovery-20260915.md)；下方旧日期记录保留为各自版本的历史事实。

## 2026-09-14 alpha.3 已替换旧候选重新送审

已按用户要求把通过中文配音复测的 r14 冻结为 **`0.1.0-alpha.3`（版本 `759`）**，并通过官方 CLI 再次提交审核。服务器读回 **`pending_review`、`review_candidate_version: 0.1.0-alpha.3`**；alpha.2 已不再是本轮审核候选，旧版本记录保留。新候选包含 ModelScope CDN 与缓存错误处理修复，版本说明一并披露中文生成偏慢、权限保存及其它未验收范围。当前未公开发布，没有推送 Git 远端。详见 [9 月 14 日重新送审记录](anna-review-submission-20260914.md)。下方 r14 私有草稿及 alpha.2 描述为此次重新送审前的验收状态。

## 2026-09-14 语音模型下载修复（r14 私有草稿，晴岚连续生成与播放通过）

ModelScope 分片 CDN 的 CSP 缺口、可选缓存异常丢弃成功响应及同 URL 盲目重试已修复，并成功上传、安装为 **r14 ready**。草稿为 **169 文件、210,030,022 字节**，内容哈希 `6f8e3f360b312875e5e001895b90c598f4dfa04363e3ade10f032477a725afdb`。线上 Worker 返回 HTTP 200、15,371 字节，SHA-256 与本地一致；实际 CSP 含 ModelScope CDN 和 `wasm-unsafe-eval`，没有一般 `unsafe-eval`。

用户确认中文字幕与中文配音后，实际编辑器以 **晴岚**在同一页面连续完成两次生成及播放：

| 文本 | 音轨时长与时间线位置 | 实际播放 |
| --- | --- | --- |
| 你好，这是中文字幕与中文配音的测试。 | 约 3.79 秒，起点 0.01 秒，结束于时间线 3.81 秒 | `00:00.06` → `00:03.81`，完成 |
| 欢迎使用时间线工作室。 | 约 2.54 秒，接在 3.81 秒处，总长增至 6.35 秒 | `00:03.88` → `00:06.35`，完成 |

首轮合计约 5 分钟，仅为粗略记录；第二轮耗时在 **154–205 秒**之间，生成仍明显偏慢。最后一次未加关键词过滤的浏览器 `warn/error` 查询（`limit: 60`）返回 `[]`，不代表平台所有日志均为空或网络绝无重试。源码保留 Worker 和 ONNX sessions，但本次未抓网络或核对 Worker 身份，不能声称实测零下载或确认运行时复用。刷新后的持久缓存、其它音色、主观音质及实际音频下载落盘尚未验收。

**本轮仅更新私有草稿；审核候选仍为 `0.1.0-alpha.2 / 750`、`pending_review`、未发布**，未替换候选或再次送审。完整证据与验证边界见 [9 月 14 日下载修复](anna-voice-download-fix-20260914.md)；下方旧日期章节保留当时状态。

## 2026-09-12 重新送审

用户明确授权继续送审后，已从 r13 冻结 **`0.1.0-alpha.2`（版本 ID `750`）** 并提交审核。控制台确认 **`In review: v0.1.0-alpha.2`**，候选已锁定为该版本，目前仍未发布。冻结清单的完整内容哈希与 r13 一致，窗口最小尺寸、WASM opt-in、Commons 域名和无 Agent 声明均已核对。版本说明包含本轮修复、真实验收范围及待官方排查的权限保存问题。详见 [送审记录](anna-review-submission-20260912.md)。下方各次“未送审”描述均为当时的历史状态。

## 2026-09-12 窗口适配状态（历史，外层自动收缩已于 9 月 15 日纠正）

**当时工作草稿为 r13 ready，已安装并完成真实 Anna 窗口初始自适应验证。** 保留 1440×900 默认尺寸，通过官方 `window.resize` 收缩超出宿主右侧或底部的窗口；编辑器同时适配矮桌面窗口和小尺寸 iframe。生产可见区域 851×914 中，原位于 (252,77) 的 1440×900 窗口自动缩至 587×825，关闭、导出及底部工具栏完整可见。没有新增 Agent 权限，之前的权限保存问题仍未解决。详细实现、尺寸矩阵、构建及范围限制见 [窗口适配验收记录](anna-window-layout-20260912.md)。当次未冻结新版本、未送审或发布。外层自动收缩的后续问题与取消决定见 [9 月 15 日纠正记录](anna-window-stability-20260915.md)；内部响应式布局继续保留。

## 2026-09-11 适配状态（历史）

**当时为无 Agent 的 r12 ready，内容与已验收 r8 相同。** r8 无 Agent 报 auto，r9 仅 auto 报 fixed；r11 同时声明两者保存成功，UI 清理三项也成功并读回 false。但恢复推送 r12 再 Install draft 后，10:47:37.435 UTC 读回声明 false、三项 grant 又 true；仅 LLM/Storage 勾选的界面原样保存再次报 auto。未在 push 与安装之间读取 grant，只确认整个流程重置，不能归因单独按钮或推断普通用户受影响。详见 [英文报告](anna-permission-save-repro-20260911.md)，未送审或发布。下述 r7/r8 为此前功能证据。

CLI `0.1.52` 与 SDK `0.16.1` 的 r7 适配已完成 Anna 和普通构建，r7 Anna 包为 **169 文件、210,024,788 字节（200.3 MiB）**，新 CLI 默认与严格校验均通过；真实未授权调用仍被负例拒绝。typecheck 通过，全量 ESLint 0 errors、71 条既有 warnings。云存储首次引用的 17 项隔离检查通过，**不保证原子首写**；两套单线程 ORT 在 Node 无 SAB 条件下的 Identity 推理通过。本地无跨源隔离页面完成真实 Piper Siwis WAV 生成/下载，并完成 **12.032 秒 720p H.264/AAC 原声 MP4** 下载、全量解码与高相关性 PCM 核验；保留约 21.333 ms 编码延迟，不声称零误差同步或主观音质验收。

`apps push --if-match 6` 已推进 **r7 ready**，08:56 UTC 读回哈希 `be3d1d579d2b1677d969bddbb1dc254f09d91acd4f9ffe9a6941f3a0fe771cef`。用户登录后已安装 r7，实际 CSP 含 WASM opt-in，SDK 和基础探针通过；真实 Piper 生成约 3.26 秒语音，Anna AI 规划并应用源 2–10 秒的 8 秒工程。12 秒及 8 秒工程分别云保存成功，完整刷新后显式恢复 8 秒主视觉、源文件、Piper 语音和字幕。**生产原声导出仍失败，权限 Save all 仍报 `manifest does not declare agent.session.auto`。** 生产 WAV 下载未确认；SAB 不可用如预期。Cloud Agent 浮层超时经 Dismiss 后继续静态应用，不代表 Linux 执行成功。

缓存修复的 **r8 构建、严格校验、Service Worker 合同检查通过并已安装**；169 文件、210,025,786 字节，哈希 `d74673cd7f40a0f15cd0d8f9be69f8de7a4e573c712d6d2c57df2ad0737ca9d9`。源 2–10 秒、Piper 静音的生产成片已通过官方 Host 存储 API 取回：**5,151,853 字节、720p H.264 240 帧、AAC 48 kHz 双声道，完整解码通过**；与目标源音频高度相关，保留 21.333 ms AAC 帧延迟。**浏览器直接/Host 下载的 IAB 落盘仍未确认，不能用 API 成功替代或据此判定平台下载失败。** r8 已声明并接入 `files.download`。最新权限弹窗仅 LLM complete/Storage 勾选、无 Agent，原样保存仍失败；官方回复第 2 段的 phantom grants 只涉及严格扫描，不是对该弹窗问题的确认。该较早 r8 验收快照为 ready、`rejected`、无候选、版本 `684` 未发布；9 月 11 日随后恢复为 r12，本次取回文件没有新增送审。详见 [9 月 11 日平台更新适配](anna-rollout-adaptation-20260911.md)，其它模型与浏览器交付继续待验收。

## 2026-09-09 状态摘要（历史）

更新日期：2026-09-09。当前工作位于 `codex/anna-validation`。应用 **`@martindelophy/timeline-studio`（app ID `254`）** 已于 9 月 7 日从已验证的 r5 草稿冻结 **`0.1.0-alpha.1`（版本 ID `684`）** 并首次送审；9 月 8 日 Anna Dev 邮件反馈初检未通过。9 月 9 日已按用户授权将修复上传至 **working draft r6 ready**，并关联两张产品截图。**未冻结新版本、未再次送审、未推送 Git 远端**。

用户明确选择保留全部本地 AI 功能入口，等待平台正式解决生产 WASM 限制后再提交。云存储样本往返等 9 月 7 日证据继续有效，但不能证明新代码、完整模型与带声交付均已通过。9 月 9 日草稿更新后的服务器读回仍为 `rejected`，`review_candidate_version: null`，唯一不可变版本仍为 `684`、`published_at: null`，未发行。

独立站继续使用根目录 `index.html`、`vite.config.mjs` 和既有部署入口。Anna 构建直接进入同一编辑器，单独启用平台适配，不改变独立站 `/` 的直接编辑体验。

## 2026-09-09 r6 草稿与截图更新

按用户授权，官方 CLI **`0.1.51`** 执行 `apps push --if-match 5` 成功，将工作草稿推进到 **r6 ready**。更新前重新执行 `build:anna` 和默认官方校验，均通过。包为 **159 文件、170,906,925 字节**，152 文件复用、仅 7 文件上传；服务器 `content_hash` **`895b1a892beefd96dc479142234e107adf1f7bfd4d4ca88e17720d6d9c330bb5`** 与本地官方 `bundleHash` 一致，入口为 `editor-B61QoiTy.js`。

服务器已读回新增的 Commons API、upload、thumb 三个精确域名，并关联两张截图：[编辑器/素材库](https://cdn.anna.partners/production/app-screenshots/254-timeline-studio/20260909023730_fd3c4baf.webp)、[导出设置](https://cdn.anna.partners/production/app-screenshots/254-timeline-studio/20260909023731_e3afa8e1.webp)。两者 CDN HEAD 均为 HTTP 200、`image/webp`，分别为 **85,910** 和 **82,080 字节**。截图来自 9 月 8 日本地 Anna 版真实界面；来源详见 [`anna/listing/NOTES.md`](../anna/listing/NOTES.md)。

r6 ready 证明草稿更新完成，截图关联与可访问性已确认；**不代表新生产窗口功能验收、平台 WASM 或权限保存错误已修复**。不可变版本 `684` 未被修改，没有执行新 `cut`、`submit-review`、`release` 或 Git 远端推送。以下 9 月 8 日章节保留当次尚未上传的历史状态，当前草稿和截图状态以本节为准。

## 2026-09-08 初检反馈与本地修复

| 官方初检问题 | 本轮状态 |
| --- | --- |
| 缺产品截图 | 已保存两张真实本地 Anna 版截图于 `anna/listing/`，并写入 `app.json` 的有序截图路径；尚未上传 Listing，最终候选需核对并补生产 AI 操作截图 |
| 权限保存报 `manifest does not declare agent.session.auto` | 官方截图只显示已开启的 `llm.complete`，无 Agent 选项；应用仅调用单次补全，未添加无用 Agent 权限。现有 ACL 与显式拒绝 Agent 的隔离样本均通过本地 schema 校验，尚无证据证明能修复宿主保存错误 |
| 素材库 Video → `nature` 报 `Failed to fetch` | 已补 Commons API、上传媒体和缩略图三项精确 origin，另声明视频预览的 `media-src`；Anna 图片、视频、音乐固定走 Commons，查询有超时、本地化恢复文案和重试 |
| AI Voice 提示本地模型受限 | 保留全部功能入口、真实 WASM 检查与重试说明；仍待平台提供合法生产支持，不删除功能、不伪造结果或绕过 CSP |
| 方案 Apply 后无明显变化 | 本地编译器区分无变化与真实重排/裁剪；无变化方案不产生新修订且禁止应用，真实方案显示变更统计和源范围，应用后定位首个变化片段 |

Anna 和独立站最终构建均通过，普通官方校验通过，严格扫描仍为已上报的 SDK `anna.tools.getJob` 字符串误报。真实浏览器已通过视频搜索、预览、时间线导入和音乐预览、音乐轨道导入；官方本地容器真实 LLM 已完成 **35.886→10 秒 Apply→35.886 秒 Undo→10 秒 Redo**，另一次真实无变化方案明确提示并禁用 Apply。临时测试、React StrictMode history 回归及重点 ESLint 通过。两张截图为本地 Anna 版真实界面，未上传。这些证据不等于生产版本 `684` 已修复，也不覆盖本轮生产云存储、带声导出。详细构建哈希、复现与边界见 [`anna-review-feedback-20260908.md`](anna-review-feedback-20260908.md)。以下日期章节保留各次历史验证，不能把其中当时的“未冻结/未送审”当作当前状态。

## 2026-09-07 r5 原声保护与静音导出回归

`apps push --if-match 4` 已将私有工作草稿更新到 **r5 ready**：159 文件、**170,897,427 字节**，内容哈希 **`e6bd6623cf95fec8ae98eeeaa58c651d53a38d8936eaffb886397a6c2584c61b`**。当次控制台确认 r5、ready 与 Unpublished，已执行 Working draft → Install & test。生产入口实际引用 `editor-BIu_J1eG.js`，与本地构建一致；该次复测结束时尚未冻结版本。同日之后已冻结版本 `684` 并首次送审，见本文当前状态。

| 验证 | 实际结果与边界 |
| --- | --- |
| r5 云恢复 | 新生产窗口从空时间轴显式恢复上述云端合成工程，恢复两秒主视觉及素材 |
| 原声失败保护 | 已知含 AAC 原声的样本仍受生产 WASM 限制；Anna 面板显示 `ANNA_SOURCE_AUDIO_UNAVAILABLE` 和本地化说明，没有生成结果视频。顶栏导出也显示同一停止提示，不再将缺声成片报为成功 |
| 明确静音 | Anna 专属音频选项默认混合轨道；选“静音”后，音频码率禁用，摘要显示 `H.264 · 静音`。关闭设置后从 Anna 面板生成，实际预览解码为 **1920×1080、duration=2、readyState=4**，显示“成片已生成” |
| 本地检查 | 31 项临时原声/导出/组件事件检查通过，覆盖无音轨视频、静音、范围排除、取消、失败终止、普通版兼容及 13 语文案；脚本和样本只在 `/tmp`。Typecheck 通过；改动文件 ESLint 0 errors，App 中 7 条既有未使用变量 warnings |
| 构建与校验 | 最终 Anna 构建 2 分 6 秒、普通站构建 2 分 9 秒均通过；官方普通 validate 通过。严格扫描仍保留已知 SDK 诊断字符串误报，不声称严格校验通过 |

Anna 导出会先用纯 JavaScript 容器元数据区分“文件确实没有音轨”和“原声读取失败”；前者允许导出，后者停止。保护限定 Anna 版本，普通站保持现有行为。上述静音成片只验证生成和浏览器解码，不代替本机文件落盘、全量解码或带声交付验收。

## 2026-09-07 云存储复测与 r4 草稿

使用官方 CLI `0.1.51`、SDK `0.16.0`。`apps push --if-match 3` 成功推进到 **r4**；159 文件、**170,891,866 字节**，内容哈希 **`ce035068a8cdb62d17f5476774afdcc402e57c410c041500f6f1cfd87fdf7f85`**，bundle ready，应用状态仍为 `draft`。开发者控制台亦显示 r4 与 Unpublished。安装入口仍是 Working draft → Install & test；没有执行 `cut`、`submit-review`、`release`。

| 复测 | 实际结果 |
| --- | --- |
| 存储 CORS | 使用真实生产来源 `https://anna.partners`、PUT 与 content-type 预检，返回 HTTP 204、精确 Allow-Origin、GET/PUT/HEAD；不代表 localhost 或任意头都被允许 |
| 生产工程往返 | r3 的 2 秒合成工程显式上传成功；刷新成空时间轴后从 Anna 恢复成功；素材播放推进至 0.42 秒。没有使用本地草稿恢复按钮代替云端恢复 |
| r4 存储回归 | 实际生产包为 `editor-CIrQsPI1.js`；新版云恢复通过，带已有引用 etag 条件的保存成功。文件列表显示四份工程与一份成片，没有因旧上传记录导致列表校验失败；可将已保存工程设为最新引用，无需重传媒体 |
| WASM 与隔离 | 生产编译/实例化探针仍失败；实际入口 GET 为 200，`script-src 'self' 'self'`；SharedArrayBuffer 因未跨源隔离不可用。最新官方语义校验仍不支持 `'wasm-unsafe-eval'` |
| 其它能力与导出 | Service Worker、Worker、IndexedDB、Cache Storage、WebGPU 通过；本次 H.264 探针曾超时，但同一生产窗口之后实际生成并解码了 1920×1080、duration=2、readyState=4 的 MP4。随后确认原声提取受 WASM 限制却被旧逻辑跳过，因此这里只证明画面生成，不证明音轨完整。探针超时也不能据此写成不支持 |
| Host 下载 | 真实文件列表出现本轮 `ai-voiceover.mp4`（1.58 MiB），证明成片已上传；Host 下载动作没有给出可确认的本机文件，未将其记作下载交付通过 |
| 首次引用并发 | 新代码保留 `if_match: ""` 的缺失行条件；公开生产文档没有明确保证该语义，首次写入仍待专项验证。没有为此创建更宽权限的临时 dev App、Executa 或存储令牌 |

据真实文件往返证据，r4 将 `ANNA_CLOUD_TRANSFERS_VERIFIED` 设为 true，并同步 `app.json` 对云传输、恢复备份与模型限制的描述。此开关仅表示允许显式传输；不代表首次写入、删除、分页、版本冲突以及 Host 下载到本机等所有操作均已通过。

审核流程已按较新的官方资料核对到 [`anna-release-readiness.md`](anna-release-readiness.md)：首发完整审核，后续版本仍须 release review；管理员可能批准即上线。送审前应先补齐材料和交付证据，不把草稿更新当作商店审核。

## 2026-09-07 较早的本地维护记录（现已随 r4 推送）

- **能力入口：**Anna 启动时实际编译并实例化最小 WASM 模块。受限时，依赖本地模型的音乐、语音、字幕、视觉分析等入口显示原因与重试操作，并阻止启动模型组件。手动编辑和平台剪辑方案仍保留。这个探针不代表模型下载、GPU 推理或所有导出回退均可用。
- **云端传输：**此前使用 `ANNA_CLOUD_TRANSFERS_VERIFIED = false` 明确关闭未验证的传输，而非伪造浏览器探针。完成上述生产样本往返后，r4 已开启显式云端传输；元数据文件管理与媒体传输仍分开。
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

合成媒体、验证脚本和临时工作区均留在仓库外。该表描述 9 月 7 日生产复测前的本地验收，生产功能证据见上面的 r4/r5 章节，审核与本轮修复状态见本文开头。以下兼容性章节保留 9 月 5 日历史基线，不能把旧阻塞、revision 或耗时当成当前状态。

## 2026-09-05 四阶段基线（历史）

| 阶段          | 已完成                                                                                                                                              | 待验证或完成                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1. 兼容性验证 | 本地及生产私有容器已导入视频；生产 IndexedDB、Cache Storage、Worker、Service Worker、WebGPU、H.264 探针通过；MP4 可预览，刷新后显式恢复完整草稿成功 | 生产 WASM 被 CSP 阻止，页面未跨源隔离；实际下载仍待复测              |
| 2. 首发任务   | 本地真实模式修复后时长 3→2→3→2 秒，第二次请求 447 tokens；生产私有容器的真实 AI 计划应用、撤销和重做也已通过                                        | 下载及云端保存恢复等完整交付流程仍待验证                             |
| 3. Anna 适配  | SDK、manifest、独立构建与缓存隔离完成；普通校验通过；`upload_init` 返回的精确 R2 origin 已随 revision 3 推送，生产 CSP 已确认生效                   | R2 未配置 CORS，生产 CSP 阻止 WASM；`--strict` 另有一条 SDK 文本误报 |
| 4. 提交审核   | 用户已完成注册激活及 CLI 登录授权；应用 254 的私有 working draft r3 已 ready，且已通过 Working draft → Install & test 安装 `0.0.0-draft`            | 尚未冻结远端版本、提交审核或发布；待解决平台阻塞并补全发布材料       |

2026-09-05 首次打包基线为 **158 个文件、162.8 MiB**；最大文件 `ffmpeg-core` WASM 为 **32,232,419 字节**。该初始包通过官方 CLI 严格校验。历史 revision 1 为 **159 个文件、170,809,266 字节**；revision 2 已完成上述生产核心流程验证。当时 **revision 3 为 159 个文件、170,810,875 字节**，服务器确认 ready，状态为 `draft`，bundle hash 为 `254899bacc35669c3357189a77a28eb6b1e148988a419cbea4fb3e53f36c2837`。接入完整 SDK 后，普通校验仍通过，严格扫描出现下述一条已定位的文本误报，不能把当时最终包描述为严格校验全部通过。后续修改编辑器后必须重新构建，以新构建输出和验证结果为准。

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
- 9 月 8 日本地修复会按实际项目差异区分无变化方案；无变化时保留原修订、禁用应用并解释原因，真实重排即使总时长不变也可应用。显示重排/裁剪片段数及源范围变化，应用后选中首个变化片段并定位播放头。此改动已随 9 月 9 日 r6 草稿上传，不改变不可变版本 `684`；新的生产运行验收仍待完成。
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

`build:anna` 生成 `anna/bundle`；`anna:validate` 使用固定 CLI 版本执行官方默认校验，9 月 8 日修复包及 9 月 9 日更新前重建均已通过；`anna:validate:strict` 单独保留严格扫描，仍有下述已知 SDK 文本误报，不能称为全部通过。`anna:dev` 在 5180 端口运行官方开发容器，并明确传入 `--no-llm`。这个默认入口用于检查容器与浏览器能力，不会产生真实 AI 结果。

### 官方严格扫描器的已知误报

2026-09-05 再次核对 npm，CLI 最新版本仍为 `0.1.51`，SDK 最新版本仍为 `0.16.0`。SDK 的异步工具等待功能中，有一段超时诊断文本包含 `recover via anna.tools.getJob({jobId})`。CLI 的 `scanHostApiCalls` 对完整文本做正则匹配，不区分字符串与实际 JavaScript 调用，因此对这段错误消息报出 `calls anna.tools.getJob ... does not grant it`。

Timeline Studio 没有调用该方法。源码与产物核对已确认命中的是 SDK 错误文本。Manifest 的 `ui.host_api.tools` 接受的是已声明的 Executa ID，不能把 `getJob` 填入当作方法授权；本项目也不应为了消除误报引入无用 Executa 或扩大权限。当前保留原 SDK 文本和固定版本；使用 `npm run anna:validate:strict` 可单独复现严格扫描结果，没有屏蔽该错误。

9 月 7 日同一最终包执行普通 `anna-app validate --manifest anna/manifest.json --bundle anna/bundle` 已通过，证明该命令执行的 schema 与静态 UI/CSP 检查通过；它不能替代未通过的严格扫描，也不能覆盖后续新构建。再次提交前仍需平台修正扫描器，或明确确认该可复现误报的处理方式。SDK 当前只提供整包入口；官方另有宿主提供的 `/static/anna-apps/_sdk/latest/index.js`，但它不固定版本，本项目没有为了改变扫描范围而改走该入口。[官方 SDK 文档](https://anna.partners/developers/apps/app-ui-sdk)

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

## 当前仍需真实平台确认的事项（2026-09-08）

9 月 7 日生产来源的存储 CORS 和完整工程样本往返已通过，r4 亦完成已有引用的条件保存、文件列表及引用修复，r5 云恢复再次通过。已确认的平台阻塞是生产 CSP 对 WASM 的限制；9 月 8 日初检还指出宿主权限保存报 Agent session 未声明。r5 已在生产验证原声失败时停止导出，并可明确选择静音生成预览。实际文件落盘、带声交付与完整文件生命周期尚未验收，不能用模拟响应或绕过浏览器安全机制补齐记录。

1. **平台 LLM 与授权：**9 月 5 日/7 日已有本地及生产真实方案、应用、撤销和重做的历史样本。9 月 8 日审核截图在只有 `llm.complete` 开关时，保存权限仍报 `agent.session.auto` 未声明；需平台核对保存载荷或默认值，不能通过增加无用 Agent 权限消除错误。新 no-op 修复已通过官方本地容器的真实 AI 浏览器验收，仍需生产验收；授权、用量、超时、取消边界与完整交付演示继续保留为待验证项。
2. **浏览器计算权限：**9 月 7 日生产 WASM 探针仍实际触发 CSP 拒绝。当前官方 schema 不接受把 `wasm-unsafe-eval` 填入 `script-src` 覆盖项，因此没有添加非法 CSP 或 `unsafe-eval`。需要平台提供正式支持 WASM 的 CSP 配置方式，才可继续验证依赖 WASM 的功能。本地容器的 WASM 成功不覆盖生产限制；H.264 探针本轮曾超时，但之后实际 MP4 画面生成与解码成功，不能以探针超时判定不支持，也不能把画面成功当成音轨完整。SharedArrayBuffer 仍因缺少跨源隔离而不可用。[官方 UI CSP](https://anna.partners/developers/apps/app-ui-manifest)
3. **文件 API 与精确域名：**实际存储 origin `https://5244841125c1e42784f5bda924751be6.r2.cloudflarestorage.com` 已在 manifest 中声明。9 月 7 日以 `https://anna.partners` 为来源的 PUT/content-type 预检返回 204，真实工程上传及恢复通过；此前 403 的记录保留在历史章节。当前不需要扩大域名或绕过浏览器限制；仍应分别验证首次引用 CAS、版本冲突、条件删除、多页列表以及 Host 下载到本机。Localhost 和其它请求头组合没有因生产样本通过而自动获得验证。[Files API](https://anna.partners/developers/reference/host-api-files)
4. **持久恢复：**IndexedDB 草稿和 Anna 云端工程都已完成显式恢复样本；启动后仍由用户选择恢复，没有自动恢复行为。r4 使用已有引用 etag 的条件保存、四份工程与一份成片的列表、最新工程引用重设均通过。更换环境、异常并发与删除后的恢复边界仍需验证；文件列表中的成片只证明上传，不能证明本机下载成功。
5. **模型下载与素材域名：**模型用途的 `external_origins` 为 `https://huggingface.co`、`https://us.aws.cdn.hf.co`、`https://www.modelscope.cn`；第二项来自自有镜像文件的实际重定向。另有上述已观察到的 Anna R2 存储 origin。9 月 8 日依据实际 Commons 搜索响应增加 `https://commons.wikimedia.org`、`https://upload.wikimedia.org`、`https://thumb.wikimedia.org`，供图片、视频与音乐的查询、预览和导入；9 月 9 日 r6 上传后已从服务器读回这些声明，实际生产窗口运行仍待复测。继续按真实重定向补精确模型域名，不加通配。
6. **有效使用认定：**本地视频处理怎样计入 Qualified App Run，以及独立站并行运营安排，仍需平台方确认。工程成功保存、视频下载或本地模型完成不能直接被描述成有效 MAU 已认定。[Builder Program 原文](https://forum.anna.partners/t/turn-your-ai-agents-apps-into-recurring-monthly-grants-join-the-anna-ai-os-founding-builder-program-up-to-80k-month-pool/205)

当前本地 manifest 的 CSP 覆盖项为 `connect-src blob:`、`font-src blob:`，以及 9 月 8 日新增的 `media-src https://upload.wikimedia.org`；外部域名按实际用途精确列举，没有任意对象存储或通配。最后一次已记录的生产 `script-src` 仍为 `'self' 'self'`；本地声明变更不证明旧生产版本已经采用新 CSP。

历史英文问题记录 [`anna-platform-issues.md`](anna-platform-issues.md) 保留生产 CORS、WASM CSP 与严格扫描证据。完整问题已发布为 [Developer Forum 帖子 #296](https://forum.anna.partners/t/timeline-studio-production-wasm-csp-blocker-and-strict-validator-false-positive-minimal-reproductions/296)；9 月 8 日新增初检反馈和本轮修复另见 [`anna-review-feedback-20260908.md`](anna-review-feedback-20260908.md)，尚未作为新一轮送审或回信发送。

## 首次送审记录与后续审核流程

应用 `@martindelophy/timeline-studio`（app ID `254`）的 r5 草稿已于 9 月 7 日冻结为不可变版本 **`0.1.0-alpha.1`（`684`）** 并首次送审。9 月 8 日 Anna Dev 告知初检未通过；修复已于 9 月 9 日更新到 **r6 ready**。云恢复、原声失败保护与明确静音导出仍只有上述历史样本证据，本轮没有新的生产运行验收或再次送审。现有版本不得覆盖；后续候选须读取版本列表后选用更高版本。

私有草稿的正确试用入口为 **Developer Console → 应用 → Versions → Working draft → Install & test**。该路径已成功安装保留版本 `0.0.0-draft`，**不需要先执行 `cut`**。应用列表上的普通 Install 曾提示“暂无可用发布版本”，原因是那个入口面向发布版本，不能把它当作草稿试用失败或冻结版本的前置要求。草稿上传、安装成功仍不能替代生产窗口的逐项功能验收。

两张真实本地操作截图已于 9 月 9 日上传，服务器关联和 CDN HTTP 200 均已确认；继续补最终生产操作截图、准确商店介绍和适用于 Anna 数据流的隐私说明。遵守用户保留全部本地 AI、等待平台正式 WASM 修复后再提交的决定，再完成最终生产试用和下一候选的冻结/送审。现有独立站隐私页不能未经核对就代表 Anna LLM 和显式云端保存的数据流。

### 发布前的隐私说明核对

当前 `anna/app.json` 没有 `privacy_url`。官方 Listing 字段表把它列为可选字段，并未说明所有草稿都必须提供；开发者条款要求介绍、权限与实际行为一致，且不得隐蔽收集数据。因此此处记录的是当前产品说明需要补全的事实，不把它编造成平台上传草稿的硬性前置要求。[Listing 字段](https://anna.partners/developers/apps/app-listing)、[开发者条款](https://anna.partners/developers/reference/developer-terms)

现有 [`public/privacy/index.html`](../public/privacy/index.html) 描述本地编辑、模型下载、浏览器偏好和导出，尚未覆盖 Anna Edition 的以下数据流。公开发布前建议准备可访问的 Anna 专用说明或独立站隐私页中的 Anna 章节，核对后再填写 `privacy_url`：

- 点击生成计划时，将用户要求、输出语言、片段 ID、名称、类型、时长及裁剪许可发送给 Anna 平台 LLM。这个规划步骤不发送媒体字节，也不分析画面或音轨；不能把这条边界扩大成整个 Anna 应用永不上传媒体的承诺。
- 本地草稿是包含素材字节的工程归档，按用户明确操作保存在浏览器 IndexedDB。说明与模型缓存、界面偏好不同，以及真实可用的清除方式。
- 明确选择保存工程到 Anna 时，会上传含素材的完整归档；选择通过 Anna 下载时，会先上传导出视频。说明 Anna/其存储服务参与这些处理，且它们与浏览器本地导出是不同操作。
- 云端归档保留多久，以及平台 LLM 的保留或训练政策，需要按 Anna 当前政策确认。文件列表、删除确认和引用修复入口已随 r4 推送；生产列表和引用重设通过，实际文件删除仍仅做过模拟 Host 检查。现阶段没有证据支持“立即删除”“永不保留”或“不会用于训练”等承诺，也不能把部分生产验收扩大成全部数据生命周期已验证。

界面已有“保存到 Anna 会上传工程及全部素材”和 Host 下载上传提示。规划区域的隐私提示现已在所有 **13 种界面语言**中明确限定为**生成计划这一步不上传素材**，避免被理解为覆盖后面的显式云端操作；该文案改动已随 revision 3 构建推送，生产界面已确认显示。以上仍有待补全的公开隐私说明，本轮没有修改或发布隐私网页。

首发流程为 **`push` 草稿 → 安装验收 → `cut VERSION` 冻结 → `submit-review` 提交审核 → 管理员审批**。`apps publish` 是 `push + cut` 的组合，不代表公开上架。管理员可能在批准时同时发布；只有停留在 `APPROVED` 而未上线时，才需要后续 `release VERSION`。9 月 7 日首次送审已有用户授权；9 月 8 日当前决定是等待平台修复后再提交，不执行新的送审。[官方发布说明](https://anna.partners/developers/apps/app-publish)

草稿操作和审核命令的完整说明见 [`anna-release-readiness.md`](anna-release-readiness.md)。以下是未来新候选的操作参考，不代表本轮已再次执行。`REVISION` 必须取自当前服务器草稿，`VERSION` 和 `CHANGELOG` 必须对应已验收构建且不能复用版本 `684`；执行后须核对 `review_candidate_version`：

```sh
npx --yes @anna-ai/cli@0.1.51 apps push --cwd anna --bundle-dir bundle --if-match REVISION
npx --yes @anna-ai/cli@0.1.51 apps cut VERSION --cwd anna --slug timeline-studio --changelog CHANGELOG
npx --yes @anna-ai/cli@0.1.51 apps submit-review --cwd anna
```

如果服务器已经冻结过同一版本，需要按平台规则选择更高 SemVer。已上架应用的后续版本也需轻量 release review；`apps release VERSION` 可能只进入待审状态，原线上版本继续服务。应读取 `release_review_state`、`is_latest` 和 `published_at` 判断结果，不能把命令成功或首次通过理解为立即上线、永久免审。[版本说明](https://anna.partners/developers/apps/app-versioning)、[官方版本审核讨论](https://forum.anna.partners/t/is-review-now-required-for-every-new-app-version-i-couldn-t-find-this-change-in-the-changelog/224)

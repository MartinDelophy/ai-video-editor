# Anna 2026-09-11 平台更新适配

记录日期：2026-09-11。工作分支：`codex/anna-validation`。**生产 MP4 实际文件、H.264/AAC、完整解码及源音频一致性已经通过。** r11 同时声明 auto/fixed 时保存成功，UI 关闭两者及继承工具也成功；但恢复推送无 Agent 的 **r12 ready** 再执行 Install draft 后，三项 grant 又 true，声明仍 false，原样保存再次报 auto。只确认“恢复推送＋安装”整个流程重新启用授权，未隔离其中具体步骤，也未验证普通用户安装。未送审或发布。

## 当前状态

| 项目 | 已确认结果 | 证据边界 |
| --- | --- | --- |
| 官方 CLI | 已安装并使用 `@anna-ai/cli@0.1.52` | 不是仅查看 npm 发布信息 |
| 浏览器 SDK / AI 规划 | `@anna-ai/app-runtime@0.16.1` 在 r7 生产连接成功；真实 Anna AI 返回源 2–10 秒方案，应用后得到 8 秒工程 | 本轮未重复验证所有规划异常、撤销/重做分支 |
| r7 默认/严格校验 | 完整 r7 应用包通过 CLI `0.1.52` 默认和 `--strict` 校验 | 不沿用为 r8 校验结果，也不代替浏览器工作流程 |
| 扫描正反例 | SDK 诊断字符串样本通过；真实未授权 `anna.tools.getJob` 调用被拒绝，退出码 `1` | 证明该负例仍被检测，不声称已穷尽扫描器语法 |
| WASM manifest 与生产响应 | r7 已声明 opt-in，实际生产入口 HTTP 200，`script-src 'self' 'self' 'wasm-unsafe-eval'`；WASM 编译/实例化探针通过 | 实际模型推理另行验收；没有 COOP/COEP，SAB 不可用仍为预期 |
| r7 构建与静态检查 | r7 Anna 包为 169 文件、210,024,788 字节（200.3 MiB）；普通构建、typecheck 通过；全量 ESLint 为 0 errors、71 条既有 warnings | 这是较早 r7 结果；r8 构建身份与校验结果单独记录 |
| r8 构建与校验 | r8 完整 Anna 构建、CLI 严格校验及最终生成 Service Worker 合同检查通过；169 文件、210,025,786 字节 | 不将构建或合同检查当作生产旧缓存已更新的证明 |
| 云存储适配 | 17 项隔离检查通过；r7 生产先保存 12 秒工程，再保存 AI 裁剪后的 8 秒工程；完整刷新后显式云恢复通过 | 生产结果验证已有引用路径；首写竞争、分页/删除等仍未实测 |
| 模型运行时适配 | Anna 专属同源资源、单线程运行时、带匹配校验的 Piper 构建适配及无跨源隔离的本地预览已完成构建；两套 ORT 实际 Identity 推理通过 | Node 的最小 WASM 推理不代替生产 CSP、WebGPU 或完整模型验收 |
| 本地真实 AI Voice | Piper Siwis 法语生成成功，预览播放时间推进，实际 WAV 文件已下载并核对格式/时长 | 未作主观听感质量验收，不是生产容器结果 |
| 生产真实 AI Voice | r7 Piper 实际生成约 3.26 秒语音，云恢复后仍包含该语音片段及字幕 | 生产 WAV 下载及主观试听质量仍未确认 |
| 本地源音频 MP4 | 12.032 秒、720p H.264/AAC 成片实际落盘，全量解码退出码 0，源音频相关性检查通过 | 仍有约 21.333 ms AAC 编码帧延迟；不是生产导出或零误差同步证明 |
| 生产 MP4 与音轨 | 官方 Host 存储 API 取回既有 r8 成片；5,151,853 字节，720p H.264 / 240 帧、AAC 48 kHz 双声道，完整解码及源音频相关性检查通过 | 保留 21.333 ms AAC 帧延迟，不扩大为所有模型、复杂混音或浏览器下载通过 |
| 权限对照实验 | r8 无 Agent / r9 仅 auto 均失败；r11 同时声明两者保存及 UI 清理均成功；r12 恢复推送＋安装后 grant 又 true，原样保存报 auto | 未在 push 与 Install draft 之间读 grant，不能归因单独某一步；清理不跨该流程保持 |
| 最新私有草稿 | r12 ready 已执行 Install draft，169 文件、210,025,786 字节，哈希为 r8 的 `d74673cd7f40a0f15cd0d8f9be69f8de7a4e573c712d6d2c57df2ad0737ca9d9`，无 Agent 声明 | 10:47:37.435 UTC 读回声明 auto/fixed false，但 grant auto/fixed/继承工具 true；未送审或发布 |
| 生产 Service Worker | 最终 GET 200、14,322 字节，SHA-256 与本地完全匹配 | 不以文件匹配代替所有旧客户端升级验收 |
| 浏览器下载 | Host 下载操作结束且 UI 未显示错误；直接下载入口也已尝试 | IAB 对应 Downloads 文件未找到；API 取回文件不等于浏览器交付通过，也不证明平台下载失败 |
| 生产浏览器 | 用户已登录；Versions → Working draft → Install draft 显示安装 `0.0.0-draft`；入口哈希与本地匹配，SDK 已连接 | Cloud Agent 启动浮层超时后使用 Dismiss 继续静态应用；未证明 Cloud Agent/Linux 执行成功 |
| 生产基础能力 | WASM、Service Worker、Worker、IndexedDB、Cache Storage、WebGPU、H.264 探针通过 | 各项仅证明所测试操作；`isolation_unavailable` 为预期 SAB 结果 |

## 本地运行时与 AI Voice 证据

临时脚本 `/tmp/anna-runtime-check-20260911.mjs` 在 Node 中把 `SharedArrayBuffer` 设为不可用、线程数设为 `1`，分别使用 ORT `1.27` asyncify 和 Transformers 自带的 ORT `1.22` JSEP 执行实际 ONNX Identity 图，均得到 **`42 → 42`**。这证明被检查的单线程运行时可执行该最小图；不证明浏览器 WebGPU 计算、完整声学模型或 Anna 生产 CSP 通过。

在 IAB 中打开本次构建的 Anna 页面 `http://127.0.0.1:5181`，本地服务没有 COOP/COEP。通过真实界面运行 Piper Siwis 法语语音，文本为 **“Bonjour, ceci est un test de voix pour Timeline Studio.”**，生成完成，预览播放时间观察到 **0 → 0.17 秒 → 结束约 3.39 秒**。实际下载文件 `/tmp/anna-piper-siwis-20260911.wav` 独立检查为 **PCM 16-bit little-endian、22,050 Hz、单声道、3.390113 秒、149,548 字节**。

以上验证了实际生成、播放器推进及 WAV 文件交付，没有宣称人工试听音色/自然度已经通过，也没有把本地服务当作 Anna 生产容器。另在 **r7 生产窗口**完成真实 Piper 生成，输出约 **3.26 秒**；其语音片段及字幕随后随云工程恢复。生产 WAV 下载仍未确认，不能用本地 WAV 的落盘结果替代。

## 本地带源音频导出证据

同一无跨源隔离的本地 Anna 构建完成已知含 AAC 原声的 12 秒视频导出。为隔离原声路线，生成的配音轨保持静音，源音频覆盖完整 12 秒。实际文件 `/tmp/anna-r7-local-aac-20260911.mp4` 为 **7,707,948 字节、12.032 秒、H.264 1280×720 / 30 fps / 360 帧、AAC 48 kHz 双声道**；FFmpeg 对整个成片解码成功，退出码 `0`。

输出全段平均电平约 **−20 dBFS**、峰值 **−6.9 dBFS**；4 秒之后平均 **−20.4 dBFS**、峰值 **−7.6 dBFS**，不能仅由前面约 3.39 秒的生成语音解释。独立 PCM 比较确认输出对应源音频，检测到 **1,024 samples / 21.333 ms** 的延迟（一个 AAC 编码帧）；对齐后的左右声道相关系数分别为 **0.9999449 / 0.9999434**。

这一结果支持原声提取、混入成片与实际本地交付通过，仍保留小幅编码延迟，不声称逐采样完美同步。它不替代 Anna 生产窗口导出、Host 下载、复杂混音或长视频验收。

## 官方已说明的合同

来源：[Anna 工程团队在现有问题帖中的正式回复](https://forum.anna.partners/t/timeline-studio-production-wasm-csp-blocker-and-strict-validator-false-positive-minimal-reproductions/296)。9 月 10 日完整回复说明了周五发布安排，本轮用户已告知收到上线通知；应用验收仍须以实际安装包和生产结果为准。

- **WASM：**在 manifest 中明确声明 `'wasm-unsafe-eval'`，打包所需 `.wasm` 并同源获取。这只允许 WebAssembly 编译，不需要启用一般 JavaScript `eval()`。
- **线程与隔离：**Anna app iframe 仍不具备 COOP/COEP 跨源隔离，`SharedArrayBuffer` 不可用；使用单线程 WASM/FFmpeg 构建。不能把这一已说明的限制继续写成“等待本次发布修复 SAB”，也不能仅设置线程数后就假定原来的 pthread 产物兼容。
- **严格校验：**CLI `0.1.52` 修复了字符串与注释中的调用形文本误报；SDK `0.16.1` 同时调整了超时诊断文本。官方第 2 段所说不必增加 phantom tools grants，指的是严格扫描误报，**不是对 `agent.session.auto` 权限弹窗错误的确认或修复承诺**。原误报只在 CLI，服务器审核没有同等扫描器；不得为消除误报增加未使用的工具授权。
- **存储：**`if_match: ""` 不是 create-if-absent。空 etag 或对缺失行提供 `if_match` 均会失败；省略条件为 upsert，已有行使用真实 etag 做 CAS。目前没有原子首次创建合同。
- **Host 下载：**官方第 4 段要求在 `manifest.ui.host_api.files` 声明 `download`；**r8 已经声明并接入这一能力**。成功只表示宿主已发起浏览器下载，不能确认文件最终落盘。另可经 Host 存储 API 获取签名 URL；本轮用该路线取回实际生产成片，仍与浏览器下载入口的交付验收分开。
- **审核：**工程团队回复说明管理员可以批准而不发布，也可以批准并发布；送审绑定特定冻结版本，重新送审可显式更换候选。**本轮实际 Versions 页面却明确显示 “Approval publishes it to the App Store immediately.”** 因此不能将“支持管理员暂不发布”当作当前应用会停留在私有状态的保证；重新送审须按可能获批即公开理解。更新私有 working draft 本身不构成重新审核或上架，本轮没有重新送审。

完整官方回复没有明确确认或修复 `agent.session.auto` 权限弹窗问题。r8 Installed Apps → Timeline Studio → Permissions 显示 All permissions granted，仅 LLM complete 与 Storage 勾选、没有 Agent 项；原样保存仍报 auto。随后根据用户新增授权，依次对比仅 auto、auto/fixed 同时声明及恢复为两者均不声明的情况，结果见下节。已有授权下真实 AI 规划通过，不能据此推断权限保存正常。

## 权限声明对照、UI 清理与恢复推送＋安装后的重置

| 检查 | 声明/界面 | 实际保存结果 |
| --- | --- | --- |
| A：r8 基线 | 整个 `ui.host_api.agent` 未声明；仅 LLM complete、Storage 勾选，无 Agent 控件，原样保存 | `Save failed: manifest does not declare agent.session.auto` |
| B：临时 r9 | 仅加 `ui.host_api.agent.session.auto: true`，未声明 fixed；Auto 与继承工具控件已勾选，保持原样保存 | `Save failed: manifest does not declare agent.session.fixed` |
| C：临时 r11 | 声明 `agent.session: {"auto":true,"fixed":{}}`，严格校验与安装通过 | 原样 Save all 成功 |
| D：r11 UI 清理 | 正常 UI 取消 auto、fixed、inherit tools 勾选，然后保存 | 保存成功；官方 API 读回三项均 false，LLM complete 及 Storage 仍启用 |
| E：恢复 r12 | 恢复无 Agent 基线，推送 ready 后执行开发者 Install draft；界面只有 LLM/Storage 勾选，无 Agent，原样保存 | API 读回声明 auto/fixed false，但 grant auto/fixed/继承工具重新 true；`Save failed: manifest does not declare agent.session.auto` |

r9 严格校验和安装均通过；169 文件、210,025,786 字节保持不变，含 manifest 的内容哈希为 `dc52739d7b7c926bebd5a29cdb949d84e44b107f57af60bab8522d09a74d18d0`。权限 API 读回的声明为 auto true / fixed false，但旧 `llm_grant.agent` 中 auto 与 fixed 均为 true。

公开生产脚本 [`installed-apps.js?v=81832387`](https://anna.partners/static/js/installed-apps.js?v=81832387) 的 `collectAppUpdate`（1091–1099 行）先复制旧 `llm_grant.agent`，只根据**已声明模式**对应的复选框更新值，未声明模式的旧 true 因而保留；1212 行把收集结果 PATCH 到 `/api/v1/apps/{id}/grants`。原函数的隔离 Node 执行确认两种声明均会保留旧 fixed true。**这是公开前端函数的已复现行为，不是已截获实际生产 PATCH 请求体；旧授权最初为何为 true 尚未查明。**

前两次检查结束时曾恢复 **r10 ready**；10:32:42.396 UTC 当时读回声明 auto/fixed false、旧 grant true。用户随后进一步要求对比“两者都声明”和“两者都不声明”，因此继续临时 r11 的对照实验。**不能把 r8/r9 的失败写成同时声明两种模式也会失败：r11 两者都声明确实保存成功。**

r11 通过正常权限界面取消 auto、fixed 和继承工具，再次保存成功；官方 `getAppPermissions` 读回 auto false、fixed false、inherit false，complete true、Storage enabled。恢复本地无 Agent manifest、推送 **r12 ready** 并点击 Install draft 后，**2026-09-11T10:47:37.435Z** 的即时读回却显示：声明 auto false / fixed false；存储 grant auto true / fixed true / inherit true；complete 与 Storage 仍启用，`satisfied: true`。

r12 最终 UI 复测只有 LLM 与 Storage 勾选，没有 Agent 控件；原样 Save all 再次报 **`Save failed: manifest does not declare agent.session.auto`**。这确认 **恢复推送＋Install draft 整个流程**重新启用了刚清理的 grant；因为没有在 push 和 Install draft 之间读取 grant，不能证明是按钮单独或某个特定后端步骤所致。清理不跨该流程保持；普通终端用户安装及最早 grant 来源尚未验证。当前无 Agent 的 r12 与已验收 r8 内容相同：169 文件、210,025,786 字节，哈希 `d74673cd7f40a0f15cd0d8f9be69f8de7a4e573c712d6d2c57df2ad0737ca9d9`；应用 `rejected`、无审核候选，没有新冻结版本、送审或发布。英文报告见 [`anna-permission-save-repro-20260911.md`](anna-permission-save-repro-20260911.md)，未自动发送。

## 云存储实现与并发边界

`src/lib/annaRuntime.js` 的保存和引用恢复共用引用写入逻辑：

1. 已有最新工程引用时，先验证其 etag 可用；后续使用这一真实 etag 写入，保留并发冲突检查。不能因为已有 etag 为空就降级为无条件覆盖。
2. 原本没有引用时，工程仍写入独立 UUID 文件。文件上传完毕、写入引用之前再读取一次 KV；若发现其他工程已建立引用，返回冲突而不继续覆盖。
3. 仍不存在引用时省略 `if_match` 进行 upsert；随后读回，核对返回的 etag 和文件身份。已观察到的并发覆盖、引用消失或检查失败均保留错误状态。
4. 文件已成功存储而引用更新失败时，返回可恢复的 `savedFile`。用户可以只修复引用，无需重新上传素材；不会自动删除新文件或旧工程。

**这不是原子首写，也不保证 first-writer-wins。** 另一个写入者仍可能在最后一次缺行检查之后、或在确认读回之后写入。读回只检测当时可观察到的竞争；所有独立 UUID 项目文件继续保留在云文件列表中，最新工程引用不是唯一恢复途径。文件与 KV 也不是一个事务。

本轮临时脚本位于 `/tmp/anna-storage-adaptation-20260911.mjs`，不进入产品仓库。17 项检查覆盖首次成功、兼容旧 `not_found`、上传期间新引用、写后竞争、etag 变化、引用消失、已有引用 CAS 与冲突、无效 etag、响应/读取失败、引用恢复和非原子首写的实际边界。全部通过；这不是生产首次写入或多窗口并发验收。

## r8 构建与生产验收基线

Anna 专属缓存修复完成后，**r8 完整 Anna 构建、CLI `0.1.52` 严格校验与最终生成 Service Worker 合同检查均通过**。新的包为 **169 文件、210,025,786 字节（约 200.3 MiB）**，不得与较早 r7 的 210,024,788 字节或旧哈希混用。

私有 push 已成功，服务器读回 **revision `8`、bundle ready**，内容哈希为 **`d74673cd7f40a0f15cd0d8f9be69f8de7a4e573c712d6d2c57df2ad0737ca9d9`**。已点击 Install draft 更新测试安装，随后完整刷新生产页面两次并显式恢复云工程，得到 **8 秒源视频、约 3.26 秒 Piper 片段和字幕**。本次输出选择源视频 **2–10 秒**（原片 12 秒），Piper 轨保持静音。导出完成原声准备和离线渲染，UI 显示 **成片已生成**；实际 MP4 预览 DOM 为 **duration `8.021333`、readyState `4`**。

最终生产 Service Worker GET 为 **HTTP 200、14,322 字节**，SHA-256 **`123368763214ea6d726b0dc9638bea6472e036ed34243204826befab18fdcb2d`** 与本地完全一致。最初 Host 下载结束且 UI 未报错，直接下载也尝试过，但 IAB 中没有找到预期 Downloads 文件。随后通过官方 CLI 调用 **Host 存储 API** 取得已存在的 r8 导出文件签名 GET 地址并下载，完成下述独立验收；这一过程没有使用 Executa，也没有重新上传或改动草稿。

### r8 生产文件独立验收与浏览器交付边界

实际文件为 `/tmp/anna-r8-production-aac-20260911.mp4`，**5,151,853 字节**，SHA-256 **`695c4f5dade377872920e12438d06d3acd109cf3a6bfdda92384b41f208b014a`**。独立检查确认 **H.264 1280×720 / 30 fps / 240 帧 / 视频时长 8 秒**，以及 **AAC 48 kHz 双声道 / 音频时长 8.021333 秒**；完整 FFmpeg 解码退出码 **0**。

音频全段平均电平 **−19.7 dBFS**、峰值 **−6.9 dBFS**；4 秒之后平均 **−21.2 dBFS**、峰值 **−7.8 dBFS**。与原始源音频 **2–10 秒**比较，检测到 **1,024 samples / 21.333 ms** 的 AAC 帧延迟；对齐后左右声道相关系数为 **0.9999701 / 0.99996913**。由此确认本次生产成片存在实际原声音轨、可以完整解码且与目标源片段高度一致，不声称逐采样零延迟或所有混音场景通过。

**生产文件与原声音轨验收通过；浏览器下载交付仍待确认。** IAB 最初 850×913 视口中的 1440px 应用窗口裁切了部分控件；改为 1920×1080 并操作可见下载入口后仍未观察到对应 Downloads 文件，随后已还原测试视口。Host 下载与直接下载均没有 UI 错误，但不能据此标记落盘成功；也不能将 IAB 中未观察到文件直接解释为 Anna 平台下载失败。API 签名 GET 取回的文件证明内容及 API 路线成功，不代替这两条浏览器交付路径。

**09:51:52 UTC（北京时间 17:51:52）的 r8 历史快照**为 r8 ready、上述同一哈希、`rejected`、`review_candidate_version: null`；冻结版本 `684` / `0.1.0-alpha.1` 未发布。当前最新草稿为本文开头的 r12。没有冻结新版本、重新送审、公开发布或推送 Git 远端。

## r7 私有草稿与云端读回（当日较早记录）

最终 Anna 构建和完整默认/严格校验通过后，执行 `apps push --if-match 6`，推进至 **r7 ready**。2026-09-11 **08:56 UTC（北京时间 16:56）**只读查询确认：

| 项目 | 返回值 |
| --- | --- |
| 应用 | `@martindelophy/timeline-studio`，app ID `254` |
| 应用状态 | `rejected` |
| 审核候选 | `review_candidate_version: null` |
| 当前 working draft | `r7 ready` |
| r7 内容哈希 | `be3d1d579d2b1677d969bddbb1dc254f09d91acd4f9ffe9a6941f3a0fe771cef` |
| WASM 配置 | `script-src` opt-in 包含 `'wasm-unsafe-eval'` |
| 已冻结版本 | `0.1.0-alpha.1`，版本 ID `684` |
| 冻结版本发布时间 | `published_at: null` |

该节保留 r7 推送及安装时的历史证据；r8 是其后完成生产文件验收的基线，**最新草稿为本文开头的 r12 ready**。各次安装与功能结果分别记录，不以旧探针结果替代新流程验收。没有冻结新版本、重新送审、公开发布或 Git 远端推送。

## r7 生产安装、响应与能力探针

用户完成登录后，通过 **Versions → Working draft → Install draft** 安装；界面显示 **Installed working draft (`0.0.0-draft`)**。实际 iframe 入口为 `https://anna.partners/anna-apps/martindelophy/timeline-studio/0.0.0-draft/index.html`，GET 返回 **HTTP 200**；入口响应 SHA-256 为 `d51ddc74b9e100f4396454a1c238e39f07cc5f62b3f8cef4f4fd43fbb3f05a12`，与本地入口一致。

实际 `script-src` 为 **`'self' 'self' 'wasm-unsafe-eval'`**；响应含 `Cross-Origin-Resource-Policy: same-origin`，但没有 COOP/COEP。SDK 连接成功。UI 主动探针确认 WASM 编译/实例化、Service Worker、Worker、IndexedDB、Cache Storage、WebGPU 及 H.264 通过；SAB 返回 **`isolation_unavailable`**，与官方仍不支持跨源隔离的合同相符。

启动过程中 Cloud Agent 浮层出现超时，使用其提供的 **Dismiss** 继续进入静态应用。当前项目没有 Executa，本次 UI/SDK/浏览器探针成功不是 Cloud Agent Linux 工具执行成功，也不将该浮层超时解释为 WASM 仍被 CSP 阻止。

### r7 真实 AI 与云工程恢复

生产窗口首先完成 **12 秒工程云保存**。随后真实 Anna AI 返回将源视频裁为 **2–10 秒**的方案，显式应用后时间线变为 **8 秒**，第二次云保存成功。整个生产页面刷新后，编辑器为空；点击 **从 Anna 恢复**，重新得到 8 秒主视觉及其源文件、约 3.26 秒 Piper 语音片段和字幕，UI 显示 **草稿已恢复**。

这证明本轮生产 AI 规划、方案应用、已有引用的云保存及含媒体工程的显式刷新恢复通过。没有把恢复成功扩大为首次缺行竞争、所有文件生命周期操作、所有恢复媒体的播放检查或完整视频交付。权限弹窗的 **Save all** 则仍失败，准确错误为 `manifest does not declare agent.session.auto`。

## r7 生产原声失败与 r8 缓存修复

r7 生产 AAC 原声提取仍失败，而同源 WASM 探针、真实 Piper 与本地同一源文件导出成功。直接匿名 Node GET 的 FFmpeg Worker、core JS 和 WASM 全部返回 HTTP 200，类型、字节数及 SHA-256 与本地 r7 相同：

| 资源 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `worker-DYSz7Krg.js` | 2,506 | `e0a67260df485c224837991e3ea12d721a43c2511a594946fe7d176b8884c429` |
| `ffmpeg-core-CI9Irx9p.js` | 111,804 | `67a48f11645f85439f3fde4f2119042c16b374b910206b7a7a24f342e28dcae3` |
| `ffmpeg-core-CgUfceKH.wasm` | 32,232,419 | `9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7` |

这些成功读取没有发现资源字节截断或损坏。较早 Python urllib 匿名请求曾返回 403，不能将客户端请求差异写成生产资源失败，更不能用该 403 推断内容损坏。

仓库外隔离复现使用**实际 r7 Service Worker 和与生产一致的 CSP**：正常获取资源时 FFmpeg 提取通过；仅向隔离缓存写入带旧 CSP 的同字节 Worker 后，缓存命中且没有 WASM token，真实 WASM 编译被旧 `script-src 'self' 'self'` 拒绝；只移除这一条缓存 Worker，再创建新的 FFmpeg 实例即成功提取 AAC 为 **44.1 kHz 双声道 WAV、12.01068 秒、2,118,762 字节**。

因此，“脚本字节不变，但 Service Worker 留下旧响应 CSP”的失败机制已在隔离环境得到直接复现和反向修复验证，与生产现象相符；**当前生产失败窗口中的旧缓存响应头尚未直接取证，不能把该机制当作生产修复完成。**

`scripts/build-anna.mjs` 已增加 Anna 专属 Service Worker 适配：运行时 `.js`/`.mjs` 从网络以 `no-store` 获取，激活时在接管页面前只清理本应用作用域内缓存的脚本；保留 WASM、ONNX、bin、data、JSON 模型数据及权重，普通独立站 Service Worker 保持原行为。实际适配器生成源码和最终 Service Worker 合同检查通过，**r8 完整构建与严格校验通过并已推送、安装测试**。两次完整刷新后，生产导出通过此前失败的原声准备并完成渲染，新 Service Worker 字节与本地一致；通过 Host API 取回的真实生产 MP4 也完成全量解码和原声音轨一致性验收。浏览器直接/Host 下载交付仍待确认。

### 同日推送前只读基线（历史）

本轮刚开始时只读查询仍为 **r6**，哈希 `895b1a892beefd96dc479142234e107adf1f7bfd4d4ca88e17720d6d9c330bb5`；当时尚未推送本次适配。该快照的 `rejected`、无候选、冻结版本 `684` 和未发布状态与推送后相同。r6 是旧 SDK 和旧配置的构建，此前对其 WASM 的失败观察不能直接替代 r7 复测。

## 待完成的验收

- [x] Anna 专属同源/单线程运行时配置及 Piper 构建适配完成；Node 在无 SAB 条件下的两套运行时最小推理通过。本项不涵盖所有模型。
- [x] 较早 r7 的完整 Anna 和独立站构建、typecheck、ESLint 检查完成；r7 包为 169 文件、210,024,788 字节，哈希见 r7 历史读回；不沿用为 r8 结果。
- [x] CLI `0.1.52` 对完整 r7 应用包的默认和 `--strict` 校验通过；另保留诊断字符串与真实未授权调用的正反例。r8 校验单列如下。
- [x] 私有草稿推进 r7 ready，服务器 revision、WASM manifest opt-in 和 hash 已读回。
- [x] 用户登录后通过 Versions → Working draft → Install draft 安装；入口哈希与本地一致，实际生产 CSP 已包含 WASM opt-in。
- [x] 新生产窗口的 WASM 编译/实例化、Worker、Service Worker、IndexedDB、Cache Storage、WebGPU、H.264 探针通过；SAB 的 `isolation_unavailable` 如预期。探针不代替真实模型推理。
- [x] 本地无跨源隔离页面的真实 Piper Siwis 法语生成、播放推进、WAV 下载及独立文件检查通过；不包含主观听感验收。
- [x] r7 生产真实 Piper 语音生成约 3.26 秒，语音片段与字幕随云工程恢复；生产独立 WAV 下载和试听质量仍待确认。
- [ ] 核实生产 WAV 下载和试听；按实际调用路径补其他模型回归，保留所有功能入口及真实失败提示。
- [x] 本地已知含 AAC 原声的 12 秒视频完成带声 MP4 导出、实际下载、全量解码及 PCM 相关性检查；保留 21.333 ms 编码延迟的边界。
- [x] 隔离复现旧缓存 Worker CSP 导致的 FFmpeg WASM 拒绝；移除该缓存条目后提取恢复，Anna Service Worker 生成源码合同检查通过。
- [x] r8 完整构建、严格校验及最终 Service Worker 合同检查通过；私有 push 后 revision 8、bundle ready 与新哈希已读回。
- [x] r8 已安装；两次完整生产刷新后显式云恢复 8 秒视频、Piper 及字幕，导出完成原声准备和离线渲染，预览为 8.021333 秒、readyState 4。
- [x] 最终生产 Service Worker GET 200、14,322 字节，SHA-256 与本地一致；最终云状态确认 r8 ready、无审核候选、未发布。
- [x] 官方 Host 存储 API 签名 GET 取回既有 r8 生产 MP4；文件 SHA、720p H.264 240 帧、AAC 双声道、完整解码及与源 2–10 秒的音频一致性检查通过，保留 21.333 ms AAC 延迟边界。
- [x] r7 生产 12 秒和 AI 裁剪后的 8 秒工程云保存成功，完整刷新后显式恢复 8 秒主视觉、源文件、语音和字幕。
- [ ] 按明确场景补存储竞争、失败恢复及其它文件生命周期生产验证。不得为了制造首次写入场景而清除用户现有引用或工程。
- [ ] 完成浏览器下载交付；Host 和直接下载无 UI 错误，但 IAB 对应 Downloads 文件未观察到。签名 GET 的实际文件验收不等于浏览器入口通过，也不说明平台下载失败。
- [x] r7 真实 Anna AI 规划并应用源 2–10 秒裁剪，结果为 8 秒；本项不代表新候选的完整视频交付。
- [x] r8 无 Agent 与 r9 仅 auto 声明的检查分别失败于 auto/fixed；随后按用户新增授权，r11 同时声明两者的 Save all 成功。
- [x] r11 正常 UI 关闭 auto/fixed/继承工具并保存成功；API 确认三项 false，LLM complete/Storage 保持启用。
- [x] 恢复无 Agent 的 r12 ready、同一 r8 哈希并 Install draft；即时 API 读回三项 grant 又 true，而声明 auto/fixed 均 false。
- [x] r12 原样保存最终确认再次报 auto；只有 LLM/Storage 勾选，无 Agent 控件。
- [ ] 向官方反馈恢复推送＋安装流程的 grant 重新启用和隐藏旧值保留问题；具体重置步骤及普通用户安装影响未隔离，报告已准备未发送。
- [ ] 根据最终结果更新商店文案、截图、变更说明及审核候选。完成验证后再决定重新送审；当前 UI 提示获批即公开，不能依赖“仅批准不发布”。草稿成功不等于审核通过。

## 历史证据入口

- [9 月 9 日 r6 生产复测](anna-cloud-retest-20260909.md)：真实 AI、云恢复和静音预览的通过边界，以及当时 WASM/权限/原声失败。
- [9 月 8 日初检与修复记录](anna-review-feedback-20260908.md)：最初五项审核反馈及应用侧改动。
- [接入记录](anna-integration.md)、[发布准备](anna-release-readiness.md)、[平台问题历史](anna-platform-issues.md)：保留旧工具版本、当时的判断和原始观察；其中旧的空字符串首写假设和 WASM 不可配置结论已被本次官方合同及适配替代。

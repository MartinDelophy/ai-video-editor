# Anna 语音模型下载修复 · 2026-09-14

用户报告 `model-cache-sw.js:329:66` 的 `Uncaught (in promise) TypeError: Failed to fetch`，并已确认本轮验证中文字幕与中文配音。本文修复已上传并安装为私有工作草稿 **r14 ready**，已完成同页两次晴岚中文配音生成及播放验证。随后按用户要求将 r14 冻结为 **`0.1.0-alpha.3 / 759`** 并重新送审，服务器已确认它替换 alpha.2 成为 `pending_review` 候选，目前未公开发布。详见 [重新送审记录](anna-review-submission-20260914.md)；下方私有草稿状态为送审前的验收记录。

## 已确认的下载阻断

读取 alpha.2 的实际 `model-cache-sw.js` 返回 HTTP 200，其 `connect-src` 允许 `https://www.modelscope.cn`，但缺少 **`https://cdn-lfs-cn-1.modelscope.cn`**。固定 Hojo 模型清单 GET 正常，模型分片 HEAD 也停留在原站返回 200；实际分片 GET 则跳转到上述 CDN。

核对的固定分片为 `hojo-tts-light-80m-zh-2voices-fp16-v1/Hojo-TTS-Light-llm.onnx.part-000.bin`。ModelScope 修订 `9cb5ab964c014b182701153bd00f7a2202f5dce8`、Hugging Face 修订 `074a57bc4dac9c58568b031898ea79da6f36b282`，均来自应用已有的自有模型仓库。

| 请求 | 实际结果 |
| --- | --- |
| ModelScope 清单 GET、分片 HEAD | 原站 HTTP 200，CORS `Access-Control-Allow-Origin: *` |
| ModelScope 分片 Range GET | 302 → `cdn-lfs-cn-1.modelscope.cn` → HTTP 206 |
| Hugging Face 等价分片 Range GET | 转至已声明的 `us.aws.cdn.hf.co`，HTTP 206 |
| 本地浏览器 Worker 使用生产原始 CSP | `Failed to fetch`，记录 `connect-src` 违规 |
| 相同 Worker、相同请求，仅在 CSP 增加精确 CDN origin | HTTP 206，实际读取 1,024 字节，最终 origin 为该 ModelScope CDN，无 CSP 违规 |

对照页与脚本留在 `/tmp/anna-voice-csp-20260914`，未进入产品仓库。使用实际响应头原文作为策略基线，没有开放通配域名、关闭 CSP 或改变模型修订。浏览器违规事件可能显示原始 `www.modelscope.cn` 请求，而不是重定向终点；因此需要结合 GET 重定向及前后对照判断。

这证明 alpha.2 的已送审配置确实会阻断这条 ModelScope 下载路径。随后已登录 Anna、安装 r14 并完成下文记录的两次晴岚中文配音生成及播放验证；1 KB 网络对照本身仍不能代表完整模型下载或所有语音模型端到端通过。

## 应用侧修改

- `anna/manifest.json` 只补入已证实的 `https://cdn-lfs-cn-1.modelscope.cn`，保留现有业务权限、模型来源、固定修订和共享缓存身份。
- `public/model-cache-sw.js` 把缓存打开、查询、迁移、写入及配额清理失败限制在可选缓存层；已经拿到的网络响应仍交给模型加载器，不再因缓存异常丢弃它。不可重构的 opaque 响应保持原样。
- `scripts/build-anna.mjs` 删除 `cacheFirst(...).catch(() => fetch(同一请求))` 的盲目重试。原第 329 行正是第二次 fetch；真正网络失败仍返回调用方，由现有模型镜像切换逻辑处理。保留 Anna 脚本 `no-store`、应用范围隔离及大模型缓存。

修复没有伪造成功响应、清空用户缓存或添加 Agent 权限。没有顺带改造所有模型加载器的超时、流读取和取消逻辑；那些潜在健壮性问题不等于本次已确认的生产原因。

## 验证与后续

普通版与生成的 Anna Worker 共 51 项仓库外故障注入检查通过，另补两例配额清理失败检查。覆盖缓存操作同步/异步失败、成功响应保留、网络错误只请求一次、规范缓存命中/迁移、HTTP 错误、opaque 响应、Piper/Range/AI Music 过滤、Anna 脚本刷新及跨应用作用域。目标文件语法、ESLint 与 typecheck 通过。

完整 Anna 构建通过（169 文件、210,030,022 字节），官方固定 CLI `0.1.52` 的严格校验通过；实际校验器报告 dispatcher `0.22.0`。构建仅保留既有运行时依赖及大包警告。

## 私有草稿更新与线上验证

修复已成功上传并安装为 **r14 ready**。草稿内容哈希为 `6f8e3f360b312875e5e001895b90c598f4dfa04363e3ade10f032477a725afdb`，共 **169 文件、210,030,022 字节**。这是私有工作草稿更新；审核仍为 **`0.1.0-alpha.2 / 750`、`pending_review`、未发布**，没有冻结新版本、替换审核候选或再次送审。

线上 r14 的 `model-cache-sw.js` 返回 **HTTP 200、15,371 字节**，SHA-256 为 `2c984d3a785c46e0ff14dbe320507a0e1d104047a23f3396dfd0462225619bbb`，与本地构建一致。实际 CSP 已包含 `https://cdn-lfs-cn-1.modelscope.cn` 和 `wasm-unsafe-eval`，没有开放一般 `unsafe-eval`。这确认修复后的 Worker 与连接策略已进入安装的私有草稿。

用户确认中文字幕与中文配音后，实际编辑器已添加中文字幕，并以中文内置声音 **晴岚**在同一页面连续生成两条配音。两次均得到音轨，播放时间推进至片尾。

| 轮次 | 文本 | 生成音轨时长与位置 | 实际播放 | 耗时证据 |
| --- | --- | --- | --- | --- |
| 首次 | 你好，这是中文字幕与中文配音的测试。 | 约 3.79 秒，起点 0.01 秒；时间线总长 3.81 秒 | `00:00.06` → `00:03.81`，播放完成 | 合计约 5 分钟，仅为粗略记录，未精确计时 |
| 同页再次生成 | 欢迎使用时间线工作室。 | 约 2.54 秒，接在 3.81 秒处；时间线总长 6.35 秒 | `00:03.88` → `00:06.35`，播放完成 | 154 秒轮询时仍在生成，205 秒观察到完成；耗时在 154–205 秒之间 |

**同页连续生成与播放通过，但生成仍明显偏慢。** 第二条仅 11 字，仍需 154–205 秒。源码保留 Worker 和 ONNX sessions 供后续生成使用；本次未抓取网络请求或核对 Worker 身份，不能声称已实测第二次零下载或确认运行时复用。

最后一次未加关键词过滤的浏览器 `warn/error` 日志查询（`limit: 60`）返回 `[]`；此前针对 fetch、CSP、Hojo、ONNX、WebGPU、audio 和 decode 的筛选也没有匹配错误。这仅说明本次浏览器查询未返回警告或错误，不能推断平台所有日志均为空或网络绝无重试。

本轮未验收刷新后的持久缓存、其它音色、主观音质或实际音频下载落盘。以上结果限定为 r14 私有草稿中的晴岚中文字幕配音生成与播放，不扩大为全部语音能力通过，也不改变 alpha.2 的审核候选。

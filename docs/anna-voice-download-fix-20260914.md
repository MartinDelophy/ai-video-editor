# Anna 语音模型下载修复 · 2026-09-14

用户报告 `model-cache-sw.js:329:66` 的 `Uncaught (in promise) TypeError: Failed to fetch`。当前已送审候选仍为 `0.1.0-alpha.2 / 750`，来源 r13；本文修复尚未上传或替换审核候选。

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

这证明已送审配置确实会阻断这条 ModelScope 下载路径，但用户尚未确认具体选择的声音，也尚未在已登录 Anna 容器内重跑完整合成，不能将 1 KB 网络检查写成所有语音模型端到端通过。

## 应用侧修改

- `anna/manifest.json` 只补入已证实的 `https://cdn-lfs-cn-1.modelscope.cn`，保留现有业务权限、模型来源、固定修订和共享缓存身份。
- `public/model-cache-sw.js` 把缓存打开、查询、迁移、写入及配额清理失败限制在可选缓存层；已经拿到的网络响应仍交给模型加载器，不再因缓存异常丢弃它。不可重构的 opaque 响应保持原样。
- `scripts/build-anna.mjs` 删除 `cacheFirst(...).catch(() => fetch(同一请求))` 的盲目重试。原第 329 行正是第二次 fetch；真正网络失败仍返回调用方，由现有模型镜像切换逻辑处理。保留 Anna 脚本 `no-store`、应用范围隔离及大模型缓存。

修复没有伪造成功响应、清空用户缓存或添加 Agent 权限。没有顺带改造所有模型加载器的超时、流读取和取消逻辑；那些潜在健壮性问题不等于本次已确认的生产原因。

## 验证与后续

普通版与生成的 Anna Worker 共 51 项仓库外故障注入检查通过，另补两例配额清理失败检查。覆盖缓存操作同步/异步失败、成功响应保留、网络错误只请求一次、规范缓存命中/迁移、HTTP 错误、opaque 响应、Piper/Range/AI Music 过滤、Anna 脚本刷新及跨应用作用域。目标文件语法、ESLint 与 typecheck 通过。

完整 Anna 构建通过（169 文件、200.3 MiB），官方固定 CLI `0.1.52` 的严格校验通过；实际校验器报告 dispatcher `0.22.0`。构建仅保留既有运行时依赖及大包警告。Anna 浏览器登录已过期，等待用户登录后验证实际所选声音的完整模型下载与合成；当前审核候选不会因本地修复自动改变。

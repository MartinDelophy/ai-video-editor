# Anna 首尾帧视频：平台接口补充契约

日期：2026-10-18。状态：**提案，当前平台尚未实现或验证**。按用户确认继续使用 Anna；不切换供应商、不提交应用草稿。本文不是已发布 API 描述。

## 已核实的现状

[Anna video 公共契约](https://anna.partners/developers/reference/host-api-video.md) 当前 `video.generate` 只提供 `prompt, imageUrl, durationSec, resolution, aspectRatio, generateAudio, model, clientTag`；`imageUrl` 明确是首帧。官方本地运行时原样转发到平台 `/api/v1/copilot/app/video/generate`，没有可在前端修复的尾帧映射。即使底层模型原生支持尾帧，也不能据此宣称 Anna 的该接口支持。

现有故事板已真实生成角色图、环境图和一张 4×4 分镜，保存实际素材和依赖关系。完整首尾帧视频测试处于阻塞状态，没有提交以单首帧冒充的任务。

## 建议扩展（字段名称需平台确认）

在现有首帧 `imageUrl` 基础上新增 `endImageUrl`，保持现有调用向后兼容：

```ts
interface StartEndVideoRequest {
  prompt: string;
  model: string;          // llm.catalog 返回的精确 modelName
  imageUrl: string;       // 独立首帧 HTTPS 文件地址
  endImageUrl: string;    // 独立尾帧 HTTPS 文件地址，绝不可忽略
  durationSec?: number;
  resolution?: string;
  generateAudio?: boolean;
  clientTag: string;      // 业务关联标记，不等于幂等键
  requestId: string;      // 建议新增：同用户、应用、请求的幂等键
}
```

平台在 `llm.catalog` 中为每个模型显式返回 `capabilities.startEndFrames`，包括 `supported`、可用时长/分辨率、图片格式/尺寸/大小限制、首尾帧比例一致性要求。旧平台未提供该能力字段时按不支持处理，不能依据模型名称猜测。SDK、RPC 参数校验、平台媒体 facade、供应商 adapter 必须端到端透传并校验两个图像参数。

首尾帧均经过现有文件上传和下载地址授权边界；验证所有权、HTTPS、SSRF、可读取性、真实图片类型、大小、尺寸及比例。校验失败必须在供应商提交与 CU 预扣之前返回明确错误。禁止静默丢弃尾帧、切换模型、改写时长或降级为单首帧。

## 任务回执、恢复和计费

- 保留已有 `jobId/state/estimatedCostCU/deadlineAt`、`getJob/listJobs/cancelJob` 和 `media_job` 事件。
- `getJob.request` 回传精确模型及 `conditioningMode: "start_end"`，并以稳定文件 ID/摘要证明两帧均被采纳；避免在应用长期快照中保存短期签名 URL。
- `requestId` 重复请求必须返回同一个任务，不能二次提交或二次预扣；同键不同参数应拒绝。网络超时先查询已有任务，不能自动重新生视频。
- 刷新后按账户、项目、节点保存的 jobId 恢复，任务成功后刷新过期结果 URL、下载真实视频字节，交给宿主写入 My assets。仅在媒体提交成功后创建视频节点并连到相应分镜；不自动插入时间线。
- 沿用队列取消退还、运行中取消不保证成功的真实规则。前端“停止等待”和平台“取消任务”必须分别说明。失败、取消、重连均保留已生成的图片和用户修改。

建议机器错误码：`VIDEO_START_END_UNSUPPORTED`、`VIDEO_END_FRAME_INVALID`、`VIDEO_FRAME_ASPECT_MISMATCH`、`VIDEO_REQUEST_CONFLICT`。平台确定正式名称后再实现本地化映射。

## 前端接入边界

用户通过左侧对话选真实视频模型和镜头范围。16 宫格仍保存为**一个原始图片资产**；为视频条件输入提取经过目视确认的对应首尾格图像，保留原图 ID、行列、裁剪范围及输出顺序，不能把整张分镜作为单个镜头的首帧，也不能把拆图变成 16 次生图。文字/分隔线会影响裁剪，应允许在对话中明确镜头后确认实际帧，不承诺任意模型输出的网格都能无误自动切分。

只有发现宿主与所选模型均支持双帧才开放生成执行工具。参数和两帧实际就绪之前不提交任务；生成视频的一切操作仍由对话驱动，右侧只呈现真实媒体节点及顺序连线。一个用户请求可依次生成多段，但要记录每段任务及失败边界，不重复生成已成功的段落。

## 平台就绪后的真实 E2E 验收

| 场景 | 必须可观察的证据 |
| --- | --- |
| 能力发现 | 支持与不支持模型都返回真实双帧能力；未知字段视为不支持 |
| 提交一段 | 只产生一个 jobId；供应商实际收到不同的首帧、尾帧；回执模型与所选一致 |
| 内容验证 | 解码真实首尾视频帧，目视比较参考身份、场景和目标构图；不可仅看请求成功 |
| 多段连续剧情 | 相邻段复用边界图，顺序/依赖正确，没有重复付费提交 |
| 故障边界 | 无效尾帧/比例/不支持模型在扣费前失败，没有降级生成 |
| 超时与幂等 | 同 requestId 重复请求仅一个任务；刷新/断网恢复不创建重复任务 |
| 取消 | 队列和运行中分别验证真实状态与退款结果；保留此前图片 |
| 输出保存 | 视频字节进入 My assets 和项目恢复；刷新可播放；时间线保持原状 |
| 账户隔离 | 其他账户不可恢复当前项目私有任务/媒体；同浏览器同账户可恢复 |

以上视频项当前均不能标记通过，需 Anna 平台先开放并确认正式双帧契约。本文英文摘要已于 2026-10-18 发布至 Anna Developers 论坛：[Feature request: First/last-frame video generation for Anna Apps](https://forum.anna.partners/t/feature-request-first-last-frame-video-generation-for-anna-apps/425)。接口字段仍是提案，尚无平台实现确认。

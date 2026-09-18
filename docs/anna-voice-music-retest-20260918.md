# Anna AI 语音与音乐复测 · 2026-09-18

测试环境：用户已登录的普通 Chrome，Anna Dashboard 内 Timeline Studio `0.1.0-alpha.6`（version 777）。本次复测已部署的冻结版本，没有上传本地入口清理提交 `8fd6af3`，没有替换审核候选。

## 结果

- 晴岚中文语音：输入“你好，这是 Timeline Studio 的语音生成测试。”，经过模型准备、WebGPU 推理，成功生成约 4.17 秒音轨。时间线播放从 0.59 秒推进至工程末尾 7.59 秒；音频元素 duration=4.18、currentTime=4.179144、readyState=4，未报告 media error。云端状态随后显示已保存。
- 英文描述音乐：输入“Gentle instrumental piano with warm ambient pads, calm and steady, no vocals.”，使用 cinematic / dreamy / piano / 30s / 90 BPM。观察到真实并行下载进度持续上升、模型初始化、生成及解码完成。产物 `AI cinematic 2026-09-18T09-53-48.wav` 出现在“我的素材”，时长 30 秒。预览音频 duration=30、currentTime=12.780861、paused=false、readyState=4，无 media error。界面确认云端保存于 17:53。
- 中文描述音乐：同页输入“舒缓的钢琴纯音乐，温暖、安静，没有人声。”，其余参数同上。观察到翻译阶段进入生成和解码，成功产出第二个 30 秒素材 `AI cinematic 2026-09-18T09-55-34.wav`。本轮没有再次进入模型下载阶段；不据此声称已验证刷新后的缓存复用。

## 范围与限制

本次没有复现上述三次生成失败，不应将 AI 语音或 AI 音乐整体认定为 Anna 不支持。首次音乐准备耗时明显长于同页第二次生成。

控制台曾记录 Anna host bridge 的 token renew Failed to fetch / HTTP 401，以及未展开的 Object 错误；生成继续完成，云端保存也成功，不能把这些记录直接归因为模型失败或声称根因已经修复。

本次确认生成产物和播放器推进，未主观听审音质、未验收所有音色/语言/长时长、未验证下载文件落盘或刷新重开后的模型缓存。测试新增一条语音音轨和两条音乐素材，保留供用户检查，没有删除原工程内容。

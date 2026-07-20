# Timeline Studio — Trình chỉnh sửa video AI trên trình duyệt

[English](README.md) | [中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [ไทย](README.th.md) | **Tiếng Việt** | [Русский](README.ru.md)

Timeline Studio là trình chỉnh sửa video AI ưu tiên xử lý cục bộ và chạy trong trình duyệt. Ứng dụng kết hợp dòng thời gian nhiều rãnh kiểu CapCut với lồng tiếng AI, phụ đề tự động, công cụ thị giác, avatar biết nói và quy trình xuất ngoại tuyến xác định.

[Mở trình chỉnh sửa](https://video-editor.ai-creator.top/) · [Xem bản demo](https://youtu.be/mUXduGpBmwE) · [Hugging Face Space](https://huggingface.co/spaces/haixin/timeline-studio)

![Trình chỉnh sửa Timeline Studio](docs/screenshots/editor-timeline.png)

## Tính năng chính

- Lồng tiếng đa ngôn ngữ với Piper/VITS ONNX và Kokoro 82M.
- Phụ đề tự động bằng Whisper small q8 ONNX.
- Căn khung thông minh với YOLOS tiny và MODNet.
- Tách giọng hát/nhạc và tạo avatar bằng JoyVASA cùng LivePortrait.
- Chỉnh sửa nhiều rãnh với lớp phủ, mặt nạ, bộ lọc, hoạt ảnh và khung hình chính.
- Xuất MP4/WebM trong trình duyệt bằng WebCodecs và trộn âm thanh.
- PWA có thể cài đặt, bộ nhớ đệm mô hình cục bộ và dự án `.timeline`.

## Khởi động nhanh

Yêu cầu Node.js 20+ và trình duyệt Chromium hiện đại. Khuyến nghị WebGPU.

```bash
git clone https://github.com/MartinDelophy/ai-video-editor.git
cd ai-video-editor
npm install
npm run dev
```

## Kiểm tra

```bash
npm test
npm run build
npm run check
```

## Hỗ trợ và phản hồi

Nếu dự án này hữu ích với bạn, hãy cân nhắc tặng dự án một ⭐ Star. Nếu gặp vấn đề, vui lòng [mở một Issue](https://github.com/MartinDelophy/ai-video-editor/issues).

## Giấy phép

[MIT](LICENSE)

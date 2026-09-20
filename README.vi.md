# Timeline Studio — Trình chỉnh sửa video AI trên trình duyệt

[English](README.md) | [中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [ไทย](README.th.md) | **Tiếng Việt** | [Русский](README.ru.md)

[![skills.sh](https://skills.sh/b/MartinDelophy/ai-video-editor)](https://skills.sh/MartinDelophy/ai-video-editor)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md) [![LINUX DO](https://shorturl.at/ggSqS)](https://linux.do)

## Sử dụng công nghệ tổng hợp sâu có trách nhiệm

Công cụ này sử dụng công nghệ tổng hợp sâu và chỉ dành cho mục đích nghiên cứu kỹ thuật và học tập.

Người dùng phải bảo đảm rằng:

- chỉ sử dụng hình ảnh hoặc video khuôn mặt của chính mình, hoặc của người đã cấp phép hợp pháp;
- không tạo hoặc phát tán nội dung bất hợp pháp, xâm phạm quyền, sai sự thật hoặc gây hiểu lầm;
- không trình bày nội dung được tạo ra như hình ảnh có thật và không mạo danh người khác khi chưa có sự đồng ý.

Người dùng tự chịu mọi trách nhiệm pháp lý phát sinh từ việc vi phạm các yêu cầu này.

## Cập nhật dự án

- **2026-09-20 — Bám mốc cho đầu phát:** Kéo đầu phát màu trắng để xem trước hình ảnh trực tiếp và bám vào mốc hoặc hai đầu khoảng, kèm đường căn chỉnh và thời gian. Giữ Alt để kéo tự do. Chi tiết dấu mốc hiển thị Xong trước khi sửa và Áp dụng thay đổi sau khi sửa.
- **2026-09-17 — Tinh chỉnh và kiểm tra qua WebMCP:** 21 công cụ trình duyệt hỗ trợ 26 thao tác có thể xem xét trước, gồm di chuyển và cắt nguồn clip định thời, biến đổi lớp phủ, kiểu/vị trí phụ đề và tỷ lệ dự án. Tác nhân có thể lấy mẫu hình và tiếng đã dựng, chạy thuyết minh hoặc chép lời ngay trong trình duyệt với tiến độ và khả năng hủy, rồi kiểm tra trước khi chèn vào dòng thời gian. Các điều khiển và thông báo mới hỗ trợ đủ 13 ngôn ngữ.
- **2026-09-15 — Xuất âm thanh đã chỉnh sửa:** khi xuất clip âm thanh, bản xuất dùng đúng phần đã cắt và áp dụng tốc độ phát, âm lượng, hiệu ứng tăng/giảm âm cùng hiệu ứng không gian. Có thể xuất từng clip hoặc bản trộn của toàn bộ dòng thời gian sang WAV hay MP3. Tùy chọn chỉ xuất âm thanh được bổ sung bên cạnh xuất video.
- **2026-09-14 — Sửa lỗi xuất và hỗ trợ thử lại:** các clip có nền màu đồng nhất và khung hình chính điều chỉnh độ mờ đục nay xuất đúng ngay cả khi không có mặt nạ người. Khi xuất thất bại, thông báo lỗi vẫn hiển thị và có thể thử lại với cùng cài đặt.
- **2026-09-14 — Cải thiện hiệu năng dự án lớn:** nhập dự án giảm tải cho luồng chính. Bộ nhớ đệm tính toán làn âm thanh, cách vẽ dạng sóng nhẹ hơn và ít thao tác tua âm thanh không cần thiết giúp giảm tải khi kéo đầu phát và phát video. Toàn bộ phương tiện, thời điểm clip, công cụ chỉnh sửa, hiệu ứng và cách xuất vẫn được giữ nguyên. Quá trình nhập hiển thị tiến độ thực tế và cho phép chỉnh sửa ngay sau khi khôi phục phương tiện; hình thu nhỏ tiếp tục được hoàn thiện trong nền.

Xem [Roadmap](ROADMAP.md) cho công việc dự kiến, [Releases](https://github.com/MartinDelophy/ai-video-editor/releases) cho thay đổi đã phát hành và [Issues](https://github.com/MartinDelophy/ai-video-editor/issues) cho nhiệm vụ và lỗi.

## Có thể tạo ra những gì?

Khám phá các ví dụ trước/sau có thể tái lập và công thức biên tập:

→ [AI Video Editing Skills Handbook](https://github.com/MartinDelophy/timeline-studio-handbook)

<p align="center">
  <a href="https://trendshift.io/repositories/77422?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-77422" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/77422/daily?language=JavaScript" alt="MartinDelophy%2Fai-video-editor | Trendshift" width="250" height="55"/></a>
  <a href="https://trendshift.io/repositories/77422?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-77422" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/77422/weekly?language=JavaScript" alt="MartinDelophy%2Fai-video-editor | Trendshift" width="250" height="55"/></a>
</p>

Timeline Studio là trình chỉnh sửa video AI ưu tiên xử lý cục bộ và chạy trong trình duyệt. Ứng dụng kết hợp dòng thời gian nhiều rãnh kiểu CapCut với lồng tiếng AI, phụ đề tự động, công cụ thị giác, avatar biết nói và quy trình xuất ngoại tuyến xác định.

[Mở trình chỉnh sửa](https://video-editor.ai-creator.top/) · [Xem bản demo](https://www.youtube.com/watch?v=chdRPG2ndMs) · [Hugging Face Space](https://huggingface.co/spaces/haixin/timeline-studio)

![Trình chỉnh sửa Timeline Studio](docs/screenshots/editor-timeline.png)

## Tính năng chính

- Lồng tiếng đa ngôn ngữ với Piper/VITS ONNX và Kokoro 82M.
- Tạo nhạc AI cục bộ bằng Stable Audio 3 Small Q4 ONNX qua WebGPU, hỗ trợ dịch lời nhắc tự do, các lựa chọn 30/60/90/120 giây, lặp nhạc dài theo phân tích dạng sóng, bộ nhớ đệm mô hình bền vững và tự động thêm vào Tài nguyên của tôi.
- Phụ đề tự động bằng Whisper small q8 ONNX.
- Căn khung thông minh với YOLOS tiny và MODNet.
- Tách giọng hát/nhạc và tạo avatar bằng JoyVASA cùng LivePortrait.
- Chỉnh sửa nhiều rãnh với lớp phủ, mặt nạ, bộ lọc, hoạt ảnh và khung hình chính.
- Xuất MP4/WebM trong trình duyệt bằng WebCodecs và trộn âm thanh.
- PWA có thể cài đặt, bộ nhớ đệm mô hình cục bộ và dự án `.timeline`.

## Bản demo lồng tiếng AI

https://github.com/user-attachments/assets/304a744e-d620-4380-9c17-19af3726f5a4

## Agent Skill

Kho mã này bao gồm Agent Skill [`edit-timeline-studio`](skills/edit-timeline-studio/SKILL.md) để lập kế hoạch, thực hiện và xác minh các dòng thời gian video có thể tiếp tục chỉnh sửa. Cài đặt bằng GitHub CLI 2.90.0 trở lên.

Cài đặt qua [skills.sh](https://skills.sh/MartinDelophy/ai-video-editor) yêu cầu Node.js 22.20.0 trở lên.

```bash
npx skills add MartinDelophy/ai-video-editor --skill edit-timeline-studio
```

```bash
# Claude Code
gh skill install MartinDelophy/ai-video-editor edit-timeline-studio --agent claude-code --scope user

# Codex
gh skill install MartinDelophy/ai-video-editor edit-timeline-studio --agent codex --scope user
```

Thêm `--pin v1.0.8` để cài bản phát hành đã được kiểm chứng thay vì luôn theo bản mới nhất. Có thể xem trước nội dung bằng `gh skill preview MartinDelophy/ai-video-editor edit-timeline-studio`.

## Lộ trình

- **Hiện tại:** củng cố quy trình xuất ngoại tuyến xác định, tăng độ tin cậy của dòng thời gian và mở rộng kiểm thử đầu-cuối trong trình duyệt.
- **Tiếp theo:** mở rộng tính tương đương giữa kết xuất headless và trình duyệt, các lệnh WebMCP có thể xem xét và việc chia sẻ mẫu dự án.
- **Sau này:** bổ sung quy trình đánh giá cộng tác, giao diện tiện ích mở rộng và thêm các mô hình AI được xác minh cục bộ.

Các ưu tiên được thảo luận tại [GitHub Discussions](https://github.com/MartinDelophy/ai-video-editor/discussions).

## Cần sự đóng góp

Chúng tôi hoan nghênh đóng góp về phương tiện trong trình duyệt, WebCodecs, WebGPU/ONNX, UX dòng thời gian, bản địa hóa, kiểm thử và tài liệu. Hãy báo lỗi có thể tái hiện trong [Issues](https://github.com/MartinDelophy/ai-video-editor/issues), chia sẻ ý tưởng tại [Discussions](https://github.com/MartinDelophy/ai-video-editor/discussions), hoặc gửi các bản sửa lỗi, kiểm thử, bản dịch và ví dụ có phạm vi rõ ràng.

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
npm run build
npm run check
```

## Hỗ trợ và phản hồi

Nếu dự án này hữu ích với bạn, hãy cân nhắc tặng dự án một ⭐ Star. Nếu gặp vấn đề, vui lòng [mở một Issue](https://github.com/MartinDelophy/ai-video-editor/issues).

Hãy tham gia [cộng đồng Discord](https://discord.gg/uq2uvUTBr) để đặt câu hỏi, chia sẻ phản hồi và kết nối với những người dùng cũng như cộng tác viên khác.

## Giấy phép

[MIT](LICENSE)

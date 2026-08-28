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

- **28 tháng 8, 2026 — Khử nhiễu thông minh cục bộ:** Hình ảnh → Sửa chữa AI cung cấp DRUNet với so sánh khung hình, bốn mức cường độ, giữ âm thanh nguồn và áp dụng có thể hoàn tác. Toàn đoạn nay chạy ở tốc độ khung hình nguồn qua luồng WebCodecs, chồng lấp giải mã và suy luận, duy trì WebGPU Session, tái sử dụng canvas, tensor và bộ đệm điểm ảnh, đồng thời thận trọng dùng lại phần dư khử nhiễu cho các khung hình liền kề ít thay đổi; PNG/FFmpeg vẫn là đường tương thích. Có trên máy tính, di động và đủ 11 ngôn ngữ.
- **28 tháng 8, 2026 — Chuẩn bị video độ trung thực cao trên dòng thời gian:** video mới tải lên giữ trạng thái đang xử lý rõ ràng trong khi giải mã siêu dữ liệu và ảnh thu nhỏ PTS thực, tránh khối giữ chỗ bị kéo giãn. Dải phim dùng khung nguồn 180px sắc nét hơn, mật độ dễ đọc theo mức thu phóng, ánh xạ thời gian nguồn chính xác dưới đầu phát và cắt giữa video dọc không có viền đen.
- **28 tháng 8, 2026 — Tiến độ thời gian thực cho mô hình tích hợp Chrome:** Dựng tự động hiển thị riêng tiến độ Chrome thực tế, trạng thái hoàn tất và số lần thử của mô hình hiểu hình ảnh và dịch phụ đề. Nếu Chrome không phát tiến độ trong 45 giây, giao diện báo trạng thái bị kẹt và hiện nút Thử tải xuống lại do người dùng kích hoạt, vừa giữ tương tác bắt buộc vừa dùng tiếp dữ liệu tải dở của Chrome.
- **27 tháng 8, 2026 — Dựng tinh trên dòng thời gian:** bổ sung trượt nội dung video trong giới hạn nguồn, trượt ba clip với cắt đồng bộ hai clip lân cận và chọn điểm dựng để chỉnh cuốn từng khung hình bằng phím mũi tên. Mọi chế độ đều giữ rãnh hình chính liền mạch, tôn trọng khóa rãnh và giới hạn nguồn, hiển thị phản hồi kéo trực tiếp và được bản địa hóa sang 11 ngôn ngữ. Ảnh thu nhỏ dọc và 9:16 nay cắt giữa để lấp đầy ô, không còn viền đen.
- **26 tháng 8, 2026 — Chỉnh sửa gợn sóng nhận biết khóa:** bổ sung chế độ gợn sóng rõ ràng trên thanh công cụ dòng thời gian. Khi kéo nội dung lên rãnh chính, một khoảng chèn đúng bằng thời lượng nội dung sẽ mở trước khi thả, đồng thời dịch các clip phía sau cùng các điểm chuyển cảnh. Clip hình chính nay có tay nắm đầu để chỉnh ranh giới cuốn, còn thao tác thả hình trong hình hiển thị đúng vị trí và thời lượng trên hàng đích. Việc chèn, nhân đôi, xóa và đổi thời lượng sẽ dịch các clip định thời đủ điều kiện theo đúng độ chênh, giữ liên kết phụ đề–âm thanh đang hoạt động, suy ra âm thanh nguồn liên kết từ chuỗi hình ảnh và không di chuyển rãnh đã khóa.

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

Thêm `--pin v1.0.0` để cài bản phát hành đã được kiểm chứng thay vì luôn theo bản mới nhất. Có thể xem trước nội dung bằng `gh skill preview MartinDelophy/ai-video-editor edit-timeline-studio`.

## Lộ trình

- **Hiện tại:** củng cố quy trình xuất ngoại tuyến xác định, tăng độ tin cậy của dòng thời gian và mở rộng kiểm thử đầu-cuối trong trình duyệt.
- **Tiếp theo:** phát hành trình chạy lệnh headless có phiên bản cho chỉnh sửa bằng tác nhân và giúp chia sẻ mẫu dự án tái sử dụng dễ dàng hơn.
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

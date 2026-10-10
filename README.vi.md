# Timeline Studio — Trình chỉnh sửa video AI trên trình duyệt

[English](README.md) | [中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [ไทย](README.th.md) | **Tiếng Việt** | [Русский](README.ru.md)

[![skills.sh](https://skills.sh/b/MartinDelophy/ai-video-editor)](https://skills.sh/MartinDelophy/ai-video-editor)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md) [![LINUX DO](https://shorturl.at/ggSqS)](https://linux.do)

## Sáng tạo cùng Anna

Phiên bản Anna kết hợp hỗ trợ dựng bằng AI và khả năng tiếp tục dự án:

- Mô tả yêu cầu dựng cho Anna, xem xét kế hoạch dựa trên yêu cầu và siêu dữ liệu của tư liệu, rồi áp dụng việc sắp xếp clip và cắt video đơn giản ở tốc độ 1× được hỗ trợ.
- Dự án và tư liệu tự động lưu vào đám mây Anna, có thể tiếp tục trên trình duyệt khác với cùng tài khoản. Bạn cũng có thể lưu các bản khôi phục dự án cục bộ.
- Tinh chỉnh trên dòng thời gian đa rãnh có thể chỉnh sửa, thêm giọng đọc AI và phụ đề thủ công, rồi xuất MP4 bằng bộ mã hóa có sẵn trong trình duyệt.

Đây là bản xem trước dành cho máy tính. Bước lập kế hoạch không phân tích hình ảnh hay âm thanh; tính năng AI cục bộ phụ thuộc vào khả năng của môi trường Anna.

→ [Trải nghiệm Timeline Studio trên Anna](https://anna.partners/store/@martindelophy/timeline-studio)

## Sử dụng công nghệ tổng hợp sâu có trách nhiệm

Công cụ này sử dụng công nghệ tổng hợp sâu và chỉ dành cho mục đích nghiên cứu kỹ thuật và học tập.

Người dùng phải bảo đảm rằng:

- chỉ sử dụng hình ảnh hoặc video khuôn mặt của chính mình, hoặc của người đã cấp phép hợp pháp;
- không tạo hoặc phát tán nội dung bất hợp pháp, xâm phạm quyền, sai sự thật hoặc gây hiểu lầm;
- không trình bày nội dung được tạo ra như hình ảnh có thật và không mạo danh người khác khi chưa có sự đồng ý.

Người dùng tự chịu mọi trách nhiệm pháp lý phát sinh từ việc vi phạm các yêu cầu này.

## Cập nhật dự án

- **2026-10-10** — Bản thử `/paypal`: báo giá cố định, duyệt sandbox, xác minh thu tiền trên máy chủ và trợ lý. Đã kiểm chứng thanh toán sandbox và suy luận Ollama cục bộ thật; giao thủ công.
- **2026-10-10** — Bản xem trước cuộc thi tại `/nebius`: kết nối Token Factory với NVIDIA Nemotron phía máy chủ, chỉ gửi siêu dữ liệu và duyệt chỉnh sửa. Suy luận thực chờ khóa API và tín dụng miễn phí.
- **2026-10-07** — Clip hình ảnh hỗ trợ thời lượng tối thiểu 0,05 giây, khắc phục việc từ chối cắt đoạn mở đầu ngắn như tại 0,45 giây. Cắt mép, đổi tốc độ và khôi phục dự án dùng chung giới hạn này. Sửa lỗi video đứng hình khi mở hoặc đóng bản xem trước lớn bằng cách khôi phục thời gian nguồn, trạng thái phát và cập nhật từng khung hình cho phần tử video mới.
- **2026-10-05** — Lấy mẫu độ sâu ở 8, 16 và 24 ảnh/giây cho chế độ Nhanh, Tiêu chuẩn và Chi tiết. Nhanh và Tiêu chuẩn dùng RIFE để xuất 24fps, đồng thời lấy mẫu và mã hóa qua hàng đợi có giới hạn. Giữ âm thanh gốc và tái sử dụng phân tích đã hoàn tất nếu tạo video thất bại. Thời điểm lấy mẫu cố định và tái sử dụng phiên, điểm ảnh, tensor RIFE giúp giảm nội suy thừa mà không giảm độ chính xác, độ phân giải hay số mẫu. RIFE dùng bản cố định từ kho Hugging Face và ModelScope của chúng tôi, kiểm tra mã băm, tự chuyển nguồn và dùng chung bộ nhớ đệm.
- **2026-10-04** — Bản đồ độ sâu — Chuyển video thành độ sâu xám: gần sáng, xa tối. Phân tích độ sâu giải mã khung hình đồng thời với suy luận, mã hóa PNG trong Worker và giảm tần suất cập nhật giao diện. Xem trước và xuất bản đồ độ sâu nội suy giữa các mẫu, sửa thời gian nguồn khi cắt và đổi tốc độ, đồng thời tái sử dụng ảnh đã giải mã. Đã lưu video độ sâu vào Tài nguyên của tôi. Video độ sâu thay thế clip nguồn và giữ các tài nguyên. Thời lượng phát lấy từ chuỗi hình ảnh, sửa lỗi hiện 0 giây sau khi xóa rồi chèn lại video. Video độ sâu có âm thanh nguồn khớp với cắt và đổi tốc độ; video gốc cùng âm thanh vẫn được giữ. Thêm ánh sáng theo độ sâu có thể chỉnh sửa, cầu vị trí đèn, giữ để so sánh bản gốc và cập nhật xem trước sau khi kéo.
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

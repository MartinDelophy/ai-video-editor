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

- **2026-10-18** — Thêm các làn hành động nhân vật và máy quay đồng bộ, cùng băng chuyền kịch bản có thể chỉnh sửa theo phát lại. Hộp thoại 3D dùng chung ChatCut với lịch sử, khôi phục bản nháp, tham chiếu đối tượng và duyệt thay đổi. Storyboard mặc định dùng GPT Image 2 (fal). Đã sửa tham số định tuyến mô hình hội thoại và giữ ngữ cảnh dài hơn; xác minh phản hồi chuyển mô hình thực tế. Video có khung đầu và cuối vẫn chờ Anna mở rộng API: docs/storyboard-anna-video-contract.md. Lỗi tải quy trình được tách khỏi trình biên tập, hỗ trợ thử lại, quay về và tương thích tài nguyên giữa các bản nháp Anna. Canvas vô hạn bổ sung đường nối có hướng, tô sáng đầu vào tương thích và menu tạo rồi kết nối nút tiếp theo trong một thao tác có thể hoàn tác. Chat canvas hỗ trợ tìm kiếm và tham chiếu nút bằng @, thẻ có thể xóa và ID nút rõ ràng.
- **2026-10-17** — Thêm Không gian vô hạn với nút có kiểu dữ liệu, chỉnh sửa Anna được xem trước, trình kết nối thật, lồng tiếng và nhạc cục bộ, phiên bản kết quả, kiểm tra lại tác vụ video và khôi phục đồ thị cùng media theo tài khoản và dự án. Kết quả vào Tài sản của tôi và chỉ tạo khi người dùng yêu cầu rõ ràng. Hai ảnh hướng dẫn nội bộ chỉ được đính kèm khi tạo, không xuất hiện trong tư liệu, gợi ý @ hay nút.
- **2026-10-17** — Thêm xử lý âm thanh trong trình duyệt với RNNoise, DeepFilterNet3, EQ, nén, độ lợi và giới hạn; nghe thử, áp dụng và khôi phục bản gốc. Cải thiện bảng âm thanh gốc, căn chỉnh và tô sáng từ khóa phụ đề, phông chữ đa ngôn ngữ, chỉnh sửa liên kết và phát tại ranh giới clip. Anna thêm thuyết minh đám mây theo danh mục, lưu vào Tư liệu của tôi, và nhập giọng nói ChatCut với quyền ứng dụng và micrô. Giọng Anna dùng chung thẻ chọn giọng và thao tác tổng hợp hiện có, với ba ảnh đại diện ảo mới. Phụ đề tự động Anna và phiên âm ChatCut dùng chung Anna STT, giữ liên kết âm thanh và hình ảnh. ChatCut hỗ trợ kiểu phụ đề, di chuyển liên kết, nhãn dán, âm thanh không gian và xử lý âm thanh cục bộ; lời dẫn Anna dùng TTS ưu tiên. Có thể tô nổi bật văn bản đã chọn riêng cho từng phụ đề, chọn màu và xóa phần tô. Thẻ giọng Anna phát trực tiếp mẫu chính thức tương ứng; đã bỏ các nút phụ đề trùng lặp. Anna thêm trợ lý giọng nói để xem tính năng, mở bảng và chỉnh sửa qua ChatCut, có tắt mic, ngắt lời và xác nhận tạo nội dung. Phụ đề tự động mặc định xử lý tất cả đoạn, vẫn có thể chọn riêng từng đoạn. Thêm tự giảm âm cho âm thanh gốc, giọng nói và nhạc, mặc định tắt, dùng Silero cục bộ và chung đường âm lượng khi xem trước và xuất. Cuộc gọi Anna dùng thanh sóng âm trên cùng với tắt mic, ngắt lời và kết thúc, không che khung hình. Khi chuyển clip, giữ khung hình trước đến khi khung hình tiếp theo sẵn sàng, tránh nháy hình trống. Tự giảm âm hiển thị các bước tải và đường âm lượng thực trên dòng thời gian. Thêm cải thiện giọng nói ba mức, so sánh và khôi phục bản gốc. Tự giảm âm tái sử dụng mô hình đã tải và hiển thị tiến độ từ 0%. Lời chào và lệnh giao diện rõ ràng phản hồi tại máy; chỉnh sửa phức tạp vẫn được kiểm tra. Quy trình bổ sung nguyên mẫu 3D có thể chỉnh sửa với biến đổi, góc máy, phát, hoàn tác và duyệt thay đổi Anna; giọng nhân vật chưa được tích hợp. Thêm bảng phân cảnh với ChatCut, tham chiếu @, khung nút ban đầu trống, tùy chọn mô hình và phục hồi theo tài khoản, dự án. 16 ô nằm trong một ảnh; video có khung hình cuối đang chờ API Anna hỗ trợ.
- **2026-10-12** — Khi phát video dài, tạm dừng tinh chỉnh hình thu nhỏ nền và vẽ đúng khung hình tại đầu phát mà không mã hóa JPEG. Tiếp tục phát ưu tiên vị trí tua mới nhất. Âm thanh AAC được trích xuất không mã hóa lại hay sao chép toàn bộ video vào WASM; giữ nguyên hiệu ứng và cài đặt xuất. Xuất video ưu tiên bộ mã hóa phần cứng được hỗ trợ và ghép trực tiếp các khung hình đủ điều kiện ở kích thước gốc; biến đổi và hiệu ứng giữ nguyên cách kết xuất hiện có. Mã hóa âm thanh và ghép khung hình tiếp theo chạy song song với việc gửi khung hình video, với hàng đợi có giới hạn.
- **2026-10-07** — Clip hình ảnh hỗ trợ thời lượng tối thiểu 0,05 giây, khắc phục việc từ chối cắt đoạn mở đầu ngắn như tại 0,45 giây. Cắt mép, đổi tốc độ và khôi phục dự án dùng chung giới hạn này. Sửa lỗi video đứng hình khi mở hoặc đóng bản xem trước lớn bằng cách khôi phục thời gian nguồn, trạng thái phát và cập nhật từng khung hình cho phần tử video mới.

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

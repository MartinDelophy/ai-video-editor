# Đóng góp cho Timeline Studio

> Đây là bản dịch tiếng Việt của [CONTRIBUTING.md](CONTRIBUTING.md). Nếu có
> bất kỳ khác biệt nào về nội dung, bản tiếng Anh là bản chuẩn.

Cảm ơn bạn đã giúp cải thiện Timeline Studio. Những người lần đầu đóng góp
cho mã nguồn mở luôn được hoan nghênh.

## Những cách tốt để bắt đầu

Hãy tìm các issue có nhãn:

- `good first issue` cho những thay đổi nhỏ, phạm vi rõ ràng
- `help wanted` cho những công việc có sẵn hướng dẫn từ maintainer
- `documentation` cho các cải tiến về hướng dẫn và nội dung văn bản
- `localization` cho công việc dịch thuật
- `testing` cho việc kiểm thử trên trình duyệt, thiết bị và quy trình làm việc

Nếu bạn chưa chắc nên chọn issue nào, hãy giới thiệu bản thân trong
[GitHub Discussions](https://github.com/MartinDelophy/ai-video-editor/discussions)
hoặc trong [cộng đồng Discord](https://discord.gg/uq2uvUTBr). Hãy nêu lĩnh vực
bạn quan tâm và bất kỳ công nghệ nào bạn muốn học.

Vui lòng bình luận vào một issue trước khi bắt đầu một thay đổi lớn. Điều này
giúp tránh trùng lặp công việc và cho maintainer cơ hội làm rõ kết quả mong
muốn.

## Phát triển cục bộ (Local development)

Yêu cầu:

- Node.js 20 trở lên
- npm
- Một trình duyệt Chromium hiện đại
- Phần cứng hỗ trợ WebGPU cho các quy trình AI nặng nhất trên trình duyệt

Thiết lập dự án:

```bash
git clone https://github.com/MartinDelophy/ai-video-editor.git
cd ai-video-editor
npm install
npm run dev
```

Mở địa chỉ local mà Vite in ra.

## Thực hiện một thay đổi

1. Fork repository.
2. Tạo một branch tập trung từ branch mặc định mới nhất.
3. Thực hiện một thay đổi rõ ràng, duy nhất.
4. Thêm hoặc cập nhật test khi hành vi thay đổi.
5. Kiểm tra trải nghiệm trên máy tính và điện thoại đối với các thay đổi mà
   người dùng nhìn thấy được.
6. Chạy các lệnh kiểm tra liên quan.
7. Mở một pull request và giải thích điều gì đã thay đổi cùng cách bạn đã
   kiểm tra.

Hãy giữ pull request nhỏ khi có thể. Một pull request tập trung sẽ dễ review
hơn và đặc biệt hữu ích cho lần đóng góp đầu tiên.

## Kiểm tra (Validation)

Chạy toàn bộ quy trình kiểm tra của repository:

```bash
npm run check
```

Trong quá trình phát triển, bạn có thể chạy từng kiểm tra riêng lẻ:

```bash
npm run lint
npm run typecheck
npm run build
```

Đối với thay đổi chỉ liên quan đến tài liệu, hãy mô tả những gì bạn đã tự
review thủ công nếu việc chạy toàn bộ quy trình kiểm tra là không cần thiết.

## Đóng góp về giao diện người dùng

Khi thay đổi hành vi hiển thị:

- Kiểm tra ở viewport máy tính.
- Kiểm tra ở viewport điện thoại `412 × 915`.
- Giữ cho các điều khiển có thể thao tác bằng bàn phím khi áp dụng được.
- Tránh đưa vào văn bản hiển thị cho người dùng mà chưa được dịch.
- Đính kèm ảnh chụp màn hình trước và sau, hoặc một đoạn ghi hình ngắn, trong
  pull request.

## Đóng góp về bản địa hóa

Hãy giữ ý nghĩa nhất quán giữa các ngôn ngữ thay vì dịch từng từ riêng lẻ.
Tái sử dụng các khóa dịch (translation key) hiện có khi có thể, và ghi rõ
ngôn ngữ giao diện bạn đã kiểm tra trong pull request.

## Báo cáo kết quả về trình duyệt và hiệu năng

Hãy bao gồm:

- Tên và phiên bản trình duyệt
- Hệ điều hành
- Thiết bị hoặc GPU khi liên quan
- Các bước chính xác để tái hiện
- Hành vi mong đợi và hành vi thực tế
- Lỗi trong console, ảnh chụp màn hình hoặc đoạn ghi hình khi có

Không đưa phương tiện riêng tư, token truy cập, thông tin cá nhân hoặc dữ
liệu nhạy cảm khác vào issue hay tệp kiểm thử.

## Kỳ vọng đối với pull request

Một pull request cần:

- Liên kết đến issue liên quan khi có.
- Giải thích kết quả mà người dùng nhìn thấy hoặc kết quả về mặt kỹ thuật.
- Liệt kê các kiểm tra đã thực hiện.
- Tránh định dạng lại (formatting) hoặc tái cấu trúc (refactoring) không liên
  quan.
- Giữ nguyên hành vi hiện tại ngoài phạm vi đã nêu.

Khi đóng góp, bạn đồng ý rằng đóng góp của mình sẽ được cấp phép theo
[Giấy phép MIT](LICENSE) của repository.

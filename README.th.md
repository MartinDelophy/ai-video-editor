# Timeline Studio — โปรแกรมตัดต่อวิดีโอ AI บนเบราว์เซอร์

[English](README.md) | [中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | **ไทย** | [Tiếng Việt](README.vi.md) | [Русский](README.ru.md)

Timeline Studio คือโปรแกรมตัดต่อวิดีโอ AI แบบเน้นการทำงานในเครื่อง ซึ่งทำงานบนเบราว์เซอร์ รวมไทม์ไลน์หลายแทร็กแบบ CapCut เข้ากับเสียงพากย์ AI คำบรรยายอัตโนมัติ เครื่องมือวิเคราะห์ภาพ อวตารพูดได้ และการส่งออกแบบออฟไลน์ที่ให้ผลแน่นอน

[เปิดโปรแกรมตัดต่อ](https://video-editor.ai-creator.top/) · [ชมเดโม](https://youtu.be/mUXduGpBmwE) · [Hugging Face Space](https://huggingface.co/spaces/haixin/timeline-studio)

![โปรแกรมตัดต่อ Timeline Studio](docs/screenshots/editor-timeline.png)

## ความสามารถหลัก

- เสียงพากย์หลายภาษาด้วย Piper/VITS ONNX และ Kokoro 82M
- คำบรรยายอัตโนมัติด้วย Whisper small q8 ONNX
- การจัดเฟรมอัจฉริยะด้วย YOLOS tiny และ MODNet
- แยกเสียงร้องและดนตรี พร้อมอวตาร JoyVASA และ LivePortrait
- การตัดต่อหลายแทร็ก พร้อมโอเวอร์เลย์ มาสก์ ฟิลเตอร์ แอนิเมชัน และคีย์เฟรม
- ส่งออก MP4/WebM ในเบราว์เซอร์ด้วย WebCodecs และการมิกซ์เสียง
- PWA ที่ติดตั้งได้ แคชโมเดลในเครื่อง และโปรเจกต์ `.timeline`

## เริ่มต้นใช้งาน

ต้องใช้ Node.js 20+ และเบราว์เซอร์ Chromium รุ่นใหม่ แนะนำให้ใช้ WebGPU

```bash
git clone https://github.com/MartinDelophy/ai-video-editor.git
cd ai-video-editor
npm install
npm run dev
```

## การตรวจสอบ

```bash
npm test
npm run build
npm run check
```

## การสนับสนุนและข้อเสนอแนะ

หากโปรเจกต์นี้มีประโยชน์กับคุณ โปรดกด ⭐ Star หากพบปัญหา โปรด[เปิด Issue](https://github.com/MartinDelophy/ai-video-editor/issues)

## สัญญาอนุญาต

[MIT](LICENSE)

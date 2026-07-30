# Timeline Studio — โปรแกรมตัดต่อวิดีโอ AI บนเบราว์เซอร์

[English](README.md) | [中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | **ไทย** | [Tiếng Việt](README.vi.md) | [Русский](README.ru.md)

[![skills.sh](https://skills.sh/b/MartinDelophy/ai-video-editor)](https://skills.sh/MartinDelophy/ai-video-editor)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md)
<a href="https://www.producthunt.com/products/timeline-studio-2?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-timeline-studio-2" target="_blank" rel="noopener noreferrer"><img alt="Timeline Studio - Local-first AI video editing in your browser | Product Hunt" width="250" height="54" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1196911&amp;theme=light&amp;t=1785378187636"></a>

## ข่าวสารโครงการ

- **29 กรกฎาคม 2026 — เอฟเฟกต์:** กำลังพัฒนาเส้นขอบบุคคล และวางแผนเส้นขอบวัตถุ การติดตามด้วยออปติคัลโฟลว์ และการเคลื่อนไหวแบบแกว่งเป็นลำดับถัดไป
- **28 กรกฎาคม 2026 — v0.8.0:** ปรับปรุงคู่มือผู้ร่วมพัฒนาและเอกสารการเผยแพร่
- ดูงานที่วางแผนไว้ใน [Roadmap](ROADMAP.md) การเปลี่ยนแปลงที่เผยแพร่แล้วใน [Releases](https://github.com/MartinDelophy/ai-video-editor/releases) และงานหรือข้อผิดพลาดใน [Issues](https://github.com/MartinDelophy/ai-video-editor/issues)

<p align="center">
  <a href="https://trendshift.io/repositories/77422?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-77422" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/77422/daily?language=JavaScript" alt="MartinDelophy%2Fai-video-editor | Trendshift" width="250" height="55"/></a>
  <a href="https://trendshift.io/repositories/77422?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-77422" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/77422/weekly?language=JavaScript" alt="MartinDelophy%2Fai-video-editor | Trendshift" width="250" height="55"/></a>
</p>

Timeline Studio คือโปรแกรมตัดต่อวิดีโอ AI แบบเน้นการทำงานในเครื่อง ซึ่งทำงานบนเบราว์เซอร์ รวมไทม์ไลน์หลายแทร็กแบบ CapCut เข้ากับเสียงพากย์ AI คำบรรยายอัตโนมัติ เครื่องมือวิเคราะห์ภาพ อวตารพูดได้ และการส่งออกแบบออฟไลน์ที่ให้ผลแน่นอน

[เปิดโปรแกรมตัดต่อ](https://video-editor.ai-creator.top/) · [ชมเดโม](https://www.youtube.com/watch?v=chdRPG2ndMs) · [Hugging Face Space](https://huggingface.co/spaces/haixin/timeline-studio)

![โปรแกรมตัดต่อ Timeline Studio](docs/screenshots/editor-timeline.png)

## ความสามารถหลัก

- เสียงพากย์หลายภาษาด้วย Piper/VITS ONNX และ Kokoro 82M
- สร้างเพลง AI ในเครื่องด้วย Stable Audio 3 Small Q4 ONNX ผ่าน WebGPU รองรับการแปลพรอมต์อิสระ ระยะเวลา 30/60/90/120 วินาที การวนเพลงยาวโดยวิเคราะห์รูปคลื่น แคชโมเดลแบบถาวร และเพิ่มลงในสินทรัพย์ของฉันโดยอัตโนมัติ
- คำบรรยายอัตโนมัติด้วย Whisper small q8 ONNX
- การจัดเฟรมอัจฉริยะด้วย YOLOS tiny และ MODNet
- แยกเสียงร้องและดนตรี พร้อมอวตาร JoyVASA และ LivePortrait
- การตัดต่อหลายแทร็ก พร้อมโอเวอร์เลย์ มาสก์ ฟิลเตอร์ แอนิเมชัน และคีย์เฟรม
- ส่งออก MP4/WebM ในเบราว์เซอร์ด้วย WebCodecs และการมิกซ์เสียง
- PWA ที่ติดตั้งได้ แคชโมเดลในเครื่อง และโปรเจกต์ `.timeline`

## เดโมเสียงพากย์ AI

https://github.com/user-attachments/assets/304a744e-d620-4380-9c17-19af3726f5a4

## Agent Skill

รีโพซิทอรีนี้มี Agent Skill [`edit-timeline-studio`](skills/edit-timeline-studio/SKILL.md) สำหรับวางแผน ดำเนินการ และตรวจสอบไทม์ไลน์วิดีโอที่ยังแก้ไขต่อได้ ติดตั้งด้วย GitHub CLI 2.90.0 ขึ้นไป

การติดตั้งผ่าน [skills.sh](https://skills.sh/MartinDelophy/ai-video-editor) ต้องใช้ Node.js 22.20.0 ขึ้นไป

```bash
npx skills add MartinDelophy/ai-video-editor --skill edit-timeline-studio
```

```bash
# Claude Code
gh skill install MartinDelophy/ai-video-editor edit-timeline-studio --agent claude-code --scope user

# Codex
gh skill install MartinDelophy/ai-video-editor edit-timeline-studio --agent codex --scope user
```

เพิ่ม `--pin v0.7.1` เพื่อติดตั้งรุ่นที่ผ่านการตรวจสอบแทนการติดตามรีลีสล่าสุด และตรวจสอบเนื้อหาก่อนติดตั้งได้ด้วย `gh skill preview MartinDelophy/ai-video-editor edit-timeline-studio`

## แผนพัฒนา

- **ขณะนี้:** เพิ่มความเสถียรของการส่งออกออฟไลน์แบบกำหนดผลลัพธ์ได้ ปรับปรุงความน่าเชื่อถือของไทม์ไลน์ และเพิ่มการทดสอบแบบ end-to-end ในเบราว์เซอร์
- **ขั้นถัดไป:** เปิดตัวตัวรันคำสั่งแบบ headless ที่มีเวอร์ชันสำหรับการตัดต่อด้วยเอเจนต์ และทำให้แชร์เทมเพลตโปรเจกต์ที่นำกลับมาใช้ใหม่ได้ง่ายขึ้น
- **อนาคต:** เพิ่มการตรวจทานร่วมกัน ระบบส่วนขยาย และโมเดล AI ที่ผ่านการตรวจสอบในเครื่องเพิ่มเติม

ร่วมกำหนดลำดับความสำคัญได้ใน [GitHub Discussions](https://github.com/MartinDelophy/ai-video-editor/discussions)

## ต้องการผู้ช่วยพัฒนา

ยินดีรับความช่วยเหลือด้านสื่อบนเบราว์เซอร์ WebCodecs, WebGPU/ONNX, UX ของไทม์ไลน์ การแปล การทดสอบ และเอกสาร โปรดแจ้งบั๊กที่ทำซ้ำได้ใน [Issues](https://github.com/MartinDelophy/ai-video-editor/issues) แบ่งปันแนวคิดใน [Discussions](https://github.com/MartinDelophy/ai-video-editor/discussions) หรือส่งการแก้ไข การทดสอบ คำแปล และตัวอย่างที่มีขอบเขตชัดเจน

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
npm run build
npm run check
```

## การสนับสนุนและข้อเสนอแนะ

หากโปรเจกต์นี้มีประโยชน์กับคุณ โปรดกด ⭐ Star หากพบปัญหา โปรด[เปิด Issue](https://github.com/MartinDelophy/ai-video-editor/issues)

เข้าร่วม[ชุมชน Discord](https://discord.gg/uq2uvUTBr) ของเราเพื่อสอบถาม แบ่งปันความคิดเห็น และพูดคุยกับผู้ใช้และผู้ร่วมพัฒนาคนอื่น ๆ

## สัญญาอนุญาต

[MIT](LICENSE)

# Timeline Studio — โปรแกรมตัดต่อวิดีโอ AI บนเบราว์เซอร์

[English](README.md) | [中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | **ไทย** | [Tiếng Việt](README.vi.md) | [Русский](README.ru.md)

[![skills.sh](https://skills.sh/b/MartinDelophy/ai-video-editor)](https://skills.sh/MartinDelophy/ai-video-editor)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md) [![LINUX DO](https://shorturl.at/ggSqS)](https://linux.do)

## การใช้เทคโนโลยีสังเคราะห์เชิงลึกอย่างรับผิดชอบ

เครื่องมือนี้ใช้เทคโนโลยีสังเคราะห์เชิงลึกและมีไว้เพื่อการวิจัยทางเทคนิคและการเรียนรู้เท่านั้น

ผู้ใช้ต้องตรวจสอบให้แน่ใจว่า:

- ใช้เฉพาะภาพหรือวิดีโอใบหน้าของตนเอง หรือของบุคคลที่ได้ให้การอนุญาตอย่างถูกต้องตามกฎหมายแล้ว
- ไม่สร้างหรือเผยแพร่เนื้อหาที่ผิดกฎหมาย ละเมิดสิทธิ เป็นเท็จ หรือทำให้เข้าใจผิด
- ไม่นำเสนอเนื้อหาที่สร้างขึ้นว่าเป็นภาพจริง และไม่สวมรอยเป็นบุคคลอื่นโดยไม่ได้รับความยินยอม

ผู้ใช้ต้องรับผิดชอบแต่เพียงผู้เดียวต่อความรับผิดทางกฎหมายใด ๆ ที่เกิดจากการฝ่าฝืนข้อกำหนดเหล่านี้

## ข่าวสารโครงการ

- **2026-09-15 — ส่งออกเสียงที่แก้ไขแล้ว:** การส่งออกคลิปเสียงจะใช้ช่วงที่ตัดไว้ พร้อมความเร็วในการเล่น ระดับเสียง เฟด และเอฟเฟกต์พื้นที่เสียง สามารถส่งออกทั้งคลิปเดี่ยวและเสียงมิกซ์ของไทม์ไลน์ทั้งหมดเป็น WAV หรือ MP3 และมีตัวเลือกส่งออกเฉพาะเสียงควบคู่กับการส่งออกวิดีโอ
- **2026-09-14 — แก้ไขการส่งออกและเพิ่มการลองใหม่:** คลิปที่ใช้พื้นหลังสีล้วนและคีย์เฟรมความทึบสามารถส่งออกได้ตามปกติแม้ไม่มีมาสก์บุคคล หากส่งออกไม่สำเร็จ ข้อความข้อผิดพลาดจะยังแสดงอยู่ และสามารถลองอีกครั้งด้วยการตั้งค่าเดิมได้
- **2026-09-14 — เพิ่มประสิทธิภาพโครงการขนาดใหญ่:** การนำเข้าโครงการลดงานบนเธรดหลัก พร้อมแคชผลคำนวณเลนเสียง การแสดงรูปคลื่นที่เบาลง และลดการเลื่อนตำแหน่งเสียงที่ไม่จำเป็น ช่วยลดภาระขณะลากหัวอ่านและเล่นวิดีโอ โดยคงสื่อทั้งหมด จังหวะเวลาของคลิป เครื่องมือแก้ไข เอฟเฟกต์ และการส่งออกไว้เหมือนเดิม ระหว่างนำเข้าจะแสดงความคืบหน้าจริง และเปิดให้แก้ไขทันทีที่กู้คืนสื่อเสร็จ โดยภาพขนาดย่อจะได้รับการปรับปรุงต่อในเบื้องหลัง
- **12 กันยายน 2026 — ป้าย Best AI Tool:** หน้าจอเลือกภาษาเมื่อเข้าใช้ครั้งแรกแสดงป้าย Best AI Tool ข้างแบรนด์ Timeline Studio โดยปรับการจัดวางให้เหมาะกับคอมพิวเตอร์และมือถือ และเปิดเว็บไซต์ภายนอกในแท็บใหม่เมื่อคลิกป้าย
- **11 กันยายน 2026 — ตัดต่อและส่งออกวิดีโอด้วย WebMCP:** เครื่องมือในเบราว์เซอร์เพิ่มเป็น 15 รายการ รองรับการตรวจสอบก่อนใช้การแก้ไขคำบรรยาย ระดับเสียงและเฟด มาร์กเกอร์ การแบ่ง/ลบ/ทำสำเนาคลิปหลัก การค้นหาและแทรกสื่อที่มีอยู่ และภาพซ้อนภาพ เอเจนต์สามารถเตรียมค่าการส่งออก เริ่มตัวส่งออกจริงของโปรแกรม ตรวจสอบความคืบหน้าและข้อมูลไฟล์ผลลัพธ์ หรือยกเลิกงาน การแก้ไขหลายรายการยังคงตรวจสอบความขัดแย้ง รักษาการเลื่อนคลิปตามการตัดต่อ การล็อกแทร็ก และการเลิกทำ การลองส่งออกซ้ำไม่ทำให้ดาวน์โหลดซ้ำ ข้อความเครื่องมือและหน้าตรวจสอบรองรับภาษาของอินเทอร์เฟซทั้ง 13 ภาษา

ดูงานที่วางแผนไว้ใน [Roadmap](ROADMAP.md) การเปลี่ยนแปลงที่เผยแพร่แล้วใน [Releases](https://github.com/MartinDelophy/ai-video-editor/releases) และงานหรือข้อผิดพลาดใน [Issues](https://github.com/MartinDelophy/ai-video-editor/issues)

## สร้างอะไรได้บ้าง?

สำรวจตัวอย่างก่อน–หลังที่ทำซ้ำได้และสูตรการตัดต่อ:

→ [AI Video Editing Skills Handbook](https://github.com/MartinDelophy/timeline-studio-handbook)

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

เพิ่ม `--pin v1.0.8` เพื่อติดตั้งรุ่นที่ผ่านการตรวจสอบแทนการติดตามรีลีสล่าสุด และตรวจสอบเนื้อหาก่อนติดตั้งได้ด้วย `gh skill preview MartinDelophy/ai-video-editor edit-timeline-studio`

## แผนพัฒนา

- **ขณะนี้:** เพิ่มความเสถียรของการส่งออกออฟไลน์แบบกำหนดผลลัพธ์ได้ ปรับปรุงความน่าเชื่อถือของไทม์ไลน์ และเพิ่มการทดสอบแบบ end-to-end ในเบราว์เซอร์
- **ขั้นถัดไป:** ขยายความสามารถเรนเดอร์แบบ headless ให้ตรงกับเบราว์เซอร์ เพิ่มคำสั่ง WebMCP ที่ตรวจสอบได้ และปรับปรุงการแชร์เทมเพลตโปรเจกต์
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

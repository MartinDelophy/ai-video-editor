# Timeline Studio — 브라우저 AI 동영상 편집기

[English](README.md) | [中文](README.zh-CN.md) | [日本語](README.ja.md) | **한국어** | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [ไทย](README.th.md) | [Tiếng Việt](README.vi.md) | [Русский](README.ru.md)

[![skills.sh](https://skills.sh/b/MartinDelophy/ai-video-editor)](https://skills.sh/MartinDelophy/ai-video-editor)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md) [![LINUX DO](https://shorturl.at/ggSqS)](https://linux.do)

## 딥 신세시스 기술의 책임 있는 사용

이 도구는 딥 신세시스 기술을 기반으로 하며 기술 연구와 학습 목적으로만 제공됩니다.

사용자는 다음 사항을 반드시 준수해야 합니다.

- 본인 또는 적법한 사용 허가를 받은 사람의 얼굴 이미지나 동영상만 사용할 것
- 불법적이거나 권리를 침해하거나 허위 또는 오해를 유발하는 콘텐츠를 제작하거나 배포하지 않을 것
- 생성된 콘텐츠를 실제 영상으로 가장하지 않고, 당사자의 동의 없이 다른 사람의 신원을 도용하지 않을 것

위 요구 사항을 위반하여 발생하는 모든 법적 책임은 사용자 본인에게 있습니다.

## 프로젝트 업데이트

- **2026년 9월 3일 — 이탈리아어 및 인도네시아어 인터페이스:** Timeline Studio가 13개 인터페이스 언어를 지원합니다. 두 언어의 전체 편집기 사전과 런타임 메시지를 추가하고 자막, 타임라인, Smart Frame, AI 음악, 벡터 디자인 및 생성 플러그인 용어를 검수했으며 해당 글꼴과 Whisper 자막 인식도 지원합니다.
- **2026년 9월 1일 — 동기화를 지키는 빠른 비디오 준비:** 로컬 및 온라인 가져오기는 120~240개 썸네일 대신 기기 성능에 맞춘 소수의 실제 PTS 시드 프레임만 기다리므로 한 포스터를 늘리지 않고 훨씬 빨리 편집할 수 있습니다. 이후 정확한 프레임은 현재 뷰포트를 먼저 채우고 화면 밖 셀을 중점 분할 순서로 보완합니다. 썸네일은 항상 목표 소스 시간 이전의 마지막 프레임을 사용하고, 재생 헤드는 실시간 미리보기 프레임을 따르며 스크러빙 중에는 백그라운드 커밋을 멈춥니다.
- **2026년 8월 29일 — 로컬 생성 커넥터:** ComfyUI와 Stable Diffusion WebUI/Forge를 별도 플러그인으로 추가했습니다. ComfyUI는 루프백 API Format 워크플로를 실행해 이미지·비디오 출력을 가져오고 WebUI는 실제 txt2img/img2img API를 사용합니다. 결과는 My assets에 자동 저장되며 일반 Hugging Face Spaces 임베드는 제거했습니다.
- **2026년 8월 28일 — 브라우저 로컬 스마트 노이즈 제거:** 화면 → AI 복구에 DRUNet 프레임 비교, 4단계 강도, 원본 오디오 유지와 되돌릴 수 있는 적용을 추가했습니다. 전체 클립은 원본 프레임률의 WebCodecs 스트림으로 처리되며 다음 프레임 디코딩과 현재 추론을 겹치고 WebGPU Session, 캔버스, 텐서, 픽셀 버퍼를 계속 재사용합니다. 변화가 적은 인접 프레임은 노이즈 제거 잔차를 보수적으로 재사용하고 PNG/FFmpeg 호환 경로도 유지합니다. 데스크톱과 모바일의 11개 언어에서 사용할 수 있습니다.
- **2026년 8월 28일 — 고품질 비디오 타임라인 준비:** 새 비디오는 메타데이터와 실제 PTS 썸네일을 해석하는 동안 명확한 로딩 상태를 유지해 한 프레임이 크게 늘어나는 임시 표시를 막습니다. 180px 고해상도 원본 프레임, 확대 수준에 맞는 가독성 높은 밀도, 재생 헤드 아래의 정확한 원본 시간 매핑, 검은 여백 없는 세로 영상 중앙 채움 자르기를 적용했습니다.

계획된 작업은 [Roadmap](ROADMAP.md), 출시된 변경 사항은 [Releases](https://github.com/MartinDelophy/ai-video-editor/releases), 개별 작업과 버그는 [Issues](https://github.com/MartinDelophy/ai-video-editor/issues)에서 확인하세요.

## 무엇을 만들 수 있나요?

재현 가능한 전후 비교 예시와 편집 레시피를 살펴보세요:

→ [AI Video Editing Skills Handbook](https://github.com/MartinDelophy/timeline-studio-handbook)

<p align="center">
  <a href="https://trendshift.io/repositories/77422?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-77422" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/77422/daily?language=JavaScript" alt="MartinDelophy%2Fai-video-editor | Trendshift" width="250" height="55"/></a>
  <a href="https://trendshift.io/repositories/77422?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-77422" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/77422/weekly?language=JavaScript" alt="MartinDelophy%2Fai-video-editor | Trendshift" width="250" height="55"/></a>
</p>

Timeline Studio는 브라우저에서 실행되는 로컬 우선 AI 동영상 편집기입니다. CapCut 스타일의 멀티트랙 타임라인에 AI 음성, 자동 자막, 비전 도구, 말하는 아바타, 결정적 오프라인 내보내기를 결합합니다.

[편집기 열기](https://video-editor.ai-creator.top/) · [데모 보기](https://www.youtube.com/watch?v=chdRPG2ndMs) · [Hugging Face Space](https://huggingface.co/spaces/haixin/timeline-studio)

![Timeline Studio 편집기](docs/screenshots/editor-timeline.png)

## 주요 기능

- Piper/VITS ONNX와 Kokoro 82M을 이용한 다국어 음성.
- Stable Audio 3 Small Q4 ONNX와 WebGPU를 이용한 로컬 AI 음악 생성. 자유 형식 프롬프트 번역, 30/60/90/120초 옵션, 파형 기반 장시간 루프, 영구 모델 캐시, 내 에셋 자동 추가를 지원합니다.
- Whisper small q8 ONNX 자동 자막.
- YOLOS tiny와 MODNet 스마트 프레이밍.
- 보컬 분리 및 JoyVASA/LivePortrait 아바타 생성.
- 오버레이, 마스크, 필터, 애니메이션, 키프레임을 지원하는 멀티트랙 편집.
- WebCodecs와 오디오 믹싱을 이용한 브라우저 MP4/WebM 내보내기.
- 설치형 PWA, 로컬 모델 캐시, `.timeline` 프로젝트.

## AI 음성 데모

https://github.com/user-attachments/assets/304a744e-d620-4380-9c17-19af3726f5a4

## Agent Skill

이 저장소에는 편집 가능한 동영상 타임라인을 계획하고 조작하며 검증하는 [`edit-timeline-studio`](skills/edit-timeline-studio/SKILL.md) Agent Skill이 포함되어 있습니다. GitHub CLI 2.90.0 이상에서 설치할 수 있습니다.

[skills.sh](https://skills.sh/MartinDelophy/ai-video-editor)를 통한 설치에는 Node.js 22.20.0 이상이 필요합니다.

```bash
npx skills add MartinDelophy/ai-video-editor --skill edit-timeline-studio
```

```bash
# Claude Code
gh skill install MartinDelophy/ai-video-editor edit-timeline-studio --agent claude-code --scope user

# Codex
gh skill install MartinDelophy/ai-video-editor edit-timeline-studio --agent codex --scope user
```

검증된 릴리스로 고정하려면 `--pin v1.0.0`을 추가하세요. 설치 전에 `gh skill preview MartinDelophy/ai-video-editor edit-timeline-studio`로 내용을 확인할 수 있습니다.

## 로드맵

- **현재:** 결정적 오프라인 내보내기 안정화, 타임라인 편집 신뢰성 향상, 브라우저 E2E 테스트 확대.
- **다음:** 에이전트 기반 편집을 위한 버전 관리형 헤드리스 명령 실행기와 공유하기 쉬운 재사용 프로젝트 템플릿.
- **향후:** 협업 검토 흐름, 플러그인 확장 인터페이스, 로컬에서 검증된 AI 모델 추가.

우선순위는 [GitHub Discussions](https://github.com/MartinDelophy/ai-video-editor/discussions)에서 함께 정합니다.

## 도움을 기다립니다

브라우저 미디어, WebCodecs, WebGPU/ONNX, 타임라인 UX, 현지화, 테스트 및 문서화 기여를 환영합니다. 재현 가능한 버그는 [Issues](https://github.com/MartinDelophy/ai-video-editor/issues)에, 아이디어와 작품은 [Discussions](https://github.com/MartinDelophy/ai-video-editor/discussions)에 공유해 주세요. 작은 수정, 테스트, 번역, 예제도 큰 도움이 됩니다.

## 빠른 시작

Node.js 20+와 최신 Chromium 브라우저가 필요합니다. WebGPU를 권장합니다.

```bash
git clone https://github.com/MartinDelophy/ai-video-editor.git
cd ai-video-editor
npm install
npm run dev
```

## 검증

```bash
npm run build
npm run check
```

## 지원 및 피드백

이 프로젝트가 도움이 되었다면 ⭐ Star를 눌러 주세요. 문제가 발생하면 [Issue를 등록해 주세요](https://github.com/MartinDelophy/ai-video-editor/issues).

질문과 피드백을 공유하고 다른 사용자 및 기여자와 소통하려면 [Discord 커뮤니티](https://discord.gg/uq2uvUTBr)에 참여해 주세요.

## 라이선스

[MIT](LICENSE)

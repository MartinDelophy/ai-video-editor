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

- **2026-09-20 — 재생 헤드 마커 스냅:** 흰색 재생 헤드를 드래그하면 화면이 실시간으로 미리보기되고 마커와 범위 경계에 맞춰집니다. 공통 정렬선과 시간이 표시되며 Alt를 누르면 자유롭게 이동합니다. 마커 상세는 수정 전에는 완료, 수정 후에는 변경 사항 적용을 표시합니다.
- **2026-09-17 — WebMCP 정밀 편집과 검토:** 브라우저 도구 21개로 시간 지정 클립 이동과 원본 범위 트리밍, 오버레이 변환, 자막 스타일·위치, 프로젝트 화면 비율을 포함한 26가지 편집을 검토 후 적용할 수 있습니다. 실제 렌더링한 프레임과 짧은 오디오 믹스를 확인하고, 진행률과 취소를 지원하는 브라우저 로컬 음성 생성·받아쓰기를 실행한 뒤 타임라인 삽입 전에 결과를 검토할 수 있습니다. 새 제어와 문구는 13개 언어를 지원합니다.
- **2026-09-15 — 편집한 오디오 내보내기:** 오디오 클립을 내보낼 때 잘라낸 범위에 재생 속도, 음량, 페이드와 공간 효과를 적용합니다. 개별 클립과 전체 타임라인 믹스를 WAV 또는 MP3로 내보낼 수 있으며, 동영상 내보내기와 함께 오디오만 내보내는 옵션도 제공합니다.
- **2026-09-14 — 내보내기 오류 수정 및 재시도:** 인물 마스크가 없어도 단색 배경과 불투명도 키프레임을 적용한 클립을 정상적으로 내보낼 수 있습니다. 내보내기에 실패하면 오류 메시지가 유지되며 같은 설정으로 다시 시도할 수 있습니다.
- **2026-09-14 — 대규모 프로젝트 성능 개선:** 프로젝트를 불러올 때 메인 스레드의 작업을 줄이고, 오디오 레인 계산 캐시와 가벼운 파형 렌더링, 불필요한 오디오 탐색 제거로 재생 헤드 드래그와 재생 부담을 낮췄습니다. 모든 미디어, 클립 타이밍, 편집 기능, 효과와 내보내기 동작은 유지됩니다. 가져오기 중에는 실제 진행률을 표시하고 미디어 복원이 끝나면 편집할 수 있습니다. 썸네일은 백그라운드에서 계속 정밀하게 보완됩니다.

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

검증된 릴리스로 고정하려면 `--pin v1.0.8`을 추가하세요. 설치 전에 `gh skill preview MartinDelophy/ai-video-editor edit-timeline-studio`로 내용을 확인할 수 있습니다.

## 로드맵

- **현재:** 결정적 오프라인 내보내기 안정화, 타임라인 편집 신뢰성 향상, 브라우저 E2E 테스트 확대.
- **다음:** 헤드리스 렌더링과 브라우저 출력의 기능 일치를 확대하고, 검토 가능한 WebMCP 편집 명령과 재사용 프로젝트 템플릿 공유를 개선합니다.
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

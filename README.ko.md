# Timeline Studio — 브라우저 AI 동영상 편집기

[English](README.md) | [中文](README.zh-CN.md) | [日本語](README.ja.md) | **한국어** | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [ไทย](README.th.md) | [Tiếng Việt](README.vi.md) | [Русский](README.ru.md)

[![skills.sh](https://skills.sh/b/MartinDelophy/ai-video-editor)](https://skills.sh/MartinDelophy/ai-video-editor)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md) [![LINUX DO](https://shorturl.at/ggSqS)](https://linux.do)

## Anna에서 확장되는 영상 제작

Anna 버전에서 AI 편집 지원과 프로젝트 이어 작업을 경험하세요.

- Anna에게 편집 요구를 설명하고 요구 사항과 미디어 메타데이터를 바탕으로 만든 계획을 검토한 뒤, 지원되는 클립 정렬과 간단한 1× 영상 트리밍을 적용하세요.
- 프로젝트와 미디어는 Anna 클라우드에 자동 저장되며, 같은 계정으로 다른 브라우저에서도 작업을 이어갈 수 있습니다. 로컬 프로젝트 체크포인트도 저장할 수 있습니다.
- 편집 가능한 다중 트랙 타임라인에서 다듬고 AI 음성과 수동 자막을 추가한 뒤, 브라우저에서 사용 가능한 인코더로 MP4를 내보내세요.

현재 데스크톱 미리보기 버전입니다. 계획 단계는 영상 프레임이나 오디오를 분석하지 않으며, 로컬 AI 기능은 Anna 컨테이너의 지원 여부에 따라 달라집니다.

→ [Anna에서 Timeline Studio 체험](https://anna.partners/store/@martindelophy/timeline-studio)

## 딥 신세시스 기술의 책임 있는 사용

이 도구는 딥 신세시스 기술을 기반으로 하며 기술 연구와 학습 목적으로만 제공됩니다.

사용자는 다음 사항을 반드시 준수해야 합니다.

- 본인 또는 적법한 사용 허가를 받은 사람의 얼굴 이미지나 동영상만 사용할 것
- 불법적이거나 권리를 침해하거나 허위 또는 오해를 유발하는 콘텐츠를 제작하거나 배포하지 않을 것
- 생성된 콘텐츠를 실제 영상으로 가장하지 않고, 당사자의 동의 없이 다른 사람의 신원을 도용하지 않을 것

위 요구 사항을 위반하여 발생하는 모든 법적 책임은 사용자 본인에게 있습니다.

## 프로젝트 업데이트

- **2026-10-10** — `/nebius` 대회 미리보기: 서버 Token Factory의 NVIDIA Nemotron 연결, 메타데이터만 전송하고 편집을 검토합니다. 실제 추론에는 API 키와 무료 크레딧이 필요합니다.
- **2026-10-07** — 영상 클립의 최소 길이를 0.05초로 조정하여 0.45초 같은 짧은 도입부에서 자르기가 거부되는 문제를 수정했습니다. 트리밍, 속도 변경, 프로젝트 복원에도 같은 하한을 적용합니다. 큰 미리보기의 열기와 닫기에서 영상이 멈추는 문제를 수정했습니다. 새 비디오 요소에 원본 시간, 재생 상태, 프레임 콜백을 복원합니다.
- **2026-10-05** — 깊이 샘플링을 빠름 8, 표준 16, 정밀 24장/초로 변경했습니다. 빠름과 표준은 RIFE로 24fps를 생성하며 제한된 파이프라인에서 샘플링과 인코딩을 함께 진행합니다. 원본 소리를 유지하고 생성 실패 후 완료된 분석을 재사용합니다. 고정 샘플링 시계와 RIFE 세션·픽셀·텐서 재사용으로 정밀도, 해상도, 샘플 수를 낮추지 않고 불필요한 보간을 줄였습니다. RIFE는 자체 Hugging Face·ModelScope 고정 버전 미러에서 다운로드하며 해시 검증, 자동 전환 및 공유 캐시를 지원합니다.
- **2026-10-04** — 깊이 맵 — 영상을 회색조 깊이로 변환합니다. 가까우면 밝고 멀면 어둡습니다. 깊이 분석은 프레임 디코딩과 추론을 겹쳐 실행하고 PNG 인코딩을 Worker로 옮기며 UI 업데이트 빈도를 제한합니다. 깊이 맵 미리보기와 내보내기에 프레임 보간을 추가하고 자르기·속도 변경의 원본 시간을 수정하며 디코딩한 이미지를 재사용합니다. 깊이 맵 영상을 내 에셋에 저장했습니다. 생성한 깊이 영상은 원본 클립을 교체하고 에셋은 유지합니다. 화면 시퀀스로 재생 시간을 계산해 삭제 후 다시 삽입할 때 0초로 표시되는 문제를 수정했습니다. 깊이 영상에도 자르기와 속도에 맞춘 원본 소리를 포함하며 원본 영상과 소리도 유지합니다. 깊이 기반 조명 편집, 구형 조명 위치, 길게 눌러 원본 비교 및 타임라인 드래그 후 미리보기 갱신을 추가했습니다.
- **2026-10-04** — 메인 영상과 화면 속 화면 동영상에서 오디오를 분리하지 않고 클립별 음량과 공간 효과를 설정할 수 있습니다. 설정은 프로젝트에 저장되며 미리보기와 내보내기에 적용됩니다. 데스크톱 영상 속성의 중복 오디오 탭을 제거하고 기존 오디오 컨트롤을 사용합니다.
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

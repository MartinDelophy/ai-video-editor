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

- **2026-10-25** — Anna 스마트 패널에 공식 클라우드 음악 생성을 추가했습니다. 모델별 가사·길이·형식, 중복 제출 없는 작업 복구, 미리 듣기와 내 에셋 저장을 지원합니다.
- **2026-10-20** — Anna 동영상 설정을 하나의 스크롤 영역으로 통합하고 내용이 넘치면 드래그 가능한 얇은 막대를 표시합니다. Anna 생성 영상은 저장 후 기존 미리보기로 열리며 닫아도 편집 화면을 유지합니다. 스토리보드 우클릭 메뉴에서 미리보기, 다운로드, 후속 노드 생성, 삭제 및 화면 맞춤을 지원합니다. 무한 캔버스도 같은 메뉴를 사용하며 빈 영역에서 실행 취소와 다시 실행을 지원합니다. 트랙패드 제스처는 시작 대상을 유지하며 프레임마다 화면을 갱신하고 제스처가 끝나면 저장합니다.
- **2026-10-19** — 무한 캔버스와 스토리보드에서 노드·연결·설명·미디어를 포함한 프로젝트 다운로드, 가져오기 및 Anna 클라우드 백업·사본 복원을 지원합니다. 두 화면의 트랙패드 처리도 통합했습니다. AI 워터마크 제거 비교 미리보기가 끝난 뒤 다시 재생되지 않던 문제를 수정했습니다.
- **2026-10-18** — 재생과 동기화되는 캐릭터 동작·카메라 트랙과 시간 편집 및 클릭 이동을 지원하는 대본 캐러셀을 추가했습니다. 화이트박스 대화가 ChatCut을 재사용하며 대화 기록, 초안 복구, 객체 참조 및 변경 확인을 통일했습니다. 스토리보드 기본 모델을 GPT Image 2(fal)로 변경했습니다. 대화 모델 라우팅과 긴 이야기 문맥 유지를 수정하고 실제 모델 전환 응답을 확인했습니다. 시작·종료 프레임 영상은 Anna API 확장을 기다립니다. 제안 계약: docs/storyboard-anna-video-contract.md. 워크플로 로딩 오류를 편집기와 격리하고 재시도·돌아가기 및 Anna 초안 업데이트 간 리소스 호환성을 지원합니다. 무한 캔버스 출력에 방향 연결선, 호환 입력 강조 및 다음 노드를 만들고 연결하는 메뉴를 추가했습니다. 한 번에 실행 취소할 수 있습니다. 캔버스 채팅에서 @로 노드를 검색하고 참조할 수 있으며, 참조 태그를 제거할 수 있고 요청에는 노드 ID가 전달됩니다.
- **2026-10-17** — 유형별 노드와 연결, 검토 후 적용하는 Anna 편집, 실제 생성 커넥터, 음성 및 로컬 음악, 결과 버전, 영상 작업 재조회, 계정·프로젝트별 브라우저 복구를 갖춘 무한 캔버스를 추가했습니다. 생성 미디어는 내 에셋에 저장되며 명시적인 실행 시에만 생성됩니다. 내장 참고 이미지 두 장은 생성 요청에만 첨부되며 자료 목록, @ 후보 및 캔버스에 표시되지 않습니다.

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

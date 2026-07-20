# Timeline Studio — Editor de vídeo com IA no navegador

[English](README.md) | [中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | **Português** | [ไทย](README.th.md) | [Tiếng Việt](README.vi.md) | [Русский](README.ru.md)

O Timeline Studio é um editor de vídeo com IA, local e executado no navegador. Ele combina uma linha do tempo multifaixa no estilo CapCut com narração por IA, legendas automáticas, visão computacional, avatares falantes e exportação offline determinística.

[Abrir o editor](https://video-editor.ai-creator.top/) · [Ver a demonstração](https://youtu.be/mUXduGpBmwE) · [Hugging Face Space](https://huggingface.co/spaces/haixin/timeline-studio)

![Editor Timeline Studio](docs/screenshots/editor-timeline.png)

## Principais recursos

- Narração multilíngue com Piper/VITS ONNX e Kokoro 82M.
- Legendas automáticas com Whisper small q8 ONNX.
- Enquadramento inteligente com YOLOS tiny e MODNet.
- Separação de voz e música e avatares com JoyVASA e LivePortrait.
- Edição multifaixa com sobreposições, máscaras, filtros, animações e quadros-chave.
- Exportação MP4/WebM no navegador com WebCodecs e mixagem de áudio.
- PWA instalável, cache local de modelos e projetos `.timeline`.

## Início rápido

Requer Node.js 20+ e um navegador Chromium moderno. WebGPU é recomendado.

```bash
git clone https://github.com/MartinDelophy/ai-video-editor.git
cd ai-video-editor
npm install
npm run dev
```

## Validação

```bash
npm test
npm run build
npm run check
```

## Licença

[MIT](LICENSE)


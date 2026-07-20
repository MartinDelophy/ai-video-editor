# Timeline Studio — Editor de vídeo com IA no navegador

[English](README.md) | [中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | **Português** | [ไทย](README.th.md) | [Tiếng Việt](README.vi.md) | [Русский](README.ru.md)

O Timeline Studio é um editor de vídeo com IA, local e executado no navegador. Ele combina uma linha do tempo multifaixa no estilo CapCut com narração por IA, legendas automáticas, visão computacional, avatares falantes e exportação offline determinística.

[Abrir o editor](https://video-editor.ai-creator.top/) · [Ver a demonstração](https://www.youtube.com/watch?v=chdRPG2ndMs) · [Hugging Face Space](https://huggingface.co/spaces/haixin/timeline-studio)

![Editor Timeline Studio](docs/screenshots/editor-timeline.png)

## Principais recursos

- Narração multilíngue com Piper/VITS ONNX e Kokoro 82M.
- Legendas automáticas com Whisper small q8 ONNX.
- Enquadramento inteligente com YOLOS tiny e MODNet.
- Separação de voz e música e avatares com JoyVASA e LivePortrait.
- Edição multifaixa com sobreposições, máscaras, filtros, animações e quadros-chave.
- Exportação MP4/WebM no navegador com WebCodecs e mixagem de áudio.
- PWA instalável, cache local de modelos e projetos `.timeline`.

## Roteiro

- **Agora:** fortalecer a exportação offline determinística, melhorar a confiabilidade da linha do tempo e ampliar os testes de ponta a ponta no navegador.
- **Em seguida:** lançar o executor de comandos headless versionado para edição por agentes e facilitar o compartilhamento de modelos de projeto reutilizáveis.
- **Mais adiante:** adicionar revisão colaborativa, uma interface de extensões e mais modelos de IA verificados localmente.

As prioridades são definidas em [GitHub Discussions](https://github.com/MartinDelophy/ai-video-editor/discussions).

## Procuramos ajuda

Contribuições sobre mídia no navegador, WebCodecs, WebGPU/ONNX, UX da linha do tempo, localização, testes e documentação são bem-vindas. Relate bugs reproduzíveis em [Issues](https://github.com/MartinDelophy/ai-video-editor/issues), compartilhe ideias em [Discussions](https://github.com/MartinDelophy/ai-video-editor/discussions) ou envie correções, testes, traduções e exemplos objetivos.

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

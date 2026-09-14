# Timeline Studio — Editor de vídeo com IA no navegador

[English](README.md) | [中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | **Português** | [ไทย](README.th.md) | [Tiếng Việt](README.vi.md) | [Русский](README.ru.md)

[![skills.sh](https://skills.sh/b/MartinDelophy/ai-video-editor)](https://skills.sh/MartinDelophy/ai-video-editor)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md) [![LINUX DO](https://shorturl.at/ggSqS)](https://linux.do)

## Uso responsável de síntese profunda

Esta ferramenta utiliza tecnologia de síntese profunda e destina-se exclusivamente à pesquisa técnica e ao aprendizado.

Os usuários devem garantir que:

- utilizem somente imagens ou vídeos do próprio rosto ou de pessoas que tenham concedido autorização legal;
- não criem nem divulguem conteúdo ilegal, infrator, falso ou enganoso;
- não apresentem conteúdo gerado como imagens reais nem se façam passar por outra pessoa sem o consentimento dela.

O usuário é o único responsável por quaisquer consequências legais decorrentes da violação destes requisitos.

## Novidades do projeto

- **2026-09-14 — Correção da exportação e novas tentativas:** clipes com fundos de cor sólida e quadros-chave de opacidade agora são exportados corretamente mesmo sem máscara de pessoa. Se a exportação falhar, a mensagem de erro permanece visível e é possível tentar novamente com as mesmas configurações.
- **2026-09-14 — Desempenho em projetos grandes:** a importação reduz o trabalho da thread principal. O cache dos cálculos de faixas de áudio, a renderização mais leve das formas de onda e menos reposicionamentos de áudio reduzem a carga ao arrastar o indicador de reprodução e reproduzir. Mídias, tempos dos clipes, controles de edição, efeitos e exportação são preservados. A importação mostra o progresso real e libera a edição assim que as mídias são restauradas; as miniaturas continuam sendo aprimoradas em segundo plano.
- **12 de setembro de 2026 — Selo Best AI Tool:** a tela de seleção de idioma no primeiro acesso exibe o selo Best AI Tool ao lado da marca Timeline Studio. O layout se adapta a computadores e celulares, e o selo abre o site externo em uma nova aba.
- **11 de setembro de 2026 — Edição e exportação com WebMCP:** as 15 ferramentas do navegador permitem revisar alterações em legendas, volume e fades, marcadores, divisão/exclusão/duplicação de clipes principais, busca e inserção de mídias existentes e imagem sobre imagem. Agentes podem preparar a exportação, iniciar o exportador real do editor, acompanhar o progresso e os dados do arquivo gerado ou cancelar. Operações combinadas preservam verificações de conflitos, edição com deslocamento, bloqueios de faixas e Desfazer; novas tentativas não duplicam downloads. Ferramentas e revisão estão traduzidas para os 13 idiomas da interface.
- **10 de setembro de 2026 — WebMCP no editor aberto:** navegadores compatíveis permitem que agentes consultem o projeto com ferramentas estruturadas, posicionem a prévia e revisem planos de reordenação e corte antes de aplicá-los. O adaptador reutiliza o mecanismo de comandos compartilhado, detecta alterações simultâneas e preserva Desfazer. Inclui recursos de descoberta e documentação; a URL raiz continua abrindo diretamente o editor.

Consulte o [Roadmap](ROADMAP.md) para o trabalho planejado, [Releases](https://github.com/MartinDelophy/ai-video-editor/releases) para mudanças publicadas e [Issues](https://github.com/MartinDelophy/ai-video-editor/issues) para tarefas e erros.

## O que ele pode produzir?

Explore exemplos reproduzíveis de antes e depois e receitas de edição:

→ [AI Video Editing Skills Handbook](https://github.com/MartinDelophy/timeline-studio-handbook)

<p align="center">
  <a href="https://trendshift.io/repositories/77422?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-77422" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/77422/daily?language=JavaScript" alt="MartinDelophy%2Fai-video-editor | Trendshift" width="250" height="55"/></a>
  <a href="https://trendshift.io/repositories/77422?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-77422" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/77422/weekly?language=JavaScript" alt="MartinDelophy%2Fai-video-editor | Trendshift" width="250" height="55"/></a>
</p>

O Timeline Studio é um editor de vídeo com IA, local e executado no navegador. Ele combina uma linha do tempo multifaixa no estilo CapCut com narração por IA, legendas automáticas, visão computacional, avatares falantes e exportação offline determinística.

[Abrir o editor](https://video-editor.ai-creator.top/) · [Ver a demonstração](https://www.youtube.com/watch?v=chdRPG2ndMs) · [Hugging Face Space](https://huggingface.co/spaces/haixin/timeline-studio)

![Editor Timeline Studio](docs/screenshots/editor-timeline.png)

## Principais recursos

- Narração multilíngue com Piper/VITS ONNX e Kokoro 82M.
- Música local por IA com Stable Audio 3 Small Q4 ONNX via WebGPU, tradução de prompts livres, opções de 30/60/90/120 segundos, loops longos orientados pela forma de onda, cache persistente do modelo e inclusão automática em Meus recursos.
- Legendas automáticas com Whisper small q8 ONNX.
- Enquadramento inteligente com YOLOS tiny e MODNet.
- Separação de voz e música e avatares com JoyVASA e LivePortrait.
- Edição multifaixa com sobreposições, máscaras, filtros, animações e quadros-chave.
- Exportação MP4/WebM no navegador com WebCodecs e mixagem de áudio.
- PWA instalável, cache local de modelos e projetos `.timeline`.

## Demonstração de voz por IA

https://github.com/user-attachments/assets/304a744e-d620-4380-9c17-19af3726f5a4

## Agent Skill

Este repositório inclui o Agent Skill [`edit-timeline-studio`](skills/edit-timeline-studio/SKILL.md) para planejar, executar e verificar linhas do tempo de vídeo editáveis. A instalação requer o GitHub CLI 2.90.0 ou posterior.

A instalação pelo [skills.sh](https://skills.sh/MartinDelophy/ai-video-editor) requer Node.js 22.20.0 ou posterior.

```bash
npx skills add MartinDelophy/ai-video-editor --skill edit-timeline-studio
```

```bash
# Claude Code
gh skill install MartinDelophy/ai-video-editor edit-timeline-studio --agent claude-code --scope user

# Codex
gh skill install MartinDelophy/ai-video-editor edit-timeline-studio --agent codex --scope user
```

Adicione `--pin v1.0.8` para instalar a versão verificada em vez de acompanhar a release mais recente. Antes de instalar, você pode conferir o conteúdo com `gh skill preview MartinDelophy/ai-video-editor edit-timeline-studio`.

## Roteiro

- **Agora:** fortalecer a exportação offline determinística, melhorar a confiabilidade da linha do tempo e ampliar os testes de ponta a ponta no navegador.
- **Em seguida:** ampliar a paridade da renderização headless, os comandos WebMCP que podem ser revisados e o compartilhamento de modelos de projeto.
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
npm run build
npm run check
```

## Apoio e feedback

Se este projeto for útil para você, considere dar uma ⭐ Star. Se encontrar algum problema, [abra uma Issue](https://github.com/MartinDelophy/ai-video-editor/issues).

Participe da nossa [comunidade no Discord](https://discord.gg/uq2uvUTBr) para tirar dúvidas, compartilhar feedback e conversar com outros usuários e colaboradores.

## Licença

[MIT](LICENSE)

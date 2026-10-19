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

- **2026-10-18** — Adicionadas faixas sincronizadas de ações e câmera e um carrossel de roteiro editável que acompanha a reprodução. O diálogo 3D reutiliza ChatCut com histórico, recuperação de rascunhos, referências a objetos e revisão de alterações. O storyboard usa GPT Image 2 (fal) por padrão. Corrigidos o roteamento dos modelos de conversa e a retenção de contexto, com respostas reais verificadas após a troca de modelo. Vídeos com quadros inicial e final aguardam uma extensão da Anna: docs/storyboard-anna-video-contract.md. Falhas de carregamento ficam isoladas do editor, com nova tentativa, retorno e compatibilidade entre atualizações Anna. O canvas infinito adiciona conexões direcionais, destaque de entradas compatíveis e um menu que cria e conecta o próximo nó em uma única edição reversível. O chat permite pesquisar e referenciar nós com @, etiquetas removíveis e IDs explícitos.
- **2026-10-17** — Adicionada a Tela infinita com nós tipados, alterações Anna revisáveis, conectores reais, narração e música local, versões dos resultados, retomada de tarefas de vídeo e recuperação no navegador por conta e projeto. Os resultados vão para Meus recursos e só são gerados por ação explícita. As duas imagens-guia internas são anexadas somente à geração, sem aparecer em mídias, sugestões @ ou nós.
- **2026-10-17** — Processamento local de áudio com RNNoise, DeepFilterNet3, equalização, compressão, ganho e limitador; prévia, aplicação e restauração do original. Melhorias no painel de áudio original, alinhamento e destaque de legendas, fontes multilíngues, edição vinculada e reprodução entre clipes. Anna adiciona narração na nuvem baseada no catálogo, salva em Meus recursos, e ditado no ChatCut com permissões do aplicativo e do microfone. As vozes Anna compartilham o seletor e a síntese existentes, com três avatares virtuais gerados. As legendas automáticas Anna e a transcrição ChatCut compartilham Anna STT e mantêm os vínculos de áudio e imagem. ChatCut integra estilos de legenda, movimentos vinculados, adesivos, áudio espacial e processamento local; a narração Anna usa o TTS preferido. Cada legenda permite destacar texto selecionado, escolher a cor e limpar o destaque. Os cartões Anna reproduzem as amostras oficiais correspondentes; ações de legendas duplicadas foram removidas. Anna adiciona um assistente de voz para consultar recursos, abrir painéis e editar com ChatCut, com silêncio, interrupção e confirmação de geração. As legendas processam todos os clipes por padrão, com seleção individual opcional. Atenuação automática para áudio original, voz e música, desativada por padrão, com Silero local e a mesma curva na prévia e exportação. As chamadas Anna usam uma forma de onda na barra superior com silêncio, interrupção e encerramento, sem painel sobreposto. Os cortes mantêm o último quadro decodificado até apresentar o próximo, evitando flashes vazios. A atenuação mostra as etapas de carregamento e sua curva de volume na linha do tempo. Melhoria de voz com três intensidades, comparação e restauração do original. A atenuação reutiliza o modelo carregado e mostra o progresso desde 0%. Saudações e comandos precisos respondem localmente; edições complexas mantêm a validação. Os fluxos incluem um protótipo 3D editável com transformações, planos, reprodução, desfazer e alterações Anna revisadas; vozes serão adicionadas depois. Adicionado storyboard com ChatCut, referências @, tela de nós inicialmente vazia, preferências de modelo e recuperação por conta e projeto. Os 16 quadros formam uma única imagem; vídeo com quadro final aguarda suporte da API Anna.
- **2026-10-12** — A reprodução de vídeos longos pausa o refinamento de miniaturas e desenha o quadro exato sob o cursor sem codificar JPEG. Ao retomar, prioriza a última busca. O áudio AAC é extraído sem recodificar nem copiar todo o vídeo para WASM; efeitos e configurações de exportação são preservados. A exportação prioriza codificadores de hardware compatíveis e compõe diretamente quadros elegíveis no tamanho original; transformações e efeitos mantêm a renderização existente. A codificação de áudio e a composição do próximo quadro avançam em paralelo ao envio de vídeo, com fila limitada.
- **2026-10-07** — Clipes visuais agora aceitam duração mínima de 0,05 segundo, corrigindo cortes recusados em introduções curtas, como em 0,45 segundo. Recorte, alterações de velocidade e recuperação usam o mesmo limite. Corrigido o congelamento ao abrir ou fechar a prévia ampliada: o novo elemento de vídeo recupera o tempo de origem, a reprodução e os callbacks de quadros.

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

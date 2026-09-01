# Timeline Studio — ИИ-видеоредактор в браузере

[English](README.md) | [中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [ไทย](README.th.md) | [Tiếng Việt](README.vi.md) | **Русский**

[![skills.sh](https://skills.sh/b/MartinDelophy/ai-video-editor)](https://skills.sh/MartinDelophy/ai-video-editor)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md) [![LINUX DO](https://shorturl.at/ggSqS)](https://linux.do)

## Ответственное использование технологии глубинного синтеза

Этот инструмент использует технологию глубинного синтеза и предназначен исключительно для технических исследований и обучения.

Пользователь обязан:

- использовать только собственные изображения или видео лица либо материалы людей, предоставивших законное разрешение;
- не создавать и не распространять незаконные, нарушающие права, ложные или вводящие в заблуждение материалы;
- не выдавать созданный контент за подлинную съёмку и не использовать личность другого человека без его согласия.

Пользователь самостоятельно несёт всю юридическую ответственность за нарушение этих требований.

## Новости проекта

- **1 сентября 2026 — Быстрая готовность видео без потери синхронизации:** локальный и онлайн-импорт ждёт лишь небольшой, адаптированный к устройству набор начальных кадров с реальными PTS вместо блокировки на 120–240 миниатюрах. Затем точные кадры сначала уточняют видимую область, а после — ячейки вне экрана в порядке деления по серединам. Миниатюра всегда берётся как последний кадр до запрошенного времени источника, ячейка под курсором следует живому предпросмотру, а фоновые обновления приостанавливаются во время прокрутки.
- **29 августа 2026 — Локальные коннекторы генерации:** добавлены отдельные плагины ComfyUI и Stable Diffusion WebUI/Forge. ComfyUI выполняет workflow в API Format через loopback и импортирует изображения или видео; WebUI использует реальные API txt2img/img2img. Результаты автоматически попадают в My assets, а универсальная интеграция Hugging Face Spaces удалена.
- **28 августа 2026 — Локальное умное шумоподавление:** Видео → ИИ-реставрация предлагает DRUNet со сравнением кадра, четырьмя уровнями, исходным звуком и обратимым применением. Весь клип теперь обрабатывается при исходной частоте потоковым WebCodecs: декодирование следующего кадра перекрывается с инференсом, WebGPU Session, холсты, тензоры и пиксельные буферы постоянно переиспользуются, а для соседних кадров с малыми изменениями осторожно повторно применяется остаток шумоподавления; PNG/FFmpeg сохранён как совместимый резерв. Доступно на компьютере и мобильных устройствах на всех 11 языках.
- **28 августа 2026 — Высокоточная подготовка видео на таймлайне:** новые видео остаются в явном состоянии загрузки при чтении метаданных и декодировании миниатюр с реальными PTS, поэтому растянутые временные блоки не появляются. Плёнка использует более чёткие исходные кадры 180px, читаемую плотность по масштабу, точное соответствие исходного времени под курсором и центральное заполнение вертикального видео без чёрных полос.
- **28 августа 2026 — Прогресс встроенных моделей Chrome в реальном времени:** Автомонтаж отдельно показывает фактический прогресс Chrome, завершение и номер попытки для моделей понимания изображения и перевода субтитров. Если Chrome не сообщает о прогрессе 45 секунд, интерфейс показывает остановку и кнопку повторной загрузки, которую нажимает пользователь, сохраняя необходимую активацию и частично загруженные данные Chrome.

Планируемые работы находятся в [Roadmap](ROADMAP.md), опубликованные изменения — в [Releases](https://github.com/MartinDelophy/ai-video-editor/releases), а отдельные задачи и ошибки — в [Issues](https://github.com/MartinDelophy/ai-video-editor/issues).

## Что можно создать?

Изучите воспроизводимые примеры «до и после» и рецепты монтажа:

→ [AI Video Editing Skills Handbook](https://github.com/MartinDelophy/timeline-studio-handbook)

<p align="center">
  <a href="https://trendshift.io/repositories/77422?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-77422" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/77422/daily?language=JavaScript" alt="MartinDelophy%2Fai-video-editor | Trendshift" width="250" height="55"/></a>
  <a href="https://trendshift.io/repositories/77422?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-77422" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/77422/weekly?language=JavaScript" alt="MartinDelophy%2Fai-video-editor | Trendshift" width="250" height="55"/></a>
</p>

Timeline Studio — локальный ИИ-видеоредактор, работающий в браузере. Он объединяет многодорожечную временную шкалу в стиле CapCut, ИИ-озвучивание, автоматические субтитры, инструменты компьютерного зрения, говорящие аватары и детерминированный офлайн-экспорт.

[Открыть редактор](https://video-editor.ai-creator.top/) · [Посмотреть демо](https://www.youtube.com/watch?v=chdRPG2ndMs) · [Hugging Face Space](https://huggingface.co/spaces/haixin/timeline-studio)

![Редактор Timeline Studio](docs/screenshots/editor-timeline.png)

## Основные возможности

- Многоязычная озвучка с Piper/VITS ONNX и Kokoro 82M.
- Локальная генерация ИИ-музыки на Stable Audio 3 Small Q4 ONNX через WebGPU: перевод свободных промптов, варианты 30/60/90/120 секунд, длинные циклы с анализом волны, постоянный кэш модели и автоматическое добавление в «Мои ресурсы».
- Автоматические субтитры на базе Whisper small q8 ONNX.
- Умное кадрирование с YOLOS tiny и MODNet.
- Разделение вокала и музыки, аватары JoyVASA и LivePortrait.
- Многодорожечный монтаж с наложениями, масками, фильтрами, анимацией и ключевыми кадрами.
- Экспорт MP4/WebM в браузере с WebCodecs и сведением звука.
- Устанавливаемое PWA, локальный кэш моделей и проекты `.timeline`.

## Демо ИИ-озвучивания

https://github.com/user-attachments/assets/304a744e-d620-4380-9c17-19af3726f5a4

## Agent Skill

Репозиторий содержит Agent Skill [`edit-timeline-studio`](skills/edit-timeline-studio/SKILL.md) для планирования, выполнения и проверки редактируемых видеотаймлайнов. Для установки требуется GitHub CLI 2.90.0 или новее.

Для установки через [skills.sh](https://skills.sh/MartinDelophy/ai-video-editor) требуется Node.js 22.20.0 или новее.

```bash
npx skills add MartinDelophy/ai-video-editor --skill edit-timeline-studio
```

```bash
# Claude Code
gh skill install MartinDelophy/ai-video-editor edit-timeline-studio --agent claude-code --scope user

# Codex
gh skill install MartinDelophy/ai-video-editor edit-timeline-studio --agent codex --scope user
```

Добавьте `--pin v1.0.0`, чтобы установить проверенный релиз, а не автоматически следовать за последним. Перед установкой Skill можно просмотреть командой `gh skill preview MartinDelophy/ai-video-editor edit-timeline-studio`.

## Дорожная карта

- **Сейчас:** повысить надёжность детерминированного офлайн-экспорта и временной шкалы, расширить сквозные браузерные тесты.
- **Далее:** выпустить версионируемый headless-обработчик команд для монтажа с агентами и упростить обмен шаблонами проектов.
- **Позже:** добавить совместное рецензирование, интерфейс расширений и больше локально проверенных ИИ-моделей.

Приоритеты обсуждаются в [GitHub Discussions](https://github.com/MartinDelophy/ai-video-editor/discussions).

## Нужна помощь

Приветствуются вклады в браузерные медиа, WebCodecs, WebGPU/ONNX, UX временной шкалы, локализацию, тесты и документацию. Сообщайте о воспроизводимых ошибках в [Issues](https://github.com/MartinDelophy/ai-video-editor/issues), делитесь идеями в [Discussions](https://github.com/MartinDelophy/ai-video-editor/discussions) или присылайте небольшие исправления, тесты, переводы и примеры.

## Быстрый старт

Требуются Node.js 20+ и современный браузер Chromium. Рекомендуется WebGPU.

```bash
git clone https://github.com/MartinDelophy/ai-video-editor.git
cd ai-video-editor
npm install
npm run dev
```

## Проверка

```bash
npm run build
npm run check
```

## Поддержка и обратная связь

Если этот проект оказался вам полезен, поставьте ему ⭐ Star. Если вы столкнулись с проблемой, [создайте Issue](https://github.com/MartinDelophy/ai-video-editor/issues).

Присоединяйтесь к нашему [сообществу в Discord](https://discord.gg/uq2uvUTBr), чтобы задавать вопросы, делиться отзывами и общаться с другими пользователями и участниками проекта.

## Лицензия

[MIT](LICENSE)

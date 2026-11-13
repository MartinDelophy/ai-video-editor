# Timeline Studio — ИИ-видеоредактор в браузере

[English](README.md) | [中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [ไทย](README.th.md) | [Tiếng Việt](README.vi.md) | **Русский**

[![skills.sh](https://skills.sh/b/MartinDelophy/ai-video-editor)](https://skills.sh/MartinDelophy/ai-video-editor)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md) [![LINUX DO](https://shorturl.at/ggSqS)](https://linux.do)

## Создавайте видео с Anna

Версия для Anna объединяет помощь ИИ в монтаже и продолжение работы над проектами:

- Опишите Anna задачу, проверьте план на основе ваших указаний и метаданных материалов, затем примените поддерживаемую перестановку клипов и простую обрезку видео на скорости 1×.
- Проекты и медиа автоматически сохраняются в облаке Anna. С той же учётной записью работу можно продолжить в другом браузере. Также доступны локальные контрольные копии проекта.
- Доработайте монтаж на редактируемой многодорожечной шкале, добавьте озвучку ИИ и ручные субтитры, затем экспортируйте MP4 доступным в браузере кодировщиком.

Это предварительная версия для компьютеров. Планирование не анализирует видеокадры или звук; локальные функции ИИ зависят от возможностей контейнера Anna.

→ [Попробовать Timeline Studio в Anna](https://anna.partners/store/@martindelophy/timeline-studio)

## Ответственное использование технологии глубинного синтеза

Этот инструмент использует технологию глубинного синтеза и предназначен исключительно для технических исследований и обучения.

Пользователь обязан:

- использовать только собственные изображения или видео лица либо материалы людей, предоставивших законное разрешение;
- не создавать и не распространять незаконные, нарушающие права, ложные или вводящие в заблуждение материалы;
- не выдавать созданный контент за подлинную съёмку и не использовать личность другого человека без его согласия.

Пользователь самостоятельно несёт всю юридическую ответственность за нарушение этих требований.

## Новости проекта

- **2026-11-13** — При импорте видео миниатюры для шкалы времени извлекаются пакетно. Предпросмотр быстрее реагирует на перетаскивание указателя воспроизведения, сохраняя прежние метки времени кадров.
- **2026-11-10** — В медиатеке появилось 120 звуковых эффектов, которые можно искать, прослушивать и добавлять на таймлайн. Эффекты и музыка используют общую кривую. Перетаскивайте её середину для изменения громкости, а две точки — для настройки плавного начала и затухания. В шаблоне «Вихрь воспоминаний» звуковые эффекты отмечают ключевые доли. При перетаскивании нескольких клипов появляется направляющая, а привязка сохраняет расстояния внутри группы.
- **2026-11-09** — Добавлены два редактируемых шаблона монтажа в такт. Шаблон с 3D-перспективой сочетает четыре раскрывающиеся полосы и 16 заменяемых карточек «картинка в картинке». «Вихрь воспоминаний» собирает витражный тоннель из фотографий или стоп-кадров 48 слотов, после чего показывает планы целиком. Цветовые круги в настольной версии теперь включают парад RGB для проверки уровней SDR после цветокоррекции. При офлайн-экспорте в 4K материалы загружаются по мере необходимости, что снижает нагрузку на память при записи больших файлов MP4 и MOV.
- **2026-11-08** — В окне замены клипа перетаскивайте маркеры начала и конца по отдельности или перемещайте выделенный диапазон целиком, сохраняя его длительность и скорость воспроизведения. Значок закрытия выровнен по центру на компьютерах и телефонах. Панель свойств следует за клипом, выбранным на шкале времени или в предпросмотре. Настройки «картинка в картинке» используют доступную высоту и прокручиваются. Предпросмотр выделяет выбранный видеоклип рамкой, а ромбы отмечают ключевые кадры. Названия дорожек спецэффектов помещаются в колонке, и при перетаскивании курсора предпросмотр эффектов требует меньше ресурсов. Добавлен квадратный шаблон «Вращающиеся карты» с неоновой заставкой, десятью заменяемыми кадрами и музыкой в выбранном темпе. Перетаскивайте ромб на видеоклипе или наложении, чтобы менять время ключевого кадра. Для каждой вращающейся масти можно выбрать фото или видео. Добавлены четыре редактируемых шаблона: семь панелей, неоновая плёнка, концентрические волны и ступенчатые маски. WebMCP позволяет проверить и добавить ритмический шаблон, просмотреть эффекты на таймлайне и настроить переходы с маской. Порядок работы описан в Timeline Studio Skill.
- **2026-11-07** — После спецэффектов добавлен раздел шаблонов. Подставьте свои изображения, видео и музыку по желанию, задайте темп и добавьте редактируемый монтаж из трёх панелей. Предпросмотр растра и нескольких панелей стал плавнее. Настройки шаблона находятся справа, встроенная музыка синхронизируется с BPM. Через контекстное меню основной клип или клип «картинка в картинке» можно заменить выбранным отрезком, сохранив позицию и длительность. Предпросмотр заранее декодирует следующий план и появляющиеся клипы «картинка в картинке», чтобы сгладить стыки. В окне замены видны миниатюры и имена файлов, горизонтальная прокрутка для пяти и более медиа и скорость воспроизведения для выбранного отрезка.
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

Добавьте `--pin v1.0.8`, чтобы установить проверенный релиз, а не автоматически следовать за последним. Перед установкой Skill можно просмотреть командой `gh skill preview MartinDelophy/ai-video-editor edit-timeline-studio`.

## Дорожная карта

- **Сейчас:** повысить надёжность детерминированного офлайн-экспорта и временной шкалы, расширить сквозные браузерные тесты.
- **Далее:** расширить соответствие headless-рендеринга браузерному экспорту, набор проверяемых команд WebMCP и обмен шаблонами проектов.
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

## Star History

<a href="https://www.star-history.com/?repos=MartinDelophy/ai-video-editor">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=MartinDelophy/ai-video-editor&amp;type=date&amp;theme=dark&amp;legend=top-left" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=MartinDelophy/ai-video-editor&amp;type=date&amp;legend=top-left" />
    <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=MartinDelophy/ai-video-editor&amp;type=date&amp;legend=top-left" />
  </picture>
</a>

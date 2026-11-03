# Contributing to Timeline Studio

Thank you for helping improve Timeline Studio. First-time open-source
contributors are welcome.

Translations of this guide: [Tiếng Việt](CONTRIBUTING.vi.md)

## Good ways to start

Look for issues labeled:

- `good first issue` for small, well-scoped changes
- `help wanted` for tasks where maintainer guidance is available
- `documentation` for guides and copy improvements
- `localization` for translation work
- `testing` for browser, device, and workflow coverage

If you are unsure which issue to choose, introduce yourself in
[GitHub Discussions](https://github.com/MartinDelophy/ai-video-editor/discussions)
or in the [Discord community](https://discord.gg/uq2uvUTBr). Mention the area
you are interested in and any technology you would like to learn.

Please comment on an issue before starting a larger change. This avoids
duplicated work and gives maintainers a chance to clarify the expected result.

## Local development

Requirements:

- Node.js 20 or newer
- npm
- A modern Chromium browser
- WebGPU-capable hardware for the heaviest browser AI workflows

Set up the project:

```bash
git clone https://github.com/MartinDelophy/ai-video-editor.git
cd ai-video-editor
npm install
npm run dev
```

Open the local URL printed by Vite.

## Making a change

1. Fork the repository.
2. Create a focused branch from the latest default branch.
3. Make one clear change.
4. Add or update tests when behavior changes.
5. Check the desktop and mobile experience for user-facing changes.
6. Run the relevant validation commands.
7. Open a pull request and explain what changed and how you tested it.

Keep pull requests small when possible. A focused pull request is easier to
review and is especially helpful for a first contribution.

## Validation

Run the complete repository check:

```bash
npm run check
```

During development, you can run individual checks:

```bash
npm run lint
npm run typecheck
npm run build
```

For a documentation-only change, describe what you reviewed manually if the
complete check is not relevant.

## User interface contributions

When changing visible behavior:

- Test at a desktop viewport.
- Test at a `412 × 915` mobile viewport.
- Keep controls keyboard accessible where applicable.
- Avoid introducing untranslated user-facing text.
- Include before-and-after screenshots or a short recording in the pull
  request.

## Localization contributions

Keep the meaning consistent across languages rather than translating words in
isolation. Reuse existing translation keys when possible, and include the
interface language you tested in the pull request.

## Reporting browser and performance results

Include:

- Browser name and version
- Operating system
- Device or GPU when relevant
- Exact steps to reproduce
- Expected and actual behavior
- Console errors, screenshots, or recordings when available

Do not include private media, access tokens, personal information, or other
sensitive data in issues or test files.

## Pull request expectations

A pull request should:

- Link the related issue when one exists.
- Explain the user-visible or technical outcome.
- List the validation performed.
- Avoid unrelated formatting or refactoring.
- Preserve existing behavior outside the stated scope.

By contributing, you agree that your contribution will be licensed under the
repository's [MIT License](LICENSE).

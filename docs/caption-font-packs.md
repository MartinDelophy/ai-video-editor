# Caption font packs

The subtitle font picker follows the active interface language. Fonts are downloaded only when selected or required by a restored project or export. The existing preview and export loaders use the same family and weight from `src/lib/captionFonts.js`.

## Additions v2

Sixteen additional fonts add Chinese WenKai handwriting and Traditional Chinese serif, Japanese handwriting, Korean sans/serif/handwriting, Latin and Cyrillic sans/serif, Thai handwriting/script, and Vietnamese handwriting. The language lists now offer 13 Chinese, 14 Latin-language, 12 Japanese, 13 Korean, 12 Thai, 15 Vietnamese, and 15 Russian fonts, plus the system default. Latin-language lists cover English, Spanish, French, German, Portuguese, Italian, and Indonesian. Font names remain their proper names; samples use characters supported by each font.

The source of truth for the additions is `src/config/captionFontAdditions.js`. The upstream Google Fonts revision is `47d54ca1ebb14fd864695f1d39dc734f39017c33`. Unmodified TTF files, original OFL-1.1 licenses, and the manifest are published under `haixin/timeline-studio-fonts/fonts/additions-v2` at immutable revision `dca764cd922e44733245ebc8f688addf59124a38`. New font bytes are SHA-256 verified before browser registration. An unavailable browser cache does not prevent in-memory font loading.

ModelScope's additions revision is intentionally empty until that mirror upload is completed and verified. The existing v1 font pack keeps its existing two-provider route. New additions use the verified Hugging Face revision, with the existing Google Fonts stylesheet fallback; no missing ModelScope path is advertised as available. Once mirrored, set the separate immutable ModelScope revision in the additions config. The browser font cache uses the Hugging Face revision as a provider-independent identity.

`scripts/prepare-caption-font-pack.mjs <output-directory>` prepares all maintained font files and original licenses, covers all 13 interface languages, records source paths and hashes, and checks the additions against the pinned checksums. Keep generated font packs outside the product repository; upload them to the owned font repositories.

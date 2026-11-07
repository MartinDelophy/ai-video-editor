# VFX card source images

Generated for Timeline Studio with OpenAI image generation on 2026-11-06.
Each image is a clean, distinct source scene; effects are applied by the production compositor on hover rather than baked into these files.

The eight 640×480 WebP files use quality 80. High-resolution originals remain in the generation workspace, outside the product repository.

- ripple: koi pond
- glitch: neon city and motorcycle
- shake: skateboard at sunset
- halo: coastal lighthouse
- glow: flowers by a window
- vignette: desert sports car
- grain: Alpine railway platform
- chromatic: orange and ivory sneaker

## Crystal face-effects collection — 2026-11-07

Built-in OpenAI ImageGen, selected Product Design direction 2 (smoky lavender translucent glass and deep ruby crystal). All final assets are local runtime assets; no external generation API is used during editing.

- `cat-ears-base.webp`, `devil-horns-base.webp`: precise object-removal edits of the matching cover originals, retaining subject, pose, lighting and composition; used for real compositor hover previews. WebP quality 82, 20,132 / 15,212 bytes.
- `crystal-cat-ear.webp`: one isolated smoky-lavender crystal cat ear, pale pink inner face, glass rim and thickness, genuine alpha; mirror and project through tracked head coordinates. 512×549 lossless WebP, 234,994 bytes.
- `crystal-devil-horn.webp`: one isolated deep-ruby glass horn, taper and subtle outward curl, genuine alpha. 219×600 WebP, 26,758 bytes.
- `face-alignment-head.webp`: neutral smoky translucent head bust facing left, fine silver contours, genuine alpha, no arrows/UI. 240×378 WebP, 16,688 bytes.

Source PNGs and the paired portraits with baked-in attachments are retained in the generation workspace outside the product build. Prompts explicitly excluded lettering, logos, borders and UI. Transparent runtime assets have only transparent-margin/fringe cleanup and WebP compression; generated material is preserved. Preview/export apply the same alpha feather, color blend, head-space projection and timeline keyframe interpolation.

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

- `cat-ears-cover.webp`, `devil-horns-cover.webp`: matching generated 640×480 portraits with baked-in headwear, used for the resting card image. These runtime covers are included with the base photographs.
- `cat-ears-base.webp`, `devil-horns-base.webp`: precise object-removal edits of the matching cover originals, retaining subject, pose, lighting and composition; used for real compositor hover previews. WebP quality 82, 20,132 / 15,212 bytes.
- `crystal-cat-ear.webp`: one isolated smoky-lavender crystal cat ear, pale pink inner face, glass rim and thickness, genuine alpha; mirror and project through tracked head coordinates. 512×549 lossless WebP, 234,994 bytes.
- `crystal-devil-horn.webp`: one isolated deep-ruby glass horn, taper and subtle outward curl, genuine alpha. 219×600 WebP, 26,758 bytes.
- `face-alignment-head.webp`: neutral smoky translucent head bust facing left, fine silver contours, genuine alpha, no arrows/UI. 240×378 WebP, 16,688 bytes.

High-resolution source PNGs are retained in the generation workspace outside the product build. Prompts explicitly excluded lettering, logos, borders and UI. Transparent runtime assets have only transparent-margin/fringe cleanup and WebP compression; generated material is preserved. Preview/export apply the same alpha feather, color blend, head-space projection and timeline keyframe interpolation.

## Cat-face portrait — 2026-11-07

- `cat-face-base.webp`: new 640×480 warm editorial portrait of an adult woman, compressed at WebP quality 82. Generated with the built-in OpenAI image tool; the original PNG stays outside the product repository.
- `cat-face-cover.webp`: resting card image rendered with the production cat-face compositor on this same portrait, then compressed at WebP quality 82.
- The base photo contains no painted animal features. Production canvas paths draw the nose, whiskers, freckles and soft cheek tint in both the card and actual footage. The card uses landmarks measured from this exact photo; user media always uses real analysis.
- Prompt: “Create a photorealistic premium portrait photograph to be the BASE SOURCE for a browser augmented-reality cat-face makeup effect card. A clearly adult East Asian woman age 25–30, softly wavy dark brown bob hair tucked away from both cheeks, direct frontal face with a tiny natural 8 degree turn toward camera left, warm brown eyes looking at the camera, a gentle relaxed closed-mouth smile. Elegant ivory knit top, intimate muted warm walnut photography studio, soft warm window light with gentle skin detail. A close head-and-shoulders composition, entire forehead, ears, nose, mouth, chin, and both cheeks fully visible with generous room at left and right for later painted whiskers. Face centered horizontally, eyes around 43 percent down the image, head occupies about 60 percent of image height. 4:3 landscape image, polished editorial photography, contemporary tasteful beauty campaign, clean natural makeup. NO cat ears, NO cat whiskers, NO painted nose, NO blush stickers, NO animal features, NO face paint, NO text, NO logos, NO UI, NO frames. This is a neutral clean base portrait: the editor will draw responsive cat makeup onto it at runtime.”

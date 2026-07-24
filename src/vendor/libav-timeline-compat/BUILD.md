# Timeline compatibility libav.js build

This directory contains a lazy-loaded libav.js WebAssembly build used only when
native browser media handling fails or a Matroska file is imported.

- libav.js: 6.9.8.1
- upstream commit: `ff473905db2c496628a1fb9f0b5b3e7c234720c5`
- FFmpeg: 8.1
- Emscripten: 4.0.23
- target: `wasm.mjs`
- upstream source: https://github.com/Yahweasel/libav.js
- license: LGPL-2.1-or-later for the selected FFmpeg configuration; the
  generated loader also includes the upstream libav.js ISC license header.

The custom libav.js configuration is:

```json
[
  "avformat",
  "avfcbridge",
  "avcodec",
  "demuxer-matroska",
  "demuxer-ac3",
  "parser-ac3",
  "decoder-ac3",
  "parser-aac",
  "parser-h264",
  "parser-hevc",
  "parser-vp8",
  "parser-vp9",
  "parser-av1"
]
```

It intentionally decodes AC3 only. Browser-supported video remains on the
WebCodecs/native path, and unsupported video codecs continue to use the
FFmpeg.wasm normalization fallback.

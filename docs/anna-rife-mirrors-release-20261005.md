# Anna owned RIFE mirrors review — 2026-10-05

The Anna branch independently incorporates owned RIFE mirrors at source commit `1f091cd`. Main contains the shared mirror change only; no Anna entry, dependency, configuration or submission record was merged into main.

RIFE downloads from `haixin/timeline-studio-onnx-models` on Hugging Face at `64f590200ea7d6142a5e58cbf069025e44c84dbe` and `martindelophy/timeline-studio-onnx-models` on ModelScope at `7e4d08c6147638872679c6d2c2af71424599fd58`. Both contain `rife-v4.17-lite/{rife_v4.17_lite_v2.onnx,LICENSE,README.md}`. Anonymous downloads are 10541215 bytes with SHA-256 `4192e1db7db7d8a110a667b8776b9fe3d92deb1cce04676d5d57a5fd52d7578a` and allow browser CORS. Chinese sessions prefer ModelScope; explicit source preferences take priority. Download or integrity failures try the other owned mirror, and the shared model service worker canonicalizes both to one cache identity.

Real WebGPU interpolation on each branch independently cold-loaded both sources and produced identical 64×64 moving-square output hashes: `354ae1d27ae1bd790b70fbd8ed0d52adfcbb962a8bade1714becb8ea978a3bc3`. The Anna test retained its asset/worker configuration while bypassing only the app-entry HTML substitution. These checks validate mirror loading and inference equivalence, not complete production-host depth-video throughput or MP4 delivery. The main fallback simulation and provider-independent cache identity checks passed. Model precision, resolution, sample timing, pipeline and source audio behavior are unchanged. Temporary verification pages and configuration files were removed before production builds.

Project tools 0.1.3 and editing Skill 0.1.2 retain their existing frozen dependencies.

## Receipt

- App `timeline-studio`, ID 254.
- Draft r94, ready; optimistic upload matched r93.
- Content hash: `44e2d4fdb3f470dbd8a20ba9a7f73ea8cc456ef13ece7ff164b414590c3d8230`.
- Uploaded bundle: 188 files / 229276735 bytes.
- Frozen version `0.1.1-beta.3`, version ID 1100, bundle ID 1031.
- Frozen manifest SHA-256: `4656df320eb4e75c3eb5774a0f2f07da0fafbe9397e466c9b3a94ff70c4ca734`.
- Release review: pending; is_latest false, published_at null. This is submission, not approval or publication of the Anna candidate.
- Main source commit `5f79c41` was pushed separately and deployed to Netlify as `6ac313caf897d9cf97ea5f5b`. Production entry `/assets/editor-Cfh9T20f.js` and both immutable mirror revisions were verified.

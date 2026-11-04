# Line-art assets

Effects → Line art opens a source-frame preview with Detail, Line weight and
Invert controls. All copy is localized directly in 13 languages. Compact layouts
use the existing Properties drawer. Anna continues to omit the Effects workspace.

A shared browser-local WebGL 2 renderer smooths luminance then extracts Sobel
contours into antialiased black lines on white (or inverted). This is deterministic
contour extraction, not a neural semantic line drawing or a pencil texture.
No model download or external inference service is required.

The preview and asset conversion use the same renderer at a maximum 1080px long
edge. Images produce PNG; videos produce 24 fps VP9/Opus WebM. MediaBunny samples
original source media at `getVisualSourceTime` timestamps, including source trim
and speed-curve windows, with a continuous decode iterator. The existing embedded
source-audio extraction and offline mix use the same segment timing. Unsupported
decoding or graphics is reported with localized errors. Cancellation stops the
encoder and decoder; no partial asset is committed. Panel unmount cancels its job.

Completed assets use the host-owned My assets commit path without replacing or
inserting timeline clips. They are ordinary image/video assets thereafter and
participate in existing project persistence, editing and original-media export.
This tool converts the selected clip's source picture, not a composited timeline
including captions, overlays or other effects. Rendering speed depends on the
browser decoder and encoder. Browser WebM/VP9 encoding and WebGL 2 are required
for video conversion; still images only require decoding and WebGL 2.

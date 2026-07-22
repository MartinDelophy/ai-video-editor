import { describe, expect, it } from "vitest";
import { buildFfmpegRenderPlan } from "./projectRenderPlan.js";

const files = new Map([
  ["media/visuals/image.png", "/tmp/image.png"],
  ["media/audio/voice.wav", "/tmp/voice.wav"],
]);

describe("buildFfmpegRenderPlan", () => {
  it("builds a deterministic MP4 plan for portable visual and voice media", () => {
    const plan = buildFfmpegRenderPlan({
      project: {
        ratioId: "9:16",
        visualSegments: [{ id: "visual", type: "image", duration: 2 }],
        audioSegments: [{ id: "voice", start: 0.5, duration: 1, volume: 0.8 }],
      },
      media: {
        visuals: [{ id: "visual", path: "media/visuals/image.png" }],
        audio: { path: "media/audio/voice.wav" },
      },
      extractedFiles: files,
      settings: { width: 360, height: 640, frameRate: 24 },
    });
    expect(plan).toMatchObject({ duration: 2, width: 360, height: 640, frameRate: 24, hasAudio: true });
    expect(plan.args.join(" ")).toContain("concat=n=1:v=1:a=0[vout]");
    expect(plan.args.join(" ")).toContain("amix=inputs=1");
  });

  it("refuses features that would otherwise be silently omitted", () => {
    expect(() => buildFfmpegRenderPlan({
      project: {
        visualSegments: [{ id: "visual", type: "image", duration: 2 }],
        captionSegments: [{ id: "caption", text: "Visible", start: 0, end: 1 }],
      },
      media: { visuals: [{ id: "visual", path: "media/visuals/image.png" }] },
      extractedFiles: files,
    })).toThrowError(expect.objectContaining({ code: "UNSUPPORTED_RENDER_FEATURE" }));
  });
});


import { describe, expect, it } from "vitest";

import { transcodeWebmToMp4 } from "./media.js";

describe("media export cancellation", () => {
  it("does not load FFmpeg for an already canceled MP4 transcode", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(transcodeWebmToMp4(new Blob(), { signal: controller.signal }))
      .rejects.toMatchObject({ name: "AbortError" });
  });
});

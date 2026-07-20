import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const VOICE_CASES = [
  { language: "中文", voice: "小雅", text: "你好，这是一次完整的中文语音合成测试。" },
  { language: "中文", voice: "超文", text: "你好，这是超文语音模型的合成测试。" },
  { language: "English", voice: "Heart", text: "Hello. This is a complete English voice synthesis test." },
  { language: "English", voice: "Fenrir", text: "Hello. This is the second English voice synthesis test." },
  { language: "Deutsch", voice: "Thorsten", text: "Hallo! Dies ist ein vollständiger Sprachtest." },
  { language: "Español", voice: "DaveFX", text: "Hola. Esta es una prueba completa de síntesis de voz." },
  { language: "Français", voice: "Siwis", text: "Bonjour. Ceci est un test complet de synthèse vocale." },
  { language: "Italiano", voice: "Riccardo", text: "Ciao. Questo è un test completo di sintesi vocale." },
  { language: "Português", voice: "Faber", text: "Olá. Este é um teste completo de síntese de voz." },
  { language: "日本語", voice: "Hikari", text: "こんにちは。これは日本語音声合成の完全なテストです。" },
  { language: "한국어", voice: "Minseo", text: "안녕하세요. 이것은 한국어 음성 합성 테스트입니다." },
  { language: "Tiếng Việt", voice: "Linh", text: "Xin chào. Đây là bài kiểm tra tổng hợp giọng nói tiếng Việt." },
  { language: "Русский", voice: "Irina", text: "Здравствуйте. Это полная проверка синтеза русской речи." },
  { language: "ไทย", voice: "Malee", text: "สวัสดี นี่คือการทดสอบการสังเคราะห์เสียงภาษาไทย" },
];

const requestedVoices = process.env.E2E_VOICES?.split(",").map((voice) => voice.trim()).filter(Boolean);
const ACTIVE_VOICE_CASES = requestedVoices?.length
  ? VOICE_CASES.filter((voiceCase) => requestedVoices.includes(voiceCase.voice))
  : VOICE_CASES;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("ai-voiceover-ui-language", "zh"));
});

test("every listed language and voice generates a valid WAV through the current editor workflow", async ({ page }) => {
  test.setTimeout(20 * 60 * 1000);
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await page.goto("/");

  for (const voiceCase of ACTIVE_VOICE_CASES) {
    // Generation selects the newly created voice clip and switches the right
    // panel to its clip inspector; explicitly return to the Audio workflow.
    await page.locator(".rail-tool").filter({ hasText: "音频" }).click();
    await page.getByRole("button", { name: /AI 配音/ }).click();
    await expect(page.locator("#script-input")).toBeVisible();
    await page.locator("#script-input").fill(voiceCase.text);
    await page.locator(".voice-filter").click();
    await page.locator(".menu-list button").getByText(voiceCase.language, { exact: true }).click();
    await page.locator(".voice-card").filter({ hasText: voiceCase.voice }).click();

    await expect(page.locator(".voice-card.is-selected strong")).toHaveText(voiceCase.voice);
    const previousClipCount = await page.locator(".audio-clip:not(.is-source)").count();
    await page.locator(".generate-button").click();
    try {
      await Promise.race([
        expect(page.locator(".audio-clip:not(.is-source)")).toHaveCount(previousClipCount + 1, { timeout: 4 * 60 * 1000 }),
        page.waitForFunction(() => document.body.innerText.includes("生成失败，请重试"), null, { timeout: 4 * 60 * 1000 })
          .then(() => { throw new Error("editor reported generation failure"); }),
      ]);
    } catch (error) {
      throw new Error(`${voiceCase.voice} failed to generate: ${browserErrors.slice(-5).join(" | ") || "no browser error was reported"}`, { cause: error });
    }
    const clipDownload = page.getByRole("button", { name: "下载片段", exact: true });
    await expect(clipDownload).toBeEnabled();

    const downloadPromise = page.waitForEvent("download");
    await clipDownload.click();
    const download = await downloadPromise;
    const path = await download.path();
    const wav = await readFile(path);

    expect(wav.byteLength).toBeGreaterThan(44);
    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wav.subarray(8, 12).toString("ascii")).toBe("WAVE");
  }
});

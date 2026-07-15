import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const VOICE_CASES = [
  { language: "中文", voice: "小雅", text: "你好，这是一次完整的中文语音合成测试。" },
  { language: "English", voice: "Heart", text: "Hello. This is a complete English voice synthesis test." },
  { language: "Deutsch", voice: "Thorsten", text: "Hallo! Dies ist ein vollständiger Sprachtest." },
  { language: "Español", voice: "DaveFX", text: "Hola. Esta es una prueba completa de síntesis de voz." },
  { language: "Français", voice: "Siwis", text: "Bonjour. Ceci est un test complet de synthèse vocale." },
  { language: "Italiano", voice: "Riccardo", text: "Ciao. Questo è un test completo di sintesi vocale." },
  { language: "Português", voice: "Faber", text: "Olá. Este é um teste completo de síntese de voz." },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("ai-voiceover-ui-language", "zh"));
});

for (const voiceCase of VOICE_CASES) {
  test(`${voiceCase.language} ${voiceCase.voice} generates a valid WAV through the editor`, async ({ page }) => {
    await page.goto("/");
    await page.locator("#script-input").fill(voiceCase.text);
    await page.locator(".voice-filter").click();
    await page.locator(".menu-list button").getByText(voiceCase.language, { exact: true }).click();

    await expect(page.locator(".voice-card.is-selected strong")).toHaveText(voiceCase.voice);
    await page.locator(".generate-button").click();
    const clipDownload = page.getByRole("button", { name: "下载片段", exact: true });
    await expect(clipDownload).toBeEnabled({ timeout: 4 * 60 * 1000 });

    const downloadPromise = page.waitForEvent("download");
    await clipDownload.click();
    const download = await downloadPromise;
    const path = await download.path();
    const wav = await readFile(path);

    expect(wav.byteLength).toBeGreaterThan(44);
    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wav.subarray(8, 12).toString("ascii")).toBe("WAVE");
  });
}

/**
 * Records each scene as a WebM video using Playwright.
 * Each HTML scene is loaded in a 1080×1920 headless browser,
 * CSS animations play, and the page is recorded.
 */

import { chromium } from "@playwright/test";
import { join } from "path";

export async function recordScenes(scenes, outputDir) {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const scene of scenes) {
    const videoPath = join(outputDir, `scene-${scene.sceneId}.webm`);

    const context = await browser.newContext({
      recordVideo: {
        dir: outputDir,
        size: { width: 1080, height: 1920 },
      },
      viewport: { width: 1080, height: 1920 },
    });

    const page = await context.newPage();

    // Load the HTML scene
    await page.goto(`file://${scene.htmlPath}`, {
      waitUntil: "networkidle",
    });

    // Small buffer for rendering to settle, then wait for animation duration
    const buffer = 0.5; // seconds of extra recording for fade-out
    const totalWait = (scene.duration + buffer) * 1000;
    await page.waitForTimeout(totalWait);

    // Finalize and save the video
    const video = page.video();
    await page.close();
    if (video) {
      await video.saveAs(videoPath);
    }
    await context.close();

    results.push({
      sceneId: scene.sceneId,
      videoPath,
      audioPath: scene.audioPath,
      duration: scene.duration,
    });

    console.log(
      `  Scene ${scene.sceneId}: recorded (${scene.duration.toFixed(1)}s + 0.5s buffer)`,
    );
  }

  await browser.close();
  return results;
}

/**
 * Captures a scrolling GIF of a demo page and uploads it to Vercel Blob.
 * Uses Puppeteer for screenshots, gif-encoder-2 (pure JS) for encoding,
 * and Sharp (already in deps) to resize frames.
 *
 * Runs only locally — the email queue is behind /dashboard/ which middleware
 * blocks on Vercel.
 */

import puppeteer from "puppeteer";
import sharp from "sharp";
import { put } from "@vercel/blob";

// gif-encoder-2 ships no TypeScript types; declare the minimum we use.
interface GIFEncoderInstance {
  start(): void;
  setDelay(ms: number): void;
  setRepeat(n: number): void;
  setQuality(q: number): void;
  addFrame(rgbaBuffer: Buffer): void;
  finish(): void;
  out: { getData(): Buffer };
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const GIFEncoder = require("gif-encoder-2") as new (
  width: number,
  height: number,
  algorithm?: string,
  useOptimizer?: boolean
) => GIFEncoderInstance;

const VIEWPORT_W = 1200;
const VIEWPORT_H = 800;
const OUTPUT_W = 800; // minimum per spec
const TARGET_FRAMES = 70; // ~7 s at 100 ms/frame
const FRAME_DELAY = 100; // ms between frames
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

async function encodeFrames(
  frames: Buffer[],
  width: number,
  height: number,
  quality: number,
  delay: number
): Promise<Buffer> {
  const encoder = new GIFEncoder(width, height, "neuquant");
  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(delay);
  encoder.setQuality(quality);

  for (const frame of frames) {
    const rgba = await sharp(frame)
      .resize(width, height, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer();
    encoder.addFrame(rgba);
  }

  encoder.finish();
  return encoder.out.getData();
}

export async function captureAndUploadGif(
  demoUrl: string,
  leadId: string
): Promise<string> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  let frames: Buffer[];
  const outputH = Math.round((OUTPUT_W * VIEWPORT_H) / VIEWPORT_W);

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: VIEWPORT_W, height: VIEWPORT_H });
    await page.goto(demoUrl, { waitUntil: "networkidle0", timeout: 30000 });
    // Wait for animations to settle
    await new Promise((r) => setTimeout(r, 1500));

    const pageH = await page.evaluate(
      () => document.documentElement.scrollHeight
    );
    const scrollDistance = Math.max(0, pageH - VIEWPORT_H);
    const scrollStep =
      scrollDistance > 0 ? Math.ceil(scrollDistance / TARGET_FRAMES) : 0;

    frames = [];
    let scrollY = 0;

    while (true) {
      await page.evaluate((y: number) => window.scrollTo(0, y), scrollY);
      await new Promise((r) => setTimeout(r, 50)); // let paint settle
      frames.push((await page.screenshot({ type: "png" })) as Buffer);

      if (scrollY >= scrollDistance) break;
      scrollY = Math.min(scrollY + scrollStep, scrollDistance);
    }
  } finally {
    await browser.close();
  }

  // First pass: quality 10 (lower = better in gif-encoder-2)
  let gif = await encodeFrames(frames, OUTPUT_W, outputH, 10, FRAME_DELAY);

  // If > 2 MB: thin frames to every other one and halve frame rate
  if (gif.length > MAX_BYTES) {
    const thinned = frames.filter((_, i) => i % 2 === 0);
    gif = await encodeFrames(thinned, OUTPUT_W, outputH, 15, FRAME_DELAY * 2);
  }

  const blob = await put(`gifs/${leadId}.gif`, gif, {
    access: "public",
    contentType: "image/gif",
    allowOverwrite: true,
  });

  return blob.url;
}

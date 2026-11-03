import sharp from "sharp";

// The navbar renders on one of two backgrounds. Pick whichever contrasts more
// with the logo's ink so the logo stays legible.
const NAV_DARK_LUMA = 10; // ~ zinc-950
const NAV_LIGHT_LUMA = 250; // ~ white

/**
 * Choose a navbar theme from a logo image. Averages the luminance of the
 * logo's opaque pixels (transparent pixels are ignored) and returns the
 * background that gives the higher contrast. Falls back to "dark" (the default
 * theme) if the image can't be decoded.
 */
export async function pickNavTheme(input: string | Buffer): Promise<"light" | "dark"> {
  try {
    const { data, info } = await sharp(input)
      .resize(64, 64, { fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let sum = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i + 3] < 32) continue; // skip transparent pixels
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      count++;
    }
    if (count === 0) return "dark";

    const inkLuma = sum / count;
    const contrastOnDark = Math.abs(inkLuma - NAV_DARK_LUMA);
    const contrastOnLight = Math.abs(inkLuma - NAV_LIGHT_LUMA);
    return contrastOnLight > contrastOnDark ? "light" : "dark";
  } catch {
    return "dark";
  }
}

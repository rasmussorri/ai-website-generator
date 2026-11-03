/**
 * Thin AI provider abstraction.
 *
 * Uses Anthropic (Claude Haiku) when ANTHROPIC_API_KEY is set,
 * falls back to OpenAI (GPT-4o mini) when only OPENAI_API_KEY is set.
 * Both keys can coexist — Anthropic takes precedence.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

/**
 * Retry budget for both SDK clients. Bulk generation (hundreds of leads
 * back-to-back) transiently saturates the tokens-per-minute limit; the 429s
 * clear in well under a second ("try again in 329ms"). Both SDKs auto-retry
 * 429s honoring the retry-after hint, but default to only 2 attempts — too few
 * for a saturated TPM window. Without enough retries a transient 429 fails the
 * lead, and the dashboard's skip path permanently DELETEs that prospect.
 */
const MAX_RETRIES = 8;

export async function generateText(prompt: string, maxTokens: number): Promise<string> {
  if (process.env.ANTHROPIC_API_KEY) {
    const anthropic = new Anthropic({ maxRetries: MAX_RETRIES });
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    });
    return msg.content[0].type === "text" ? msg.content[0].text : "";
  }

  const openai = new OpenAI({ maxRetries: MAX_RETRIES });
  const msg = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  return msg.choices[0]?.message?.content ?? "";
}

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

/** Same provider routing as generateText, but with a base64 image attached. */
export async function generateTextFromImage(
  prompt: string,
  imageBase64: string,
  mediaType: ImageMediaType,
  maxTokens: number,
): Promise<string> {
  if (process.env.ANTHROPIC_API_KEY) {
    const anthropic = new Anthropic({ maxRetries: MAX_RETRIES });
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            { type: "text", text: prompt },
          ],
        },
      ],
    });
    return msg.content[0].type === "text" ? msg.content[0].text : "";
  }

  const openai = new OpenAI({ maxRetries: MAX_RETRIES });
  const msg = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: maxTokens,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${mediaType};base64,${imageBase64}` } },
        ],
      },
    ],
  });
  return msg.choices[0]?.message?.content ?? "";
}

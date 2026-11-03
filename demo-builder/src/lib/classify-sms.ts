import { generateText } from "./ai";

type AutoStage = "declined" | "meeting-accepted" | "answered";

// Stage progression used to prevent downgrading a lead.
const PROGRESS: Record<string, number> = {
  contacted: 0,
  answered: 1,
  "meeting-accepted": 2,
};

// Only auto-classify leads that are still in the pre-meeting stages.
export const AUTO_CLASSIFIABLE_STAGES = new Set(["contacted", "answered", "meeting-accepted"]);

/**
 * Ask a cheap model to classify a Finnish inbound SMS reply.
 * Returns the funnel stage to move the lead to, or null if no change is needed.
 */
export async function classifyInboundSms(
  inbound: string,
  outboundContext: string,
  currentStage: string,
): Promise<AutoStage | null> {
  if (!AUTO_CLASSIFIABLE_STAGES.has(currentStage)) return null;

  const prompt = `Finnish SMS reply to a cold sales message. Classify as one word.

Sales message sent:
"${outboundContext.slice(0, 300)}"

Their reply:
"${inbound.slice(0, 300)}"

Classes:
- declined: rejecting, not interested, won't proceed, too busy, not now, "ei lähdetä", "ei kiinnosta"
- meeting-accepted: wants to meet, talk, call, or shows clear buying interest
- answered: anything else (question, neutral, maybe, unclear)

Reply with ONLY the class word.`;

  let classified: AutoStage;
  try {
    const raw = (await generateText(prompt, 10)).trim().toLowerCase();
    if (raw.includes("declined")) classified = "declined";
    else if (raw.includes("meeting")) classified = "meeting-accepted";
    else classified = "answered";
  } catch {
    return null; // no key or API error — leave stage unchanged
  }

  // Don't downgrade: e.g. if already meeting-accepted, a neutral reply stays there.
  const currentProgress = PROGRESS[currentStage] ?? 0;
  const classifiedProgress = PROGRESS[classified] ?? 0;
  if (classified !== "declined" && classifiedProgress <= currentProgress) return null;

  return classified;
}

// A customer who says they might harm themselves gets a caring answer, never the agent's "I can't help with that": when
// NVIDIA NeMo Guardrails blocks such a message, this is what they're told instead (src/platform/chat/converse.ts).

/** Whether a message speaks of suicide or self-harm ("I want to die", "kill myself", "hurt myself"). */
export function speaksOfSelfHarm(message: string): boolean {
  const text = message.replace(/[\u2018\u2019\u02bc]/g, "'");
  return /\b(?:kill(?:ing)? myself|(?:want(?:ed)?|wanna|going) to die|end(?:ing)? (?:my life|it all)|suicid\w*|take my (?:own )?life|hurt(?:ing)? myself|self[- ]?harm\w*|(?:don'?t|do not) want to (?:live|be alive|be here))\b/i.test(text);
}

/** What they're told: that someone can help now, and where; no specific number, since the country isn't known. */
export const SELF_HARM_REPLY =
  "I'm really sorry you're feeling this way, and I'm glad you said something. You don't have to face this alone: if you're in danger or might act on these thoughts, please call your local emergency number now, or reach a crisis line in your country, where someone can talk with you straight away. If there's anything else I can help with, I'm here.";

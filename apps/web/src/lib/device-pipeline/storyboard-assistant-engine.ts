import type { DeviceBook } from "@/components/device/device-types";
import type { ProviderKeys } from "@/components/device/provider-vault";

type ChatMessage = NonNullable<DeviceBook["assistantMessages"]>[number];

export async function generateStoryboardAssistantReply(keys: ProviderKeys, messages: ChatMessage[], instruction: string) {
  const context = messages.slice(-10).map(message => `${message.role}: ${message.text}`).join("\n");
  const prompt = `You are Litera's storyboard assistant. Help improve a converted book while preserving the source page's composition, typography, imagery, reading order, and accessibility. The user's instruction is already queued; respond briefly with what you understood and what the storyboard pass will inspect or change. Never claim work is complete. Format naturally using WhatsApp conventions: *bold*, _italic_, ~strikethrough~, bullet lines, and inline \`code\` only when useful.\n\nConversation:\n${context}\nuser: ${instruction}`;
  if (keys.openai) return callOpenAi(keys.openai, prompt);
  if (keys.gemini) return callGemini(keys.gemini, prompt);
  if (keys.anthropic) return callAnthropic(keys.anthropic, prompt);
  throw new Error("Unlock an AI provider before chatting with the storyboard assistant.");
}

async function request(input: string, init: RequestInit) {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
    ? (await import("@tauri-apps/plugin-http")).fetch(input, init)
    : fetch(input, init);
}

async function callOpenAi(key: string, prompt: string) {
  const response = await request("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "gpt-5.4", input: prompt, max_output_tokens: 700 }) });
  const data = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }>; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || "OpenAI could not answer.");
  return data.output_text ?? data.output?.flatMap(item => item.content ?? []).map(item => item.text ?? "").join("") ?? "";
}

async function callGemini(key: string, prompt: string) {
  const response = await request("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent", { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.25, maxOutputTokens: 700 } }) });
  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || "Gemini could not answer.");
  return data.candidates?.[0]?.content?.parts?.map(part => part.text ?? "").join("") ?? "";
}

async function callAnthropic(key: string, prompt: string) {
  const response = await request("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true", "x-api-key": key }, body: JSON.stringify({ model: "claude-3-5-sonnet-latest", max_tokens: 700, temperature: 0.25, messages: [{ role: "user", content: prompt }] }) });
  const data = await response.json() as { content?: Array<{ type: string; text?: string }>; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || "Anthropic could not answer.");
  return data.content?.filter(item => item.type === "text").map(item => item.text ?? "").join("") ?? "";
}

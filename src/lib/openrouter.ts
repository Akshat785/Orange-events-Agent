import OpenAI from "openai";

let _client: OpenAI | null = null;

export function getOpenRouter() {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
        "X-Title": "Orange Events WhatsApp Agent",
      },
    });
  }
  return _client;
}

export const AI_MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

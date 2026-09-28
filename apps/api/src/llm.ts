/**
 * One prompt, one answer, on whichever provider `models.ts` picked.
 *
 * `models.ts` reads a document; this reads nothing but the text it is given.
 * Kept separate because the two have almost nothing in common once the PDF is
 * gone — no span to verify against a document's own bytes, no `jsonHint` to
 * build for a sixteen-field schema — and grafting a text-only path onto a
 * module whose every comment is about reading a policy schedule would make
 * that module about two things instead of one.
 *
 * Same rules as everywhere else in this codebase: temperature 0, because a
 * question about someone's policy should get the same answer twice, and no
 * fallback between providers — a plausible-but-wrong answer from a second
 * provider is worse than a clear failure from the first.
 */

import Anthropic from "@anthropic-ai/sdk";
import { accessToken, chosen, type Chosen } from "./models.js";

export interface ChatResult {
  text: string;
  used: Chosen;
}

async function viaGemini(
  model: string,
  system: string,
  user: string,
  endpoint?: { url: string; headers: Record<string, string>; name: string },
): Promise<string> {
  const name = endpoint?.name ?? "Gemini";
  const url =
    endpoint?.url ??
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const auth = endpoint?.headers ?? { "x-goog-api-key": process.env.GEMINI_API_KEY! };

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...auth },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 2048 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw Object.assign(
      new Error(`${name} refused the request: ${res.status} ${detail.slice(0, 300)}`),
      { status: res.status === 429 ? 429 : 502 },
    );
  }

  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  };
  const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  if (!text.trim()) {
    throw Object.assign(new Error(`${name} returned an empty answer.`), { status: 502 });
  }
  return text;
}

async function viaVertex(model: string, system: string, user: string): Promise<string> {
  const project = (process.env.VERTEX_PROJECT ?? "").trim();
  const location = (process.env.VERTEX_LOCATION ?? "us-central1").trim();
  const url =
    `https://${location}-aiplatform.googleapis.com/v1/projects/${project}` +
    `/locations/${location}/publishers/google/models/${model}:generateContent`;

  return viaGemini(model, system, user, {
    url,
    headers: { authorization: `Bearer ${await accessToken()}` },
    name: "Vertex",
  });
}

/** OpenRouter and Groq both speak the OpenAI chat-completions protocol. */
const OPENAI_COMPATIBLE = {
  groq: { name: "Groq", url: "https://api.groq.com/openai/v1/chat/completions", key: "GROQ_API_KEY" },
  openrouter: { name: "OpenRouter", url: "https://openrouter.ai/api/v1/chat/completions", key: "OPENROUTER_API_KEY" },
} as const;

async function viaOpenAiCompatible(
  which: keyof typeof OPENAI_COMPATIBLE,
  model: string,
  system: string,
  user: string,
): Promise<string> {
  const { name, url, key } = OPENAI_COMPATIBLE[which];

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env[key]!}`,
      // OpenRouter's attribution headers; ignored by Groq.
      "x-title": "ClaimCast",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 2048,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw Object.assign(
      new Error(`${name} refused the request: ${res.status} ${detail.slice(0, 300)}`),
      { status: res.status === 429 ? 429 : 502 },
    );
  }

  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = body.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) {
    throw Object.assign(new Error(`${name} returned an empty answer.`), { status: 502 });
  }
  return text;
}

async function viaAnthropic(model: string, system: string, user: string): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const res = await client.messages.create({
    model,
    max_tokens: 2048,
    temperature: 0,
    system,
    messages: [{ role: "user", content: user }],
  });
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text" || !block.text.trim()) {
    throw Object.assign(new Error("The model returned no answer."), { status: 502 });
  }
  return block.text;
}

/**
 * Ask whichever provider is configured, with a system prompt and a user turn.
 * Throws the same `{ status }`-tagged errors `models.ts` does, for the same
 * reason: a route above this can turn a 503 into "not configured on this
 * server" and a 502 into "could not be answered" without inspecting the text.
 */
export async function chat(system: string, user: string): Promise<ChatResult> {
  // The chatbox runs on OpenRouter whenever a key for it is set -- Llama 3.3 70B
  // by default -- whatever reads the policy schedules.
  const pick: Chosen | null = process.env.OPENROUTER_API_KEY
    ? { provider: "openrouter", model: process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct" }
    : chosen();
  if (!pick) {
    throw Object.assign(
      new Error(
        "No model provider is configured. Set VERTEX_PROJECT, or one of " +
          "GEMINI_API_KEY, ANTHROPIC_API_KEY or GROQ_API_KEY.",
      ),
      { status: 503 },
    );
  }

  const text =
    pick.provider === "vertex"
      ? await viaVertex(pick.model, system, user)
      : pick.provider === "gemini"
        ? await viaGemini(pick.model, system, user)
        : pick.provider === "anthropic"
          ? await viaAnthropic(pick.model, system, user)
          : pick.provider === "openrouter"
            ? await viaOpenAiCompatible("openrouter", pick.model, system, user)
            : await viaOpenAiCompatible("groq", pick.model, system, user);

  return { text, used: pick };
}

import { config } from "./config.js";

// The API key stays on the server. The browser never sees it and cannot send
// arbitrary prompts — every prompt is built here.
async function callClaude(content, maxTokens = 1500) {
  const res = await fetch(`${config.anthropic.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.anthropic.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.anthropic.model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Tagged so the route can turn this into something the reader can act on
    // rather than a generic failure.
    const err = new Error(`Anthropic API returned ${res.status}`);
    err.code = "ANTHROPIC_ERROR";
    err.status = res.status;
    err.detail = body.slice(0, 400);
    throw err;
  }
  const data = await res.json();
  return (data.content || [])
    .filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}

function parseJSON(text) {
  const clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  return JSON.parse(clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1));
}

export const aiEnabled = () => config.anthropic.enabled;

// The document block goes before the text block, which is what the Messages
// API expects. `media` is { kind: "document" | "image", mime, data }.
export async function askClaudeDocumentJSON(media, prompt, maxTokens = 2000) {
  const source = { type: "base64", media_type: media.mime, data: media.data };
  const text = await callClaude(
    [
      media.kind === "image" ? { type: "image", source } : { type: "document", source },
      { type: "text", text: prompt },
    ],
    maxTokens
  );
  return parseJSON(text);
}

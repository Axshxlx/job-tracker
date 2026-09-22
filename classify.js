import { z } from "zod";

const OLLAMA_URL = "http://localhost:11434/api/chat";
const MODEL = "job-classifier";
const MAX_BODY_CHARS = 1500;

const resultSchema = z.object({
  job_related: z.boolean(),
  company: z.string().nullable(),
  role: z.string().nullable(),
  status: z.enum(["applied", "interview", "rejected", "accepted", "neutral"]),
});

export async function classifyEmail({ subject, from, body }) {
  const content =
    `From: ${from}\nSubject: ${subject}\n\n${body.slice(0, MAX_BODY_CHARS)}`;

  const res = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content }],
      stream: false,
      think: false,
      format: "json",
    }),
  });
  if (!res.ok) throw new Error(`Ollama returned ${res.status}`);

  const data = await res.json();
  
  console.log({
    load_s: data.load_duration / 1e9,
    prompt_tokens: data.prompt_eval_count,
    prompt_s: data.prompt_eval_duration / 1e9,
    output_tokens: data.eval_count,
    output_s: data.eval_duration / 1e9,
    thinking: !!data.message.thinking,
  });
  return resultSchema.parse(JSON.parse(data.message.content));
}

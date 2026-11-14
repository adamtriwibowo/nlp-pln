import { z } from "zod";

import { ApiError, CitationSchema, detailOf } from "./api";

export const StepSchema = z.object({
  tool: z.string(),
  args: z.record(z.string(), z.unknown()),
  found: z.array(z.string()),
  summary: z.string(),
});
export type AgentStep = z.infer<typeof StepSchema>;

export const BadgeSchema = z.enum(["supported", "limited", "not_found"]);
export type Badge = z.infer<typeof BadgeSchema>;

export const DoneSchema = z.object({
  query_id: z.number(),
  abstained: z.boolean(),
  abstain_reason: z.string(),
  confidence: z.number(),
  badge: BadgeSchema,
  latency_ms: z.number(),
  config: z.string(),
});
export type DoneMeta = z.infer<typeof DoneSchema>;

export type AskEvent =
  | { type: "agent_steps"; data: AgentStep }
  | { type: "token"; data: { text: string } }
  | { type: "citations"; data: z.infer<typeof CitationSchema>[] }
  | { type: "done"; data: DoneMeta }
  | { type: "error"; data: { message: string; type: string } };

const parsers: Record<AskEvent["type"], (raw: unknown) => AskEvent["data"]> = {
  agent_steps: (r) => StepSchema.parse(r),
  token: (r) => z.object({ text: z.string() }).parse(r),
  citations: (r) => z.array(CitationSchema).parse(r),
  done: (r) => DoneSchema.parse(r),
  error: (r) => z.object({ message: z.string(), type: z.string() }).parse(r),
};

/** Parse one SSE block ("event: x\ndata: {...}") into a validated event, or null if unknown. */
export function parseSseBlock(block: string): AskEvent | null {
  let event = "";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (!event || data.length === 0 || !(event in parsers)) return null;
  const type = event as AskEvent["type"];
  return { type, data: parsers[type](JSON.parse(data.join("\n"))) } as AskEvent;
}

export interface AskBody {
  question: string;
  mode: "standard" | "agentic";
}

/** POST /api/ask and deliver validated events as they arrive (EventSource cannot POST). */
export async function streamAsk(
  body: AskBody,
  onEvent: (e: AskEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
    credentials: "same-origin",
    signal,
  });
  if (!res.ok || !res.body) {
    const err: unknown = await res.json().catch(() => null);
    throw new ApiError(res.status, detailOf(err, res.status));
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value.replaceAll("\r\n", "\n");
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const ev = parseSseBlock(block);
      if (ev) onEvent(ev);
    }
  }
  const tail = parseSseBlock(buffer.trim());
  if (tail) onEvent(tail);
}

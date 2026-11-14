"use client";

import { ChevronDown, Search } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { AgentStep } from "@/lib/sse";

export function describeStep(s: AgentStep): string {
  if (s.tool === "search_regulations")
    return `Mencari: “${String(s.args.query ?? "")}”`;
  if (s.tool === "get_chunk") return `Membaca ${String(s.args.chunk_id ?? "")}`;
  if (s.tool === "list_documents") return "Melihat daftar dokumen";
  return s.tool;
}

/** Collapsible "search steps" panel for agentic mode (order of tool calls + what was found). */
export function AgentSteps({
  steps,
  running,
}: {
  steps: AgentStep[];
  running: boolean;
}) {
  if (steps.length === 0 && !running) return null;
  return (
    <Collapsible
      defaultOpen={running}
      className="rounded-xl border border-line bg-surface"
    >
      <CollapsibleTrigger className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-4 text-left text-sm font-semibold">
        <span className="flex items-center gap-2">
          <Search className="size-4 text-cite" aria-hidden="true" />
          Langkah pencarian ({steps.length}){running ? " …" : ""}
        </span>
        <ChevronDown className="size-4" aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol
          data-testid="agent-steps"
          className="m-0 flex list-none flex-col gap-2 px-4 pb-4 pt-1 text-sm"
        >
          {steps.map((s, i) => (
            <li
              key={i}
              className="flex flex-col gap-0.5 border-l-2 border-line pl-3"
            >
              <span className="font-medium">
                {i + 1}. {describeStep(s)}
              </span>
              <span className="text-[13px] text-ink-muted">{s.summary}</span>
            </li>
          ))}
          {steps.length === 0 ? (
            <li className="text-ink-muted">Menunggu langkah pertama…</li>
          ) : null}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}

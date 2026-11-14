"use client";

import { useCallback, useRef, useState } from "react";

import { ApiError, type Citation } from "./api";
import { streamAsk, type AgentStep, type AskBody, type DoneMeta } from "./sse";

export type AskState =
  | { status: "idle" }
  | {
      status: "loading";
      question: string;
      mode: AskBody["mode"];
      steps: AgentStep[];
    }
  | {
      status: "done";
      question: string;
      mode: AskBody["mode"];
      steps: AgentStep[];
      answer: string;
      citations: Citation[];
      meta: DoneMeta;
    }
  | {
      status: "error";
      question: string;
      mode: AskBody["mode"];
      message: string;
      httpStatus?: number;
    };

export interface FinishedAnswer {
  question: string;
  mode: AskBody["mode"];
  steps: AgentStep[];
  answer: string;
  citations: Citation[];
  meta: DoneMeta;
}

/** Streams /api/ask. The answer text grows while tokens arrive; sources appear at the end. */
export function useAsk(onFinished?: (a: FinishedAnswer) => void) {
  const [state, setState] = useState<AskState>({ status: "idle" });
  const [partial, setPartial] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (question: string, mode: AskBody["mode"]) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const steps: AgentStep[] = [];
      let answer = "";
      let citations: Citation[] = [];
      setPartial("");
      setState({ status: "loading", question, mode, steps: [] });
      try {
        await streamAsk(
          { question, mode },
          (e) => {
            if (e.type === "agent_steps") {
              steps.push(e.data);
              setState({
                status: "loading",
                question,
                mode,
                steps: [...steps],
              });
            } else if (e.type === "token") {
              answer += e.data.text;
              setPartial(answer);
            } else if (e.type === "citations") {
              citations = e.data;
            } else if (e.type === "error") {
              throw new ApiError(500, e.data.message);
            } else if (e.type === "done") {
              const finished = {
                question,
                mode,
                steps: [...steps],
                answer,
                citations,
                meta: e.data,
              };
              setState({ status: "done", ...finished });
              onFinished?.(finished);
            }
          },
          ctrl.signal,
        );
      } catch (err) {
        if (ctrl.signal.aborted) return;
        if (err instanceof ApiError) {
          setState({
            status: "error",
            question,
            mode,
            message: err.message,
            httpStatus: err.status,
          });
        } else {
          setState({
            status: "error",
            question,
            mode,
            message: "Koneksi terputus.",
            httpStatus: 0,
          });
        }
      }
    },
    [onFinished],
  );

  const restore = useCallback((f: FinishedAnswer) => {
    abortRef.current?.abort();
    setPartial(f.answer);
    setState({ status: "done", ...f });
  }, []);

  return { state, partial, run, restore };
}

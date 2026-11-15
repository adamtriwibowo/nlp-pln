import { z } from "zod";

import { ApiError, detailOf, JobSchema, type Job } from "./api";

/** JSON call with Zod validation of the response; non-2xx becomes an ApiError with the server text. */
async function call<T>(
  schema: z.ZodType<T>,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, detailOf(data, res.status));
  return schema.parse(data);
}

// ---- dataset ----------------------------------------------------------------------------

export const QA_TYPES = ["factual", "multihop", "unanswerable"] as const;
export const QA_SPLITS = ["dev", "test"] as const;

export const QAItemSchema = z.object({
  id: z.string(),
  question: z.string(),
  reference_answer: z.string(),
  gold_chunk_ids: z.array(z.string()),
  type: z.enum(QA_TYPES),
  split: z.enum(QA_SPLITS),
  source_note: z.string(),
});
export type QAItem = z.infer<typeof QAItemSchema>;

export const QAViewSchema = z.object({
  items: z.array(QAItemSchema),
  stats: z.object({
    total: z.number(),
    target_min: z.number(),
    by_split: z.object({ dev: z.number(), test: z.number() }),
    by_type: z.object({
      factual: z.number(),
      multihop: z.number(),
      unanswerable: z.number(),
    }),
    cross: z.record(z.string(), z.number()),
  }),
  next_id: z.string(),
  frozen: z
    .object({ frozen_at: z.string(), n_test: z.number(), sha256: z.string() })
    .nullable(),
  integrity: z.enum(["not_frozen", "ok", "modified"]),
});
export type QAView = z.infer<typeof QAViewSchema>;

export const fetchQA = () => call(QAViewSchema, "GET", "/api/admin/qa");
export const createQA = (item: QAItem) =>
  call(QAViewSchema, "POST", "/api/admin/qa", item);
export const updateQA = (item: QAItem) =>
  call(
    QAViewSchema,
    "PUT",
    `/api/admin/qa/${encodeURIComponent(item.id)}`,
    item,
  );
export const deleteQA = (id: string) =>
  call(QAViewSchema, "DELETE", `/api/admin/qa/${encodeURIComponent(id)}`);
export const freezeTest = () =>
  call(QAViewSchema, "POST", "/api/admin/qa/freeze");

export const CandidateSchema = z.object({
  rank: z.number(),
  chunk_id: z.string(),
  ref: z.string(),
  doc_title: z.string(),
  page_start: z.number(),
  score: z.number(),
  snippet: z.string(),
});
export type Candidate = z.infer<typeof CandidateSchema>;
export const fetchCandidates = (q: string, k = 8) =>
  call(
    z.array(CandidateSchema),
    "GET",
    `/api/admin/qa/candidates?q=${encodeURIComponent(q)}&k=${k}`,
  );

// ---- playground -------------------------------------------------------------------------

export const PlaygroundSchema = z.object({
  question: z.string(),
  config: z.string(),
  generated: z.boolean(),
  retrieval_ms: z.number(),
  ranking: z.array(
    z.object({
      rank: z.number(),
      chunk_id: z.string(),
      ref: z.string(),
      doc_title: z.string(),
      page_start: z.number(),
      score: z.number(),
      api_allowed: z.boolean(),
      is_gold: z.boolean(),
      snippet: z.string(),
    }),
  ),
  gold: z
    .object({
      ids: z.array(z.string()),
      found: z.record(z.string(), z.number().nullable()),
      best_rank: z.number().nullable(),
      depth: z.number(),
    })
    .nullable(),
  answer: z
    .object({
      answer: z.string(),
      abstained: z.boolean(),
      confidence: z.number(),
      abstain_reason: z.string(),
      audit_removed: z.array(z.string()),
      citations: z.array(
        z.object({
          label: z.number(),
          chunk_id: z.string(),
          quote: z.string(),
          ref: z.string(),
          in_context: z.boolean(),
          quote_verified: z.boolean(),
          is_gold: z.boolean(),
        }),
      ),
    })
    .nullable(),
  steps: z.array(
    z.object({
      tool: z.string(),
      args: z.record(z.string(), z.unknown()),
      found: z.array(z.string()),
      summary: z.string(),
    }),
  ),
  usage: z
    .object({
      model: z.string(),
      input_tokens: z.number(),
      output_tokens: z.number(),
      cost_usd: z.number(),
      latency_ms: z.number(),
    })
    .nullable(),
});
export type PlaygroundResult = z.infer<typeof PlaygroundSchema>;

export interface PlaygroundInput {
  question: string;
  config_id: string;
  generate: boolean;
  gold_chunk_ids: string[];
  audit?: boolean;
}
export const runPlayground = (body: PlaygroundInput) =>
  call(PlaygroundSchema, "POST", "/api/admin/playground", body);

// ---- configuration and evaluation jobs -----------------------------------------------------

export const ConfigSchema = z.object({
  configs: z.array(
    z.object({
      id: z.string(),
      retriever: z.string(),
      mode: z.string(),
      top_k: z.number(),
      seed: z.number(),
      stem: z.boolean(),
      rrf_k: z.number(),
      candidate_k: z.number(),
      exclude_kinds: z.array(z.string()),
      embedding_model: z.string().nullable(),
      reranker_model: z.string(),
    }),
  ),
  models: z.object({
    llm_model: z.string(),
    judge_model: z.string(),
    embedding_provider: z.string(),
    embedding_model: z.string(),
    reranker_model: z.string(),
  }),
  secrets_set: z.record(z.string(), z.boolean()),
  limits: z.object({
    daily_cost_limit_usd: z.number(),
    daily_cost_used_usd: z.number(),
    ask_rate_per_min: z.number(),
    login_rate_per_min: z.number(),
  }),
  corpus: z.object({
    versions: z.array(z.string()),
    chunks: z.number(),
    documents_indexed: z.number(),
    embeddings: z.array(z.object({ model: z.string(), count: z.number() })),
  }),
  prompts: z.object({ answer: z.string(), judge: z.string() }),
  tracing_enabled: z.boolean(),
  warnings: z.array(z.string()),
});
export type ConfigSummary = z.infer<typeof ConfigSchema>;
export const fetchConfig = () => call(ConfigSchema, "GET", "/api/admin/config");

export interface EvalInput {
  config_id: string;
  kind: "retrieval" | "generation";
  split: "dev";
}
export const EstimateSchema = z.object({
  n_questions: z.number(),
  est_cost_usd: z.number(),
  note: z.string(),
});
export const estimateEval = (b: EvalInput) =>
  call(EstimateSchema, "POST", "/api/admin/evals/estimate", b);
export const startEval = (b: EvalInput): Promise<Job> =>
  call(JobSchema, "POST", "/api/admin/evals", b);

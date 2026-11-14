import createClient from "openapi-fetch";
import { z } from "zod";

import type { paths } from "./api-types";

/** Typed client generated from docs/openapi.json (`pnpm gen-api`). Relative URLs: same origin. */
export const client = createClient<paths>({
  baseUrl: "",
  credentials: "same-origin",
});

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Turn an openapi-fetch result into data, or throw an ApiError with the server's message. */
export function unwrap<T>(res: {
  data?: T;
  error?: unknown;
  response: Response;
}): T {
  if (res.error !== undefined || res.data === undefined) {
    throw new ApiError(
      res.response.status,
      detailOf(res.error, res.response.status),
    );
  }
  return res.data;
}

export function detailOf(error: unknown, status: number): string {
  if (error && typeof error === "object" && "detail" in error) {
    const d = (error as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d[0] && typeof d[0] === "object" && "msg" in d[0]) {
      return String((d[0] as { msg: unknown }).msg);
    }
  }
  return `Permintaan gagal (HTTP ${status}).`;
}

// ---- Runtime schemas (validate what the UI depends on) ---------------------------------

export const Role = z.enum(["admin", "reviewer"]);
export const MeSchema = z.object({
  role: Role.nullable(),
  name: z.string().nullable(),
});
export type Me = z.infer<typeof MeSchema>;

export const DocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  publisher: z.string().nullable(),
  lang: z.string(),
  status: z.string().nullable(),
  source_url: z.string().nullable(),
  indexed: z.boolean(),
});
export type CorpusDocument = z.infer<typeof DocumentSchema>;

export const BoxSchema = z.object({
  page: z.number(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
});
export type PageBox = z.infer<typeof BoxSchema>;

export const ChunkSchema = z.object({
  chunk_id: z.string(),
  doc_id: z.string(),
  doc_title: z.string(),
  label: z.string(),
  page_start: z.number(),
  page_end: z.number(),
  bbox: z.array(BoxSchema).nullable(),
  text: z.string(),
  ocr_noisy: z.boolean(),
});
export type Chunk = z.infer<typeof ChunkSchema>;

export const CitationSchema = z.object({
  label: z.number(),
  chunk_id: z.string(),
  quote: z.string(),
  ref: z.string(),
  doc_id: z.string().nullable(),
  doc_title: z.string().nullable(),
  page_start: z.number().nullable(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const ReviewCitationSchema = z.object({
  label: z.number(),
  chunk_id: z.string(),
  quote: z.string(),
  ref: z.string().optional(),
  doc_title: z.string().optional(),
  page_start: z.number().nullable().optional(),
  text: z.string().optional(),
});
export const ReviewResponseSchema = z.object({
  item: z
    .object({
      item_id: z.number(),
      question: z.string(),
      answer: z.object({
        answer: z.string(),
        abstained: z.boolean(),
        citations: z.array(ReviewCitationSchema),
      }),
    })
    .nullable(),
  progress: z.object({ done: z.number(), total: z.number() }),
});
export type ReviewResponse = z.infer<typeof ReviewResponseSchema>;

export const AdminDocSchema = z.object({
  id: z.string(),
  title: z.string(),
  lang: z.string(),
  file: z.string().nullable(),
  file_present: z.boolean(),
  sha256: z.string().nullable(),
  index: z.boolean(),
  api_allowed: z.boolean(),
  ingested: z.boolean(),
  chunks: z.number(),
  status_berlaku: z.string(),
  note: z.string().nullable(),
});
export type AdminDoc = z.infer<typeof AdminDocSchema>;

export const JobSchema = z.object({
  id: z.string(),
  status: z.enum(["queued", "running", "done", "failed"]),
  log: z.array(z.string()),
  error: z.string().nullable(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
});
export type Job = z.infer<typeof JobSchema>;

export const EvalRunSchema = z.object({
  run_id: z.string(),
  config: z.string(),
  corpus_version: z.string().nullable(),
  models: z.record(z.string(), z.unknown()).nullable(),
  metrics: z.record(z.string(), z.record(z.string(), z.number())).nullable(),
  created_at: z.string(),
});
export type EvalRun = z.infer<typeof EvalRunSchema>;

// ---- Calls ------------------------------------------------------------------------------

export async function fetchMe(): Promise<Me> {
  return MeSchema.parse(unwrap(await client.GET("/api/auth/me")));
}

export async function login(token: string, name?: string): Promise<Me> {
  return MeSchema.parse(
    unwrap(await client.POST("/api/auth/login", { body: { token, name } })),
  );
}

export async function logout(): Promise<void> {
  await client.POST("/api/auth/logout");
}

export async function fetchDocuments(): Promise<CorpusDocument[]> {
  return z
    .array(DocumentSchema)
    .parse(unwrap(await client.GET("/api/documents")));
}

export async function fetchChunk(chunkId: string): Promise<Chunk> {
  const res = await client.GET("/api/chunks/{chunk_id}", {
    params: { path: { chunk_id: chunkId } },
  });
  return ChunkSchema.parse(unwrap(res));
}

export async function sendFeedback(
  queryId: number,
  thumbs: 1 | -1,
  comment?: string,
): Promise<void> {
  unwrap(
    await client.POST("/api/feedback", {
      body: { query_id: queryId, thumbs, comment },
    }),
  );
}

export async function fetchReviewItem(): Promise<ReviewResponse> {
  return ReviewResponseSchema.parse(
    unwrap(await client.GET("/api/review/items")),
  );
}

export interface ScoreInput {
  item_id: number;
  correctness: number;
  completeness: number;
  usefulness: number;
  citation_ok: boolean;
  comment?: string;
}

export async function submitScore(body: ScoreInput): Promise<void> {
  unwrap(await client.POST("/api/review/scores", { body }));
}

export async function fetchAdminDocs(): Promise<AdminDoc[]> {
  return z
    .array(AdminDocSchema)
    .parse(unwrap(await client.GET("/api/admin/documents")));
}

export async function startReindex(): Promise<Job> {
  return JobSchema.parse(unwrap(await client.POST("/api/admin/reindex")));
}

export async function fetchJob(id: string): Promise<Job> {
  const res = await client.GET("/api/admin/jobs/{job_id}", {
    params: { path: { job_id: id } },
  });
  return JobSchema.parse(unwrap(res));
}

export async function fetchEvalRuns(): Promise<EvalRun[]> {
  return z
    .array(EvalRunSchema)
    .parse(unwrap(await client.GET("/api/admin/eval-runs")));
}

/** Multipart upload (openapi-fetch does not model FormData well, so plain fetch). */
export async function uploadDocument(
  form: FormData,
): Promise<{ id: string; file: string }> {
  const r = await fetch("/api/admin/documents", {
    method: "POST",
    body: form,
    credentials: "same-origin",
  });
  const body: unknown = await r.json().catch(() => null);
  if (!r.ok) throw new ApiError(r.status, detailOf(body, r.status));
  return z.object({ id: z.string(), file: z.string() }).parse(body);
}

"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchJob, type Job } from "@/lib/api";

const LABEL: Record<Job["status"], string> = {
  queued: "Antre",
  running: "Berjalan",
  done: "Selesai",
  failed: "Gagal",
};

/** Polls a background job until it finishes. */
export function useJobPolling(jobId: string | null) {
  return useQuery({
    queryKey: ["job", jobId],
    queryFn: () => fetchJob(jobId!),
    enabled: jobId !== null,
    refetchInterval: (q) =>
      q.state.data && ["done", "failed"].includes(q.state.data.status)
        ? false
        : 1500,
  });
}

export const isRunning = (job?: Job) =>
  job?.status === "queued" || job?.status === "running";

export function JobBox({
  job,
  testId = "job-status",
}: {
  job: Job;
  testId?: string;
}) {
  const tone =
    job.status === "failed"
      ? "bg-danger-tint text-danger"
      : job.status === "done"
        ? "bg-ok-tint text-ok"
        : "bg-warn-tint text-warn";
  const lines = [...job.log, ...(job.error ? [`GALAT: ${job.error}`] : [])];
  return (
    <div className="flex flex-col gap-2">
      <span
        role="status"
        data-testid={testId}
        className={`w-fit rounded-full px-3 py-1 text-[13px] font-semibold ${tone}`}
      >
        {LABEL[job.status]}
      </span>
      <pre className="m-0 max-h-48 overflow-auto rounded-lg bg-surface-2 p-3 text-[13px] leading-relaxed">
        {lines.join("\n") || "…"}
      </pre>
    </div>
  );
}

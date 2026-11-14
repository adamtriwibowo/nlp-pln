"use client";

import { useMutation } from "@tanstack/react-query";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendFeedback } from "@/lib/api";

export function FeedbackBar({ queryId }: { queryId: number }) {
  const [thumbs, setThumbs] = useState<1 | -1 | null>(null);
  const [comment, setComment] = useState("");
  const id = useId();
  const send = useMutation({
    mutationFn: () =>
      sendFeedback(queryId, thumbs as 1 | -1, comment.trim() || undefined),
  });

  if (send.isSuccess) {
    return (
      <p role="status" className="m-0 text-sm text-ink-muted">
        Terima kasih atas umpan balik Anda.
      </p>
    );
  }
  const thumb = (value: 1 | -1, label: string, Icon: typeof ThumbsUp) => (
    <Button
      type="button"
      variant="outline"
      aria-label={label}
      aria-pressed={thumbs === value}
      onClick={() => setThumbs(value)}
      className={`size-11 min-h-11 rounded-xl ${thumbs === value ? "border-cite bg-cite-tint text-cite" : ""}`}
    >
      <Icon className="size-5" aria-hidden="true" />
    </Button>
  );
  return (
    <div className="flex flex-col gap-3 text-sm text-ink-muted">
      <div className="flex flex-wrap items-center gap-3">
        <span>Apakah jawaban ini membantu?</span>
        {thumb(1, "Membantu", ThumbsUp)}
        {thumb(-1, "Tidak membantu", ThumbsDown)}
      </div>
      {thumbs !== null ? (
        <div className="flex max-w-xl flex-col gap-2">
          <label htmlFor={id} className="text-[13px]">
            Komentar (opsional)
          </label>
          <Textarea
            id={id}
            value={comment}
            maxLength={500}
            rows={2}
            onChange={(e) => setComment(e.target.value)}
            className="border-field bg-surface text-base text-ink"
          />
          <div className="flex items-center gap-3">
            <Button
              type="button"
              disabled={send.isPending}
              onClick={() => send.mutate()}
              className="min-h-11 rounded-xl bg-brand px-5 font-semibold text-brand-ink hover:bg-brand/90"
            >
              Kirim umpan balik
            </Button>
            {send.isError ? (
              <span role="alert" className="text-danger">
                Gagal mengirim. Coba lagi.
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

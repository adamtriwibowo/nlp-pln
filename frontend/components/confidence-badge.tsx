import { AlertTriangle, Check, SearchX } from "lucide-react";

import { BADGE_LABEL } from "@/lib/answer";
import type { Badge } from "@/lib/sse";

const STYLE: Record<Badge, string> = {
  supported: "bg-ok-tint text-ok",
  limited: "bg-warn-tint text-warn",
  not_found: "bg-warn-tint text-warn",
};

export function ConfidenceBadge({ badge }: { badge: Badge }) {
  const Icon =
    badge === "supported"
      ? Check
      : badge === "limited"
        ? AlertTriangle
        : SearchX;
  return (
    <span
      data-testid="confidence-badge"
      data-badge={badge}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold ${STYLE[badge]}`}
    >
      <Icon className="size-4" aria-hidden="true" />
      {BADGE_LABEL[badge]}
    </span>
  );
}

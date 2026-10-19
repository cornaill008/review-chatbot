"use client";

import { ChevronDown, Quote } from "lucide-react";
import { useId, useState } from "react";
import SourceCard from "@/components/SourceCard";
import type { SourceReview } from "@/lib/types";

/** 답변의 근거 리뷰를 "참고 리뷰 N건" 배지와 함께 접고 펼친다. 근거가 없으면 아무것도 그리지 않는다. */
export default function SourceAccordion({ sources }: { sources: SourceReview[] }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  if (sources.length === 0) return null;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        <Quote aria-hidden className="size-3.5 text-indigo-600" />
        <span data-testid="source-badge">참고 리뷰 {sources.length}건</span>
        <ChevronDown aria-hidden className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <div id={panelId} hidden={!open} className="mt-2 flex flex-col gap-2">
        {sources.map((review, i) => (
          <SourceCard key={review.id} review={review} index={i + 1} />
        ))}
      </div>
    </div>
  );
}

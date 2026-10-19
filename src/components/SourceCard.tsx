import { Star } from "lucide-react";
import type { SourceReview } from "@/lib/types";

const MAX_STARS = 5;

export default function SourceCard({ review, index }: { review: SourceReview; index: number }) {
  const filled = Math.max(0, Math.min(MAX_STARS, Math.round(review.rating)));

  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          [{index}]
        </span>
        <span role="img" aria-label={`평점 ${review.rating}점`} className="inline-flex items-center gap-0.5">
          {Array.from({ length: MAX_STARS }, (_, i) => (
            <Star
              key={i}
              aria-hidden
              className={`size-3.5 ${i < filled ? "fill-amber-400 text-amber-400" : "text-zinc-300 dark:text-zinc-600"}`}
            />
          ))}
          <span className="ml-1 text-xs text-zinc-500 dark:text-zinc-400">{review.rating}</span>
        </span>
        {review.author && <span className="text-xs text-zinc-500 dark:text-zinc-400">{review.author}</span>}
      </header>
      <h4 className="mt-1.5 font-semibold">{review.title}</h4>
      <p className="mt-0.5 whitespace-pre-wrap text-zinc-600 dark:text-zinc-300">{review.content}</p>
    </article>
  );
}

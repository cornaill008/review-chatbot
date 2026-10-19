import { Calendar, Star, Target, User } from "lucide-react";
import type { ReactNode } from "react";
import ExpandableText from "@/components/ExpandableText";
import { formatReviewDate, toMatchPercent } from "@/lib/format";
import type { SourceReview } from "@/lib/types";

const MAX_STARS = 5;

function MetaTag({ icon, testId, children }: { icon: ReactNode; testId: string; children: ReactNode }) {
  return (
    <li
      data-testid={testId}
      className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
    >
      {icon}
      {children}
    </li>
  );
}

export default function SourceCard({ review, index }: { review: SourceReview; index: number }) {
  const filled = Math.max(0, Math.min(MAX_STARS, Math.round(review.rating)));
  const author = review.author?.trim();
  const date = formatReviewDate(review.date);
  const percent = toMatchPercent(review.score);

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
              data-filled={i < filled}
              className={`size-3.5 ${i < filled ? "fill-amber-400 text-amber-400" : "text-zinc-300 dark:text-zinc-600"}`}
            />
          ))}
          <span className="ml-1 text-xs text-zinc-500 dark:text-zinc-400">{review.rating}</span>
        </span>
        {percent !== null && (
          <span
            data-testid="match-badge"
            title={`검색 점수 ${(percent / 100).toFixed(2)} · 키워드 관련도와 도움이 됨 수를 조합한 표시용 점수이며, 의미 유사도는 아닙니다`}
            className="ml-auto inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
          >
            <Target aria-hidden className="size-3" />
            <span>{percent}% 일치</span>
            <span className="sr-only">. 키워드 관련도와 도움이 됨 수를 조합한 표시용 점수이며 의미 유사도는 아닙니다</span>
          </span>
        )}
      </header>

      {(author || date) && (
        <ul aria-label="리뷰 정보" className="mt-2 flex flex-wrap gap-1.5">
          {author && (
            <MetaTag testId="meta-author" icon={<User aria-hidden className="size-3" />}>
              {author}
            </MetaTag>
          )}
          {date && (
            <MetaTag testId="meta-date" icon={<Calendar aria-hidden className="size-3" />}>
              {date}
            </MetaTag>
          )}
        </ul>
      )}

      <h4 className="mt-1.5 font-semibold">{review.title}</h4>
      <ExpandableText text={review.content} />
    </article>
  );
}

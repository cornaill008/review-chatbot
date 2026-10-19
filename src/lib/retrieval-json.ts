import type { SourceReview } from "@/lib/types";

export const GENERATION_SKIPPED_NOTE = "KIMI_API_KEY가 없어 답변 생성을 생략하고 검색 결과만 표시합니다.";

/** API 키 없이 동작할 때 `answer`로 내려주는, 검색 결과 JSON 문자열을 만든다. */
export function formatRetrievalJson(question: string, sources: SourceReview[]): string {
  return JSON.stringify(
    {
      note: GENERATION_SKIPPED_NOTE,
      question,
      count: sources.length,
      results: sources.map((s, i) => ({
        rank: i + 1,
        id: s.id,
        rating: s.rating,
        author: s.author,
        title: s.title,
        content: s.content,
        date: s.date,
        score: s.score,
      })),
    },
    null,
    2,
  );
}

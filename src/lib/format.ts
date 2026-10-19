const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * `YYYY-MM-DD`는 `YYYY.MM.DD`로, 다른 형식은 원문 그대로, 비어 있으면 null.
 * `Date`로 파싱하지 않고 문자열로만 바꾸므로 시간대 때문에 날짜가 하루 밀리지 않는다.
 */
export function formatReviewDate(date: string | null | undefined): string | null {
  const text = date?.trim();
  if (!text) return null;
  const match = ISO_DATE.exec(text);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : text;
}

/** 검색 점수(0~1)를 0~100 정수 퍼센트로 바꾼다. 숫자가 아니면 null. */
export function toMatchPercent(score: unknown): number | null {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  const clamped = Math.min(1, Math.max(0, score));
  // 0.885 * 100 같은 부동소수 오차(88.49999…)로 반올림이 어긋나지 않도록 자릿수를 정리한 뒤 반올림한다.
  return Math.round(Number((clamped * 100).toFixed(6)));
}

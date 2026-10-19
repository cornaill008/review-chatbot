/**
 * 실데이터 저장소 테스트용 인메모리 가짜 Pinecone 네임스페이스와 Supabase.
 * 두 가짜는 같은 `log`에 호출을 남겨 서비스 사이의 호출 순서도 검증할 수 있다.
 * 테스트에서만 쓰며 vitest에 의존하지 않는다.
 */

export type Row = Record<string, unknown>;
export interface FakeError {
  code?: string;
  message: string;
}

// ───────────────────────── Supabase ─────────────────────────

class FakeQuery implements PromiseLike<{ data: unknown; error: FakeError | null; count: number | null }> {
  private op: "select" | "upsert" | "insert" | "delete" = "select";
  private columns = "*";
  private selectOptions: { count?: string; head?: boolean } = {};
  private payload: Row[] = [];
  private onConflict = "id";
  private filters: Array<(row: Row) => boolean> = [];
  private ordering: { column: string; ascending: boolean } | undefined;
  private limitCount: number | undefined;
  private rangeBounds: [number, number] | undefined;
  private returning = false;

  constructor(
    private readonly db: FakeSupabase,
    private readonly table: string,
  ) {}

  select(columns = "*", options: { count?: string; head?: boolean } = {}) {
    if (this.op === "select") {
      this.columns = columns;
      this.selectOptions = options;
    } else {
      this.returning = true; // upsert/insert/delete(...).select()
    }
    return this;
  }
  upsert(rows: Row | Row[], options: { onConflict?: string } = {}) {
    this.op = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.onConflict = options.onConflict ?? "id";
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  order(column: string, options: { ascending?: boolean } = {}) {
    this.ordering = { column, ascending: options.ascending ?? true };
    return this;
  }
  limit(count: number) {
    this.limitCount = count;
    return this;
  }
  range(from: number, to: number) {
    this.rangeBounds = [from, to];
    return this;
  }

  then<R1 = { data: unknown; error: FakeError | null; count: number | null }, R2 = never>(
    onfulfilled?: ((value: { data: unknown; error: FakeError | null; count: number | null }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute() {
    const { db, table, op } = this;
    db.log.push(`supabase:${table}:${op}`);
    db.calls.push({
      table,
      op,
      payload: this.payload,
      filtersCount: this.filters.length,
      onConflict: op === "upsert" ? this.onConflict : undefined,
    });

    const key = `${table}.${op}`;
    const failure = db.failures[key] ?? (this.filters.length > 0 ? db.filteredFailures[key] : undefined);
    if (failure) return { data: null, error: failure, count: null };

    const rows = (db.tables[table] ??= []);

    if (op === "upsert") {
      for (const incoming of this.payload) {
        const existing = rows.find((row) => row[this.onConflict] === incoming[this.onConflict]);
        if (existing) Object.assign(existing, incoming);
        else rows.push({ created_at: db.nextTimestamp(), ...incoming });
      }
      return { data: this.returning ? [...this.payload] : null, error: null, count: null };
    }

    if (op === "insert") {
      const inserted = this.payload.map((row) => ({ id: db.nextUuid(), created_at: db.nextTimestamp(), ...row }));
      rows.push(...inserted);
      return { data: this.returning ? inserted : null, error: null, count: null };
    }

    const matches = rows.filter((row) => this.filters.every((fn) => fn(row)));

    if (op === "delete") {
      db.tables[table] = rows.filter((row) => !matches.includes(row));
      return { data: this.returning ? matches : null, error: null, count: null };
    }

    // select
    let result = [...matches];
    if (this.ordering) {
      const { column, ascending } = this.ordering;
      result.sort((a, b) => {
        const left = String(a[column] ?? "");
        const right = String(b[column] ?? "");
        return (left < right ? -1 : left > right ? 1 : 0) * (ascending ? 1 : -1);
      });
    }
    // PostgREST의 기본 상한(1000행)을 흉내 낸다.
    const [from, to] = this.rangeBounds ?? [0, 999];
    result = result.slice(from, to + 1);
    if (this.limitCount !== undefined) result = result.slice(0, this.limitCount);
    const columns = this.columns === "*" ? undefined : this.columns.split(",").map((c) => c.trim());
    const projected = columns ? result.map((row) => Object.fromEntries(columns.map((c) => [c, row[c]]))) : result;
    const count = this.selectOptions.count ? matches.length : null;
    return { data: this.selectOptions.head ? null : projected, error: null, count };
  }
}

export class FakeSupabase {
  tables: Record<string, Row[]> = { reviews: [], messages: [] };
  /** 호출 기록 (테이블, 동작, 보낸 행) */
  calls: Array<{ table: string; op: string; payload: Row[]; filtersCount: number; onConflict?: string }> = [];
  /** `reviews.upsert`처럼 `${테이블}.${동작}` 키로 실패를 주입한다. */
  failures: Record<string, FakeError> = {};
  /** `failures`와 같지만 `eq`/`in` 필터가 붙은 호출에만 적용된다(예: 건수 조회는 통과, id 조회만 실패). */
  filteredFailures: Record<string, FakeError> = {};
  private clock = 0;
  private uuidCounter = 0;

  constructor(readonly log: string[] = []) {}

  from(table: string) {
    return new FakeQuery(this, table);
  }
  nextTimestamp() {
    return new Date(1_700_000_000_000 + ++this.clock).toISOString();
  }
  nextUuid() {
    return `00000000-0000-4000-8000-${String(++this.uuidCounter).padStart(12, "0")}`;
  }
  callsFor(table: string, op: string) {
    return this.calls.filter((call) => call.table === table && call.op === op);
  }
}

// ───────────────────────── Pinecone ─────────────────────────

export interface FakeHit {
  _id: string;
  _score: number;
  fields?: Row;
}

type NamespaceMethod = "upsertRecords" | "searchRecords" | "deleteMany" | "listPaginated" | "describeIndexStats";

export class FakeNamespace {
  records = new Map<string, Row>();
  upsertCalls: Array<{ records: Row[] }> = [];
  searchCalls: Array<Record<string, unknown>> = [];
  deleteCalls: Array<{ ids?: string[] }> = [];
  listCalls: Array<{ limit?: number; paginationToken?: string }> = [];
  statsCalls = 0;
  inFlightUpserts = 0;
  maxInFlightUpserts = 0;
  /** 검색이 돌려줄 결과 */
  searchHits: FakeHit[] = [];
  /** 통계가 돌려줄 레코드 수. 함수면 호출할 때마다 계산한다(반영 지연 흉내). */
  visibleCount: number | (() => number) | undefined;
  failures: Partial<Record<NamespaceMethod, Error>> = {};

  constructor(readonly log: string[] = []) {}

  async upsertRecords(options: { records: Row[] }) {
    // 실제 SDK 9.x는 배열을 직접 받으면 이 오류로 실패한다.
    if (!options || !Array.isArray(options.records)) throw new TypeError("options.records is not iterable");
    if (options.records.length > 96) throw new Error(`배치가 96개를 넘었습니다: ${options.records.length}`);
    this.log.push(`pinecone:upsertRecords:${options.records.length}`);
    this.upsertCalls.push({ records: options.records });
    // 동시에 여러 배치가 날아가는지 알 수 있도록 진행 중인 호출 수를 센다.
    this.inFlightUpserts += 1;
    this.maxInFlightUpserts = Math.max(this.maxInFlightUpserts, this.inFlightUpserts);
    try {
      await Promise.resolve();
      await Promise.resolve();
      if (this.failures.upsertRecords) throw this.failures.upsertRecords;
      for (const record of options.records) this.records.set(String(record._id), record);
    } finally {
      this.inFlightUpserts -= 1;
    }
  }

  async searchRecords(options: Record<string, unknown>) {
    this.log.push("pinecone:searchRecords");
    this.searchCalls.push(options);
    if (this.failures.searchRecords) throw this.failures.searchRecords;
    return { result: { hits: this.searchHits }, usage: { readUnits: 1 } };
  }

  async deleteMany(options: { ids?: string[] }) {
    this.log.push(`pinecone:deleteMany:${options.ids?.length ?? 0}`);
    this.deleteCalls.push(options);
    if (this.failures.deleteMany) throw this.failures.deleteMany;
    for (const id of options.ids ?? []) this.records.delete(id);
  }

  async listPaginated(options: { limit?: number; paginationToken?: string } = {}) {
    this.log.push("pinecone:listPaginated");
    this.listCalls.push(options);
    if (this.failures.listPaginated) throw this.failures.listPaginated;
    const ids = [...this.records.keys()].sort();
    const start = options.paginationToken ? Number(options.paginationToken) : 0;
    const limit = options.limit ?? 100;
    const page = ids.slice(start, start + limit);
    const next = start + limit < ids.length ? String(start + limit) : undefined;
    return { vectors: page.map((id) => ({ id })), pagination: next ? { next } : undefined, namespace: "reviews" };
  }

  async describeIndexStats() {
    this.log.push("pinecone:describeIndexStats");
    this.statsCalls += 1;
    if (this.failures.describeIndexStats) throw this.failures.describeIndexStats;
    const visible = typeof this.visibleCount === "function" ? this.visibleCount() : (this.visibleCount ?? this.records.size);
    return { namespaces: visible > 0 ? { reviews: { recordCount: visible } } : {}, dimension: 1024, totalRecordCount: visible };
  }
}

/** 두 가짜가 같은 호출 기록을 쓰도록 묶어서 만든다. */
export function createFakeServices() {
  const log: string[] = [];
  return { log, supabase: new FakeSupabase(log), namespace: new FakeNamespace(log) };
}

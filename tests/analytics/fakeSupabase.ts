/**
 * Fake klien Supabase/PostgREST in-memory untuk test router analitik.
 * - Mendukung: from().select(cols, {count}).eq().in().order().range().limit().maybeSingle().single()
 * - Semua operasi tulis (insert/update/upsert/delete/rpc) DICATAT lalu dilempar error,
 *   sehingga test bisa memastikan endpoint analitik tidak pernah menulis ke database.
 * - `maxRows` mensimulasikan `db-max-rows` PostgREST (halaman dipotong diam-diam).
 */

export interface FakeCall {
  table: string;
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' | 'rpc';
  columns: string;
  count: string | null;
  filters: Array<{ kind: 'eq' | 'in'; column: string; value: unknown }>;
  range: [number, number] | null;
}

type Row = Record<string, any>;

export class FakeSupabase {
  readonly calls: FakeCall[] = [];
  readonly writes: FakeCall[] = [];
  /** Tabel yang dipaksa mengembalikan error (simulasi database bermasalah). */
  readonly failingTables = new Set<string>();
  maxRows: number | null;

  constructor(readonly tables: Record<string, Row[]>, opts: { maxRows?: number } = {}) {
    this.maxRows = opts.maxRows ?? null;
  }

  from(table: string): FakeQuery {
    return new FakeQuery(this, table);
  }

  rpc(fn: string): never {
    const call: FakeCall = { table: fn, op: 'rpc', columns: '', count: null, filters: [], range: null };
    this.calls.push(call);
    this.writes.push(call);
    throw new Error(`FakeSupabase: rpc("${fn}") tidak diizinkan`);
  }

  resetCalls() {
    this.calls.length = 0;
    this.writes.length = 0;
  }
}

function project(row: Row, columns: string): Row {
  if (columns.trim() === '*') return structuredClone(row);
  const out: Row = {};
  for (const col of columns.split(',').map((c) => c.trim()).filter(Boolean)) {
    if (col in row) out[col] = structuredClone(row[col]);
  }
  return out;
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  return String(a) < String(b) ? -1 : 1;
}

export class FakeQuery implements PromiseLike<{ data: any; error: any; count: number | null }> {
  private columns = '*';
  private countMode: string | null = null;
  private readonly filters: FakeCall['filters'] = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private limitN: number | null = null;
  private singleMode: 'maybe' | 'single' | null = null;

  constructor(private readonly db: FakeSupabase, private readonly table: string) {}

  select(columns = '*', opts?: { count?: string }) {
    this.columns = columns;
    this.countMode = opts?.count ?? null;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ kind: 'eq', column, value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ kind: 'in', column, value: values });
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: opts?.ascending !== false };
    return this;
  }

  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  limit(n: number) {
    this.limitN = n;
    return this;
  }

  maybeSingle() {
    this.singleMode = 'maybe';
    return this;
  }

  single() {
    this.singleMode = 'single';
    return this;
  }

  private write(op: FakeCall['op']): never {
    const call: FakeCall = { table: this.table, op, columns: '', count: null, filters: [], range: null };
    this.db.calls.push(call);
    this.db.writes.push(call);
    throw new Error(`FakeSupabase: ${op} pada "${this.table}" tidak diizinkan (endpoint analitik harus read-only)`);
  }

  insert(): never {
    return this.write('insert');
  }
  update(): never {
    return this.write('update');
  }
  upsert(): never {
    return this.write('upsert');
  }
  delete(): never {
    return this.write('delete');
  }

  private execute(): { data: any; error: any; count: number | null } {
    this.db.calls.push({
      table: this.table,
      op: 'select',
      columns: this.columns,
      count: this.countMode,
      filters: [...this.filters],
      range: this.rangeFrom === null ? null : [this.rangeFrom, this.rangeTo as number],
    });

    if (this.db.failingTables.has(this.table)) {
      return { data: null, error: { message: `simulasi error tabel ${this.table}` }, count: null };
    }

    let rows = (this.db.tables[this.table] || []).filter((row) =>
      this.filters.every((f) =>
        f.kind === 'eq' ? row[f.column] === f.value : (f.value as unknown[]).includes(row[f.column])
      )
    );
    const total = rows.length;

    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      rows = [...rows].sort((a, b) => (ascending ? 1 : -1) * compare(a[column], b[column]));
    }
    if (this.rangeFrom !== null) rows = rows.slice(this.rangeFrom, (this.rangeTo as number) + 1);
    if (this.limitN !== null) rows = rows.slice(0, this.limitN);
    if (this.db.maxRows !== null) rows = rows.slice(0, this.db.maxRows);

    const data = rows.map((r) => project(r, this.columns));
    const count = this.countMode ? total : null;

    if (this.singleMode) {
      if (data.length > 1) return { data: null, error: { message: 'multiple rows returned' }, count };
      if (data.length === 0 && this.singleMode === 'single') {
        return { data: null, error: { message: 'no rows returned' }, count };
      }
      return { data: data[0] ?? null, error: null, count };
    }
    return { data, error: null, count };
  }

  then<TResult1 = { data: any; error: any; count: number | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any; count: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve()
      .then(() => this.execute())
      .then(onfulfilled, onrejected);
  }
}

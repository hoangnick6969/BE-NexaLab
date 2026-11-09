/**
 * In-memory stand-in for the Prisma calls the TAI-05 credit code makes (test support only, no database).
 * It models: filters (in, gte, lt, gt, not, OR, NOT, some), selects with the `entries`, `items` and `decisions`
 * relations, unique keys (P2002 on create, silent skip for `createMany({ skipDuplicates })`), atomic conditional
 * `updateMany`, increment, and transactions with rollback. Transactions are serialized by default, which models the
 * per-actor advisory lock; `serialize: false` runs them interleaved without a lock so a test can prove that the
 * conditional decrement alone keeps a balance from going negative. It does not model PostgreSQL itself: the real
 * run is `scripts/tai05-integration.mjs` on an isolated database.
 */
export type Row = Record<string, any>;

let seq = 0;
let tick = 0;
export const nextId = (prefix: string) => `${prefix}-${String(++seq).padStart(8, "0")}`;
/** Strictly increasing timestamps, so "newest first" orderings are deterministic. */
const stamp = () => new Date(Date.UTC(2026, 10, 9, 8, 0, 0) + ++tick * 1000);

const isPlain = (value: unknown): value is Row => !!value && typeof value === "object" && !(value instanceof Date) && !Array.isArray(value);
const time = (value: any) => (value instanceof Date ? value.getTime() : value);
const same = (a: any, b: any) => time(a) === time(b);

const DEFAULTS: Record<string, () => Row> = {
  aiJob: () => ({
    status: "PENDING", attemptCount: 0, failureCode: null, leaseUntil: null, inputTokens: null, outputTokens: null, droppedItems: [],
    materializedResourceId: null, startedAt: null, completedAt: null, cancelledAt: null,
    pricingVersionId: null, estimatedCredits: null, chargedCredits: null,
  }),
  aiJobItem: () => ({ flags: [] }),
  classResource: () => ({ status: "DRAFT", version: 1, publishedAt: null, archivedAt: null }),
  creditAccount: () => ({ balance: 0, ownerId: null }),
  pricingVersion: () => ({ status: "draft", activatedAt: null, retiredAt: null }),
};

const UNIQUE: Record<string, Array<(r: Row) => unknown[] | null>> = {
  idempotencyRecord: [(r) => [r.actorId, r.key]],
  creditAccount: [(r) => [r.kind, r.ownerId ?? "<system>"]],
  creditTransaction: [
    (r) => (r.aiJobId ? [r.aiJobId, r.kind] : null),
    (r) => (r.actorId && r.idempotencyKey ? [r.actorId, r.idempotencyKey] : null),
  ],
  pricingVersion: [(r) => [r.purpose, r.version]],
};

const TABLES = [
  "aiJob", "aiJobItem", "aiItemDecision", "auditLog", "idempotencyRecord", "classroom", "classResource", "questionFingerprint",
  "curriculumOutcome", "user", "creditAccount", "creditTransaction", "creditEntry", "pricingVersion",
];

export function makeCreditsStore(options: { serialize?: boolean } = {}) {
  const serialize = options.serialize ?? true;
  let tables: Record<string, Row[]> = Object.fromEntries(TABLES.map((name) => [name, []]));
  const rows = (name: string) => tables[name];

  function matches(row: Row, where: Row = {}, table = ""): boolean {
    return Object.entries(where).every(([key, cond]) => {
      if (cond === undefined) return true;
      if (key === "AND") return (cond as Row[]).every((c) => matches(row, c, table));
      if (key === "OR") return (cond as Row[]).some((c) => matches(row, c, table));
      if (key === "NOT") return !matches(row, cond, table);
      if (table === "creditTransaction" && key === "entries" && isPlain(cond) && "some" in cond)
        return rows("creditEntry").some((entry) => entry.transactionId === row.id && matches(entry, cond.some, "creditEntry"));
      const value = row[key];
      if (value === undefined && key.includes("_") && isPlain(cond)) return matches(row, cond, table);
      if (isPlain(cond)) {
        if ("in" in cond) return cond.in.some((v: any) => same(v, value));
        if ("not" in cond) return !same(value, cond.not);
        if ("lt" in cond || "lte" in cond || "gt" in cond || "gte" in cond) {
          if (value === null || value === undefined) return false;
          const v = time(value);
          return (!("lt" in cond) || v < time(cond.lt)) && (!("lte" in cond) || v <= time(cond.lte)) && (!("gt" in cond) || v > time(cond.gt)) && (!("gte" in cond) || v >= time(cond.gte));
        }
        return isPlain(value) && matches(value, cond, table);
      }
      return same(value, cond);
    });
  }

  function sortRows(list: Row[], orderBy: any) {
    const keys = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []).flatMap((o: Row) => Object.entries(o));
    return [...list].sort((a, b) => {
      for (const [key, dir] of keys) {
        const x = time(a[key]), y = time(b[key]);
        if (x === y) continue;
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        return (x > y ? 1 : -1) * (dir === "desc" ? -1 : 1);
      }
      return 0;
    });
  }

  function shape(table: string, row: Row, args: Row = {}): Row {
    const spec = args.select ?? args.include;
    const out: Row = args.select ? {} : { ...row };
    if (!spec) return out;
    for (const [key, value] of Object.entries(spec)) {
      if (!value) continue;
      if (table === "creditTransaction" && key === "entries") {
        out.entries = rows("creditEntry").filter((e) => e.transactionId === row.id).map((e) => shape("creditEntry", e, value === true ? {} : (value as Row)));
      } else if (table === "aiJob" && key === "items") {
        const nested = value === true ? {} : (value as Row);
        out.items = sortRows(rows("aiJobItem").filter((i) => i.jobId === row.id), { position: "asc" }).map((item) => ({
          ...item,
          decisions: sortRows(rows("aiItemDecision").filter((d) => d.itemId === item.id), [{ createdAt: "desc" }, { id: "desc" }]).slice(0, 1),
        }));
        void nested;
      } else if (table === "aiJob" && key === "_count") {
        out._count = { items: rows("aiJobItem").filter((i) => i.jobId === row.id).length };
      } else out[key] = row[key];
    }
    return out;
  }

  const clash = (table: string, candidate: Row, ignore?: Row) =>
    (UNIQUE[table] ?? []).some((keyOf) => {
      const key = keyOf(candidate);
      return key !== null && rows(table).some((r) => r !== ignore && JSON.stringify(keyOf(r)) === JSON.stringify(key));
    });

  function insert(table: string, data: Row, skipDuplicates = false): Row | null {
    const row: Row = { id: nextId(table), createdAt: stamp(), ...(DEFAULTS[table]?.() ?? {}), ...data };
    if (clash(table, row)) {
      if (skipDuplicates) return null;
      throw Object.assign(new Error(`unique constraint on ${table}`), { code: "P2002" });
    }
    rows(table).push(row);
    return row;
  }

  const apply = (row: Row, data: Row) => {
    for (const [key, value] of Object.entries(data)) {
      if (isPlain(value) && "increment" in value) row[key] = (row[key] ?? 0) + value.increment;
      else row[key] = value;
    }
  };

  const delegate = (table: string) => ({
    get rows() {
      return rows(table);
    },
    async findFirst(args: Row = {}) {
      const row = sortRows(rows(table).filter((r) => matches(r, args.where, table)), args.orderBy)[0];
      return row ? shape(table, row, args) : null;
    },
    async findUnique(args: Row) {
      const row = rows(table).find((r) => matches(r, args.where, table));
      return row ? shape(table, row, args) : null;
    },
    async findMany(args: Row = {}) {
      let list = sortRows(rows(table).filter((r) => matches(r, args.where, table)), args.orderBy);
      if (args.cursor) list = list.slice(list.findIndex((r) => r.id === args.cursor.id) + (args.skip ?? 0));
      if (args.take) list = list.slice(0, args.take);
      return list.map((r) => shape(table, r, args));
    },
    async count(args: Row = {}) {
      return rows(table).filter((r) => matches(r, args.where, table)).length;
    },
    async create(args: Row) {
      return shape(table, insert(table, args.data)!, args);
    },
    async createMany(args: Row) {
      let count = 0;
      for (const data of args.data) if (insert(table, data, !!args.skipDuplicates)) count++;
      return { count };
    },
    async update(args: Row) {
      const row = rows(table).find((r) => matches(r, args.where, table));
      if (!row) throw Object.assign(new Error(`${table} not found`), { code: "P2025" });
      apply(row, args.data);
      return shape(table, row, args);
    },
    async updateMany(args: Row) {
      const hit = rows(table).filter((r) => matches(r, args.where, table));
      for (const row of hit) apply(row, args.data);
      return { count: hit.length };
    },
    async deleteMany(args: Row) {
      const keep = rows(table).filter((r) => !matches(r, args.where, table));
      const count = rows(table).length - keep.length;
      tables[table] = keep;
      return { count };
    },
  });

  let chain = Promise.resolve();
  const db: Row = {
    lessonRows: [] as Row[],
    lessonStepRows: [] as Row[],
    lesson: {
      async findFirst({ where }: Row) {
        const row = db.lessonRows.find((l: Row) => l.id === where.id && ((l.scope === "SHARED_LIBRARY" && l.status === "published") || l.authorId === where.OR[1].authorId));
        return row ? { id: row.id } : null;
      },
      async findUnique({ where, select }: Row) {
        const row = db.lessonRows.find((l: Row) => l.id === where.id);
        if (!row) return null;
        if (!select?.steps) return { id: row.id };
        return { ...row, steps: db.lessonStepRows.filter((s: Row) => s.lessonId === row.id && s.type === "READING") };
      },
    },
    async $executeRaw() {
      return 0;
    },
    async $transaction(fn: (tx: any) => Promise<any>) {
      const run = async () => {
        const snapshot = serialize ? structuredClone(tables) : null;
        try {
          return await fn(db);
        } catch (error) {
          if (snapshot) tables = snapshot;
          throw error;
        }
      };
      if (!serialize) return run();
      const result = chain.then(run);
      chain = result.then(() => undefined, () => undefined);
      return result;
    },
  };
  for (const name of TABLES) db[name] = delegate(name);
  return db;
}

export type CreditsStore = ReturnType<typeof makeCreditsStore>;

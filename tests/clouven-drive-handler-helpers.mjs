let sequence = 0;

/** Minimal in-memory PostgREST-like client for handler tests. */
export function createFakeDb(initial = {}) {
  const state = {};
  for (const [table, rows] of Object.entries(initial)) state[table] = rows.map(row => ({ ...row }));
  const calls = [];
  return {
    state,
    calls,
    from(table) {
      const filters = [];
      let mode = "select";
      let payload = null;
      let single = false;
      const q = {
        select() { return q; },
        eq(key, value) { filters.push(row => row[key] === value); return q; },
        is(key, value) { filters.push(row => (row[key] ?? null) === value); return q; },
        in(key, values) { filters.push(row => values.includes(row[key])); return q; },
        insert(row) { mode = "insert"; payload = row; return q; },
        update(row) { mode = "update"; payload = row; return q; },
        delete() { mode = "delete"; return q; },
        maybeSingle() { single = true; return q; },
        then(resolve, reject) {
          if (!state[table]) state[table] = [];
          const rows = state[table];
          const matched = rows.filter(row => filters.every(test => test(row)));
          let result;
          if (mode === "insert") {
            const row = { id: `${table}-${++sequence}`, ...payload };
            rows.push(row);
            calls.push({ table, mode, payload });
            result = { data: single ? row : [row], error: null };
          } else if (mode === "update") {
            for (const row of matched) Object.assign(row, payload);
            calls.push({ table, mode, payload });
            result = { data: single ? matched[0] || null : matched, error: null };
          } else if (mode === "delete") {
            state[table] = rows.filter(row => !matched.includes(row));
            calls.push({ table, mode });
            result = { data: null, error: null };
          } else {
            result = { data: single ? matched[0] || null : matched, error: null };
          }
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return q;
    },
  };
}

export function createResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    sent: null,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.sent = body; return this; },
  };
}

export function createRequest({ method = "POST", headers = {}, body, query } = {}) {
  return { method, headers, body, query };
}

export const OPERATION_KEY = "11111111-1111-4111-8111-111111111111";
export const ITEM_ID = "22222222-2222-4222-8222-222222222222";
export const PARENT_ID = "33333333-3333-4333-8333-333333333333";
export const OTHER_ITEM_ID = "44444444-4444-4444-8444-444444444444";
export const MEMBER_ID = "55555555-5555-4555-8555-555555555555";

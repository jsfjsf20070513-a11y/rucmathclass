// In-memory transport for repository contract tests. Applies filters to stored
// rows so dropping a CAS/ownership filter changes observable test outcomes.
export function fakeSupabase(initial = []) {
  const rows = structuredClone(initial)
  const calls = []
  let loseResponse = false
  const client = {
    rows, calls, pageLimit: Infinity, beforeWrite: null,
    loseNextWriteResponse() { loseResponse = true },
    from(table) {
      const filters = [], orders = []
      let action = 'select', payload, limit = Infinity
      const execute = async (single = false) => {
        calls.push({ table, action, filters, payload })
        const matches = (row) => filters.every(([key, value, op]) => op === 'gt' ? row[key] > value : op === 'lte' ? row[key] <= value : row[key] === value)
        if (action !== 'select') client.beforeWrite?.()
        let data
        if (action === 'insert') {
          const additions = Array.isArray(payload) ? payload : [payload]
          if (table === 'review_states' && additions.some((r) => rows.some((x) => x.user_id === r.user_id && x.word_id === r.word_id))) {
            return { data: null, error: { code: '23505' } }
          }
          rows.push(...structuredClone(additions))
          data = additions
        } else if (action === 'update') {
          data = rows.filter(matches)
          data.forEach((row) => Object.assign(row, structuredClone(payload)))
        } else if (action === 'delete') {
          data = rows.filter(matches)
          for (let i = rows.length - 1; i >= 0; i -= 1) if (matches(rows[i])) rows.splice(i, 1)
        } else {
          data = rows.filter(matches).sort((a, b) => {
            for (const [key, ascending] of orders) {
              const cmp = a[key] === b[key] ? 0 : a[key] < b[key] ? -1 : 1
              if (cmp) return ascending ? cmp : -cmp
            }
            return 0
          }).slice(0, Math.min(limit, client.pageLimit))
        }
        if (action !== 'select' && loseResponse) {
          loseResponse = false
          return { data: null, error: { message: 'response lost after commit' } }
        }
        return { data: structuredClone(single ? data[0] || null : data), error: null }
      }
      const query = {
        select: () => query,
        abortSignal: () => query,
        eq: (key, value) => { filters.push([key, value]); return query },
        gt: (key, value) => { filters.push([key, value, 'gt']); return query },
        lte: (key, value) => { filters.push([key, value, 'lte']); return query },
        delete: () => { action = 'delete'; return query },
        update: (value) => { action = 'update'; payload = value; return query },
        insert: (value) => { action = 'insert'; payload = value; return query },
        order: (key, { ascending }) => { orders.push([key, ascending]); return query },
        limit: (value) => { limit = value; return query },
        maybeSingle: () => execute(true),
        then: (resolve, reject) => execute().then(resolve, reject),
      }
      return query
    },
  }
  return client
}

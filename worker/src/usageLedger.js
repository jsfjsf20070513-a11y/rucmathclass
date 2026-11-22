import { planUsage } from './chatUsage.js'

// 一个月共用一份余额。同一笔事务同时修改月余额、账号当天可搜次数和请求编号。
export function createUsageLedger(storage) {
  async function reserve({ today, userId, inputTokens, wantSearch }) {
    const id = crypto.randomUUID()
    const dayKey = today + ':' + userId
    return storage.transaction(async tx => {
      const spent = await tx.get('spent') || 0
      const searches = await tx.get(dayKey) || 0
      const plan = planUsage({ spent, searches, inputTokens, wantSearch })
      if (!plan) return null
      await tx.put('spent', spent + plan.amount)
      if (plan.search) await tx.put(dayKey, searches + 1)
      await tx.put(id, { ...plan, dayKey })
      return { id, ...plan, monthMicros: spent + plan.amount }
    })
  }
  async function settle(id, charge) {
    return storage.transaction(async tx => {
      const ticket = await tx.get(id)
      if (!ticket) return
      const spent = await tx.get('spent')
      await tx.put('spent', spent - ticket.amount + charge.amount)
      if (ticket.search && !charge.searches) await tx.put(ticket.dayKey, await tx.get(ticket.dayKey) - 1)
      await tx.delete(id)
    })
  }
  return { reserve, settle }
}

import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import { completedResponseFields } from './responseValidators'

export const createCompletedResponse = mutationGeneric({
  args: completedResponseFields,
  returns: v.id('responses'),
  handler: async (ctx, args) => {
    return ctx.db.insert('responses', args)
  },
})

export const getLatestCompletedResponse = queryGeneric({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id('responses'),
      _creationTime: v.number(),
      ...completedResponseFields,
    }),
  ),
  handler: async (ctx) => {
    return ctx.db.query('responses').withIndex('by_submittedAt').order('desc').first()
  },
})

export const getRecentCompletedResponses = queryGeneric({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id('responses'),
      _creationTime: v.number(),
      ...completedResponseFields,
    }),
  ),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 6, 12))

    return ctx.db.query('responses').withIndex('by_submittedAt').order('desc').take(limit)
  },
})

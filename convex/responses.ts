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

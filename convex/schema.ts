import { defineSchema, defineTable } from 'convex/server'
import { completedResponseFields } from './responseValidators'

export default defineSchema({
  responses: defineTable(completedResponseFields).index('by_submittedAt', ['submittedAt']),
})

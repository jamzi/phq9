import { v } from 'convex/values'

export const phqAnswerValidator = v.union(v.literal(0), v.literal(1), v.literal(2), v.literal(3))

export const difficultyAnswerValidator = v.union(
  v.literal('not_difficult'),
  v.literal('somewhat_difficult'),
  v.literal('very_difficult'),
  v.literal('extremely_difficult'),
)

export const severityBandValidator = v.union(
  v.literal('none/minimal'),
  v.literal('mild'),
  v.literal('moderate'),
  v.literal('moderately severe'),
  v.literal('severe'),
)

export const completedResponseFields = {
  submittedAt: v.string(),
  symptoms: v.array(phqAnswerValidator),
  difficulty: difficultyAnswerValidator,
  totalScore: v.number(),
  severityBand: severityBandValidator,
  needsFollowUp: v.boolean(),
  item9Positive: v.boolean(),
}

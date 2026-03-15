import type { DifficultyAnswer, PhqAnswer, SeverityBand } from './phq9'

export interface Phq9Fixture {
  name: string
  answers: PhqAnswer[]
  difficulty: DifficultyAnswer
  expectedScore: number
  expectedSeverity: SeverityBand
}

export const comparisonFixtures: Phq9Fixture[] = [
  {
    name: 'all-zeros',
    answers: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    difficulty: 'not_difficult',
    expectedScore: 0,
    expectedSeverity: 'none/minimal',
  },
  {
    name: 'mild-nine',
    answers: [1, 1, 1, 1, 1, 1, 1, 2, 0],
    difficulty: 'somewhat_difficult',
    expectedScore: 9,
    expectedSeverity: 'mild',
  },
  {
    name: 'moderate-ten',
    answers: [2, 1, 1, 1, 1, 1, 1, 2, 0],
    difficulty: 'somewhat_difficult',
    expectedScore: 10,
    expectedSeverity: 'moderate',
  },
]

export const safetyFixture = {
  answers: [0, 0, 0, 0, 0, 0, 0, 0, 1] as PhqAnswer[],
  difficulty: 'somewhat_difficult' as DifficultyAnswer,
}

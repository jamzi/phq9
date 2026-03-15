import { describe, expect, test } from 'vitest'
import { comparisonFixtures, safetyFixture } from './phq9.fixtures'
import { calculatePhq9Result } from './phq9'

describe('calculatePhq9Result', () => {
  test('maps the comparison fixtures to the expected score and severity band', () => {
    for (const fixture of comparisonFixtures) {
      expect(calculatePhq9Result(fixture.answers)).toMatchObject({
        totalScore: fixture.expectedScore,
        severityBand: fixture.expectedSeverity,
      })
    }
  })

  test('marks scores of 10 or higher for follow-up', () => {
    expect(calculatePhq9Result(comparisonFixtures[1].answers).needsFollowUp).toBe(false)
    expect(calculatePhq9Result(comparisonFixtures[2].answers).needsFollowUp).toBe(true)
  })

  test('treats any positive item 9 answer as a safety flag', () => {
    expect(calculatePhq9Result(safetyFixture.answers).item9Positive).toBe(true)
  })
})

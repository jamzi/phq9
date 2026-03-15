export type PhqAnswer = 0 | 1 | 2 | 3

export type DifficultyAnswer =
  | 'not_difficult'
  | 'somewhat_difficult'
  | 'very_difficult'
  | 'extremely_difficult'

export type SeverityBand =
  | 'none/minimal'
  | 'mild'
  | 'moderate'
  | 'moderately severe'
  | 'severe'

export interface Phq9Question {
  id: number
  prompt: string
}

export interface DifficultyOption {
  value: DifficultyAnswer
  label: string
}

export interface Phq9FormValues {
  symptoms: Array<PhqAnswer | null>
  difficulty: DifficultyAnswer | null
}

export interface Phq9Result {
  totalScore: number
  severityBand: SeverityBand
  needsFollowUp: boolean
  item9Positive: boolean
}

export const RESPONSE_OPTIONS: Array<{ value: PhqAnswer; label: string }> = [
  { value: 0, label: 'Not at all' },
  { value: 1, label: 'Several days' },
  { value: 2, label: 'More than half the days' },
  { value: 3, label: 'Nearly every day' },
]

export const PHQ9_QUESTIONS: Phq9Question[] = [
  { id: 1, prompt: 'Little interest or pleasure in doing things' },
  { id: 2, prompt: 'Feeling down, depressed, or hopeless' },
  {
    id: 3,
    prompt: 'Trouble falling or staying asleep, or sleeping too much',
  },
  { id: 4, prompt: 'Feeling tired or having little energy' },
  { id: 5, prompt: 'Poor appetite or overeating' },
  {
    id: 6,
    prompt:
      'Feeling bad about yourself - or that you are a failure or have let yourself or your family down',
  },
  {
    id: 7,
    prompt:
      'Trouble concentrating on things, such as reading the newspaper or watching television',
  },
  {
    id: 8,
    prompt:
      'Moving or speaking so slowly that other people could have noticed? Or the opposite - being so fidgety or restless that you have been moving around a lot more than usual',
  },
  {
    id: 9,
    prompt:
      'Thoughts that you would be better off dead or of hurting yourself in some way',
  },
]

export const DIFFICULTY_OPTIONS: DifficultyOption[] = [
  { value: 'not_difficult', label: 'Not difficult at all' },
  { value: 'somewhat_difficult', label: 'Somewhat difficult' },
  { value: 'very_difficult', label: 'Very difficult' },
  { value: 'extremely_difficult', label: 'Extremely difficult' },
]

export const EMPTY_FORM_VALUES: Phq9FormValues = {
  symptoms: Array.from({ length: 9 }, () => null),
  difficulty: null,
}

export function getMissingSymptomIndexes(
  symptoms: Array<PhqAnswer | null>,
): number[] {
  return symptoms.flatMap((answer, index) => (answer === null ? [index] : []))
}

export function calculatePhq9Result(symptoms: PhqAnswer[]): Phq9Result {
  const totalScore = symptoms.reduce((total, answer) => total + answer, 0)

  return {
    totalScore,
    severityBand: getSeverityBand(totalScore),
    needsFollowUp: totalScore >= 10,
    item9Positive: symptoms[8] > 0,
  }
}

export function getSeverityBand(score: number): SeverityBand {
  if (score <= 4) {
    return 'none/minimal'
  }

  if (score <= 9) {
    return 'mild'
  }

  if (score <= 14) {
    return 'moderate'
  }

  if (score <= 19) {
    return 'moderately severe'
  }

  return 'severe'
}

export function formatSeverityBand(band: SeverityBand): string {
  switch (band) {
    case 'none/minimal':
      return 'None/minimal'
    case 'mild':
      return 'Mild'
    case 'moderate':
      return 'Moderate'
    case 'moderately severe':
      return 'Moderately severe'
    case 'severe':
      return 'Severe'
  }
}

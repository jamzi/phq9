import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { comparisonFixtures } from '#/lib/phq9.fixtures'
import { PHQ9_QUESTIONS } from '#/lib/phq9'
import { Phq9App } from './Phq9App'

function getResponseLabel(answer: number) {
  return answer === 0
    ? 'Not at all'
    : answer === 1
      ? 'Several days'
      : answer === 2
        ? 'More than half the days'
        : 'Nearly every day'
}

function flushAdvance() {
  act(() => {
    vi.runOnlyPendingTimers()
  })
}

function completeQuestionnaire(answers: number[], difficultyLabel: string) {
  PHQ9_QUESTIONS.forEach((question, index) => {
    const group = screen.getByTestId(`question-${question.id}`)

    fireEvent.click(within(group).getByRole('radio', { name: getResponseLabel(answers[index]) }))
    flushAdvance()
  })

  const difficultyGroup = screen.getByTestId('difficulty-question')
  fireEvent.click(within(difficultyGroup).getByRole('radio', { name: difficultyLabel }))
  flushAdvance()
}

describe('Phq9App', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  test('auto-advances to the next question after an answer is selected', () => {
    render(<Phq9App />)

    expect(screen.getByTestId('question-1')).toBeInTheDocument()
    expect(screen.queryByTestId('question-2')).not.toBeInTheDocument()
    expect(screen.queryByTestId('next-button')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Several days' }))

    expect(screen.getByTestId('question-1')).toBeInTheDocument()
    expect(screen.getByText('Picked')).toBeInTheDocument()
    expect(screen.queryByTestId('question-2')).not.toBeInTheDocument()

    flushAdvance()

    expect(screen.getByTestId('question-2')).toBeInTheDocument()
    expect(screen.queryByTestId('question-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('score-total')).not.toBeInTheDocument()
  })

  test('keeps a next button available when revisiting an answered question', () => {
    render(<Phq9App />)

    fireEvent.click(screen.getByRole('radio', { name: 'Several days' }))
    flushAdvance()
    expect(screen.getByTestId('question-2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Not at all' }))
    flushAdvance()
    expect(screen.getByTestId('question-3')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('back-button'))
    expect(screen.getByTestId('question-2')).toBeInTheDocument()
    expect(screen.getByTestId('next-button')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('next-button'))
    expect(screen.getByTestId('question-3')).toBeInTheDocument()
  })

  test('renders the completed score and severity band', () => {
    render(<Phq9App />)

    completeQuestionnaire(comparisonFixtures[1].answers, 'Somewhat difficult')

    expect(screen.getByTestId('result-view')).toBeInTheDocument()
    expect(screen.getByTestId('score-total')).toHaveTextContent('9')
    expect(screen.getByTestId('severity-band')).toHaveTextContent('Mild')
    expect(screen.queryByTestId('difficulty-question')).not.toBeInTheDocument()
  })

  test('lets the user review answers or start over from the result view', () => {
    render(<Phq9App />)

    completeQuestionnaire(comparisonFixtures[1].answers, 'Somewhat difficult')

    fireEvent.click(screen.getByTestId('change-answers-button'))

    expect(screen.getByTestId('difficulty-question')).toBeInTheDocument()
    expect(screen.queryByTestId('result-view')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('submit-button'))
    expect(screen.getByTestId('result-view')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('start-over-button'))

    expect(screen.getByTestId('question-1')).toBeInTheDocument()
    expect(screen.queryByTestId('result-view')).not.toBeInTheDocument()
    expect(screen.queryByTestId('back-button')).not.toBeInTheDocument()
  })

  test('shows immediate and results-level safety messaging for a positive item 9 answer', () => {
    render(<Phq9App />)

    PHQ9_QUESTIONS.slice(0, 8).forEach((question) => {
      const group = screen.getByTestId(`question-${question.id}`)
      fireEvent.click(within(group).getByRole('radio', { name: 'Not at all' }))
      flushAdvance()
    })

    const questionNine = screen.getByTestId('question-9')
    fireEvent.click(within(questionNine).getByRole('radio', { name: 'Several days' }))

    expect(screen.getByRole('alertdialog')).toHaveTextContent('call or text 988')

    fireEvent.click(screen.getByRole('button', { name: 'I understand' }))
    flushAdvance()

    const difficultyGroup = screen.getByTestId('difficulty-question')
    fireEvent.click(within(difficultyGroup).getByRole('radio', { name: 'Somewhat difficult' }))
    flushAdvance()

    expect(screen.getByTestId('safety-panel')).toHaveTextContent(
      'Because you reported at least some thoughts',
    )
  })
})

import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { comparisonFixtures } from '#/lib/phq9.fixtures'
import { PHQ9_QUESTIONS } from '#/lib/phq9'
import { Phq9App } from './Phq9App'

const { saveCompletedResponseMock } = vi.hoisted(() => ({
  saveCompletedResponseMock: vi.fn(),
}))

const { fetchRecentCompletedResponsesMock } = vi.hoisted(() => ({
  fetchRecentCompletedResponsesMock: vi.fn(),
}))

vi.mock('./saveCompletedResponse', () => ({
  saveCompletedResponse: saveCompletedResponseMock,
  fetchRecentCompletedResponses: fetchRecentCompletedResponsesMock,
}))

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

async function flushSave() {
  await act(async () => {
    await Promise.resolve()
  })
}

async function flushAsyncWork() {
  await flushSave()
  await flushSave()
  await flushSave()
  await flushSave()
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
    saveCompletedResponseMock.mockReset()
    saveCompletedResponseMock.mockResolvedValue(undefined)
    fetchRecentCompletedResponsesMock.mockReset()
    fetchRecentCompletedResponsesMock.mockResolvedValue([])
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  test('auto-advances to the next question after an answer is selected', async () => {
    render(<Phq9App />)
    await flushSave()

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

  test('keeps a next button available when revisiting an answered question', async () => {
    render(<Phq9App />)
    await flushSave()

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

  test('renders the completed score and severity band', async () => {
    render(<Phq9App />)

    completeQuestionnaire(comparisonFixtures[1].answers, 'Somewhat difficult')
    await flushAsyncWork()

    expect(screen.getByTestId('result-view')).toBeInTheDocument()
    expect(screen.getByTestId('score-total')).toHaveTextContent('9')
    expect(screen.getByTestId('severity-band')).toHaveTextContent('Mild')
    expect(screen.queryByTestId('difficulty-question')).not.toBeInTheDocument()
    expect(screen.getByTestId('save-status')).toHaveTextContent('Saved')
  })

  test('saves the completed response and shows a saved state', async () => {
    render(<Phq9App />)

    completeQuestionnaire(comparisonFixtures[1].answers, 'Somewhat difficult')
    await flushAsyncWork()

    expect(saveCompletedResponseMock).toHaveBeenCalledWith({
      submittedAt: expect.any(String),
      symptoms: comparisonFixtures[1].answers,
      difficulty: comparisonFixtures[1].difficulty,
      totalScore: comparisonFixtures[1].expectedScore,
      severityBand: comparisonFixtures[1].expectedSeverity,
      needsFollowUp: false,
      item9Positive: false,
    })
  })

  test('lets the user review answers or start over from the result view', async () => {
    render(<Phq9App />)

    completeQuestionnaire(comparisonFixtures[1].answers, 'Somewhat difficult')
    await flushAsyncWork()

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

  test('shows immediate and results-level safety messaging for a positive item 9 answer', async () => {
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

    await flushAsyncWork()
    expect(screen.getByTestId('safety-panel')).toHaveTextContent(
      'Because you reported at least some thoughts',
    )
  })

  test('keeps the result visible and retries the same payload if saving fails', async () => {
    saveCompletedResponseMock.mockRejectedValueOnce(new Error('Request failed')).mockResolvedValueOnce(undefined)

    render(<Phq9App />)

    completeQuestionnaire(comparisonFixtures[1].answers, 'Somewhat difficult')
    await flushAsyncWork()

    expect(screen.getByTestId('save-status')).toHaveTextContent("Couldn't save this result")

    expect(screen.getByTestId('result-view')).toBeInTheDocument()

    const firstPayload = saveCompletedResponseMock.mock.calls[0]?.[0]

    fireEvent.click(screen.getByTestId('retry-save-button'))
    await flushAsyncWork()

    expect(saveCompletedResponseMock).toHaveBeenCalledTimes(2)
    expect(saveCompletedResponseMock.mock.calls[1]?.[0]).toEqual(firstPayload)
    expect(screen.getByTestId('save-status')).toHaveTextContent('Saved')
  })

  test('shows a simple score history chart after multiple saved check-ins', async () => {
    fetchRecentCompletedResponsesMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          _id: 'response-2',
          _creationTime: 2,
          submittedAt: '2026-03-14T09:00:00.000Z',
          symptoms: [0, 1, 0, 1, 0, 1, 0, 0, 0],
          difficulty: 'somewhat_difficult',
          totalScore: 3,
          severityBand: 'none/minimal',
          needsFollowUp: false,
          item9Positive: false,
        },
        {
          _id: 'response-1',
          _creationTime: 1,
          submittedAt: '2026-03-01T09:00:00.000Z',
          symptoms: comparisonFixtures[1].answers,
          difficulty: comparisonFixtures[1].difficulty,
          totalScore: comparisonFixtures[1].expectedScore,
          severityBand: comparisonFixtures[1].expectedSeverity,
          needsFollowUp: false,
          item9Positive: false,
        },
      ])

    render(<Phq9App />)

    completeQuestionnaire([0, 1, 0, 1, 0, 1, 0, 0, 0], 'Somewhat difficult')
    await flushAsyncWork()

    expect(screen.getByTestId('history-panel')).toBeInTheDocument()
    expect(screen.getByText('6 points lower than last time.')).toBeInTheDocument()
    expect(screen.getByTestId('history-chart')).toBeInTheDocument()
    expect(screen.getByTestId('history-bar-latest')).toHaveAccessibleName(/score 3/i)
  })
})

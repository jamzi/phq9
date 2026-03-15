import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DIFFICULTY_OPTIONS,
  EMPTY_FORM_VALUES,
  PHQ9_QUESTIONS,
  RESPONSE_OPTIONS,
  buildCompletedPhq9Response,
  type CompletedPhq9Response,
  formatSeverityBand,
  getMissingSymptomIndexes,
  type DifficultyAnswer,
  type PhqAnswer,
  type Phq9FormValues,
  type Phq9Result,
} from '#/lib/phq9'
import {
  fetchRecentCompletedResponses,
  saveCompletedResponse,
  type StoredCompletedPhq9Response,
} from './saveCompletedResponse'

const AUTO_ADVANCE_DELAY_MS = 180
const HISTORY_LIMIT = 6
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
type HistoryStatus = 'idle' | 'loading' | 'ready' | 'error'

function formatHistoryDate(submittedAt: string) {
  const submittedDate = new Date(submittedAt)

  if (Number.isNaN(submittedDate.getTime())) {
    return 'Saved'
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(submittedDate)
}

function getHistorySummary(history: StoredCompletedPhq9Response[]) {
  if (history.length === 0) {
    return {
      tone: 'steady' as const,
      title: 'Progress will appear here after you save a few check-ins.',
      detail: 'Lower scores are better. Higher scores mean more symptoms and deserve more attention.',
    }
  }

  if (history.length === 1) {
    return {
      tone: 'steady' as const,
      title: `Score ${history[0].totalScore} is your starting point.`,
      detail: 'Lower scores are better. Save one more check-in and we will show whether things are easing or getting heavier.',
    }
  }

  const [latest, previous] = history
  const scoreDelta = latest.totalScore - previous.totalScore

  if (scoreDelta === 0) {
    return {
      tone: 'steady' as const,
      title: 'Your score matches your last check-in.',
      detail: 'That means symptoms look about the same. Lower scores are better, so no drop means things have not eased yet.',
    }
  }

  if (scoreDelta < 0) {
    return {
      tone: 'improving' as const,
      title: `${Math.abs(scoreDelta)} point${Math.abs(scoreDelta) === 1 ? '' : 's'} lower than last time.`,
      detail: 'That is a good sign. Lower scores usually mean fewer symptoms.',
    }
  }

  return {
    tone: 'worsening' as const,
    title: `${scoreDelta} point${scoreDelta === 1 ? '' : 's'} higher than last time.`,
    detail: 'That can mean symptoms are feeling heavier lately, so it is worth paying attention to.',
  }
}

function getHistoryBarTone(score: number) {
  if (score <= 4) {
    return 'low'
  }

  if (score <= 9) {
    return 'mild'
  }

  if (score <= 14) {
    return 'moderate'
  }

  return 'high'
}

export function Phq9App() {
  const totalSteps = PHQ9_QUESTIONS.length + 1
  const [formValues, setFormValues] = useState<Phq9FormValues>(EMPTY_FORM_VALUES)
  const [result, setResult] = useState<Phq9Result | null>(null)
  const [completedResponse, setCompletedResponse] = useState<CompletedPhq9Response | null>(null)
  const [recentResponses, setRecentResponses] = useState<StoredCompletedPhq9Response[]>([])
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>('idle')
  const [showErrors, setShowErrors] = useState(false)
  const [isSafetyDialogOpen, setIsSafetyDialogOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [pendingSelectionKey, setPendingSelectionKey] = useState<string | null>(null)
  const previousItem9 = useRef<PhqAnswer | null>(null)
  const resultsRef = useRef<HTMLElement | null>(null)
  const autoAdvanceTimeoutRef = useRef<number | null>(null)
  const saveAttemptRef = useRef(0)
  const historyRequestRef = useRef(0)

  const item9Answer = formValues.symptoms[8]
  const isDifficultyStep = currentStep === PHQ9_QUESTIONS.length
  const currentQuestion = isDifficultyStep ? null : PHQ9_QUESTIONS[currentStep]
  const currentSymptomAnswer = currentQuestion === null ? null : formValues.symptoms[currentStep]
  const showResultView = result !== null
  const hasCurrentAnswer = currentQuestion !== null && currentSymptomAnswer !== null
  const hasDifficultyAnswer = formValues.difficulty !== null
  const answeredCount =
    formValues.symptoms.filter((answer) => answer !== null).length +
    (formValues.difficulty === null ? 0 : 1)
  const hasStarted = currentStep > 0 || answeredCount > 0 || result !== null
  const showSubmitButton = isDifficultyStep && hasDifficultyAnswer && !showResultView
  const showNextButton = !isDifficultyStep && hasCurrentAnswer && !showResultView
  const showNavigationControls = !showResultView && (currentStep > 0 || showSubmitButton || showNextButton)
  const panelTitle = showResultView
    ? 'Your result'
    : isDifficultyStep
      ? `Question ${totalSteps} of ${totalSteps}`
      : `Question ${currentQuestion?.id} of ${totalSteps}`
  const panelCopy = showResultView
    ? 'Use this as a screening snapshot, not a diagnosis.'
    : 'Answer based on the last 2 weeks.'

  useEffect(() => {
    const previousValue = previousItem9.current

    if ((previousValue === null || previousValue === 0) && item9Answer !== null && item9Answer > 0) {
      setIsSafetyDialogOpen(true)
    }

    previousItem9.current = item9Answer
  }, [item9Answer])

  useEffect(() => {
    if (result === null) {
      return
    }

    resultsRef.current?.focus()
  }, [result])

  useEffect(() => {
    return () => {
      if (autoAdvanceTimeoutRef.current !== null) {
        window.clearTimeout(autoAdvanceTimeoutRef.current)
      }
    }
  }, [])

  const validation = useMemo(() => {
    const missingSymptomIndexes = getMissingSymptomIndexes(formValues.symptoms)
    const missingDifficulty = formValues.difficulty === null

    return {
      missingSymptomIndexes,
      missingDifficulty,
      isComplete: missingSymptomIndexes.length === 0 && !missingDifficulty,
    }
  }, [formValues])

  const historyEntries = useMemo(() => {
    return [...recentResponses].reverse()
  }, [recentResponses])

  const historySummary = useMemo(() => {
    return getHistorySummary(recentResponses)
  }, [recentResponses])

  async function loadRecentResponses() {
    const nextRequest = historyRequestRef.current + 1
    historyRequestRef.current = nextRequest
    setHistoryStatus('loading')

    try {
      const nextResponses = await fetchRecentCompletedResponses(HISTORY_LIMIT)

      if (historyRequestRef.current !== nextRequest) {
        return
      }

      setRecentResponses(nextResponses)
      setHistoryStatus('ready')
    } catch {
      if (historyRequestRef.current !== nextRequest) {
        return
      }

      setHistoryStatus('error')
    }
  }

  useEffect(() => {
    void loadRecentResponses()
  }, [])

  function updateSymptomAnswer(index: number, value: PhqAnswer) {
    setFormValues((current) => {
      const nextSymptoms = current.symptoms.slice()
      nextSymptoms[index] = value

      return {
        ...current,
        symptoms: nextSymptoms,
      }
    })
    setShowErrors(false)
    setResult(null)
    setCompletedResponse(null)
    setSaveStatus('idle')
  }

  function updateDifficulty(value: DifficultyAnswer) {
    setFormValues((current) => ({
      ...current,
      difficulty: value,
    }))
    setShowErrors(false)
    setResult(null)
    setCompletedResponse(null)
    setSaveStatus('idle')
  }

  function cancelPendingAdvance() {
    if (autoAdvanceTimeoutRef.current !== null) {
      window.clearTimeout(autoAdvanceTimeoutRef.current)
      autoAdvanceTimeoutRef.current = null
    }

    setPendingSelectionKey(null)
  }

  function scheduleAdvance(selectionKey: string, nextAction: () => void) {
    cancelPendingAdvance()
    setPendingSelectionKey(selectionKey)

    autoAdvanceTimeoutRef.current = window.setTimeout(() => {
      autoAdvanceTimeoutRef.current = null
      setPendingSelectionKey(null)
      nextAction()
    }, AUTO_ADVANCE_DELAY_MS)
  }

  function goToStep(step: number) {
    setCurrentStep(Math.max(0, Math.min(step, totalSteps - 1)))
  }

  async function persistCompletedResponse(
    nextCompletedResponse: CompletedPhq9Response,
    saveAttempt: number,
  ) {
    try {
      await saveCompletedResponse(nextCompletedResponse)

      if (saveAttemptRef.current !== saveAttempt) {
        return
      }

      setSaveStatus('saved')
      void loadRecentResponses()
    } catch {
      if (saveAttemptRef.current !== saveAttempt) {
        return
      }

      setSaveStatus('error')
    }
  }

  function startCompletedResponseSave(nextCompletedResponse: CompletedPhq9Response) {
    const nextSaveAttempt = saveAttemptRef.current + 1
    saveAttemptRef.current = nextSaveAttempt

    setCompletedResponse(nextCompletedResponse)
    setSaveStatus('saving')
    void persistCompletedResponse(nextCompletedResponse, nextSaveAttempt)
  }

  function finalizeQuestionnaire(nextFormValues: Phq9FormValues = formValues) {
    const nextCompletedResponse = buildCompletedPhq9Response(nextFormValues)

    setShowErrors(false)
    setResult(nextCompletedResponse)
    startCompletedResponseSave(nextCompletedResponse)
  }

  function handleNextStep() {
    cancelPendingAdvance()

    if (isDifficultyStep || currentQuestion === null) {
      return
    }

    if (formValues.symptoms[currentStep] === null) {
      setShowErrors(true)
      return
    }

    setShowErrors(false)
    goToStep(currentStep + 1)
  }

  function handlePreviousStep() {
    cancelPendingAdvance()
    setShowErrors(false)
    goToStep(currentStep - 1)
  }

  function handleSymptomSelection(index: number, value: PhqAnswer) {
    updateSymptomAnswer(index, value)

    if (index === currentStep && index < PHQ9_QUESTIONS.length) {
      scheduleAdvance(`q${PHQ9_QUESTIONS[index].id}-${value}`, () => {
        goToStep(index + 1)
      })
    }
  }

  function handleDifficultySelection(value: DifficultyAnswer) {
    updateDifficulty(value)

    if (validation.missingSymptomIndexes.length === 0) {
      scheduleAdvance(`difficulty-${value}`, () => {
        finalizeQuestionnaire({
          ...formValues,
          difficulty: value,
        })
      })
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    cancelPendingAdvance()
    setShowErrors(true)

    if (!validation.isComplete) {
      if (validation.missingSymptomIndexes.length > 0) {
        goToStep(validation.missingSymptomIndexes[0])
      } else if (validation.missingDifficulty) {
        goToStep(PHQ9_QUESTIONS.length)
      }

      return
    }

    finalizeQuestionnaire()
  }

  function handleChangeAnswers() {
    cancelPendingAdvance()
    saveAttemptRef.current += 1
    setShowErrors(false)
    setResult(null)
    setCompletedResponse(null)
    setSaveStatus('idle')
    goToStep(PHQ9_QUESTIONS.length)
  }

  function handleStartOver() {
    cancelPendingAdvance()
    saveAttemptRef.current += 1
    previousItem9.current = null
    setFormValues(EMPTY_FORM_VALUES)
    setResult(null)
    setCompletedResponse(null)
    setSaveStatus('idle')
    setShowErrors(false)
    setIsSafetyDialogOpen(false)
    setCurrentStep(0)
  }

  function handleRetrySave() {
    if (completedResponse === null) {
      return
    }

    startCompletedResponseSave(completedResponse)
  }

  const saveStatusMessage =
    saveStatus === 'saving'
      ? 'Saving...'
      : saveStatus === 'saved'
        ? 'Saved'
        : saveStatus === 'error'
          ? "Couldn't save this result"
          : null

  const currentStepError =
    showErrors && currentQuestion !== null && validation.missingSymptomIndexes.includes(currentStep)
      ? `Choose one answer for question ${currentQuestion.id} before continuing.`
      : showErrors && isDifficultyStep && validation.missingDifficulty
        ? 'Choose one answer for the difficulty question before scoring.'
        : null

  return (
    <main className="page-wrap app-shell">
      <section className={`paper-panel intro-panel${hasStarted ? ' intro-panel-started' : ''}`}>
        <h1 className="display-title">
          <span className="desktop-title">A simple PHQ-9 check-in for the last 2 weeks.</span>
          <span className="mobile-title">PHQ-9 check-in</span>
        </h1>
        <p className="lede">
          This screening can help you notice patterns and decide whether to reach out for
          support. It is not a diagnosis.
        </p>
      </section>

      <form className="paper-panel form-panel" onSubmit={handleSubmit} noValidate>
        <div className="question-header">
          <div className="progress-row">
            <div>
              <h2 className="section-title">{panelTitle}</h2>
            </div>
            <p className="progress-copy">
              {answeredCount} of {totalSteps} answered
            </p>
          </div>

          <div
            aria-hidden="true"
            className="progress-track"
            data-testid="progress-track"
          >
            <div
              className="progress-fill"
              style={{ width: `${(Math.max(currentStep + 1, answeredCount) / totalSteps) * 100}%` }}
            />
          </div>

          <p className="section-copy">{panelCopy}</p>
        </div>

        {showResultView ? (
          <section
            aria-live="polite"
            className="result-view"
            data-testid="result-view"
            ref={resultsRef}
            tabIndex={-1}
          >
            <div className="result-grid">
              <article className="result-card">
                <p className="result-label">Total score</p>
                <p className="result-value score" data-testid="score-total">
                  {result.totalScore}
                </p>
              </article>

              <article className="result-card">
                <p className="result-label">Severity band</p>
                <p className="result-value" data-testid="severity-band">
                  {formatSeverityBand(result.severityBand)}
                </p>
              </article>
            </div>

            {result.needsFollowUp ? (
              <p className="result-note follow-up-note">
                Scores of 10 or higher are commonly used as a signal to seek a fuller clinical
                evaluation.
              </p>
            ) : (
              <p className="result-note">
                Even lower scores can still matter if symptoms feel persistent, distressing, or
                disruptive in daily life.
              </p>
            )}

            <p className="disclaimer-copy">
              This questionnaire is a symptom screener. Diagnosis should not rely on this score
              alone.
            </p>

            {saveStatusMessage ? (
              <section
                className={`save-status save-status-${saveStatus}`}
                data-save-state={saveStatus}
                data-testid="save-status"
              >
                <p className="result-label">Save status</p>
                <p className="save-status-text">{saveStatusMessage}</p>
                {saveStatus === 'error' ? (
                  <button
                    className="ghost-button"
                    data-testid="retry-save-button"
                    onClick={handleRetrySave}
                    type="button"
                  >
                    Retry save
                  </button>
                ) : null}
              </section>
            ) : null}

            <section className="history-panel" data-testid="history-panel">
              <div className="history-header">
                <div>
                  <p className="result-label">Progress</p>
                  <h3
                    className={`history-title history-title-${historySummary.tone}`}
                  >
                    {historySummary.title}
                  </h3>
                </div>
                <p className="history-caption">Last {HISTORY_LIMIT} saved check-ins</p>
              </div>

              <p className="history-copy">{historySummary.detail}</p>

              {historyEntries.length > 0 ? (
                <>
                  <div className="history-chart-shell">
                    <div aria-hidden="true" className="history-axis">
                      <span>27 - needs attention</span>
                      <span>0 - better</span>
                    </div>
                    <ol className="history-chart" data-testid="history-chart">
                      {historyEntries.map((entry, index) => {
                        const barHeight = Math.max((entry.totalScore / 27) * 100, 10)
                        const isLatestEntry = index === historyEntries.length - 1
                        const barTone = getHistoryBarTone(entry.totalScore)

                        return (
                          <li className="history-column" key={entry._id}>
                            <div className="history-bar-stack">
                              <span className="history-score">{entry.totalScore}</span>
                              <div
                                aria-label={`${formatHistoryDate(entry.submittedAt)} score ${entry.totalScore}`}
                                className={`history-bar history-bar-${barTone}${
                                  isLatestEntry ? ' history-bar-latest' : ''
                                }`}
                                data-testid={isLatestEntry ? 'history-bar-latest' : undefined}
                                role="img"
                                style={{ height: `${barHeight}%` }}
                              />
                            </div>
                            <span className="history-date">{formatHistoryDate(entry.submittedAt)}</span>
                          </li>
                        )
                      })}
                    </ol>
                  </div>
                  <p className="history-legend" data-testid="history-legend">
                    Green is lower and better. Yellow and orange mean symptoms are higher. Red means the score is high and worth more attention.
                  </p>
                </>
              ) : historyStatus === 'loading' ? (
                <p className="history-empty">Loading your saved check-ins...</p>
              ) : historyStatus === 'error' ? (
                <p className="history-empty">
                  We could not load earlier saved check-ins yet, so this view only shows the current result.
                </p>
              ) : (
                <p className="history-empty">Save a result to start building your progress view.</p>
              )}
            </section>

            {result.item9Positive ? (
              <section className="safety-panel" data-testid="safety-panel">
                <h3>Safety check for question 9</h3>
                <p>
                  Because you reported at least some thoughts of being better off dead or hurting
                  yourself, please seek immediate support. If you are in the United States, call or
                  text 988 now. If you may act on these thoughts, call emergency services or go to
                  the nearest emergency department immediately.
                </p>
              </section>
            ) : null}

            <div className="action-row result-actions">
              <div className="action-buttons">
                <button
                  className="primary-button"
                  data-testid="change-answers-button"
                  onClick={handleChangeAnswers}
                  type="button"
                >
                  Change answers
                </button>
                <button
                  className="ghost-button"
                  data-testid="start-over-button"
                  onClick={handleStartOver}
                  type="button"
                >
                  Start over
                </button>
              </div>
              <p className="helper-text">
                Update any answer and we will recalculate the result right away.
              </p>
            </div>
          </section>
        ) : currentQuestion ? (
          <fieldset
            className="question-card single-question-card"
            data-testid={`question-${currentQuestion.id}`}
          >
            <legend>
              <span className="question-prompt">{currentQuestion.prompt}</span>
            </legend>

            <div className="choice-grid">
              {RESPONSE_OPTIONS.map((option) => {
                const inputId = `q${currentQuestion.id}-${option.value}`
                const isSelected = currentSymptomAnswer === option.value
                const isPressed = pendingSelectionKey === inputId

                return (
                  <label
                    className={`choice-pill${isPressed ? ' choice-pill-pressed' : ''}${
                      isSelected ? ' choice-pill-selected' : ''
                    }`}
                    data-selection-state={isPressed ? 'pressed' : isSelected ? 'selected' : 'idle'}
                    key={inputId}
                    htmlFor={inputId}
                  >
                    <input
                      autoFocus={
                        currentSymptomAnswer === null
                          ? option.value === RESPONSE_OPTIONS[0].value
                          : currentSymptomAnswer === option.value
                      }
                      checked={currentSymptomAnswer === option.value}
                      id={inputId}
                      name={`q${currentQuestion.id}`}
                      onChange={() => handleSymptomSelection(currentStep, option.value)}
                      type="radio"
                      value={option.value}
                    />
                    <span className="choice-pill-content">
                      <span className="choice-pill-label">{option.label}</span>
                      <span className="choice-pill-meta">
                        {isSelected ? (
                          <span aria-hidden="true" className="choice-selection-mark">
                            Picked
                          </span>
                        ) : null}
                        <small aria-hidden="true">{option.value}</small>
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>

            {currentStepError ? (
              <p className="field-error" role="alert">
                {currentStepError}
              </p>
            ) : null}
          </fieldset>
        ) : (
          <fieldset className="question-card single-question-card" data-testid="difficulty-question">
            <legend>
              <span className="question-prompt">
                If you checked off any problems, how difficult have these problems made it for
                you to do your work, take care of things at home, or get along with other
                people?
              </span>
            </legend>

            <div className="difficulty-grid">
              {DIFFICULTY_OPTIONS.map((option) => {
                const inputId = `difficulty-${option.value}`
                const isSelected = formValues.difficulty === option.value
                const isPressed = pendingSelectionKey === inputId

                return (
                  <label
                    className={`choice-pill${isPressed ? ' choice-pill-pressed' : ''}${
                      isSelected ? ' choice-pill-selected' : ''
                    }`}
                    data-selection-state={isPressed ? 'pressed' : isSelected ? 'selected' : 'idle'}
                    key={inputId}
                    htmlFor={inputId}
                  >
                    <input
                      autoFocus={
                        formValues.difficulty === null
                          ? option.value === DIFFICULTY_OPTIONS[0].value
                          : formValues.difficulty === option.value
                      }
                      checked={formValues.difficulty === option.value}
                      id={inputId}
                      name="difficulty"
                      onChange={() => handleDifficultySelection(option.value)}
                      type="radio"
                      value={option.value}
                    />
                    <span className="choice-pill-content">
                      <span className="choice-pill-label">{option.label}</span>
                      {isSelected ? (
                        <span aria-hidden="true" className="choice-selection-mark">
                          Picked
                        </span>
                      ) : null}
                    </span>
                  </label>
                )
              })}
            </div>

            <p className="helper-text">
              This question is included in the standard PHQ-9, but it does not change the 0-27
              total score.
            </p>

            {currentStepError ? (
              <p className="field-error" role="alert">
                {currentStepError}
              </p>
            ) : null}
          </fieldset>
        )}

        <div className="action-row wizard-actions">
          {showNavigationControls ? (
            <div className="action-buttons">
              {currentStep > 0 ? (
                <button
                  className="ghost-button"
                  data-testid="back-button"
                  onClick={handlePreviousStep}
                  type="button"
                >
                  Back
                </button>
              ) : null}

              {showSubmitButton ? (
                <button className="primary-button" data-testid="submit-button" type="submit">
                  Score my PHQ-9
                </button>
              ) : showNextButton ? (
                <button
                  className="primary-button"
                  data-testid="next-button"
                  onClick={handleNextStep}
                  type="button"
                >
                  Next question
                </button>
              ) : null}
            </div>
          ) : null}

          <p className="helper-text">
            {isDifficultyStep
              ? hasDifficultyAnswer
                ? 'Choose again to change it. Your score updates right away.'
                : 'Choose one answer and we will score it right away.'
              : hasCurrentAnswer
                ? 'Choose again to change it, or use Next.'
                : 'Choose one answer to keep moving.'}
          </p>
        </div>
      </form>

      <section className="paper-panel help-panel">
        <h2 className="section-title">A few reminders</h2>
        <div className="help-grid">
          <article className="help-card">
            <h3>Screening only</h3>
            <p>
              The PHQ-9 helps organize symptoms. It does not replace a clinician&apos;s judgment.
            </p>
          </article>
          <article className="help-card">
            <h3>Question 9 matters</h3>
            <p>
              Any positive answer on the last question should be taken seriously, even if the
              total score is otherwise low.
            </p>
          </article>
          <article className="help-card">
            <h3>Talk to someone</h3>
            <p>
              If symptoms are worsening, affecting daily life, or making you feel unsafe, reach
              out to a clinician, crisis line, or trusted person.
            </p>
          </article>
        </div>
        <p className="footer-copy">
          Completed check-ins are saved anonymously so they can be reviewed later.
        </p>
      </section>

      {isSafetyDialogOpen ? (
        <div className="dialog-backdrop">
          <div
            aria-describedby="safety-dialog-description"
            aria-labelledby="safety-dialog-title"
            aria-modal="true"
            className="dialog-card"
            role="alertdialog"
          >
            <h2 id="safety-dialog-title">Please pause and get support now.</h2>
            <p id="safety-dialog-description">
              You selected a positive answer for question 9. If you are in the United States,
              call or text 988 for immediate crisis support. If you are in immediate danger or
              may act on these thoughts, call emergency services right now or go to the nearest
              emergency department.
            </p>
            <div className="dialog-actions">
              <button className="ghost-button" onClick={() => setIsSafetyDialogOpen(false)} type="button">
                I understand
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

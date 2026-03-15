import {
  answerLocalDifficultyScript,
  answerLocalQuestionScript,
  createAgentBrowserSession,
  dismissLocalSafetyDialogScript,
  localStateScript,
  localUrl,
  normalizeSeverity,
  startDevServer,
  storedResponsesScript,
  stopProcess,
  waitForLocalApp,
  waitForSavedResult,
} from './agent-browser-helpers.mjs'

const mildFixture = {
  answers: [1, 1, 1, 1, 1, 1, 1, 2, 0],
  difficulty: 'somewhat_difficult',
  expectedScore: 9,
  expectedSeverity: 'mild',
}

const safetyFixture = {
  answers: [0, 0, 0, 0, 0, 0, 0, 0, 1],
  difficulty: 'somewhat_difficult',
  expectedScore: 1,
  expectedSeverity: 'none/minimal',
}

const improvedFixture = {
  answers: [0, 1, 0, 1, 0, 1, 0, 0, 0],
  difficulty: 'somewhat_difficult',
  expectedScore: 3,
  expectedSeverity: 'none/minimal',
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function parseJsonLine(output) {
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const jsonLine = [...lines].reverse().find(
    (line) =>
      (line.startsWith('{') && line.endsWith('}')) ||
      (line.startsWith('[') && line.endsWith(']')) ||
      (line.startsWith('"{') && line.endsWith('}"')) ||
      (line.startsWith('"[') && line.endsWith(']"')),
  )

  if (!jsonLine) {
    throw new Error(`Unable to parse agent-browser output:\n${output}`)
  }

  return JSON.parse(
    jsonLine.startsWith('"{') || jsonLine.startsWith('"[') ? JSON.parse(jsonLine) : jsonLine,
  )
}

function parseLocalState(output) {
  const parsed = parseJsonLine(output)

  return {
    ...parsed,
    score: parsed.score === null ? null : Number(parsed.score),
  }
}

function readLocalState(browser) {
  return parseLocalState(browser.run(['eval', localStateScript()]))
}

function readStoredResponses(browser, limit = 6) {
  return parseJsonLine(browser.run(['eval', storedResponsesScript(limit)]))
}

async function answerQuestion(browser, questionNumber, answer) {
  browser.run(['eval', answerLocalQuestionScript(questionNumber, answer)])
  await new Promise((resolve) => setTimeout(resolve, 320))
}

async function answerDifficulty(browser, difficulty) {
  browser.run(['eval', answerLocalDifficultyScript(difficulty)])
  await new Promise((resolve) => setTimeout(resolve, 320))
}

async function completeWizard(browser, answers, difficulty) {
  browser.runChain([
    ['open', localUrl],
    ['wait', '1000'],
    ['snapshot', '-i'],
  ])

  for (const [index, answer] of answers.entries()) {
    await answerQuestion(browser, index + 1, answer)
  }

  await answerDifficulty(browser, difficulty)
  return waitForSavedResult(() => readLocalState(browser))
}

function startOverFromResult(browser) {
  browser.run([
    'eval',
    `
      (() => {
        const button = document.querySelector('[data-testid="start-over-button"]');
        if (!button) throw new Error('Missing start over button');
        button.click();
        return 'done';
      })();
    `,
  ])
}

let devServer = null
const browser = createAgentBrowserSession('phq9-local')

try {
  devServer = startDevServer()

  console.log('Starting local app for agent-browser smoke test...')
  await waitForLocalApp()

  console.log('Checking the standard completion flow...')
  const mildState = await completeWizard(browser, mildFixture.answers, mildFixture.difficulty)

  assert(
    mildState.score === mildFixture.expectedScore,
    `Expected mild score ${mildFixture.expectedScore}, got ${mildState.score}. State: ${JSON.stringify(mildState)}`,
  )
  assert(
    normalizeSeverity(mildState.severity) === mildFixture.expectedSeverity,
    `Expected mild severity ${mildFixture.expectedSeverity}, got ${mildState.severity}. State: ${JSON.stringify(mildState)}`,
  )
  assert(mildState.saveState === 'saved', `Expected a saved result. State: ${JSON.stringify(mildState)}`)
  assert(
    mildState.saveStatusText?.includes('Saved'),
    `Expected the save status to show Saved. State: ${JSON.stringify(mildState)}`,
  )
  assert(!mildState.safetyPanelText, 'Expected no safety panel for the non-item-9 fixture')

  const latestCompletedResponse = readStoredResponses(browser, 1)[0] ?? null

  assert(latestCompletedResponse !== null, 'Expected local storage to return the latest completed response')
  assert(
    latestCompletedResponse.totalScore === mildFixture.expectedScore,
    `Expected latest saved score ${mildFixture.expectedScore}, got ${latestCompletedResponse.totalScore}`,
  )
  assert(
    normalizeSeverity(latestCompletedResponse.severityBand) === mildFixture.expectedSeverity,
    `Expected latest saved severity ${mildFixture.expectedSeverity}, got ${latestCompletedResponse.severityBand}`,
  )

  console.log('Checking score history after a second saved check-in...')
  startOverFromResult(browser)
  await new Promise((resolve) => setTimeout(resolve, 320))

  for (const [index, answer] of improvedFixture.answers.entries()) {
    await answerQuestion(browser, index + 1, answer)
  }

  await answerDifficulty(browser, improvedFixture.difficulty)
  const improvedState = await waitForSavedResult(() => readLocalState(browser))

  assert(
    improvedState.score === improvedFixture.expectedScore,
    `Expected improved score ${improvedFixture.expectedScore}, got ${improvedState.score}. State: ${JSON.stringify(improvedState)}`,
  )
  assert(
    normalizeSeverity(improvedState.severity) === improvedFixture.expectedSeverity,
    `Expected improved severity ${improvedFixture.expectedSeverity}, got ${improvedState.severity}. State: ${JSON.stringify(improvedState)}`,
  )
  assert(
    improvedState.historyBarCount >= 2,
    `Expected the progress chart to show at least two bars. State: ${JSON.stringify(improvedState)}`,
  )
  assert(
    improvedState.historyPanelText?.includes('6 points lower than last time.'),
    `Expected the progress panel to compare with the prior result. State: ${JSON.stringify(improvedState)}`,
  )

  const recentCompletedResponses = readStoredResponses(browser)

  assert(
    recentCompletedResponses.length >= 2,
    `Expected at least two saved responses for the progress chart. Responses: ${JSON.stringify(recentCompletedResponses)}`,
  )
  assert(
    recentCompletedResponses[0]?.totalScore === improvedFixture.expectedScore,
    `Expected the latest saved score ${improvedFixture.expectedScore}, got ${recentCompletedResponses[0]?.totalScore}`,
  )
  assert(
    recentCompletedResponses[1]?.totalScore === mildFixture.expectedScore,
    `Expected the previous saved score ${mildFixture.expectedScore}, got ${recentCompletedResponses[1]?.totalScore}`,
  )

  console.log('Checking the immediate item 9 safety dialog...')
  browser.runChain([
    ['open', localUrl],
    ['wait', '1000'],
    ['snapshot', '-i'],
  ])

  for (const [index, answer] of safetyFixture.answers.slice(0, 8).entries()) {
    await answerQuestion(browser, index + 1, answer)
  }

  await answerQuestion(browser, 9, 1)
  const immediateSafetyState = readLocalState(browser)

  assert(
    immediateSafetyState.dialogText?.includes('call or text 988'),
    'Expected the item 9 dialog to mention calling or texting 988',
  )

  console.log('Checking the persistent results safety panel...')
  browser.run(['eval', dismissLocalSafetyDialogScript()])
  await new Promise((resolve) => setTimeout(resolve, 320))
  await answerDifficulty(browser, safetyFixture.difficulty)

  const safetyState = await waitForSavedResult(() => readLocalState(browser))

  assert(
    safetyState.score === safetyFixture.expectedScore,
    `Expected safety score ${safetyFixture.expectedScore}, got ${safetyState.score}. State: ${JSON.stringify(safetyState)}`,
  )
  assert(
    normalizeSeverity(safetyState.severity) === safetyFixture.expectedSeverity,
    `Expected safety severity ${safetyFixture.expectedSeverity}, got ${safetyState.severity}. State: ${JSON.stringify(safetyState)}`,
  )
  assert(
    safetyState.safetyPanelText?.includes('Because you reported at least some thoughts'),
    'Expected the results view to show the persistent safety panel',
  )

  const latestSafetyResponse = readStoredResponses(browser, 1)[0] ?? null

  assert(
    latestSafetyResponse?.item9Positive === true,
    `Expected the latest saved response to keep the item 9 safety flag. Response: ${JSON.stringify(latestSafetyResponse)}`,
  )

  console.log('agent-browser local smoke test passed')
} finally {
  if (devServer) {
    await stopProcess(devServer)
  }

  browser.cleanup()
}

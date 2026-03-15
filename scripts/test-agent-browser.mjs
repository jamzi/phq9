import {
  createAgentBrowserSession,
  localStateScript,
  localUrl,
  normalizeSeverity,
  startDevServer,
  stopDevServer,
  waitForLocalApp,
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
      (line.startsWith('"{') && line.endsWith('}"')),
  )

  if (!jsonLine) {
    throw new Error(`Unable to parse agent-browser output:\n${output}`)
  }

  return JSON.parse(jsonLine.startsWith('"{') ? JSON.parse(jsonLine) : jsonLine)
}

function parseLocalState(output) {
  const parsed = parseJsonLine(output)

  return {
    ...parsed,
    score: parsed.score === null ? null : Number(parsed.score),
  }
}

function localFillScript(answers, difficulty) {
  return `
    const answers = ${JSON.stringify(answers)};
    answers.forEach((value, index) => {
      const input = document.querySelector('input[name="q' + (index + 1) + '"][value="' + value + '"]');
      if (!input) throw new Error('Missing local radio for question ' + (index + 1));
      input.click();
    });
    const difficultyInput = document.querySelector('input[name="difficulty"][value="${difficulty}"]');
    if (!difficultyInput) throw new Error('Missing local difficulty input');
    difficultyInput.click();
    const submitButton = document.querySelector('[data-testid="submit-button"]');
    if (!submitButton) throw new Error('Missing local submit button');
    submitButton.click();
    'done';
  `
}

function localItem9Script(value) {
  return `
    const input = document.querySelector('input[name="q9"][value="${value}"]');
    if (!input) throw new Error('Missing local item 9 radio');
    input.click();
    'done';
  `
}

const devServer = startDevServer()
const browser = createAgentBrowserSession('phq9-local')

try {
  console.log('Starting local app for agent-browser smoke test...')
  await waitForLocalApp()

  console.log('Checking the standard completion flow...')
  const mildState = parseLocalState(
    browser.runChain([
      ['open', localUrl],
      ['wait', '1000'],
      ['snapshot', '-i'],
      ['eval', localFillScript(mildFixture.answers, mildFixture.difficulty)],
      ['wait', '500'],
      ['eval', localStateScript()],
    ]),
  )

  assert(
    mildState.score === mildFixture.expectedScore,
    `Expected mild score ${mildFixture.expectedScore}, got ${mildState.score}. State: ${JSON.stringify(mildState)}`,
  )
  assert(
    normalizeSeverity(mildState.severity) === mildFixture.expectedSeverity,
    `Expected mild severity ${mildFixture.expectedSeverity}, got ${mildState.severity}. State: ${JSON.stringify(mildState)}`,
  )
  assert(!mildState.safetyPanelText, 'Expected no safety panel for the non-item-9 fixture')

  console.log('Checking the immediate item 9 safety dialog...')
  const immediateSafetyState = parseLocalState(
    browser.runChain([
      ['open', localUrl],
      ['wait', '1000'],
      ['snapshot', '-i'],
      ['eval', localItem9Script(1)],
      ['wait', '300'],
      ['eval', localStateScript()],
    ]),
  )

  assert(
    immediateSafetyState.dialogText?.includes('call or text 988'),
    'Expected the item 9 dialog to mention calling or texting 988',
  )

  console.log('Checking the persistent results safety panel...')
  const safetyState = parseLocalState(
    browser.runChain([
      ['open', localUrl],
      ['wait', '1000'],
      ['snapshot', '-i'],
      ['eval', localFillScript(safetyFixture.answers, safetyFixture.difficulty)],
      ['wait', '500'],
      ['eval', localStateScript()],
    ]),
  )

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

  console.log('agent-browser local smoke test passed')
} finally {
  await stopDevServer(devServer)
  browser.cleanup()
}

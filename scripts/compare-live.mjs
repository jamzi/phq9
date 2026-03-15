import {
  createAgentBrowserSession,
  completeLocalQuestionnaire,
  liveStateScript,
  localStateScript,
  localUrl,
  normalizeSeverity,
  startDevServer,
  stopDevServer,
  waitForLocalApp,
} from './agent-browser-helpers.mjs'

const liveUrl = 'https://phqcalculator.com/'

const fixtures = [
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

const browser = createAgentBrowserSession('phq9-live')

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

function liveFillCommands(answers) {
  return [
    ...answers.map((value, index) => [
      'check',
      `input[name="q${index + 1}"][value="${value}"]`,
    ]),
    ['find', 'role', 'button', 'click', '--name', 'Calculate Score'],
  ]
}

async function compareFixture(fixture) {
  const localResultRaw = parseJsonLine(
    browser.runChain([
      ['open', localUrl],
      ['wait', '1000'],
      ['snapshot', '-i'],
      ...completeLocalQuestionnaire(browser.run, fixture.answers, fixture.difficulty),
      ['wait', '500'],
      ['eval', localStateScript()],
    ]),
  )
  const localResult = {
    score: localResultRaw.score === null ? null : Number(localResultRaw.score),
    severity: localResultRaw.severity,
  }

  const liveResultRaw = parseJsonLine(
    browser.runChain([
      ['open', liveUrl],
      ['wait', '1500'],
      ['snapshot', '-i'],
      ...liveFillCommands(fixture.answers),
      ['wait', '1000'],
      ['eval', liveStateScript()],
    ]),
  )
  const liveResult = {
    excerpt: liveResultRaw.excerpt,
    score: liveResultRaw.scoreText === null ? null : Number(liveResultRaw.scoreText),
    severity: liveResultRaw.severityText,
  }

  if (
    localResult.score !== fixture.expectedScore ||
    normalizeSeverity(localResult.severity) !== fixture.expectedSeverity
  ) {
    throw new Error(
      `Local app mismatch for ${fixture.name}: expected ${fixture.expectedScore}/${fixture.expectedSeverity}, got ${localResult.score}/${localResult.severity}`,
    )
  }

  if (
    liveResult.score !== fixture.expectedScore ||
    normalizeSeverity(liveResult.severity) !== fixture.expectedSeverity
  ) {
    throw new Error(
      `Live site mismatch for ${fixture.name}: expected ${fixture.expectedScore}/${fixture.expectedSeverity}, got ${liveResult.score}/${liveResult.severity}\n\nExcerpt:\n${liveResult.excerpt}`,
    )
  }

  console.log(
    `${fixture.name}: local ${localResult.score}/${localResult.severity} matches live ${liveResult.score}/${liveResult.severity}`,
  )
}

const devServer = startDevServer()

try {
  console.log('Starting local app for live comparison...')
  await waitForLocalApp()

  for (const fixture of fixtures) {
    console.log(`Comparing fixture: ${fixture.name}`)
    await compareFixture(fixture)
  }
} finally {
  await stopDevServer(devServer)
  browser.cleanup()
}

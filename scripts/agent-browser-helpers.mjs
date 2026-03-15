import { execFileSync, execSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { ConvexHttpClient } from 'convex/browser'
import { anyApi } from 'convex/server'

export const localUrl = 'http://127.0.0.1:3000'
const localConvexEnvFile = '.env.local'

export function createAgentBrowserSession(prefix) {
  const browserHome = mkdtempSync(join(tmpdir(), `${prefix}-agent-browser-`))
  const socketDir = join(tmpdir(), `${prefix.slice(0, 4)}-ab`)
  const baseEnv = {
    ...process.env,
    AGENT_BROWSER_SOCKET_DIR: socketDir,
    HOME: browserHome,
  }

  function shellEscape(value) {
    return `'${value.replaceAll("'", `'\\''`)}'`
  }

  function buildCommand(args) {
    return ['agent-browser', ...args]
      .map((arg) => shellEscape(arg))
      .join(' ')
  }

  function run(args) {
    return execFileSync('agent-browser', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: baseEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  }

  function runChain(commandList) {
    return execSync(commandList.map((args) => buildCommand(args)).join(' && '), {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: baseEnv,
      shell: '/bin/zsh',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  }

  function cleanup() {
    try {
      run(['close'])
    } catch {}

    rmSync(browserHome, { recursive: true, force: true })
  }

  return { cleanup, run, runChain }
}

export function startDevServer() {
  return spawn('pnpm', ['exec', 'vite', 'dev', '--port', '3000', '--host', '127.0.0.1'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  })
}

export function startConvexDev() {
  return spawn(
    'pnpm',
    ['exec', 'convex', 'dev', '--local', '--typecheck', 'disable', '--tail-logs', 'disable'],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    },
  )
}

export async function waitForLocalApp(url = localUrl) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch {}

    await delay(1000)
  }

  throw new Error(`Local app at ${url} did not start within 60 seconds.`)
}

export async function stopDevServer(server) {
  if (server.killed) {
    return
  }

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      server.kill('SIGKILL')
      resolve()
    }, 5000)

    server.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })

    server.kill('SIGTERM')
  })
}

export async function stopProcess(server) {
  return stopDevServer(server)
}

export function answerLocalQuestionScript(questionNumber, value) {
  return `
    (() => {
      const input = document.querySelector('input[name="q${questionNumber}"][value="${value}"]');
      if (!input) throw new Error('Missing local radio for question ${questionNumber}');
      input.click();
      return 'done';
    })();
  `
}

export function answerLocalDifficultyScript(value) {
  return `
    (() => {
      const input = document.querySelector('input[name="difficulty"][value="${value}"]');
      if (!input) throw new Error('Missing local difficulty input');
      input.click();
      return 'done';
    })();
  `
}

export function dismissLocalSafetyDialogScript() {
  return `
    (() => {
      const dialogButton = Array.from(document.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'I understand',
      );
      if (!dialogButton) throw new Error('Missing safety dialog dismiss button');
      dialogButton.click();
      return 'done';
    })();
  `
}

export function readEnvFile(envFile = localConvexEnvFile) {
  if (!existsSync(envFile)) {
    return {}
  }

  return readFileSync(envFile, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .reduce((values, line) => {
      const separatorIndex = line.indexOf('=')

      if (separatorIndex === -1) {
        return values
      }

      const key = line.slice(0, separatorIndex).trim()
      const rawValue = line.slice(separatorIndex + 1).trim()
      const value = rawValue.replace(/^['"]|['"]$/g, '')

      return {
        ...values,
        [key]: value,
      }
    }, {})
}

export function getConfiguredConvexUrl(envFile = localConvexEnvFile) {
  return process.env.VITE_CONVEX_URL ?? readEnvFile(envFile).VITE_CONVEX_URL ?? null
}

export async function waitForConfiguredConvexUrl(envFile = localConvexEnvFile) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const convexUrl = getConfiguredConvexUrl(envFile)

    if (convexUrl) {
      return convexUrl
    }

    await delay(1000)
  }

  throw new Error(`No VITE_CONVEX_URL found in ${envFile} within 60 seconds.`)
}

export function localStateScript() {
  return `
    JSON.stringify({
      checkedCount: document.querySelectorAll('input:checked').length,
      dialogText: document.querySelector('[role="alertdialog"]')?.textContent?.trim() || null,
      formErrorText: document.querySelector('[data-testid="form-error"]')?.textContent?.trim() || null,
      historyBarCount: document.querySelectorAll('.history-bar').length,
      historyPanelText: document.querySelector('[data-testid="history-panel"]')?.textContent?.trim() || null,
      safetyPanelText: document.querySelector('[data-testid="safety-panel"]')?.textContent?.trim() || null,
      saveState: document.querySelector('[data-testid="save-status"]')?.getAttribute('data-save-state') || null,
      saveStatusText: document.querySelector('[data-testid="save-status"]')?.textContent?.trim() || null,
      score: document.querySelector('[data-testid="score-total"]')?.textContent?.trim() || null,
      severity: document.querySelector('[data-testid="severity-band"]')?.textContent?.trim() || null,
    });
  `
}

export function liveStateScript() {
  return `
    const text = document.body.innerText;
    JSON.stringify({
      excerpt: text.slice(0, 2500),
      scoreText:
        text.match(/score\\s*(?:is|:)\\s*(\\d{1,2})/i)?.[1] ||
        text.match(/phq-9 score\\s*(?:is|:)\\s*(\\d{1,2})/i)?.[1] ||
        null,
      severityText:
        text.match(/severity\\s*(?:is|:)\\s*(minimal or none|mild|moderate|moderately severe|severe)/i)?.[1] ||
        text.match(/(minimal or none|mild|moderate|moderately severe|severe)\\s*(?:depression)?/i)?.[1] ||
        null,
    });
  `
}

export function normalizeSeverity(value) {
  if (!value) {
    return ''
  }

  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace('minimal or none', 'none/minimal')
}

export async function waitForSavedResult(readState, { retries = 20, delayMs = 300 } = {}) {
  let latestState = null

  for (let attempt = 0; attempt < retries; attempt += 1) {
    latestState = readState()

    if (latestState.saveState === 'saved') {
      return latestState
    }

    if (latestState.saveState === 'error') {
      throw new Error(`Save entered an error state: ${JSON.stringify(latestState)}`)
    }

    await delay(delayMs)
  }

  throw new Error(`Timed out waiting for a saved result. Last state: ${JSON.stringify(latestState)}`)
}

export async function fetchLatestCompletedResponse(convexUrl) {
  const client = new ConvexHttpClient(convexUrl)

  return client.query(anyApi.responses.getLatestCompletedResponse, {})
}

export async function fetchRecentCompletedResponses(convexUrl, limit = 6) {
  const client = new ConvexHttpClient(convexUrl)

  return client.query(anyApi.responses.getRecentCompletedResponses, { limit })
}

import type { CompletedPhq9Response } from '#/lib/phq9'

export interface StoredCompletedPhq9Response extends CompletedPhq9Response {
  _id: string
  _creationTime: number
}

const STORAGE_KEY = 'phq9.completedResponses'

function getStorage() {
  if (typeof window === 'undefined') {
    throw new Error('PHQ-9 responses can only be saved in the browser.')
  }

  return window.localStorage
}

function readStoredResponses() {
  const rawValue = getStorage().getItem(STORAGE_KEY)

  if (!rawValue) {
    return []
  }

  try {
    const parsed = JSON.parse(rawValue)

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter(isStoredCompletedPhq9Response)
  } catch {
    return []
  }
}

function writeStoredResponses(responses: StoredCompletedPhq9Response[]) {
  getStorage().setItem(STORAGE_KEY, JSON.stringify(responses))
}

function isStoredCompletedPhq9Response(value: unknown): value is StoredCompletedPhq9Response {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Partial<StoredCompletedPhq9Response>

  return (
    typeof candidate._id === 'string' &&
    typeof candidate._creationTime === 'number' &&
    typeof candidate.submittedAt === 'string' &&
    Array.isArray(candidate.symptoms) &&
    typeof candidate.totalScore === 'number' &&
    typeof candidate.severityBand === 'string' &&
    typeof candidate.needsFollowUp === 'boolean' &&
    typeof candidate.item9Positive === 'boolean' &&
    typeof candidate.difficulty === 'string'
  )
}

function buildStoredResponse(response: CompletedPhq9Response): StoredCompletedPhq9Response {
  const creationTime = Date.now()
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `response-${creationTime}-${Math.random().toString(36).slice(2, 10)}`

  return {
    ...response,
    _id: id,
    _creationTime: creationTime,
  }
}

export async function saveCompletedResponse(response: CompletedPhq9Response) {
  const nextEntry = buildStoredResponse(response)
  const existingResponses = readStoredResponses()
  const nextResponses = [nextEntry, ...existingResponses].sort(
    (left, right) => right._creationTime - left._creationTime,
  )

  writeStoredResponses(nextResponses)
}

export async function fetchRecentCompletedResponses(limit = 6) {
  return readStoredResponses()
    .sort((left, right) => right._creationTime - left._creationTime)
    .slice(0, limit)
}

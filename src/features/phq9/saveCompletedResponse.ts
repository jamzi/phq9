import { ConvexHttpClient } from 'convex/browser'
import { anyApi } from 'convex/server'
import type { CompletedPhq9Response } from '#/lib/phq9'

export interface StoredCompletedPhq9Response extends CompletedPhq9Response {
  _id: string
  _creationTime: number
}

let convexClient: ConvexHttpClient | null = null

function getConvexHttpClient() {
  const convexUrl = import.meta.env.VITE_CONVEX_URL

  if (!convexUrl) {
    throw new Error('Saving is not configured. Set VITE_CONVEX_URL to enable Convex saves.')
  }

  convexClient ??= new ConvexHttpClient(convexUrl)

  return convexClient
}

export async function saveCompletedResponse(response: CompletedPhq9Response) {
  return getConvexHttpClient().mutation(anyApi.responses.createCompletedResponse, response)
}

export async function fetchRecentCompletedResponses(limit = 6) {
  return getConvexHttpClient().query(anyApi.responses.getRecentCompletedResponses, {
    limit,
  }) as Promise<StoredCompletedPhq9Response[]>
}

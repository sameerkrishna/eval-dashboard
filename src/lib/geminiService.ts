import type { AgentExplanationContext, ExplanationCacheEntry } from '@/types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/gemini-explain`;

const CACHE = new Map<string, ExplanationCacheEntry>();

function serializeContext(context: AgentExplanationContext): string {
  return JSON.stringify(context, Object.keys(context).sort());
}

function computeHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

function getCacheKey(agentId: string, contextHash: string): string {
  return `${agentId}:${contextHash}`;
}

export function generateFallbackExplanation(context: AgentExplanationContext): string {
  const paragraphs: string[] = [];

  const readiness = context.threshold_status === 'Pass';
  if (readiness) {
    paragraphs.push(`${context.agent_name} is currently at ${context.current_lifecycle_state} stage with an overall score of ${context.overall_score}/10. The agent meets all thresholds for promotion to ${context.promotion_target} and is marked as "${context.eval_result}". `);
  } else {
    paragraphs.push(`${context.agent_name} is currently at ${context.current_lifecycle_state} stage with an overall score of ${context.overall_score}/10. The agent is not yet ready for promotion to ${context.promotion_target} and is marked as "${context.eval_result}". `);
  }

  if (context.review_status === 'Pending Review' && context.review_reason) {
    paragraphs[0] += `A ${context.review_type || 'evaluation'} review is pending: ${context.review_reason}. `;
  }

  const strengths = context.strongest_metrics.length > 0
    ? `Key strengths include ${context.strongest_metrics.join(', ')}.`
    : 'No standout strengths identified.';
  const weaknesses = context.weakest_metrics.length > 0
    ? `Areas needing attention: ${context.weakest_metrics.join(', ')}.`
    : 'No significant weaknesses identified.';
  paragraphs.push(`${strengths} ${weaknesses}`);

  if (context.human_review_action) {
    const actionText = context.human_review_action === 'Approved' ? 'approved' : context.human_review_action === 'Rejected' ? 'rejected' : 'placed on hold';
    paragraphs.push(`Human Review: The reviewer ${actionText} the promotion from ${context.human_review_previous_state || 'N/A'} to ${context.human_review_target_state || 'N/A'}.${context.human_review_notes ? ` Reviewer notes: ${context.human_review_notes}` : ''}`);
  }

  if (context.critical_metrics_failed.length > 0) {
    paragraphs.push(`Critical metric failures are blocking: ${context.critical_metrics_failed.join(', ')} must pass before promotion. Team should prioritize fixing these issues.`);
  } else if (context.critical_metrics_passed.length > 0) {
    paragraphs.push(`All critical metrics are passing (${context.critical_metrics_passed.join(', ')}). The team can proceed with confidence toward ${context.promotion_target}.`);
  } else {
    paragraphs.push('Continue monitoring performance and address any emerging weaknesses before promotion.');
  }

  return paragraphs.join('\n\n');
}

async function streamText(
  text: string,
  onChunk: (chunk: string) => void,
  signal: AbortSignal
): Promise<void> {
  const chunks = text.split(/(?=[.!?]\s)/g);
  for (const chunk of chunks) {
    if (signal.aborted) break;
    onChunk(chunk);
    await new Promise(r => setTimeout(r, 90));
  }
}

async function callEdgeFunction(
  context: AgentExplanationContext,
  signal: AbortSignal
): Promise<string> {
  const response = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ context }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Explanation service error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  if (!data || typeof data.explanation !== 'string') {
    if (data && typeof data.error === 'string') {
      throw new Error(data.error);
    }
    throw new Error('Unexpected response from explanation service');
  }

  return data.explanation;
}

export function invalidateCache(agentId: string): void {
  for (const key of CACHE.keys()) {
    if (key.startsWith(`${agentId}:`)) {
      CACHE.delete(key);
    }
  }
}

export function getCacheEntry(agentId: string, context: AgentExplanationContext): ExplanationCacheEntry | null {
  const serialized = serializeContext(context);
  const hash = computeHash(serialized);
  const key = getCacheKey(agentId, hash);
  return CACHE.get(key) ?? null;
}

export async function generateExplanation(
  agentId: string,
  context: AgentExplanationContext,
  onChunk: (chunk: string) => void,
  signal: AbortSignal
): Promise<string> {
  const serialized = serializeContext(context);
  const hash = computeHash(serialized);
  const key = getCacheKey(agentId, hash);

  // Check cache
  const cached = CACHE.get(key);
  if (cached && cached.streamingStatus === 'complete') {
    await streamText(cached.responseText, onChunk, signal);
    return cached.responseText;
  }

  // Try the edge function (server-side Gemini call)
  try {
    const result = await callEdgeFunction(context, signal);
    const entry: ExplanationCacheEntry = {
      contextHash: hash,
      contextObject: context,
      responseText: result,
      timestamp: Date.now(),
      streamingStatus: 'complete',
    };
    CACHE.set(key, entry);
    await streamText(result, onChunk, signal);
    return result;
  } catch (e) {
    if (signal.aborted || (e instanceof Error && e.name === 'AbortError')) {
      throw e;
    }
    console.error('Edge function call failed, using fallback:', e);
    const fallback = generateFallbackExplanation(context);
    const entry: ExplanationCacheEntry = {
      contextHash: hash,
      contextObject: context,
      responseText: fallback,
      timestamp: Date.now(),
      streamingStatus: 'complete',
    };
    CACHE.set(key, entry);
    return fallback;
  }
}

export function getCacheSize(): number {
  return CACHE.size;
}

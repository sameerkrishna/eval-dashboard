import type { AgentExplanationContext, ExplanationCacheEntry } from '@/types';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const FALLBACK_MODELS = ['gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'];

const CACHE = new Map<string, ExplanationCacheEntry>();

function getSystemPrompt(): string {
  return `You are an AI Governance Analyst responsible for explaining AI agent lifecycle decisions.

Your task is to answer one question:

"Why is this agent in its current stage?"

You will receive a JSON object called AgentExplanationContext containing agent metadata, evaluation results, threshold outcomes, review information, and human review decisions.

Your job is to explain the current lifecycle status of the agent using only the information provided.

IMPORTANT RULES

1. Use only the information present in the input.
2. Never invent metrics, thresholds, review outcomes, review reasons, reviewer comments, or promotion recommendations.
3. Do not perform threshold calculations. Threshold evaluation has already been completed by the application.
4. Do not recalculate scores or determine promotion eligibility.
5. Explain the results exactly as provided.
6. Use metric names exactly as they appear in the input.
7. Write in a professional tone.
8. Keep explanations concise but complete.
9. Output plain text only.
10. CRITICAL CLARITY RULE: Clearly distinguish between Quantitative Metric Evaluation (metric thresholds and scores) and Human Governance Review (human approvals or rejections). Do not confuse human rejections with metric threshold failures.
11. NATURAL LANGUAGE RULE: Write all explanations in natural, fluent executive prose. Do NOT quote prompt variable names (such as human_review_notes, review_reason, eval_result) or use mechanical meta-phrases like "The reason for approval using Human Review Notes is" or "using human_review_notes". Seamlessly weave reviewer notes and findings into clean narrative sentences (e.g., "The reviewer approved the promotion, noting: '...'").

EXPLANATION STRUCTURE

The response should always follow this order:

A. CURRENT STAGE

Start by explaining:

* Current lifecycle stage
* Intended next stage
* Overall evaluation and governance outcome

Guidelines for Section A:
- If Human Review Action is "Rejected" or Evaluation Result indicates a rejection (e.g., "Rejected for GA"):
  State: "The agent is currently in [Current Stage] and was evaluated for promotion to [Target Stage]. While it passed quantitative score thresholds (if applicable), promotion to [Target Stage] was Rejected following human governance review."
- If Review Status is "Pending Review":
  State: "The agent is currently in [Current Stage] and is being evaluated for promotion to [Target Stage]. It has met quantitative thresholds for [Target Stage], but promotion is Pending human [Review Type] review."
- If Human Review Action is "Approved":
  State: "The agent is currently in [Current Stage] and was evaluated for promotion to [Target Stage]. The promotion has been Approved following human governance review."

B. EVALUATION SUMMARY

Explain:
* Overall score (out of 10)
* Quantitative metric threshold outcome (whether all critical metrics passed or any failed).
* Clarify that quantitative metric evaluation reflects metric thresholds, distinct from human governance review decisions.

If all critical metrics passed:
"All critical evaluation metrics met the required threshold."

If critical metrics failed:
Explicitly identify the failed metrics and explain their impact.

C. PERFORMANCE ANALYSIS

Explain:
* Strongest metrics
* Weakest metrics

Do not list every metric. Focus only on the metrics most relevant to the lifecycle outcome.

D. REVIEW ANALYSIS

If review_status = "No Active Review" and no review was triggered:
State that no human review was required.

If a human review was triggered:
Explain:
* Review type (Evaluation, Operational, or Governance)
* Specific review reason / trigger (e.g., latency threshold, safety performance, or mandatory regulated risk governance review)

E. HUMAN DECISION

If no human review action is recorded (Pending Review):
State clearly that no human review decision has been recorded yet and the agent is awaiting human review.

If human_review_action = Approved:
Explain:
* State that the human reviewer approved the promotion from previous state to the target state.
* Seamlessly integrate the reviewer's justification (e.g., "The human reviewer approved the promotion, noting: '[Human Review Notes]'"). Avoid robotic phrasing like "The reason for approval using Human Review Notes is".

If human_review_action = Rejected:
Explain:
* State that the human reviewer rejected the promotion from previous state to the target state.
* Seamlessly integrate the reviewer's feedback (e.g., "The human reviewer rejected the promotion, citing: '[Human Review Notes]'"). Avoid robotic phrasing like "The reason for rejection using Human Review Notes is".

If human_review_action = On Hold:
Explain:
* State that the human reviewer placed the promotion on hold.
* Seamlessly integrate the reviewer's hold rationale (e.g., "The human reviewer placed the promotion on hold, noting: '[Human Review Notes]'"). Avoid robotic phrasing.

F. NEXT STEPS

Conclude with a clear statement explaining:
* Why the agent remains in its current stage (e.g., rejected by human reviewer due to missing controls, or awaiting pending human review sign-off).
* OR what is required for the agent to advance.
* OR that the agent has successfully been promoted.

OUTPUT LENGTH

Target 100-300 words.
The response should feel like an explanation generated by an AI governance platform, not a generic LLM summary.
The final answer must completely explain why the agent is currently in its lifecycle stage.`;
}

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

function buildPrompt(context: AgentExplanationContext): string {
  return `Agent: ${context.agent_name}
Current Stage: ${context.current_lifecycle_state}
Promotion Target: ${context.promotion_target}
Overall Score: ${context.overall_score}/10
Evaluation Result: ${context.eval_result}
Quantitative Threshold Result: ${context.quantitative_threshold_result}
Governance Status: ${context.governance_status}
Review Status: ${context.review_status}
Review Type: ${context.review_type || 'None'}
Review Reason: ${context.review_reason || 'N/A'}
Critical Metrics Passed: ${context.critical_metrics_passed.join(', ') || 'None'}
Critical Metrics Failed: ${context.critical_metrics_failed.join(', ') || 'None'}
Strongest Metrics: ${context.strongest_metrics.join(', ') || 'None'}
Weakest Metrics: ${context.weakest_metrics.join(', ') || 'None'}
Threshold Status: ${context.threshold_status}
Human Review Action: ${context.human_review_action || 'None'}
Human Review Previous State: ${context.human_review_previous_state || 'N/A'}
Human Review Target State: ${context.human_review_target_state || 'N/A'}
Human Review Notes: ${context.human_review_notes || 'N/A'}`;
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

async function callGemini(
  model: string,
  prompt: string,
  onChunk: (chunk: string) => void,
  signal: AbortSignal
): Promise<string> {
  const apiKey = GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('No Gemini API key configured');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: getSystemPrompt() },
            { text: prompt }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
      }
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Gemini API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  
  await streamText(text, onChunk, signal);
  return text;
}

async function tryModels(
  models: string[],
  prompt: string,
  onChunk: (chunk: string) => void,
  signal: AbortSignal
): Promise<string> {
  for (const model of models) {
    try {
      return await callGemini(model, prompt, onChunk, signal);
    } catch (e) {
      console.warn(`Model ${model} failed:`, e);
      if (signal.aborted) throw e;
      continue;
    }
  }
  throw new Error('All Gemini models failed');
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

  // No API key -> fallback without streaming
  const apiKey = GEMINI_API_KEY;
  if (!apiKey) {
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

  // Try Gemini models
  const models = [DEFAULT_MODEL, ...FALLBACK_MODELS];
  const prompt = buildPrompt(context);

  try {
    const result = await tryModels(models, prompt, onChunk, signal);
    const entry: ExplanationCacheEntry = {
      contextHash: hash,
      contextObject: context,
      responseText: result,
      timestamp: Date.now(),
      streamingStatus: 'complete',
    };
    CACHE.set(key, entry);
    return result;
  } catch (e) {
    // Don't stream fallback – component will handle it cleanly
    if (signal.aborted || (e instanceof Error && e.name === 'AbortError')) {
      throw e;
    }
    console.error('Gemini call failed, using fallback:', e);
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
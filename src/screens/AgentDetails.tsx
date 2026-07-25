import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAppContext } from '@/lib/appContext';
import StatusBadge from '@/components/StatusBadge';
import SectionCard from '@/components/SectionCard';
import EmptyState from '@/components/EmptyState';
import { generateExplanation, getCacheEntry, generateFallbackExplanation } from '@/lib/geminiService';
import { buildExplanationContext, formatValue } from '@/lib/enrichmentEngine';
import type { EnrichedAgent } from '@/types';
import { ArrowLeft, AlertTriangle, CheckCircle, XCircle, Brain } from 'lucide-react';

export default function AgentDetails() {
  const { id } = useParams<{ id: string }>();
  const { agents } = useAppContext();
  const [activeTab, setActiveTab] = useState<'overview' | 'metrics' | 'review'>('overview');

  const agent = agents.find(a => a.agent_id === id);

  if (!agent) {
    return (
      <div className="max-w-4xl mx-auto">
        <EmptyState title="Agent not found" message="The agent you are looking for does not exist." />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Link to="/" className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">Portfolio</Link>
        <span>/</span>
        <span className="text-gray-900 dark:text-white font-medium">{agent.agent_name}</span>
      </div>

      {/* Header Card */}
      <AgentHeaderCard agent={agent} />

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-6">
          {(['overview', 'metrics', 'review'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 text-sm font-medium border-b-2 transition-colors capitalize ${
                activeTab === tab
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && <OverviewTab agent={agent} />}
      {activeTab === 'metrics' && <MetricsTab agent={agent} />}
      {activeTab === 'review' && <ReviewTab agent={agent} />}
    </div>
  );
}

function AgentHeaderCard({ agent }: { agent: EnrichedAgent }) {
  function getLifecycleVariant(state: string): 'in-dev' | 'beta' | 'ga' {
    if (state === 'In Dev') return 'in-dev';
    if (state === 'Beta') return 'beta';
    return 'ga';
  }

  function getRiskVariant(risk: string): 'critical' | 'high' | 'medium' | 'low' {
    if (risk === 'Regulated') return 'critical';
    if (risk === 'Consumer') return 'high';
    return 'medium';
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-start gap-6">
        {/* Left: agent info */}
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{agent.agent_name}</h1>
            <StatusBadge label={agent.risk_category} variant={getRiskVariant(agent.risk_category)} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge label={agent.current_lifecycle_state} variant={getLifecycleVariant(agent.current_lifecycle_state)} />
            <span className="text-gray-400 dark:text-gray-500">→</span>
            <StatusBadge label={agent.next_lifecycle_state} variant={getLifecycleVariant(agent.next_lifecycle_state)} />
            <StatusBadge label={agent.eval_result} variant={agent.eval_result.includes('Ready') || agent.eval_result === 'GA Compliant' ? 'success' : 'warning'} />
            {agent.pending_review && <StatusBadge label="Pending Review" variant="pending" />}
          </div>
        </div>

        {/* Center: overall score */}
        <div className="flex flex-col items-center justify-center text-center">
          <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-0.5">Overall Score</div>
          <div className={`text-4xl font-bold tabular-nums ${
            agent.overall_score >= 8.0 ? 'text-success-600 dark:text-success-400' :
            agent.overall_score >= 7.0 ? 'text-primary-600 dark:text-primary-400' :
            'text-warning-600 dark:text-warning-400'
          }`}>
            {agent.overall_score.toFixed(1)}
          </div>
          <div className="text-xs text-gray-400 dark:text-gray-500">out of 10</div>
        </div>

        {/* Right: back link */}
        <div className="flex justify-end">
          <Link
            to="/"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Portfolio
          </Link>
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ agent }: { agent: EnrichedAgent }) {
  return (
    <div className="space-y-6">
      <AiExplanationCard agent={agent} />
      <LifecycleSummaryCard agent={agent} />
      <StrengthsWeaknessesCard agent={agent} />
    </div>
  );
}

function AiExplanationCard({ agent }: { agent: EnrichedAgent }) {
  const [explanation, setExplanation] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFallback, setIsFallback] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isMounted = useRef(true);
  const minThinkingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const cacheKey = agent.agent_id;

  const generate = useCallback(async (force = false) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    if (minThinkingTimeoutRef.current) {
      clearTimeout(minThinkingTimeoutRef.current);
      minThinkingTimeoutRef.current = null;
    }

    const currentRequestId = ++requestIdRef.current;
    abortRef.current = new AbortController();

    setIsLoading(true);
    setError(null);
    setExplanation('');
    setIsFallback(false);

    const minThinkingPromise = new Promise<void>(resolve => {
      minThinkingTimeoutRef.current = setTimeout(resolve, 600);
    });

    const context = buildExplanationContext(agent);

    try {
      if (!abortRef.current.signal.aborted) {
        await minThinkingPromise;
      }

      if (requestIdRef.current !== currentRequestId) return;

      if (!force) {
        const cached = getCacheEntry(cacheKey, context);
        if (cached) {
          const chunks = cached.responseText.split(/(?=[.!?]\s)/g);
          let fullText = '';
          for (const chunk of chunks) {
            if (!isMounted.current || abortRef.current?.signal.aborted) break;
            if (requestIdRef.current !== currentRequestId) break;
            fullText += chunk;
            setExplanation(fullText);
            await new Promise(r => setTimeout(r, 30));
          }
          if (requestIdRef.current === currentRequestId) {
            setIsLoading(false);
          }
          return;
        }
      }

      const result = await generateExplanation(
        cacheKey,
        context,
        (chunk) => {
          if (requestIdRef.current === currentRequestId && isMounted.current && !abortRef.current?.signal.aborted) {
            setExplanation(prev => prev + chunk);
          }
        },
        abortRef.current.signal
      );

      if (requestIdRef.current === currentRequestId) {
        setIsFallback(!result.includes(agent.agent_name) && !result.includes('agent'));
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      if (abortRef.current?.signal.aborted) return;

      if (requestIdRef.current === currentRequestId && isMounted.current) {
        const fallbackText = generateFallbackExplanation(context);
        setExplanation(fallbackText);
        setIsFallback(true);
        setError(null);
      }
    } finally {
      if (minThinkingTimeoutRef.current) {
        clearTimeout(minThinkingTimeoutRef.current);
        minThinkingTimeoutRef.current = null;
      }
      if (requestIdRef.current === currentRequestId && isMounted.current) {
        setIsLoading(false);
      }
    }
  }, [agent, cacheKey]);

  useEffect(() => {
    isMounted.current = true;
    generate(false);
    return () => {
      isMounted.current = false;
      if (abortRef.current) {
        abortRef.current.abort();
      }
      if (minThinkingTimeoutRef.current) {
        clearTimeout(minThinkingTimeoutRef.current);
        minThinkingTimeoutRef.current = null;
      }
    };
  }, [generate]);

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <img
            src="/gemini-color.png"
            alt=""
            className="h-5 w-5 inline-block"
          />
         Why the Agent is in its Current Stage
        </span>
      }
    >
      <div className="min-h-[160px]">
        {isLoading && explanation === '' && (
          <div className="flex flex-col items-center justify-center py-8">
            <Brain className="w-9 h-9 text-black dark:text-white animate-pulse" />
            <div className="flex items-center gap-1 mt-3">
              <span className="text-sm text-gray-500 dark:text-gray-400">Thinking</span>
              <span className="flex gap-0.5 ml-1">
                <span className="w-1 h-1 bg-black dark:bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 bg-black dark:bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 bg-black dark:bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          </div>
        )}
        {error && (
          <div className="text-sm text-error-600 dark:text-error-400">{error}</div>
        )}
        {explanation && (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{explanation}</p>
            {isFallback && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 italic">Generated using deterministic fallback (no LLM available)</p>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function LifecycleSummaryCard({ agent }: { agent: EnrichedAgent }) {
  return (
    <SectionCard title="Lifecycle Summary">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-3 bg-gray-50 dark:bg-gray-900/30 rounded-md">
          <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">Current Stage</div>
          <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{agent.current_lifecycle_state}</div>
        </div>
        <div className="p-3 bg-gray-50 dark:bg-gray-900/30 rounded-md">
          <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">Promotion Target</div>
          <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{agent.next_lifecycle_state}</div>
        </div>
        <div className="p-3 bg-gray-50 dark:bg-gray-900/30 rounded-md">
          <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">Eligibility</div>
          <div className={`mt-1 text-lg font-semibold ${agent.eval_result.includes('Ready') || agent.eval_result === 'GA Compliant' ? 'text-success-600 dark:text-success-400' : 'text-warning-600 dark:text-warning-400'}`}>
            {agent.eval_result}
          </div>
        </div>
      </div>
      {agent.review_reason && agent.pending_review && (
        <div className="mt-4 p-3 bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-md">
          <div className="flex items-center gap-2 text-sm text-warning-700 dark:text-warning-300">
            <AlertTriangle className="w-4 h-4" />
            <span className="font-medium">Review Required:</span>
            <span>{agent.review_reason}</span>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function StrengthsWeaknessesCard({ agent }: { agent: EnrichedAgent }) {
  return (
    <SectionCard title="Strengths & Weaknesses">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h4 className="text-sm font-semibold text-success-700 dark:text-success-400 mb-3 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Top 3 Strengths
          </h4>
          {agent.strongest_metrics.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No standout strengths identified.</p>
          ) : (
            <ul className="space-y-2">
              {agent.strongest_metrics.map((m, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 dark:text-gray-300">{m.metric_name}</span>
                  <span className="font-medium text-success-600 dark:text-success-400">{m.display_value}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h4 className="text-sm font-semibold text-error-700 dark:text-error-400 mb-3 flex items-center gap-2">
            <XCircle className="w-4 h-4" />
            Top 3 Weaknesses
          </h4>
          {agent.weakest_metrics.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No significant weaknesses identified.</p>
          ) : (
            <ul className="space-y-2">
              {agent.weakest_metrics.map((m, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className={`${m.failed ? 'text-error-700 dark:text-error-300 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>
                    {m.metric_name}
                    {m.is_critical && <span className="ml-1 text-xs text-error-500">(critical)</span>}
                  </span>
                  <span className={`font-medium ${m.failed ? 'text-error-600 dark:text-error-400' : 'text-gray-600 dark:text-gray-400'}`}>
                    {m.display_value}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {agent.critical_metrics_failed.length > 0 && (
        <div className="mt-4 p-3 bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-md">
          <p className="text-sm text-error-700 dark:text-error-300">
            <strong>Blockers:</strong> {agent.critical_metrics_failed.join(', ')} must pass before promotion.
          </p>
        </div>
      )}
      {agent.critical_metrics_failed.length === 0 && agent.weakest_metrics.length > 0 && (
        <div className="mt-4 p-3 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-md">
          <p className="text-sm text-primary-700 dark:text-primary-300">
            <strong>Improvement Areas:</strong> Focus on {agent.weakest_metrics.map(m => m.metric_name).join(', ')} to strengthen readiness.
          </p>
        </div>
      )}
    </SectionCard>
  );
}

function MetricsTab({ agent }: { agent: EnrichedAgent }) {
  const thresholdLabel = 'Threshold';

  return (
    <div className="space-y-6">
      <SectionCard title="Metric Breakdown">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Metric</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Category</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Value</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">{thresholdLabel}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {agent.metric_results.map(metric => {
                const displayValue = formatValue(metric.value, metric.display_format);
                const displayThreshold = metric.display_format === 'latency_ms' || metric.display_format === 'currency'
                  ? '—'
                  : metric.display_format === 'boolean'
                    ? 'True'
                    : metric.threshold.toFixed(1);
                return (
                  <tr key={metric.metric_id} className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                      {metric.metric_name}
                      {metric.is_critical && <span className="ml-1 text-xs text-error-500">*</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{metric.category}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{displayValue}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{displayThreshold}</td>
                    <td className="px-4 py-3">
                      <MetricStatusBadge status={metric.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Scoring Methodology" collapsible defaultOpen={true}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-gray-600 dark:text-gray-400">
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Metric Weights</h4>
            <ul className="space-y-1">
              <li>Completeness: 10%</li>
              <li>Accuracy: 10%</li>
              <li>Faithfulness: 15%</li>
              <li>Safety Score: 20%</li>
              <li>Graceful Fallback: 15%</li>
              <li>Task Completion Rate: 10%</li>
              <li>Answer Relevancy: 10%</li>
              <li>Response Clarity: 10%</li>
            </ul>
          </div>
          <div className="mt-6">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Scoring Methodology</h4>
            <div className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
              <p>Overall Score = (Completeness × 0.1) + (Accuracy × 0.1) + (Answer Relevancy × 0.1) + (Faithfulness × 0.15) + (Response Clarity × 0.1) + (Safety × 0.2) + (Graceful Fallback × 0.15) + (Task Completion Rate × 0.1)</p>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function MetricStatusBadge({ status }: { status: string }) {
  const variants: Record<string, { label: string; class: string }> = {
    pass: { label: 'Pass', class: 'bg-success-50 text-success-700 border-success-200 dark:bg-success-900/30 dark:text-success-400 dark:border-success-700' },
    fail: { label: 'Fail', class: 'bg-error-50 text-error-700 border-error-200 dark:bg-error-900/30 dark:text-error-400 dark:border-error-700' },
    review: { label: 'Review', class: 'bg-warning-50 text-warning-700 border-warning-200 dark:bg-warning-900/30 dark:text-warning-400 dark:border-warning-700' },
    'Informational': { label: 'Informational', class: 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600' },
  };
  const v = variants[status] ?? variants['Informational'];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${v.class}`}>
      {v.label}
    </span>
  );
}

function ReviewTab({ agent }: { agent: EnrichedAgent }) {
  function getLifecycleVariant(state: string): 'in-dev' | 'beta' | 'ga' {
    if (state === 'In Dev') return 'in-dev';
    if (state === 'Beta') return 'beta';
    return 'ga';
  }

  function getReviewTypeVariant(type: string): 'neutral' | 'warning' {
    if (type === 'Evaluation') return 'neutral';
    if (type === 'Operational') return 'warning';
    if (type === 'Governance') return 'neutral';
    return 'neutral';
  }

  return (
    <div className="space-y-6">
      {agent.pending_review && (
        <SectionCard title="Pending Review">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-sm">
                <span className="text-gray-500 dark:text-gray-400">Type:</span>
                <span className="ml-2">
                  <StatusBadge label={agent.pending_review.review_type} variant={getReviewTypeVariant(agent.pending_review.review_type)} />
                </span>
              </div>
              <div className="text-sm">
                <span className="text-gray-500 dark:text-gray-400">Status:</span>
                <span className="ml-2">
                  <StatusBadge label="Pending" variant="pending" />
                </span>
              </div>
              <div className="text-sm">
                <span className="text-gray-500 dark:text-gray-400">Reason:</span>
                <span className="ml-2 font-medium text-gray-900 dark:text-white">{agent.pending_review.review_reason}</span>
              </div>
            </div>
            {/* Evidence Section */}
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 capitalize">
                {agent.pending_review.review_type === 'Evaluation' && 'Evaluation Samples'}
                {agent.pending_review.review_type === 'Operational' && 'Operational Evidence'}
                {agent.pending_review.review_type === 'Governance' && 'Governance Evidence'}
              </h4>
              <ReviewEvidenceSection reviewType={agent.pending_review.review_type} agent={agent} />
            </div>
          </div>
        </SectionCard>
      )}

      {agent.completed_reviews.length > 0 && (
        <SectionCard title="Review History">
          <div className="space-y-4">
            {agent.completed_reviews.map(review => (
              <div key={review.review_id} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-md border border-gray-200 dark:border-gray-600">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white capitalize">{review.review_type} Review</span>
                    <StatusBadge label={review.review_type} variant={getReviewTypeVariant(review.review_type)} />
                  </div>
                  <StatusBadge
                    label={review.reviewer_action ?? 'N/A'}
                    variant={review.reviewer_action === 'Approved' ? 'success' : review.reviewer_action === 'Rejected' ? 'error' : 'warning'}
                  />
                </div>
                {/* Lifecycle states */}
                {(review.previous_lifecycle_state || review.current_lifecycle_state) && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 p-3 bg-white dark:bg-gray-800 rounded-md">
                    <div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Previous State</span>
                      <div className="mt-1">
                        {review.previous_lifecycle_state ? (
                          <StatusBadge label={review.previous_lifecycle_state} variant={getLifecycleVariant(review.previous_lifecycle_state)} />
                        ) : (
                          <span className="text-sm text-gray-400">N/A</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Target State</span>
                      <div className="mt-1">
                        <StatusBadge label={agent.promotion_target} variant={agent.promotion_target ? getLifecycleVariant(agent.promotion_target) : 'neutral'} />
                      </div>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Action Taken</span>
                      <div className="mt-1">
                        <StatusBadge
                          label={review.reviewer_action ?? 'N/A'}
                          variant={review.reviewer_action === 'Approved' ? 'success' : review.reviewer_action === 'Rejected' ? 'error' : 'warning'}
                        />
                      </div>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Current State</span>
                      <div className="mt-1">
                        {review.current_lifecycle_state ? (
                          <StatusBadge label={review.current_lifecycle_state} variant={getLifecycleVariant(review.current_lifecycle_state)} />
                        ) : (
                          <span className="text-sm text-gray-400">N/A</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mb-2">
                  <span>Provided by Reviewer: {review.reviewer ?? 'N/A'}</span>
                  <span>{review.review_timestamp ? new Date(review.review_timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'}</span>
                </div>
                {review.reviewer_notes && (
                  <p className="text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 p-2 rounded">{review.reviewer_notes}</p>
                )}
                {/* Evidence Section */}
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                  <h5 className="text-xs font-semibold text-gray-900 dark:text-white mb-2 capitalize">
                    {review.review_type === 'Evaluation' && 'Evaluation Samples'}
                    {review.review_type === 'Operational' && 'Operational Evidence'}
                    {review.review_type === 'Governance' && 'Governance Evidence'}
                  </h5>
                  <ReviewEvidenceSection reviewType={review.review_type} agent={agent} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {!agent.pending_review && agent.completed_reviews.length === 0 && agent.sample_reviews.length === 0 && (
        <EmptyState title="No review data available" message="This agent has no pending or completed reviews." />
      )}
    </div>
  );
}

function ReviewEvidenceSection({
  reviewType,
  agent,
}: {
  reviewType: string;
  agent: EnrichedAgent;
}) {
  // Operational reviews use "Performance" sample type in the data
  const matchingSamples = agent.sample_reviews.filter(s => {
    if (reviewType === 'Operational') {
      return s.review_type === 'Performance' || s.review_type === 'Operational';
    }
    return s.review_type === reviewType;
  });

  if (matchingSamples.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No sample evidence available for this review.</p>;
  }

  if (reviewType === 'Evaluation') {
    return (
      <div className="space-y-3">
        {matchingSamples.map(sample => (
          <div key={sample.review_id} className="p-3 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
            <div className="mb-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Prompt</span>
              <p className="text-sm text-gray-800 dark:text-gray-200 mt-1">{sample.prompt || 'Not provided'}</p>
            </div>
            <div className="mb-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Expected Response</span>
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{sample.expected_response || 'Not provided'}</p>
            </div>
            <div className="mb-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actual Response</span>
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{sample.actual_response || 'Not provided'}</p>
            </div>
            <div className="mb-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Reviewer Note</span>
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{sample.reviewer_note || 'Not provided'}</p>
            </div>
            <div className="mt-3">
              {sample.reviewer_action ? (
                <StatusBadge
                  label={sample.reviewer_action === 'Pass Sample' ? 'Marked as Pass' : 'Marked as Fail'}
                  variant={sample.reviewer_action === 'Pass Sample' ? 'success' : 'error'}
                />
              ) : (
                <span className="text-xs text-gray-400 dark:text-gray-500">No action recorded</span>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (reviewType === 'Operational') {
    const latencyMetric = agent.metric_results.find(m => m.metric_name === 'Latency (P95)' || m.metric_name === 'Latency(p95)' || m.metric_name === 'Latency');
    const opSamples = matchingSamples;

    if (latencyMetric) {
      return (
        <div className="p-3 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-700 dark:text-gray-300">Observed Latency (P95)</span>
            <span className={`font-medium ${latencyMetric.passed ? 'text-success-600 dark:text-success-400' : 'text-error-600 dark:text-error-400'}`}>
              {Math.round(latencyMetric.value)}ms
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-700 dark:text-gray-300">Target Latency</span>
            <span className="font-medium text-gray-900 dark:text-white">{Math.round(latencyMetric.threshold)}ms</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-700 dark:text-gray-300">Status</span>
            <span className={`font-medium ${latencyMetric.passed ? 'text-success-600 dark:text-success-400' : 'text-error-600 dark:text-error-400'}`}>
              {latencyMetric.passed ? 'Within Target' : 'Exceeds Target'}
            </span>
          </div>
          {opSamples.length > 0 && opSamples[0].reviewer_note && (
            <div>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Reviewer Note</span>
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{opSamples[0].reviewer_note}</p>
            </div>
          )}
        </div>
      );
    }

    if (opSamples.length > 0) {
      return (
        <div className="space-y-3">
          {opSamples.map(sample => (
            <div key={sample.review_id} className="p-3 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-700 dark:text-gray-300">Observed Latency</span>
                <span className="font-medium text-error-600 dark:text-error-400">{sample.actual_response || 'N/A'}</span>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Reviewer Note</span>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{sample.reviewer_note || 'Not provided'}</p>
              </div>
            </div>
          ))}
        </div>
      );
    }

    return <p className="text-sm text-gray-500 dark:text-gray-400">Latency data unavailable.</p>;
  }

  if (reviewType === 'Governance') {
    return (
      <div className="space-y-3">
        {matchingSamples.map(sample => {
          const isPass = sample.actual_response === 'Implemented' || sample.actual_response === 'Configured';
          const isPartial = sample.actual_response === 'Partial';
          return (
            <div key={sample.review_id} className="p-3 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-700 dark:text-gray-300">{sample.prompt || 'Control'}</span>
                <span className={`font-medium ${isPass ? 'text-success-600 dark:text-success-400' : isPartial ? 'text-warning-600 dark:text-warning-400' : 'text-error-600 dark:text-error-400'}`}>
                  {sample.actual_response || 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Reviewer Note</span>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{sample.reviewer_note || 'Not provided'}</p>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return <p className="text-sm text-gray-500 dark:text-gray-400">No sample evidence available for this review.</p>;
}
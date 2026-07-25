import type {
  Agent, Metric, AgentMetric, Threshold, SampleReview, AgentReview,
  EnrichedAgent, MetricResult, StrongestMetric, WeakestMetric, AgentExplanationContext,
} from '@/types';

export function formatValue(value: number, displayFormat: string): string {
  switch (displayFormat) {
    case 'numeric':
      return value.toFixed(1);
    case 'boolean':
      return value === 1 ? 'True' : 'False';
    case 'latency_ms':
      return `${Math.round(value)}ms`;
    case 'currency':
      return '$' + value.toFixed(2);
    case 'percentage':
      return `${(value * 100).toFixed(0)}%`;
    default:
      return String(value);
  }
}

export const LIFECYCLE_ORDER = ['In Dev', 'Beta', 'GA'];

export function getLifecycleIndex(state: string): number {
  const idx = LIFECYCLE_ORDER.indexOf(state);
  return idx === -1 ? 0 : idx;
}

function getMetricStatus(
  passed: boolean,
  isScored: boolean,
  _isCritical: boolean,
  inReviewBand: boolean,
): MetricResult['status'] {
  if (!isScored) return 'non-scored';
  if (inReviewBand) return 'review';
  if (passed) return 'pass';
  return 'fail';
}

function isInReviewBand(value: number, displayFormat: string, isCritical: boolean, threshold: number): boolean {
  if (displayFormat === 'latency_ms' || displayFormat === 'currency' || displayFormat === 'boolean') return false;
  if (!isCritical) return false;
  const low = threshold - 0.1;
  const high = threshold + 0.1;
  return value >= low && value <= high;
}

export function enrichAgent(
  agent: Agent,
  metrics: Metric[],
  agentMetrics: AgentMetric[],
  thresholds: Threshold[],
  sampleReviews: SampleReview[],
  agentReviews: AgentReview[],
): EnrichedAgent {
  const myMetrics = agentMetrics.filter(am => am.agent_id === agent.agent_id);
  const myReviews = agentReviews.filter(r => r.agent_id === agent.agent_id);
  const mySamples = sampleReviews.filter(s => s.agent_id === agent.agent_id);

  const pendingReview = myReviews.find(r => r.review_status === 'pending') ?? null;
  const completedReviews = myReviews.filter(r => r.review_status === 'completed');

  const betaThresholds = thresholds.filter(t => t.lifecycle_stage === 'Beta');
  const gaThresholds = thresholds.filter(t => t.lifecycle_stage === 'GA');

  const metricResults: MetricResult[] = myMetrics.map(am => {
    const metricDef = metrics.find(m => m.metric_id === am.metric_id || m.metric_name === am.metric_name);
    const isCritical = metricDef?.is_critical ?? false;
    const isScored = (metricDef?.weight ?? 0) > 0;
    const displayFormat = metricDef?.display_format ?? 'numeric';
    const inBand = isInReviewBand(am.value, displayFormat, isCritical, am.threshold);
    const status = getMetricStatus(am.passed, isScored, isCritical, inBand);
    const margin = am.value - am.threshold;

    return {
      metric_id: am.metric_id,
      metric_name: am.metric_name,
      category: metricDef?.category ?? 'General',
      value: am.value,
      threshold: am.threshold,
      passed: am.passed,
      is_critical: isCritical,
      is_scored: isScored,
      weight: metricDef?.weight ?? 0,
      display_format: displayFormat,
      scoring_type: metricDef?.scoring_type ?? 'higher_is_better',
      status,
      margin,
    };
  });

  const criticalResults = metricResults.filter(m => m.is_critical);
  const criticalPassed = criticalResults.filter(m => m.passed).map(m => m.metric_name);
  const criticalFailed = criticalResults.filter(m => !m.passed).map(m => m.metric_name);

  const scoredResults = metricResults.filter(m => m.is_scored && m.display_format === 'numeric');

  const strongestMetrics: StrongestMetric[] = [...scoredResults]
    .sort((a, b) => (b.value - b.threshold) - (a.value - a.threshold))
    .slice(0, 3)
    .map(m => ({
      metric_name: m.metric_name,
      value: m.value,
      display_value: formatValue(m.value, m.display_format),
      is_critical: m.is_critical,
    }));

  const weakestMetrics: WeakestMetric[] = [...scoredResults]
    .sort((a, b) => (a.value - a.threshold) - (b.value - b.threshold))
    .slice(0, 3)
    .map(m => ({
      metric_name: m.metric_name,
      value: m.value,
      display_value: formatValue(m.value, m.display_format),
      is_critical: m.is_critical,
      failed: !m.passed,
    }));

  const betaThresholdResults = betaThresholds.map(t => {
    const m = myMetrics.find(am => am.metric_name === t.metric_name);
    const passed = m ? (t.operator === '>=' ? m.value >= t.required_value : m.value <= t.required_value) : false;
    return { metric_name: t.metric_name, passed, is_critical: t.is_critical };
  });

  const gaThresholdResults = gaThresholds.map(t => {
    const m = myMetrics.find(am => am.metric_name === t.metric_name);
    const passed = m ? (t.operator === '>=' ? m.value >= t.required_value : m.value <= t.required_value) : false;
    return { metric_name: t.metric_name, passed, is_critical: t.is_critical };
  });

  const observabilityMetric = myMetrics.find(m => m.metric_name === 'Observability Implementation');
  const observabilityStatus = observabilityMetric?.value === 1 ? 'Implemented' : 'Not Implemented';

  const promotionTarget = agent.next_lifecycle_state === 'None'
    ? 'N/A'
    : agent.next_lifecycle_state;

  const allCriticalPassedBeta = betaThresholdResults.filter(t => t.is_critical).every(t => t.passed);
  const allCriticalPassedGA = gaThresholdResults.filter(t => t.is_critical).every(t => t.passed);

  let evalResult = agent.eval_result;
  let overallStatusLabel = 'Needs Improvement';
  if (agent.current_lifecycle_state === 'GA') {
    overallStatusLabel = 'GA Compliant';
  } else if (allCriticalPassedGA && observabilityStatus === 'Implemented') {
    overallStatusLabel = 'Ready for GA';
  } else if (allCriticalPassedBeta) {
    overallStatusLabel = 'Ready for Beta';
  }

  let reviewTriggerType: string | null = null;
  let reviewReason: string | null = null;
  if (pendingReview) {
    reviewTriggerType = pendingReview.review_type;
    reviewReason = pendingReview.review_reason;
  }

  const isBlocked = pendingReview !== null && pendingReview.action_required;

  return {
    agent_id: agent.agent_id,
    agent_name: agent.agent_name,
    risk_category: agent.risk_category,
    current_lifecycle_state: agent.current_lifecycle_state,
    next_lifecycle_state: agent.next_lifecycle_state,
    eval_result: evalResult,
    overall_score: agent.overall_score,
    promotion_target: promotionTarget,
    review_trigger_type: reviewTriggerType,
    review_reason: reviewReason,
    observability_status: observabilityStatus,
    overall_status_label: overallStatusLabel,
    critical_metrics_passed: criticalPassed,
    critical_metrics_failed: criticalFailed,
    strongest_metrics: strongestMetrics,
    weakest_metrics: weakestMetrics,
    metric_results: metricResults,
    threshold_results: {
      beta: betaThresholdResults,
      ga: gaThresholdResults,
    },
    pending_review: pendingReview,
    completed_reviews: completedReviews,
    sample_reviews: mySamples,
    all_reviews: myReviews,
    is_blocked: isBlocked,
  };
}

export function buildExplanationContext(agent: EnrichedAgent): AgentExplanationContext {
  const reviewStatus = agent.pending_review ? 'Pending Review' : 'No Active Review';
  const thresholdStatus = agent.critical_metrics_failed.length === 0
    ? 'All critical metrics passing'
    : `${agent.critical_metrics_failed.length} critical metric(s) failing: ${agent.critical_metrics_failed.join(', ')}`;

  const lastCompletedReview = agent.completed_reviews[agent.completed_reviews.length - 1] ?? null;

  return {
    agent_name: agent.agent_name,
    current_lifecycle_state: agent.current_lifecycle_state,
    overall_score: agent.overall_score,
    promotion_target: agent.promotion_target,
    eval_result: agent.eval_result,
    review_status: reviewStatus,
    review_type: agent.review_trigger_type ?? lastCompletedReview?.review_type ?? null,
    review_reason: agent.review_reason ?? lastCompletedReview?.review_reason ?? null,
    critical_metrics_passed: agent.critical_metrics_passed,
    critical_metrics_failed: agent.critical_metrics_failed,
    strongest_metrics: agent.strongest_metrics.map(m => `${m.metric_name}: ${m.display_value}`),
    weakest_metrics: agent.weakest_metrics.map(m => `${m.metric_name}: ${m.display_value}`),
    threshold_status: thresholdStatus,
    human_review_action: lastCompletedReview?.reviewer_action ?? null,
    human_review_previous_state: lastCompletedReview?.previous_lifecycle_state ?? null,
    human_review_target_state: lastCompletedReview?.next_lifecycle_state ?? null,
    human_review_notes: lastCompletedReview?.reviewer_notes ?? null,
  };
}

import type { Agent, Metric, AgentMetric, Threshold, SampleReview, AgentReview } from '@/types';
import agentsData from '@/data/agents.json';
import metricsDefinitionsData from '@/data/metrics_definitions.json';
import agentMetricsData from '@/data/agent_metrics.json';
import thresholdsData from '@/data/thresholds.json';
import sampleReviewsData from '@/data/HITL_sample_review.json';
import agentReviewsData from '@/data/HITL_agent_review.json';

export interface LoadedData {
  agents: Agent[];
  metrics: Metric[];
  agentMetrics: AgentMetric[];
  thresholds: Threshold[];
  sampleReviews: SampleReview[];
  agentReviews: AgentReview[];
  errors: string[];
}

// --- Raw data type definitions ---

interface RawAgent {
  agent_id: number;
  agent_name: string;
  risk_category: string;
  current_state: string;
  next_state: string;
  overall_score: number;
  latest_eval_date: string;
  eval_result: string;
  needs_review: boolean;
  review_status: string;
  review_type: string;
  summary: string;
}

interface RawMetricDef {
  metric_id: number;
  metric_name: string;
  category: string;
  severity: string;
}

interface RawAgentMetrics {
  agent_id: number;
  agent_name: string;
  metrics: Record<string, number>;
}

interface RawThresholds {
  Beta: {
    overall_score: number;
    critical_metrics: Record<string, number>;
  };
  GA: {
    overall_score: number;
    critical_metrics: Record<string, number>;
    observability_required?: boolean;
  };
  review_rules: {
    beta_review: {
      overall_score_range: [number, number];
      critical_metric_range: [number, number];
    };
    ga_review: {
      overall_score_range: [number, number];
      critical_metric_range: [number, number];
    };
    operational_review: {
      latency_ms: number;
    };
    governance_review: {
      observability_required: boolean;
    };
  };
}

interface RawSampleReview {
  agent_id: number;
  sample_type: string;
  action_required: boolean;
  samples: RawSample[];
}

interface RawSample {
  sample_id: number;
  prompt?: string;
  expected_response?: string;
  actual_response?: string;
  reviewer_action?: string | null;
  reviewer_note?: string;
  observed_latency?: number;
  target_latency?: number;
  control?: string;
  status?: string;
}

interface RawAgentReview {
  review_id: number;
  agent_id: number;
  review_type: string;
  review_reason: string;
  previous_state: string;
  current_state: string;
  next_state: string;
  review_status: string;
  action_taken: string | null;
  review_timestamp: string | null;
  reviewer: string | null;
  review_notes: string | null;
}

// --- Helper functions ---

function getMetricWeight(metricName: string): number {
  const weights: Record<string, number> = {
    'Completeness': 0.10,
    'Accuracy': 0.10,
    'Faithfulness': 0.15,
    'Safety Score': 0.20,
    'Graceful Fallback': 0.15,
    'Task Completion Rate': 0.10,
    'Answer Relevancy': 0.10,
    'Response Clarity': 0.10,
    'Latency(p95)': 0.00,
    'Latency': 0.00,
    'Cost per Conversation': 0.00,
    'Observability Implementation': 0.00,
  };
  return weights[metricName] ?? 0.00;
}

function isCriticalMetric(metricName: string): boolean {
  const critical = ['Completeness', 'Accuracy', 'Faithfulness', 'Safety Score', 'Graceful Fallback'];
  return critical.includes(metricName);
}

function getScoringType(metricName: string): string {
  if (metricName === 'Latency(p95)' || metricName === 'Latency' || metricName === 'Cost per Conversation') return 'lower_is_better';
  return 'higher_is_better';
}

function getDisplayFormat(metricName: string): string {
  if (metricName === 'Latency(p95)' || metricName === 'Latency') return 'latency_ms';
  if (metricName === 'Cost per Conversation') return 'currency';
  if (metricName === 'Observability Implementation') return 'boolean';
  return 'numeric';
}

function getMetricId(metricName: string): string {
  const ids: Record<string, number> = {
    'Completeness': 1,
    'Accuracy': 2,
    'Answer Relevancy': 3,
    'Faithfulness': 4,
    'Response Clarity': 5,
    'Safety Score': 6,
    'Graceful Fallback': 7,
    'Latency(p95)': 8,
    'Latency': 8,
    'Task Completion Rate': 9,
    'Cost per Conversation': 10,
    'Observability Implementation': 11,
  };
  return String(ids[metricName] ?? 0);
}

function getThresholdForMetric(metricName: string, stage: string, thresholds: RawThresholds): number | null {
  const stageData = stage === 'Beta' ? thresholds.Beta : thresholds.GA;
  if (stageData.critical_metrics[metricName] !== undefined) {
    return stageData.critical_metrics[metricName];
  }
  // Non-critical thresholds: use same as critical for scored metrics, or derive
  if (['Completeness', 'Accuracy', 'Answer Relevancy', 'Faithfulness', 'Response Clarity', 'Safety Score', 'Graceful Fallback'].includes(metricName)) {
    return stage === 'Beta' ? 7.0 : 8.0;
  }
  if (metricName === 'Latency(p95)' || metricName === 'Latency') return stage === 'Beta' ? 5000 : 5000;
  if (metricName === 'Task Completion Rate') return stage === 'Beta' ? 7 : 8;
  if (metricName === 'Cost per Conversation') return stage === 'Beta' ? 0.5 : 0.3;
  if (metricName === 'Observability Implementation') return stage === 'Beta' ? 0 : 1;
  return null;
}

function evaluateMetric(_metricName: string, value: number, threshold: number | null, scoringType: string): boolean {
  if (threshold === null) return true;
  if (scoringType === 'lower_is_better') {
    return value <= threshold;
  }
  return value >= threshold;
}

// --- Transform functions ---

function transformAgents(raw: RawAgent[]): Agent[] {
  return raw.map(a => {
    const criticalMetrics = ['Completeness', 'Accuracy', 'Faithfulness', 'Safety Score', 'Graceful Fallback'];
    const statusBadges: string[] = [];
    if (a.needs_review) statusBadges.push('Review Required');
    if (a.eval_result === 'Pass') statusBadges.push('Thresholds Met');
    else statusBadges.push('Thresholds Failed');

    return {
      agent_id: String(a.agent_id),
      agent_name: a.agent_name,
      risk_category: a.risk_category,
      current_lifecycle_state: a.current_state,
      next_lifecycle_state: a.next_state === 'None' ? 'None' : a.next_state,
      eval_result: a.eval_result === 'Pass' ? (a.next_state === 'None' ? 'Approved for GA' : 'Ready for ' + a.next_state) : 'Needs Improvement',
      overall_score: a.overall_score,
      critical_metrics: criticalMetrics,
      status_badges: statusBadges,
      created_at: a.latest_eval_date,
      updated_at: a.latest_eval_date,
    };
  });
}

function transformMetrics(raw: RawMetricDef[]): Metric[] {
  return raw.map(m => ({
    metric_id: String(m.metric_id),
    metric_name: m.metric_name,
    category: m.category,
    weight: getMetricWeight(m.metric_name),
    is_scored: true,
    is_critical: isCriticalMetric(m.metric_name),
    description: `${m.metric_name} metric`,
    scoring_type: getScoringType(m.metric_name),
    display_format: getDisplayFormat(m.metric_name),
  }));
}

function transformAgentMetrics(raw: RawAgentMetrics[], thresholds: RawThresholds, metrics: Metric[], agents: RawAgent[]): AgentMetric[] {
  const results: AgentMetric[] = [];
  for (const am of raw) {
    const agent = agents.find(a => a.agent_id === am.agent_id);
    // In Dev → use Beta thresholds; Beta or GA → use GA thresholds
    const stage = (!agent || agent.current_state === 'In Dev') ? 'Beta' : 'GA';

    for (const [metricName, value] of Object.entries(am.metrics)) {
      const metric = metrics.find(m => m.metric_name === metricName);
      const metricId = metric ? metric.metric_id : getMetricId(metricName);
      const scoringType = getScoringType(metricName);
      const threshold = getThresholdForMetric(metricName, stage, thresholds);
      const passed = evaluateMetric(metricName, value, threshold, scoringType);

      results.push({
        agent_id: String(am.agent_id),
        metric_id: metricId,
        metric_name: metricName,
        value,
        threshold: threshold ?? 0,
        passed,
        evaluated_at: new Date().toISOString(),
      });
    }
  }
  return results;
}

function transformThresholds(raw: RawThresholds): Threshold[] {
  const results: Threshold[] = [];

  // Beta thresholds
  for (const [metricName, requiredValue] of Object.entries(raw.Beta.critical_metrics)) {
    results.push({
      threshold_id: `beta-${metricName}`,
      lifecycle_stage: 'Beta',
      metric_id: getMetricId(metricName),
      metric_name: metricName,
      required_value: requiredValue,
      operator: '>=',
      is_critical: true,
    });
  }

  // GA thresholds
  for (const [metricName, requiredValue] of Object.entries(raw.GA.critical_metrics)) {
    results.push({
      threshold_id: `ga-${metricName}`,
      lifecycle_stage: 'GA',
      metric_id: getMetricId(metricName),
      metric_name: metricName,
      required_value: requiredValue,
      operator: '>=',
      is_critical: true,
    });
  }

  // Non-critical metric thresholds (derived)
  const nonCriticalMetrics = ['Answer Relevancy', 'Response Clarity', 'Latency(p95)', 'Task Completion Rate', 'Cost per Conversation', 'Observability Implementation'];
  for (const metricName of nonCriticalMetrics) {
    const betaVal = getThresholdForMetric(metricName, 'Beta', raw);
    const gaVal = getThresholdForMetric(metricName, 'GA', raw);
    if (betaVal !== null) {
      results.push({
        threshold_id: `beta-${metricName}`,
        lifecycle_stage: 'Beta',
        metric_id: getMetricId(metricName),
        metric_name: metricName,
        required_value: betaVal,
        operator: metricName === 'Latency(p95)' || metricName === 'Cost per Conversation' ? '<=' : '>=',
        is_critical: false,
      });
    }
    if (gaVal !== null) {
      results.push({
        threshold_id: `ga-${metricName}`,
        lifecycle_stage: 'GA',
        metric_id: getMetricId(metricName),
        metric_name: metricName,
        required_value: gaVal,
        operator: metricName === 'Latency(p95)' || metricName === 'Cost per Conversation' ? '<=' : '>=',
        is_critical: false,
      });
    }
  }

  return results;
}

function transformSampleReviews(raw: RawSampleReview[]): SampleReview[] {
  const results: SampleReview[] = [];
  for (const review of raw) {
    for (const sample of review.samples) {
      results.push({
        review_id: `${review.agent_id}-${sample.sample_id}`,
        agent_id: String(review.agent_id),
        sample_id: String(sample.sample_id),
        review_type: review.sample_type,
        prompt: sample.prompt ?? sample.control ?? '',
        expected_response: sample.expected_response ?? '',
        actual_response: sample.actual_response ?? sample.status ?? '',
        reviewer_note: sample.reviewer_note ?? '',
        action_required: review.action_required,
        reviewer_action: sample.reviewer_action ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }
  return results;
}

function transformAgentReviews(raw: RawAgentReview[]): AgentReview[] {
  return raw.map(r => ({
    review_id: String(r.review_id),
    agent_id: String(r.agent_id),
    review_type: r.review_type,
    review_status: r.review_status.toLowerCase() === 'pending' ? 'pending' : 'completed',
    review_reason: r.review_reason,
    action_required: r.review_status.toLowerCase() === 'pending',
    reviewer_action: r.action_taken,
    reviewer: r.reviewer,
    reviewer_notes: r.review_notes,
    review_timestamp: r.review_timestamp,
    previous_lifecycle_state: r.previous_state,
    current_lifecycle_state: r.current_state,
    next_lifecycle_state: r.next_state,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
}

export async function loadAllData(): Promise<LoadedData> {
  const errors: string[] = [];

  try {
    const agents = transformAgents(agentsData as unknown as RawAgent[]);
    const metrics = transformMetrics(metricsDefinitionsData as unknown as RawMetricDef[]);
    const agentMetrics = transformAgentMetrics(agentMetricsData as unknown as RawAgentMetrics[], thresholdsData as unknown as RawThresholds, metrics, agentsData as unknown as RawAgent[]);
    const thresholds = transformThresholds(thresholdsData as unknown as RawThresholds);
    const sampleReviews = transformSampleReviews(sampleReviewsData as unknown as RawSampleReview[]);
    const agentReviews = transformAgentReviews(agentReviewsData as unknown as RawAgentReview[]);

    return {
      agents,
      metrics,
      agentMetrics,
      thresholds,
      sampleReviews,
      agentReviews,
      errors,
    };
  } catch (e) {
    errors.push(`Data loading error: ${e}`);
    return {
      agents: [],
      metrics: [],
      agentMetrics: [],
      thresholds: [],
      sampleReviews: [],
      agentReviews: [],
      errors,
    };
  }
}

export interface Agent {
  agent_id: string;
  agent_name: string;
  risk_category: string;
  current_lifecycle_state: string;
  next_lifecycle_state: string;
  eval_result: string;
  overall_score: number;
  critical_metrics: string[];
  status_badges: string[];
  created_at: string;
  updated_at: string;
}

export interface Metric {
  metric_id: string;
  metric_name: string;
  category: string;
  weight: number;
  is_scored: boolean;
  is_critical: boolean;
  description: string;
  scoring_type: string;
  display_format: string;
  threshold_value?: number;
  enum_values?: string[];
}

export interface AgentMetric {
  agent_id: string;
  metric_id: string;
  metric_name: string;
  value: number;
  threshold: number;
  passed: boolean;
  evaluated_at: string;
}

export interface Threshold {
  threshold_id: string;
  lifecycle_stage: string;
  metric_id: string;
  metric_name: string;
  required_value: number;
  operator: string;
  is_critical: boolean;
}

export interface SampleReview {
  review_id: string;
  agent_id: string;
  sample_id: string;
  review_type: string;
  prompt: string;
  expected_response: string;
  actual_response: string;
  reviewer_note: string;
  action_required: boolean;
  reviewer_action: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentReview {
  review_id: string;
  agent_id: string;
  review_type: string;
  review_status: string;
  review_reason: string;
  action_required: boolean;
  reviewer_action: string | null;
  reviewer: string | null;
  reviewer_notes: string | null;
  review_timestamp: string | null;
  previous_lifecycle_state: string | null;
  current_lifecycle_state: string | null;
  next_lifecycle_state: string | null;
  created_at: string;
  updated_at: string;
}

export interface MetricResult {
  metric_id: string;
  metric_name: string;
  category: string;
  value: number;
  threshold: number;
  passed: boolean;
  is_critical: boolean;
  is_scored: boolean;
  weight: number;
  display_format: string;
  scoring_type: string;
  status: 'pass' | 'fail' | 'review' | 'non-scored';
  margin: number;
}

export interface StrongestMetric {
  metric_name: string;
  value: number;
  display_value: string;
  is_critical: boolean;
}

export interface WeakestMetric {
  metric_name: string;
  value: number;
  display_value: string;
  is_critical: boolean;
  failed: boolean;
}

export interface EnrichedAgent {
  agent_id: string;
  agent_name: string;
  risk_category: string;
  current_lifecycle_state: string;
  next_lifecycle_state: string;
  eval_result: string;
  overall_score: number;
  promotion_target: string;
  review_trigger_type: string | null;
  review_reason: string | null;
  observability_status: string;
  overall_status_label: string;
  critical_metrics_passed: string[];
  critical_metrics_failed: string[];
  strongest_metrics: StrongestMetric[];
  weakest_metrics: WeakestMetric[];
  metric_results: MetricResult[];
  threshold_results: {
    beta: { metric_name: string; passed: boolean; is_critical: boolean }[];
    ga: { metric_name: string; passed: boolean; is_critical: boolean }[];
  };
  pending_review: AgentReview | null;
  completed_reviews: AgentReview[];
  sample_reviews: SampleReview[];
  all_reviews: AgentReview[];
  is_blocked: boolean;
}

export interface AgentExplanationContext {
  agent_name: string;
  current_lifecycle_state: string;
  overall_score: number;
  promotion_target: string;
  eval_result: string;
  review_status: string;
  review_type: string | null;
  review_reason: string | null;
  critical_metrics_passed: string[];
  critical_metrics_failed: string[];
  strongest_metrics: string[];
  weakest_metrics: string[];
  threshold_status: string;
  human_review_action: string | null;
  human_review_previous_state: string | null;
  human_review_target_state: string | null;
  human_review_notes: string | null;
}

export interface ExplanationCacheEntry {
  contextHash: string;
  contextObject: AgentExplanationContext;
  responseText: string;
  timestamp: number;
  streamingStatus: 'complete' | 'streaming';
}

export interface ReviewQueueItem {
  review_id: string;
  agent_id: string;
  agent_name: string;
  risk_category: string;
  review_type: string;
  current_lifecycle_state: string;
  promotion_target: string;
  review_status: string;
  review_reason: string;
  created_at: string;
}

export interface AuditEntry {
  review_id: string;
  agent_id: string;
  agent_name: string;
  review_type: string;
  review_status: string;
  action_taken: string;
  previous_lifecycle_state: string;
  current_lifecycle_state: string;
  reviewer: string;
  review_timestamp: string;
  review_notes: string | null;
  is_sample_entry?: boolean;
  sample_info?: {
    prompt: string;
    expected_response: string;
    actual_response: string;
    reviewer_action: string;
  };
}

export type ReviewAction = 'Approved' | 'Rejected' | 'On Hold';
export type SampleAction = 'Pass Sample' | 'Fail Sample';

export interface AppState {
  agents: EnrichedAgent[];
  reviewQueue: ReviewQueueItem[];
  auditTrail: AuditEntry[];
  isLoading: boolean;
  errors: string[];
}

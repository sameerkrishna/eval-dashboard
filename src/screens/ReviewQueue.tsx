import { useState, useMemo, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '@/lib/appContext';
import StatusBadge from '@/components/StatusBadge';

import EmptyState from '@/components/EmptyState';
import type { EnrichedAgent } from '@/types';
import type { ReviewQueueItem, ReviewAction, SampleAction } from '@/types';
import { ChevronDown, ChevronUp, CheckCircle, XCircle, PauseCircle } from 'lucide-react';

const REVIEW_TYPE_PRIORITY: Record<string, number> = {
  Governance: 0,
  Operational: 1,
  Evaluation: 2,
};

export default function ReviewQueue() {
  const { reviewQueue, agents, updateAgentReview, updateSampleAction, searchQuery } = useAppContext();
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [riskFilter, setRiskFilter] = useState<string>('All');
  const [sortBy, setSortBy] = useState<string>('newest');
  const [expandedReview, setExpandedReview] = useState<string | null>(null);
  const [reviewerNotes, setReviewerNotes] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  const riskCategories = useMemo(() => ['All', ...Array.from(new Set(reviewQueue.map(r => r.risk_category)))], [reviewQueue]);

  const filteredQueue = useMemo(() => {
    let filtered = [...reviewQueue];
    if (searchQuery) {
      filtered = filtered.filter(r => r.agent_name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    if (typeFilter !== 'All') {
      filtered = filtered.filter(r => r.review_type === typeFilter);
    }
    if (riskFilter !== 'All') {
      filtered = filtered.filter(r => r.risk_category === riskFilter);
    }
    if (sortBy === 'newest') {
      filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortBy === 'oldest') {
      filtered.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else if (sortBy === 'score') {
      filtered.sort((a, b) => {
        const agentA = agents.find(x => x.agent_id === a.agent_id);
        const agentB = agents.find(x => x.agent_id === b.agent_id);
        return (agentB?.overall_score ?? 0) - (agentA?.overall_score ?? 0);
      });
    } else if (sortBy === 'priority') {
      filtered.sort((a, b) => (REVIEW_TYPE_PRIORITY[a.review_type] ?? 99) - (REVIEW_TYPE_PRIORITY[b.review_type] ?? 99));
    }
    return filtered;
  }, [reviewQueue, searchQuery, typeFilter, riskFilter, sortBy, agents]);

  function getReviewTypeVariant(type: string): 'neutral' | 'warning' {
    if (type === 'Evaluation') return 'neutral';
    if (type === 'Operational') return 'warning';
    if (type === 'Governance') return 'neutral';
    return 'neutral';
  }

  function getLifecycleVariant(state: string): 'in-dev' | 'beta' | 'ga' {
    if (state === 'In Dev') return 'in-dev';
    if (state === 'Beta') return 'beta';
    return 'ga';
  }

  function getRiskVariant(risk: string): 'critical' | 'high' | 'medium' | 'low' {
    if (risk === 'Regulated') return 'critical';
    if (risk === 'Consumer') return 'high';
    return 'medium'; // Internal
  }

  function handleAgentAction(reviewId: string, agentId: string, action: ReviewAction) {
    if (submitting) return;
    setSubmitting(reviewId);
    const notes = reviewerNotes[reviewId] ?? '';
    setTimeout(() => {
      updateAgentReview(agentId, action, notes);
      setSubmitting(null);
      setExpandedReview(null);
    }, 500);
  }

  function handleSampleAction(_reviewId: string, sampleId: string, action: SampleAction) {
    updateSampleAction(sampleId, action);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Review Queue</h1>
        <span className="text-sm text-gray-500 dark:text-gray-400">{filteredQueue.length} pending</span>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-3 py-2 rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label="Filter by review type"
          >
            <option value="All">All Types</option>
            <option value="Evaluation">Evaluation</option>
            <option value="Operational">Operational</option>
            <option value="Governance">Governance</option>
          </select>
          <select
            value={riskFilter}
            onChange={e => setRiskFilter(e.target.value)}
            className="px-3 py-2 rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label="Filter by risk category"
          >
            {riskCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="px-3 py-2 rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label="Sort queue"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="score">Highest Score</option>
          </select>
        </div>
      </div>

      {/* Queue Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Agent</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Risk</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Current</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Target</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Reason</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredQueue.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8">
                    <EmptyState title="No pending reviews" message="No pending reviews. All agents have been evaluated or no reviews are required at this time." />
                  </td>
                </tr>
              ) : (
                filteredQueue.map(item => {
                  const agent = agents.find(a => a.agent_id === item.agent_id);
                  const isExpanded = expandedReview === item.review_id;
                  return (
                    <Fragment key={item.review_id}>
                      <tr className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                          <Link to={`/agents/${item.agent_id}`} className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                            {item.agent_name}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge label={item.risk_category} variant={getRiskVariant(item.risk_category)} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge label={item.review_type} variant={getReviewTypeVariant(item.review_type)} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge label={item.current_lifecycle_state} variant={getLifecycleVariant(item.current_lifecycle_state)} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge label={item.promotion_target} variant={getLifecycleVariant(item.promotion_target)} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge label={item.review_status} variant="pending" />
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 max-w-xs">{item.review_reason}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setExpandedReview(isExpanded ? null : item.review_id)}
                            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium text-gray-700 hover:text-gray-900 dark:text-gray-200 dark:hover:text-white bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                            aria-label={isExpanded ? 'Hide details' : 'Show detailed info'}
                          >
                            <span>{isExpanded ? 'Hide' : 'Detailed Info'}</span>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} className="px-4 py-4 bg-gray-50 dark:bg-gray-700">
                            <ExpandedReviewCard
                              item={item}
                              agent={agent}
                              notes={reviewerNotes[item.review_id] ?? ''}
                              onNotesChange={notes => setReviewerNotes(prev => ({ ...prev, [item.review_id]: notes }))}
                              onAction={action => handleAgentAction(item.review_id, item.agent_id, action)}
                              submitting={submitting === item.review_id}
                              onSampleAction={(sampleId, action) => handleSampleAction(item.review_id, sampleId, action)}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ExpandedReviewCard({
  item,
  agent,
  notes,
  onNotesChange,
  onAction,
  submitting,
  onSampleAction,
}: {
  item: ReviewQueueItem;
  agent?: EnrichedAgent;
  notes: string;
  onNotesChange: (notes: string) => void;
  onAction: (action: ReviewAction) => void;
  submitting: boolean;
  onSampleAction: (sampleId: string, action: SampleAction) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Evidence Section */}
      <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 p-4">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 capitalize">
          {item.review_type === 'Evaluation' && 'Evaluation Samples'}
          {item.review_type === 'Operational' && 'Operational Evidence'}
          {item.review_type === 'Governance' && 'Governance Evidence'}
        </h4>
        {item.review_type === 'Evaluation' && agent && (
          <EvaluationEvidence agent={agent} onSampleAction={onSampleAction} />
        )}
        {item.review_type === 'Operational' && agent && (
          <OperationalEvidence agent={agent} />
        )}
        {item.review_type === 'Governance' && agent && (
          <GovernanceEvidence agent={agent} />
        )}
      </div>

      {/* Reviewer Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Reviewer Justification <span className="text-error-500">*</span>
        </label>
        <textarea
          value={notes}
          onChange={e => onNotesChange(e.target.value)}
          rows={3}
          className={`w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${
            notes.trim() === ''
              ? 'border-error-300 dark:border-error-700 bg-error-50 dark:bg-error-900/20'
              : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
          }`}
          placeholder="Review justification required before taking action..."
          aria-label="Reviewer justification (required)"
        />
        {notes.trim() === '' && (
          <p className="mt-1 text-xs text-error-500">Please enter review notes before approving, rejecting, or putting on hold.</p>
        )}
      </div>

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={() => onAction('Approved')}
          disabled={submitting || notes.trim() === ''}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-success-600 hover:bg-success-700 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <CheckCircle className="w-4 h-4" />
          {submitting ? 'Processing...' : 'Approve Promotion'}
        </button>
        <button
          onClick={() => onAction('Rejected')}
          disabled={submitting || notes.trim() === ''}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-error-600 hover:bg-error-700 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <XCircle className="w-4 h-4" />
          Reject Promotion
        </button>
        <button
          onClick={() => onAction('On Hold')}
          disabled={submitting || notes.trim() === ''}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-warning-600 hover:bg-warning-700 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <PauseCircle className="w-4 h-4" />
          Put On Hold
        </button>
      </div>
    </div>
  );
}

function EvaluationEvidence({
  agent,
  onSampleAction,
}: {
  agent: EnrichedAgent;
  onSampleAction: (sampleId: string, action: SampleAction) => void;
}) {
  const evalSamples = agent.sample_reviews.filter(s => s.review_type === 'Evaluation');
  return (
    <div className="space-y-4">
      {evalSamples.map(sample => {
        const action = sample.reviewer_action;
        return (
          <div key={sample.review_id} className="border border-gray-200 dark:border-gray-700 rounded-md p-3">
            <div className="mb-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Prompt</span>
              <p className="text-sm text-gray-800 dark:text-gray-200 mt-1">{sample.prompt}</p>
            </div>
            <div className="mb-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Expected</span>
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{sample.expected_response}</p>
            </div>
            <div className="mb-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actual</span>
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{sample.actual_response}</p>
            </div>
            <div className="mb-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Note</span>
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{sample.reviewer_note}</p>
            </div>
            <div className="flex items-center gap-2 mt-3">
              {action ? (
                <StatusBadge
                  label={action === 'Pass Sample' ? 'Marked as Pass' : 'Marked as Fail'}
                  variant={action === 'Pass Sample' ? 'success' : 'error'}
                />
              ) : sample.action_required ? (
                <>
                  <button
                    onClick={() => onSampleAction(sample.review_id, 'Pass Sample')}
                    className="px-3 py-1.5 text-xs font-medium bg-success-50 text-success-700 border border-success-200 rounded-md hover:bg-success-100 dark:bg-success-900/30 dark:text-success-400 dark:border-success-700"
                  >
                    Pass Sample
                  </button>
                  <button
                    onClick={() => onSampleAction(sample.review_id, 'Fail Sample')}
                    className="px-3 py-1.5 text-xs font-medium bg-error-50 text-error-700 border border-error-200 rounded-md hover:bg-error-100 dark:bg-error-900/30 dark:text-error-400 dark:border-error-700"
                  >
                    Fail Sample
                  </button>
                </>
              ) : (
                <span className="text-xs text-gray-400 dark:text-gray-500">No action required</span>
              )}
            </div>
          </div>
        );
      })}
      {evalSamples.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">No sample evidence available.</p>
      )}
    </div>
  );
}

function OperationalEvidence({ agent }: { agent: EnrichedAgent }) {
  const latencyMetric = agent.metric_results.find(m => m.metric_name === 'Latency (P95)' || m.metric_name === 'Latency(p95)' || m.metric_name === 'Latency');
  // Operational reviews use "Performance" sample type in the data
  const opSamples = agent.sample_reviews.filter(s => s.review_type === 'Performance' || s.review_type === 'Operational');
  return (
    <div className="space-y-3">
      {latencyMetric ? (
        <>
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
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-700 dark:text-gray-300"> Note</span>
            <p className="font-medium text-gray-900 dark:text-white">
              {opSamples.length > 0 && opSamples[0].reviewer_note 
                ? opSamples[0].reviewer_note 
                : 'No reviewer justification provided'}
            </p>
          </div>
        </>
      ) : opSamples.length > 0 ? (
        opSamples.map(sample => (
          <div key={sample.review_id} className="border border-gray-200 dark:border-gray-700 rounded-md p-3">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-gray-700 dark:text-gray-300">Observed Latency</span>
              <span className="font-medium text-error-600 dark:text-error-400">{sample.actual_response || 'N/A'}</span>
            </div>
            <div>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Note</span>
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{sample.reviewer_note}</p>
            </div>
          </div>
        ))
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">Latency data unavailable.</p>
      )}
    </div>
  );
}

function GovernanceEvidence({ agent }: { agent: EnrichedAgent }) {
  const govSamples = agent.sample_reviews.filter(s => s.review_type === 'Governance');
  if (govSamples.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No governance evidence available.</p>;
  }
  return (
    <div className="space-y-3">
      {govSamples.map(sample => {
        const isPass = sample.actual_response === 'Implemented' || sample.actual_response === 'Configured';
        const isPartial = sample.actual_response === 'Partial';
        return (
          <div key={sample.review_id} className="border border-gray-200 dark:border-gray-700 rounded-md p-3">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-gray-700 dark:text-gray-300">{sample.prompt || 'Control'}</span>
              <span className={`font-medium ${isPass ? 'text-success-600 dark:text-success-400' : isPartial ? 'text-warning-600 dark:text-warning-400' : 'text-error-600 dark:text-error-400'}`}>
                {sample.actual_response || 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Note</span>
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{sample.reviewer_note}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

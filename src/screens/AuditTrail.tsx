import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '@/lib/appContext';
import StatusBadge from '@/components/StatusBadge';
import EmptyState from '@/components/EmptyState';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { EnrichedAgent, SampleReview } from '@/types';

export default function AuditTrail() {
  const { auditTrail, agents, searchQuery } = useAppContext();
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [riskFilter, setRiskFilter] = useState<string>('All');
  const [sortBy, setSortBy] = useState<string>('newest');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const riskCategories = useMemo(() => ['All', ...Array.from(new Set(agents.map(a => a.risk_category)))], [agents]);

  const filteredTrail = useMemo(() => {
    let filtered = [...auditTrail];
    if (searchQuery) {
      filtered = filtered.filter(a => a.agent_name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    if (typeFilter !== 'All') {
      filtered = filtered.filter(a => a.review_type === typeFilter);
    }
    if (statusFilter !== 'All') {
      filtered = filtered.filter(a => a.action_taken === statusFilter);
    }
    if (riskFilter !== 'All') {
      filtered = filtered.filter(a => {
        const agent = agents.find(x => x.agent_id === a.agent_id);
        return agent?.risk_category === riskFilter;
      });
    }
    if (sortBy === 'newest') {
      filtered.sort((a, b) => new Date(b.review_timestamp).getTime() - new Date(a.review_timestamp).getTime());
    } else if (sortBy === 'oldest') {
      filtered.sort((a, b) => new Date(a.review_timestamp).getTime() - new Date(b.review_timestamp).getTime());
    }
    return filtered;
  }, [auditTrail, searchQuery, typeFilter, statusFilter, riskFilter, sortBy, agents]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Audit Trail</h1>
        <span className="text-sm text-gray-500 dark:text-gray-400">{filteredTrail.length} completed</span>
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
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label="Filter by action status"
          >
            <option value="All">All Actions</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
            <option value="On Hold">On Hold</option>
            <option value="pass_sample">Sample Passed</option>
            <option value="fail_sample">Sample Failed</option>
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
            aria-label="Sort audit trail"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>
        </div>
      </div>

      {/* Audit Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Agent</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Review Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Action</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Previous State</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Current State</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Reviewer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Timestamp</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredTrail.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8">
                    <EmptyState title="No completed reviews" message="No completed reviews yet. Reviews will appear here once actions are taken in the Review Queue." />
                  </td>
                </tr>
              ) : (
                filteredTrail.map(item => {
                  const isExpanded = expandedRow === item.review_id;
                  const agent = agents.find(a => a.agent_id === item.agent_id);
                  return (
                    <React.Fragment key={item.review_id}>
                      <tr className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                          <Link to={`/agents/${item.agent_id}`} className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                            {item.agent_name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 capitalize">{item.review_type}</td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            label={item.review_status === 'completed' ? 'Completed' : item.review_status}
                            variant={item.review_status === 'completed' ? 'success' : 'pending'}
                          />
                        </td>
                        <td className="px-4 py-3">
                          {item.is_sample_entry ? (
                            <StatusBadge
                              label={item.action_taken === 'pass_sample' ? 'Marked as Pass' : 'Marked as Fail'}
                              variant={item.action_taken === 'pass_sample' ? 'success' : 'error'}
                            />
                          ) : (
                            <StatusBadge
                              label={item.action_taken}
                              variant={item.action_taken === 'Approved' ? 'success' : item.action_taken === 'Rejected' ? 'error' : 'warning'}
                            />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge label={item.previous_lifecycle_state} variant={getLifecycleVariant(item.previous_lifecycle_state)} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge label={item.current_lifecycle_state} variant={getLifecycleVariant(item.current_lifecycle_state)} />
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.reviewer ?? 'N/A'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          {item.review_timestamp ? new Date(item.review_timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setExpandedRow(isExpanded ? null : item.review_id)}
                            className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                            aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={9} className="px-4 py-4 bg-gray-50 dark:bg-gray-700">
                            <div className="space-y-3 text-sm">
                              {item.is_sample_entry && item.sample_info ? (
                                <>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <span className="text-gray-500 dark:text-gray-400">Review ID:</span>
                                      <span className="ml-2 font-medium text-gray-900 dark:text-white">{item.review_id}</span>
                                    </div>
                                    <div>
                                      <span className="text-gray-500 dark:text-gray-400">Review Status:</span>
                                      <span className="ml-2">
                                        <StatusBadge
                                          label={item.review_status === 'completed' ? 'Completed' : 'Pending'}
                                          variant={item.review_status === 'completed' ? 'success' : 'pending'}
                                        />
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-gray-500 dark:text-gray-400">Risk Category:</span>
                                      <span className="ml-2">
                                        {agent ? <StatusBadge label={agent.risk_category} variant={getRiskVariant(agent.risk_category)} /> : 'N/A'}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-gray-500 dark:text-gray-400">Overall Score:</span>
                                      <span className="ml-2 font-medium text-gray-900 dark:text-white">{agent?.overall_score.toFixed(1) ?? 'N/A'}</span>
                                    </div>
                                  </div>
                                  <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Sample Evidence</h4>
                                    <div className="space-y-2">
                                      <div>
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Prompt</span>
                                        <p className="text-sm text-gray-800 dark:text-gray-200 mt-1">{item.sample_info.prompt || 'Not provided'}</p>
                                      </div>
                                      <div>
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Expected Response</span>
                                        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{item.sample_info.expected_response || 'Not provided'}</p>
                                      </div>
                                      <div>
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actual Response</span>
                                        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{item.sample_info.actual_response || 'Not provided'}</p>
                                      </div>
                                      <div className="mt-2">
                                        <StatusBadge
                                          label={item.sample_info.reviewer_action === 'Pass Sample' ? 'Marked as Pass' : 'Marked as Fail'}
                                          variant={item.sample_info.reviewer_action === 'Pass Sample' ? 'success' : 'error'}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                  {item.review_notes && (
                                    <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                                      <span className="text-gray-500 dark:text-gray-400">Sample Reviewer Note:</span>
                                      <p className="mt-1 text-gray-700 dark:text-gray-300">{item.review_notes}</p>
                                    </div>
                                  )}
                                </>
                              ) : (
                                <>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <span className="text-gray-500 dark:text-gray-400">Review ID:</span>
                                      <span className="ml-2 font-medium text-gray-900 dark:text-white">{item.review_id}</span>
                                    </div>
                                    <div>
                                      <span className="text-gray-500 dark:text-gray-400">Agent ID:</span>
                                      <span className="ml-2 font-medium text-gray-900 dark:text-white">{item.agent_id}</span>
                                    </div>
                                    <div>
                                      <span className="text-gray-500 dark:text-gray-400">Risk Category:</span>
                                      <span className="ml-2 font-medium text-gray-900 dark:text-white">
                                        {agent ? <StatusBadge label={agent.risk_category} variant={getRiskVariant(agent.risk_category)} /> : 'N/A'}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-gray-500 dark:text-gray-400">Overall Score:</span>
                                      <span className="ml-2 font-medium text-gray-900 dark:text-white">{agent?.overall_score.toFixed(1) ?? 'N/A'}</span>
                                    </div>
                                  </div>
                                  {/* Lifecycle states section */}
                                  <div className="mt-4 p-3 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                      <div>
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Previous State</span>
                                        <div className="mt-1">
                                          <StatusBadge label={item.previous_lifecycle_state} variant={getLifecycleVariant(item.previous_lifecycle_state)} />
                                        </div>
                                      </div>
                                      <div>
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Target State</span>
                                        <div className="mt-1">
                                          <StatusBadge label={agent?.promotion_target ?? 'N/A'} variant={agent?.promotion_target ? getLifecycleVariant(agent.promotion_target) : 'neutral'} />
                                        </div>
                                      </div>
                                      <div>
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Action Taken</span>
                                        <div className="mt-1">
                                          <StatusBadge
                                            label={item.action_taken}
                                            variant={item.action_taken === 'Approved' ? 'success' : item.action_taken === 'Rejected' ? 'error' : 'warning'}
                                          />
                                        </div>
                                      </div>
                                      <div>
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Current State</span>
                                        <div className="mt-1">
                                          <StatusBadge label={item.current_lifecycle_state} variant={getLifecycleVariant(item.current_lifecycle_state)} />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  {item.review_notes && (
                                    <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                                      <span className="text-gray-500 dark:text-gray-400">Reviewer Justification:</span>
                                      <p className="mt-1 text-gray-700 dark:text-gray-300">{item.review_notes}</p>
                                    </div>
                                  )}
                                  {/* Evidence Section */}
                                  {agent && (
                                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 p-4">
                                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 capitalize">
                                        {item.review_type === 'Evaluation' && 'Evaluation Samples'}
                                        {item.review_type === 'Operational' && 'Operational Evidence'}
                                        {item.review_type === 'Governance' && 'Governance Evidence'}
                                      </h4>
                                      <SampleEvidenceSection reviewType={item.review_type} agent={agent} />
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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

function SampleEvidenceSection({
  reviewType,
  agent,
}: {
  reviewType: string;
  agent: EnrichedAgent;
}) {
  // Operational reviews use "Performance" sample type in the data
  const matchingSamples: SampleReview[] = agent.sample_reviews.filter((s: SampleReview) => {
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
        {matchingSamples.map((sample: SampleReview) => (
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
    const latencyMetric = agent.metric_results.find(
      (m: { metric_name: string }) => m.metric_name === 'Latency (P95)' || m.metric_name === 'Latency(p95)' || m.metric_name === 'Latency'
    );
    // Operational reviews use "Performance" sample type in the data
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
          {opSamples.map((sample: SampleReview) => (
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
        {matchingSamples.map((sample: SampleReview) => {
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

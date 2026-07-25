import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '@/lib/appContext';
import StatusBadge from '@/components/StatusBadge';
import SectionCard from '@/components/SectionCard';
import EmptyState from '@/components/EmptyState';
import { getLifecycleIndex, LIFECYCLE_ORDER }  from '@/lib/enrichmentEngine';
import type { EnrichedAgent } from '@/types';

export default function PortfolioDashboard() {
  const { agents, errors, searchQuery } = useAppContext();
  const [lifecycleFilter, setLifecycleFilter] = useState<string>('All');
  const [riskFilter, setRiskFilter] = useState<string>('All');
  const [reviewFilter, setReviewFilter] = useState<string>('All');
  const [scoreRange, setScoreRange] = useState<number>(0);
  const [sortBy, setSortBy] = useState<string>('lifecycle');
  const [viewMode, setViewMode] = useState<'table' | 'grouped'>('table');

  const riskCategories = useMemo(() => ['All', ...Array.from(new Set(agents.map(a => a.risk_category)))], [agents]);

  const filteredAgents = useMemo(() => {
    let filtered = [...agents];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(a =>
        a.agent_name.toLowerCase().includes(q) ||
        a.current_lifecycle_state.toLowerCase().includes(q) ||
        a.eval_result.toLowerCase().includes(q)
      );
    }
    if (lifecycleFilter !== 'All') {
      filtered = filtered.filter(a => a.current_lifecycle_state === lifecycleFilter);
    }
    if (riskFilter !== 'All') {
      filtered = filtered.filter(a => a.risk_category === riskFilter);
    }
    if (reviewFilter !== 'All') {
      if (reviewFilter === 'Pending') {
        filtered = filtered.filter(a => a.pending_review !== null);
      } else if (reviewFilter === 'Completed') {
        filtered = filtered.filter(a => a.pending_review === null && a.completed_reviews.length > 0);
      } else if (reviewFilter === 'No Review') {
        filtered = filtered.filter(a => a.pending_review === null && a.completed_reviews.length === 0);
      }
    }
    if (scoreRange > 1) {
      filtered = filtered.filter(a => a.overall_score >= scoreRange);
    }

    // Sort
    filtered.sort((a, b) => {
      if (sortBy === 'lifecycle') {
        const idxA = getLifecycleIndex(a.current_lifecycle_state);
        const idxB = getLifecycleIndex(b.current_lifecycle_state);
        if (idxA !== idxB) return idxA - idxB;
        if (b.overall_score !== a.overall_score) return b.overall_score - a.overall_score;
        return (a.pending_review ? 1 : 1) - (b.pending_review ? 1 : 0);
      }
      if (sortBy === 'score') return b.overall_score - a.overall_score;
      if (sortBy === 'name') return a.agent_name.localeCompare(b.agent_name);
      return 0;
    });

    return filtered;
  }, [agents, searchQuery, lifecycleFilter, riskFilter, reviewFilter, scoreRange, sortBy]);

  const kpis = useMemo(() => {
    const total = agents.length;
    const inDev = agents.filter(a => a.current_lifecycle_state === 'In Dev').length;
    const beta = agents.filter(a => a.current_lifecycle_state === 'Beta').length;
    const ga = agents.filter(a => a.current_lifecycle_state === 'GA').length;
    const pendingReviews = agents.filter(a => a.pending_review !== null).length;
    const completedReviews = agents.filter(a => a.pending_review === null && a.completed_reviews.length > 0).length;
    const noReview = agents.filter(a => a.pending_review === null && a.completed_reviews.length === 0).length;
    return { total, inDev, beta, ga, pendingReviews, completedReviews, noReview };
  }, [agents]);

  const groupedByRisk = useMemo(() => {
    const groups: Record<string, EnrichedAgent[]> = {};
    for (const agent of filteredAgents) {
      if (!groups[agent.risk_category]) groups[agent.risk_category] = [];
      groups[agent.risk_category].push(agent);
    }
    return groups;
  }, [filteredAgents]);

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
      {/* Error cards */}
      {errors.length > 0 && (
        <div className="space-y-2">
          {errors.map((err, i) => (
            <div key={i} className="bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-lg p-3 text-sm text-error-700 dark:text-error-300">
              {err}
            </div>
          ))}
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard label="Total Agents" value={kpis.total} />
        <KpiCard label="Pending Reviews" value={kpis.pendingReviews} variant="pending" />
        <KpiCard label="Completed Reviews" value={kpis.completedReviews} variant="ga" />
        <KpiCard label="In Dev" value={kpis.inDev} variant="in-dev" />
        <KpiCard label="Beta" value={kpis.beta} variant="beta" />
        <KpiCard label="GA" value={kpis.ga} variant="ga" />
       
      </div>
     <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
  <div className="space-y-3">
    {/* First Row: 3 Columns */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">Filter by</span>
        <select
          value={lifecycleFilter}
          onChange={e => setLifecycleFilter(e.target.value)}
          className="px-3 py-2 rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 flex-1"
          aria-label="Filter by lifecycle state"
        >
          <option value="All">All [States]</option>
          {LIFECYCLE_ORDER.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <select
        value={riskFilter}
        onChange={e => setRiskFilter(e.target.value)}
        className="px-3 py-2 rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
        aria-label="Filter by risk category"
      >
        {riskCategories.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <select
        value={reviewFilter}
        onChange={e => setReviewFilter(e.target.value)}
        className="px-3 py-2 rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
        aria-label="Filter by review status"
      >
        <option value="All">All [Reviews]</option>
        <option value="Pending">Pending Reviews</option>
        <option value="Completed">Completed Reviews</option>
        <option value="No Review">No Review</option>
      </select>
    </div>

    {/* Second Row: 3 Columns */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">Sort by</span>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          className="px-3 py-2 rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 flex-1"
          aria-label="Sort by"
        >
          <option value="lifecycle">Lifecycle Stage</option>
          <option value="score">Score (High to Low)</option>
          <option value="name">Name (A-Z)</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">Min Score:</span>
        <input
          type="range"
          min="0"
          max="10"
          step="0.5"
          value={scoreRange}
          onChange={e => setScoreRange(parseFloat(e.target.value))}
          className="flex-1"
          aria-label="Minimum score filter"
        />
        <span className="text-sm text-gray-700 dark:text-gray-300 w-8 text-right">{scoreRange}</span>
      </div>
      <div className="flex items-center gap-1 justify-end">
        <button
          onClick={() => setViewMode('table')}
          className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'table' ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'}`}
          aria-label="Table view"
        >
          Table
        </button>
        <button
          onClick={() => setViewMode('grouped')}
          className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'grouped' ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'}`}
          aria-label="Grouped view"
        >
          Grouped
        </button>
      </div>
    </div>
  </div>
</div>

      {/* Main Content */}
      {viewMode === 'table' ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Agent</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Current State</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Next State</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Eval Result</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Overall Score</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Critical Metrics</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Review</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredAgents.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8">
                      <EmptyState title="No agents match the current filters" message="Try adjusting your filters to see more results." />
                    </td>
                  </tr>
                ) : (
                  filteredAgents.map(agent => (
                    <tr key={agent.agent_id} className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                        <Link to={`/agents/${agent.agent_id}`} className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                          {agent.agent_name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge label={agent.risk_category} variant={getRiskVariant(agent.risk_category)} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge label={agent.current_lifecycle_state} variant={getLifecycleVariant(agent.current_lifecycle_state)} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge label={agent.next_lifecycle_state} variant={getLifecycleVariant(agent.next_lifecycle_state)} />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{agent.eval_result}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">{agent.overall_score.toFixed(1)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {agent.critical_metrics_passed.length} / {agent.critical_metrics_passed.length + agent.critical_metrics_failed.length} passed
                      </td>
                      <td className="px-4 py-3">
                        {agent.pending_review ? (
                          <StatusBadge label="Pending" variant="pending" />
                        ) : agent.completed_reviews.length > 0 ? (
                          (() => {
                            const latest = agent.completed_reviews[0];
                            const action = latest.reviewer_action;
                            const variant = action === 'Approved' ? 'success' : action === 'Rejected' ? 'error' : action === 'On Hold' ? 'warning' : 'neutral';
                            return <StatusBadge label={action ?? 'Completed'} variant={variant} />;
                          })()
                        ) : (
                          <span className="text-sm text-gray-400 dark:text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/agents/${agent.agent_id}`}
                          className="text-sm text-primary-400 hover:text-primary-400 dark:text-primary-400 dark:hover:text-primary-300 font-bold"
                        >
                           Read More&gt;
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedByRisk).map(([risk, agents]) => (
            <SectionCard key={risk} title={`${risk} Risk (${agents.length})`}>
              <div className="space-y-2">
                {agents.map(agent => (
                  <div key={agent.agent_id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-md gap-2">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <Link to={`/agents/${agent.agent_id}`} className="text-sm font-medium text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400">
                        {agent.agent_name}
                      </Link>
                      <div className="flex items-center gap-2">
                        <StatusBadge label={agent.current_lifecycle_state} variant={getLifecycleVariant(agent.current_lifecycle_state)} />
                        <span className="text-sm text-gray-500 dark:text-gray-400">Score: {agent.overall_score.toFixed(1)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {agent.pending_review ? (
                        <StatusBadge label="Review" variant="pending" />
                      ) : agent.completed_reviews.length > 0 ? (
                        (() => {
                          const latest = agent.completed_reviews[0];
                          const action = latest.reviewer_action;
                          const variant = action === 'Approved' ? 'success' : action === 'Rejected' ? 'error' : action === 'On Hold' ? 'warning' : 'neutral';
                          return <StatusBadge label={action ?? 'Completed'} variant={variant} />;
                        })()
                      ) : null}
                      <Link to={`/agents/${agent.agent_id}`} className="text-lg text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 font-bold"> &gt;</Link>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          ))}
          {Object.keys(groupedByRisk).length === 0 && (
            <EmptyState title="No agents match the current filters" message="Try adjusting your filters to see more results." />
          )}
        </div>
      )}

      {/* Framework Explainer */}
      <SectionCard title="Framework Reference" collapsible defaultOpen={true}>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Metric Classification</h4>
            <ul className="space-y-1">
              <li><strong>Critical:</strong> Completeness, Accuracy, Faithfulness, Safety Score, Graceful Fallback</li>
              <li><strong>Important:</strong> Task Completion Rate, Answer Relevancy, Response Clarity, Latency (P95), Observability Implementation</li>
              <li><strong>Informational:</strong> Cost per Conversation</li>
              
            </ul>
          </div>
          <div>
            <br></br>
            <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Promotion Thresholds</h4>
            <ul className="space-y-1">
              <li><strong>Beta:</strong> Overall Score ≥ 7.0 AND Critical metrics ≥ 7.0</li>
              <li><strong>GA:</strong> Overall Score ≥ 8.0 AND Critical metrics ≥ 8.0 AND Observability Implementation = 1</li>
            </ul>
          </div>
        
        <div>
          <br></br>
            <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Review Bands</h4>
            <ul className="space-y-1">
              <li><strong>Beta Review:</strong> 6.9 ≤ Overall Score ≤ 7.1 OR Any critical metric between 6.9 and 7.1</li>
              <li><strong>GA Review:</strong> 7.9 ≤ Overall Score ≤ 8.1 OR Any critical metric between 7.9 and 8.1</li>
              <li><strong>Operational Review:</strong> Triggered when Latency (P95) &gt; 5000 ms</li>
              <li><strong>Governance Review:</strong> Triggered when the agent is evaluated for GA promotion and Observability Implementation = 0</li>
            </ul>
          </div>
      </SectionCard>
    </div>
  );
}

function KpiCard({ label, value, variant }: { label: string; value: string | number; variant?: 'in-dev' | 'beta' | 'ga' | 'pending' }) {
  const variantClasses: Record<string, string> = {
    'in-dev': 'border-l-4 border-gray-400',
    'beta': 'border-l-4 border-primary-500',
    'ga': 'border-l-4 border-success-500',
    'pending': 'border-l-4 border-warning-500',
  };
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 ${variant ? variantClasses[variant] : ''}`}>
      <div className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">{label}</div>
      <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}

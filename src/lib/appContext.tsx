import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type {
  EnrichedAgent, AgentReview, ReviewQueueItem, AuditEntry, ReviewAction, SampleAction
} from '@/types';
import { enrichAgent } from '@/lib/enrichmentEngine';
import { invalidateCache } from '@/lib/geminiService';
import type { LoadedData } from '@/lib/dataLoader';

interface AppContextValue {
  agents: EnrichedAgent[];
  reviewQueue: ReviewQueueItem[];
  auditTrail: AuditEntry[];
  isLoading: boolean;
  errors: string[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  updateAgentReview: (agentId: string, action: ReviewAction, notes: string) => void;
  updateSampleAction: (reviewId: string, action: SampleAction) => void;
  refreshData: (data: LoadedData) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}

function buildReviewQueue(agents: EnrichedAgent[]): ReviewQueueItem[] {
  return agents
    .filter(a => a.pending_review)
    .map(a => ({
      review_id: a.pending_review!.review_id,
      agent_id: a.agent_id,
      agent_name: a.agent_name,
      risk_category: a.risk_category,
      review_type: a.pending_review!.review_type,
      current_lifecycle_state: a.current_lifecycle_state,
      promotion_target: a.promotion_target,
      review_status: a.pending_review!.review_status,
      review_reason: a.pending_review!.review_reason,
      created_at: a.pending_review!.created_at,
    }));
}

function buildAuditTrail(agents: EnrichedAgent[]): AuditEntry[] {
  const entries: AuditEntry[] = [];
  for (const agent of agents) {
    // Add completed agent reviews
    for (const review of agent.completed_reviews) {
      if (review.review_timestamp && review.reviewer) {
        entries.push({
          review_id: review.review_id,
          agent_id: agent.agent_id,
          agent_name: agent.agent_name,
          review_type: review.review_type,
          review_status: review.review_status,
          action_taken: review.reviewer_action ?? 'N/A',
          previous_lifecycle_state: review.previous_lifecycle_state ?? agent.current_lifecycle_state,
          current_lifecycle_state: review.current_lifecycle_state ?? agent.current_lifecycle_state,
          reviewer: review.reviewer,
          review_timestamp: review.review_timestamp,
          review_notes: review.reviewer_notes,
        });
      }
    }

    // Add marked sample entries from pending reviews
    if (agent.pending_review) {
      for (const sample of agent.sample_reviews) {
        if (sample.reviewer_action && sample.review_type === agent.pending_review!.review_type) {
          entries.push({
            review_id: sample.review_id,
            agent_id: agent.agent_id,
            agent_name: agent.agent_name,
            review_type: agent.pending_review!.review_type,
            review_status: 'pending',
            action_taken: sample.reviewer_action === 'Pass Sample' ? 'pass_sample' : 'fail_sample',
            previous_lifecycle_state: agent.current_lifecycle_state,
            current_lifecycle_state: agent.current_lifecycle_state,
            reviewer: 'Reviewer A',
            review_timestamp: sample.updated_at || new Date().toISOString(),
            review_notes: sample.reviewer_note || null,
            is_sample_entry: true,
            sample_info: {
              prompt: sample.prompt,
              expected_response: sample.expected_response,
              actual_response: sample.actual_response,
              reviewer_action: sample.reviewer_action,
            },
          });
        }
      }
    }
  }
  return entries.sort((a, b) => new Date(b.review_timestamp).getTime() - new Date(a.review_timestamp).getTime());
}

export function AppProvider({ children, initialData }: { children: React.ReactNode; initialData: LoadedData }) {
  const [agents, setAgents] = useState<EnrichedAgent[]>(() => {
    const enriched = initialData.agents.map(agent =>
      enrichAgent(
        agent,
        initialData.metrics,
        initialData.agentMetrics,
        initialData.thresholds,
        initialData.sampleReviews,
        initialData.agentReviews
      )
    );
    return enriched;
  });

  const [errors] = useState<string[]>(initialData.errors);
  const [isLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const reviewQueue = useMemo(() => buildReviewQueue(agents), [agents]);
  const auditTrail = useMemo(() => buildAuditTrail(agents), [agents]);

  const updateAgentReview = useCallback((agentId: string, action: ReviewAction, notes: string) => {
    setAgents(prev => {
      const updated = prev.map(agent => {
        if (agent.agent_id !== agentId) return agent;

        const pending = agent.pending_review;
        if (!pending) return agent;

        // Update lifecycle state
        let newState = agent.current_lifecycle_state;
        let newNextState = agent.next_lifecycle_state;
        let newEvalResult = agent.eval_result;

        if (action === 'Approved') {
          if (agent.current_lifecycle_state === 'In Dev') {
            newState = 'Beta';
            newNextState = 'GA';
            newEvalResult = 'Approved for Beta, GA evaluations pending';
          } else if (agent.current_lifecycle_state === 'Beta') {
            newState = 'GA';
            newNextState = 'None';
            newEvalResult = 'Approved for GA';
          }
        } else if (action === 'Rejected') {
          if (agent.current_lifecycle_state === 'In Dev') {
            newEvalResult = 'Rejected for Beta, needs improvement';
          } else if (agent.current_lifecycle_state === 'Beta') {
            newEvalResult = 'Rejected for GA, needs improvement';
          } else {
            newEvalResult = 'Needs Improvement';
          }
        } else if (action === 'On Hold') {
          if (agent.current_lifecycle_state === 'In Dev') {
            newEvalResult = 'On Hold for Beta, needs improvement';
          } else if (agent.current_lifecycle_state === 'Beta') {
            newEvalResult = 'On Hold for GA, needs improvement';
          } else {
            newEvalResult = 'Needs Improvement';
          }
        }

        const completedReview: AgentReview = {
          ...pending,
          review_status: 'completed',
          reviewer_action: action,
          reviewer: 'Reviewer A',
          reviewer_notes: notes || null,
          review_timestamp: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          previous_lifecycle_state: agent.current_lifecycle_state,
          current_lifecycle_state: newState,
          next_lifecycle_state: agent.next_lifecycle_state,
        };

        const newCompleted = [completedReview, ...agent.completed_reviews];
        const newAll = agent.all_reviews.map(r =>
          r.review_id === pending.review_id ? completedReview : r
        );

        const updatedAgent: EnrichedAgent = {
          ...agent,
          current_lifecycle_state: newState,
          next_lifecycle_state: newNextState,
          eval_result: newEvalResult,
          pending_review: null,
          completed_reviews: newCompleted,
          all_reviews: newAll,
        };

        return updatedAgent;
      });

      // Invalidate cache for this agent
      invalidateCache(agentId);

      return updated;
    });
  }, []);

  const updateSampleAction = useCallback((reviewId: string, action: SampleAction) => {
    setAgents(prev => {
      return prev.map(agent => {
        const updatedSamples = agent.sample_reviews.map(s =>
          s.review_id === reviewId ? { ...s, reviewer_action: action } : s
        );
        return { ...agent, sample_reviews: updatedSamples };
      });
    });
  }, []);

  const refreshData = useCallback((data: LoadedData) => {
    const enriched = data.agents.map(agent =>
      enrichAgent(
        agent,
        data.metrics,
        data.agentMetrics,
        data.thresholds,
        data.sampleReviews,
        data.agentReviews
      )
    );
    setAgents(enriched);
  }, []);

  const value = useMemo(() => ({
    agents,
    reviewQueue,
    auditTrail,
    isLoading,
    errors,
    searchQuery,
    setSearchQuery,
    updateAgentReview,
    updateSampleAction,
    refreshData,
  }), [agents, reviewQueue, auditTrail, isLoading, errors, searchQuery, updateAgentReview, updateSampleAction, refreshData]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

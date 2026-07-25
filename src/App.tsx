import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from '@/lib/appContext';
import { loadAllData } from '@/lib/dataLoader';
import type { LoadedData } from '@/lib/dataLoader';
import AppShell from '@/components/AppShell';
import PortfolioDashboard from '@/screens/PortfolioDashboard';
import AgentDetails from '@/screens/AgentDetails';
import ReviewQueue from '@/screens/ReviewQueue';
import AuditTrail from '@/screens/AuditTrail';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import ErrorState from '@/components/ErrorState';

export default function App() {
  const [data, setData] = useState<LoadedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    async function init() {
      const loaded = await loadAllData();
      if (mounted) {
        setData(loaded);
        setErrors(loaded.errors);
        setLoading(false);
      }
    }
    init();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <LoadingSkeleton rows={6} />
      </div>
    );
  }

  if (!data || data.agents.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <ErrorState title="Failed to load data" message={errors.join(', ')} />
      </div>
    );
  }

  return (
    <AppProvider initialData={data}>
      <AppShell>
        <Routes>
          <Route path="/" element={<PortfolioDashboard />} />
          <Route path="/agents/:id" element={<AgentDetails />} />
          <Route path="/queue" element={<ReviewQueue />} />
          <Route path="/audit" element={<AuditTrail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </AppProvider>
  );
}

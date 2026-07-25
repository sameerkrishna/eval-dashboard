
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  message?: string;
  className?: string;
}

export default function EmptyState({ title, message, className = '' }: EmptyStateProps) {
  return (
    <div className={`text-center py-12 ${className}`}>
      <Inbox className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</h3>
      {message && <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">{message}</p>}
    </div>
  );
}

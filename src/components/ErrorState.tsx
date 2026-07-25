
import { AlertTriangle } from 'lucide-react';

interface ErrorStateProps {
  title: string;
  message?: string;
  className?: string;
}

export default function ErrorState({ title, message, className = '' }: ErrorStateProps) {
  return (
    <div className={`bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-lg p-6 ${className}`}>
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-error-600 dark:text-error-400" />
        <div>
          <h3 className="text-sm font-semibold text-error-800 dark:text-error-300">{title}</h3>
          {message && (
            <p className="mt-1 text-sm text-error-600 dark:text-error-400">{message}</p>
          )}
        </div>
      </div>
    </div>
  );
}

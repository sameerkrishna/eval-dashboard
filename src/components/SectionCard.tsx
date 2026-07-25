import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface SectionCardProps {
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  action?: React.ReactNode;
}

export default function SectionCard({ title, children, className = '', collapsible, defaultOpen = true, action }: SectionCardProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          {collapsible && (
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
              aria-label={isOpen ? 'Collapse section' : 'Expand section'}
            >
              {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          )}
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
        </div>
        {action && <div>{action}</div>}
      </div>
      {(!collapsible || isOpen) && (
        <div className="p-4">{children}</div>
      )}
    </div>
  );
}

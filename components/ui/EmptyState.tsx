'use client';

import { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <Card className={`p-8 border border-border bg-card rounded-xl text-center max-w-lg mx-auto w-full flex flex-col items-center justify-center space-y-4 ${className}`}>
      <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center text-title text-2xl">
        {icon ?? '✨'}
      </div>

      <div className="space-y-1">
        <h3 className="font-bold text-lg text-foreground tracking-tight">{title}</h3>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{description}</p>
      </div>

      {action && (
        <Button onClick={action.onClick} className="gap-2 mt-4" size="sm">
          <PlusCircle className="h-4 w-4" />
          {action.label}
        </Button>
      )}
    </Card>
  );
}

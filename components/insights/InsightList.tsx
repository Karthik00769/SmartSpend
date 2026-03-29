'use client';

import { InsightDTO } from '@/types/api';
import { InsightCard } from './InsightCard';
import { Button } from '@/components/ui/button';

interface InsightListProps {
  insights: InsightDTO[];
  loading?: boolean;
  onMarkRead?: (id: number) => void;
  onRefresh?: () => void;
}

export function InsightList({ insights, loading, onMarkRead, onRefresh }: InsightListProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="animate-pulse bg-card border border-border rounded-xl p-6 h-28">
            <div className="flex gap-4">
              <div className="w-12 h-12 bg-muted rounded-xl" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-1/4" />
                <div className="h-4 bg-muted rounded w-3/4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!insights || insights.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center bg-card border border-border rounded-xl">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center text-3xl mb-4">
          ✨
        </div>
        <h3 className="text-xl font-bold mb-2">No items found</h3>
        <p className="text-muted-foreground max-w-sm mb-6">
          Check back later to see smart insights.
        </p>
        <Button variant="outline" onClick={onRefresh}>
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {insights.map((item) => (
        <InsightCard key={item.id} insight={item} onMarkRead={onMarkRead} />
      ))}
    </div>
  );
}

'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

// ─── Stats Card Skeleton ──────────────────────────────────────────────────────
export function StatsSkeleton() {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
      <Skeleton className="h-8 w-32 mt-2" />
      <Skeleton className="h-4 w-16 mt-1" />
    </Card>
  );
}

// ─── Chart Skeleton ──────────────────────────────────────────────────────────
interface ChartSkeletonProps {
  height?: string;
}

export function ChartSkeleton({ height = 'h-[300px]' }: ChartSkeletonProps) {
  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-6">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>

      <div className={`flex items-end justify-between gap-4 ${height} w-full pt-4`}>
        <Skeleton className="h-[20%] w-full rounded-t-lg" />
        <Skeleton className="h-[40%] w-full rounded-t-lg" />
        <Skeleton className="h-[35%] w-full rounded-t-lg" />
        <Skeleton className="h-[60%] w-full rounded-t-lg" />
        <Skeleton className="h-[80%] w-full rounded-t-lg" />
        <Skeleton className="h-[55%] w-full rounded-t-lg" />
        <Skeleton className="h-[75%] w-full rounded-t-lg" />
      </div>
    </Card>
  );
}

// ─── List/Table Item Skeleton ────────────────────────────────────────────────
export function ListSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex items-center justify-between p-4 bg-card border border-border rounded-xl">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface ErrorMessageProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorMessage({
  title = 'Failed to load content',
  message = 'Something went wrong while fetching data. Please try again.',
  onRetry,
  className = '',
}: ErrorMessageProps) {
  return (
    <Card className={`p-6 border-destructive/20 bg-destructive/5 rounded-xl text-center max-w-lg mx-auto w-full ${className}`}>
      <div className="flex justify-center mb-4">
        <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </div>
      </div>
      
      <h3 className="font-bold text-lg text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground mb-6">{message}</p>

      {onRetry && (
        <Button 
          variant="outline" 
          onClick={onRetry} 
          className="gap-2 border-destructive/20 hover:bg-destructive/10"
        >
          <RefreshCcw className="h-4 w-4" />
          Try Again
        </Button>
      )}
    </Card>
  );
}

'use client';

import { CheckCircle2, Circle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';
import type { Placeholder } from '@/lib/types';

interface ProgressTrackerProps {
  placeholders: Placeholder[];
  filledValues: Record<string, string>;
  currentIndex: number;
  progress: number;
}

export function ProgressTracker({
  placeholders,
  filledValues,
  currentIndex,
  progress,
}: ProgressTrackerProps) {
  const completedCount = Object.keys(filledValues).length;
  const totalCount = placeholders.length;

  return (
    <Card className="border-2 border-gray-200 bg-white shadow-sm">
      <CardHeader className="border-b border-gray-200 bg-gradient-to-r from-primary/5 to-secondary/5">
        <CardTitle className="text-lg font-semibold flex items-center justify-between">
          <span>Progress</span>
          <Badge variant="default" className="ml-2">
            {completedCount} / {totalCount}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-black">Completion</span>
            <span className="font-medium">{progress.toFixed(0)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {placeholders.length > 0 && (
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            <p className="text-sm font-medium text-black mb-2">
              Fields Status:
            </p>
            <div className="space-y-1.5">
              {placeholders.slice(0, 10).map((placeholder, index) => {
                // Check by ID first, then key as fallback
                const isFilled = (placeholder.id && placeholder.id in filledValues) || placeholder.key in filledValues;
                const isCurrent = index === currentIndex;
                
                return (
                  <div
                    key={placeholder.id || placeholder.key}
                    className={cn(
                      'flex items-center gap-2 text-sm p-2 rounded-md transition-colors',
                      isCurrent && 'bg-primary/10 border border-primary/20',
                      !isCurrent && !isFilled && 'hover:bg-gray-50'
                    )}
                  >
                    {isFilled ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                    ) : (
                      <Circle className="h-4 w-4 text-black flex-shrink-0" />
                    )}
                    <span
                      className={cn(
                        'flex-1 truncate',
                        isFilled && 'text-gray-600 font-normal',
                        isCurrent && 'font-semibold text-primary',
                        !isFilled && !isCurrent && 'text-gray-900'
                      )}
                    >
                      {placeholder.name}
                    </span>
                    {isCurrent && (
                      <Badge variant="outline" className="text-xs">
                        Current
                      </Badge>
                    )}
                  </div>
                );
              })}
              {placeholders.length > 10 && (
                <p className="text-xs text-black text-center pt-2">
                  +{placeholders.length - 10} more fields
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


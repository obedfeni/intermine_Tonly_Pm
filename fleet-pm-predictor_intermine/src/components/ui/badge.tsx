import * as React from 'react';
import { cn } from '@/lib/utils';

export type BadgeColor = 'gray' | 'red' | 'orange' | 'yellow' | 'green' | 'purple' | 'blue';

const colorClasses: Record<BadgeColor, string> = {
  gray: 'bg-muted text-muted-foreground border-border',
  red: 'bg-danger/10 text-danger border-danger/20',
  orange: 'bg-warning/10 text-warning border-warning/20',
  yellow: 'bg-amber-400/10 text-amber-600 dark:text-amber-400 border-amber-400/20',
  green: 'bg-success/10 text-success border-success/20',
  purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  blue: 'bg-primary/10 text-primary border-primary/20',
};

export function Badge({
  className,
  color = 'gray',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { color?: BadgeColor }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        colorClasses[color],
        className
      )}
      {...props}
    />
  );
}

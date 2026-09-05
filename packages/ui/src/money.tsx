import { formatPaise } from '@parking/core';
import { cn } from './cn';

/**
 * Renders an amount held in paise.
 *
 * Exists so that no screen ever divides by 100 by hand - the single most likely place for a
 * money bug to enter a codebase that otherwise keeps amounts as integers (assumption A9).
 */
export function Money({
  paise,
  showDecimals = true,
  className,
}: {
  paise: number;
  showDecimals?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('tabular-nums', className)}>{formatPaise(paise, { showDecimals })}</span>
  );
}

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges Tailwind classes so a caller's override actually wins.
 *
 * Plain string concatenation leaves both `px-4` and `px-2` in the class list and lets CSS
 * source order decide, which is why a variant prop appears to do nothing at random.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

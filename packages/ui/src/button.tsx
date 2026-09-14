import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

/**
 * The one button in the system (spec §9.2: a component library so screens are not hand-built).
 *
 * Sizes meet the 44px minimum touch target at `md` and above, because spec §7.4 requires the
 * core booking loop to be fully usable on a 375px mobile viewport.
 *
 * `primary` is indigo rather than near-black. On a screen where several things are clickable —
 * a listing card, a filter, a chip — a black button is just the darkest thing present, not
 * obviously the action. Colour makes "Book and pay" the one element that reads as the next step.
 * The pressed state moves the button down a pixel: on a phone, where no hover exists, that is
 * the only feedback between the tap and the server answering.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium ' +
    'transition-[background-color,box-shadow,transform,border-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] ' +
    'active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 ' +
    'disabled:pointer-events-none disabled:opacity-55 disabled:shadow-none',
  {
    variants: {
      variant: {
        primary:
          'bg-brand-600 text-white shadow-sm shadow-brand-600/25 hover:bg-brand-700 hover:shadow-md hover:shadow-brand-600/25',
        secondary:
          'border border-slate-300 bg-white text-slate-700 shadow-xs hover:border-slate-400 hover:bg-slate-50',
        ghost: 'text-slate-700 hover:bg-slate-100',
        danger: 'bg-red-600 text-white shadow-sm shadow-red-600/25 hover:bg-red-700',
      },
      size: {
        sm: 'h-9 px-3.5 text-sm',
        md: 'h-11 px-5 text-sm',
        lg: 'h-12 px-6 text-base',
      },
      full: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', full: false },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  children: ReactNode;
}

export function Button({ className, variant, size, full, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size, full }), className)} {...props} />;
}

export { buttonVariants };

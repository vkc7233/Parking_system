import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * Surface used for every panel in the Seeker, Host and Admin experiences.
 *
 * `interactive` is for a card that is itself a link — a listing in the search results. It lifts
 * on hover, which is the affordance telling a seeker the whole tile is clickable rather than
 * just the title inside it. Panels that merely contain things never lift; a page where every
 * surface reacts to the pointer teaches nothing about what is clickable.
 */
export function Card({
  className,
  interactive = false,
  children,
}: {
  className?: string;
  interactive?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200/80 bg-white shadow-card',
        interactive &&
          'transition-[box-shadow,border-color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ' +
            'group-hover:-translate-y-0.5 group-hover:border-slate-300 group-hover:shadow-lift',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>;
}

export function CardFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-b-xl border-t border-slate-100 bg-slate-50/60 px-5 py-4', className)}>
      {children}
    </div>
  );
}

/**
 * Status pill.
 *
 * The colours carry meaning and are used consistently across every screen: amber means "waiting
 * on someone", emerald means "settled or earning", indigo means "in progress", grey means "off
 * the market", red means "someone has a problem". A reader who learns them on the host's
 * listings page reads the admin dispute queue without being taught again.
 *
 * Drawn with a ring rather than a solid fill so a row of them sits quietly next to body text
 * instead of competing with it.
 */
const TONES = {
  neutral: 'bg-slate-50 text-slate-700 ring-slate-200',
  info: 'bg-brand-50 text-brand-800 ring-brand-200',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warning: 'bg-accent-50 text-accent-900 ring-accent-400/40',
  danger: 'bg-red-50 text-red-800 ring-red-200',
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Shown when a list has nothing in it — the first thing a new Host sees. */
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="px-5 py-12 text-center">
      {icon ? (
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          {icon}
        </div>
      ) : null}
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {description ? (
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-slate-600">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

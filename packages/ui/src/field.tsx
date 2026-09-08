import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from './cn';

/**
 * Form primitives.
 *
 * Every control is wrapped by `Field`, which owns the label, the hint and the error, and wires
 * `aria-describedby` and `aria-invalid` for it. Doing that here rather than at each call site is
 * what keeps spec §12's WCAG AA requirement true as screens are added - an error a screen reader
 * never announces is not an error message.
 */

// 16px text on the control itself, not 14px: iOS Safari zooms the whole page when a font-size
// under 16px is focused, and a viewport that jumps mid-checkout is the sort of thing people
// abandon a booking over.
const controlBase =
  'w-full rounded-lg border bg-white px-3 py-2.5 text-base text-slate-900 shadow-xs ' +
  'placeholder:text-slate-400 transition-[border-color,box-shadow] duration-150 ' +
  'focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';

const controlTone = {
  normal: 'border-slate-300 hover:border-slate-400 focus:border-brand-500 focus:ring-brand-500/20',
  invalid: 'border-red-400 focus:border-red-500 focus:ring-red-500/20',
};

export interface FieldProps {
  /** Must match the control's `id`. */
  htmlFor: string;
  label: string;
  /** Rendered under the control, and referenced by aria-describedby. */
  hint?: ReactNode;
  error?: string | undefined;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

export function Field({ htmlFor, label, hint, error, required, className, children }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
        {required ? (
          <span className="ml-0.5 text-red-600" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      {children}

      {hint && !error ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Wires the aria attributes a control needs to be announced with its hint and error. */
export function fieldAria(id: string, opts: { hint?: boolean; error?: boolean } = {}) {
  const describedBy = [
    opts.error ? `${id}-error` : null,
    opts.hint && !opts.error ? `${id}-hint` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    id,
    'aria-invalid': opts.error ? true : undefined,
    'aria-describedby': describedBy || undefined,
  };
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function Input({ className, invalid, ...props }: InputProps) {
  return (
    <input
      className={cn(controlBase, invalid ? controlTone.invalid : controlTone.normal, className)}
      {...props}
    />
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export function Textarea({ className, invalid, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        controlBase,
        'min-h-24 resize-y',
        invalid ? controlTone.invalid : controlTone.normal,
        className,
      )}
      {...props}
    />
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export function Select({ className, invalid, children, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        controlBase,
        'appearance-none bg-[length:1rem] pr-9',
        invalid ? controlTone.invalid : controlTone.normal,
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

/** Non-field error, e.g. a whole form failing. */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </p>
  );
}

export function FormSuccess({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
      {children}
    </p>
  );
}

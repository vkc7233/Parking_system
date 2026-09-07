import type { ListingStatus } from '@parking/types';
import { Badge, type BadgeTone } from './card';

/**
 * One place that knows how a listing status is presented, so the Host dashboard, the Admin
 * approval queue and the listing detail page cannot describe the same state differently.
 *
 * The wording is written for the Host, since they are who sees it most: "In review" is more
 * useful to them than the database's "pending".
 */
const PRESENTATION: Record<ListingStatus, { label: string; tone: BadgeTone; hint: string }> = {
  draft: {
    label: 'Draft',
    tone: 'neutral',
    hint: 'Not submitted yet. Only you can see this.',
  },
  pending: {
    label: 'In review',
    tone: 'warning',
    hint: 'Submitted for approval. We usually review within one working day.',
  },
  live: {
    label: 'Live',
    tone: 'success',
    hint: 'Visible in search and bookable.',
  },
  paused: {
    label: 'Paused',
    tone: 'neutral',
    hint: 'Hidden from search. Existing bookings are unaffected.',
  },
  rejected: {
    label: 'Changes needed',
    tone: 'danger',
    hint: 'Not approved. Fix the issue noted and resubmit.',
  },
};

/**
 * A status arriving from the database that this file has not been taught about should render as
 * something neutral rather than crash a Host's dashboard, so every lookup goes through here.
 */
function presentationFor(status: ListingStatus) {
  return PRESENTATION[status] ?? { label: status, tone: 'neutral' as BadgeTone, hint: '' };
}

export function listingStatusLabel(status: ListingStatus): string {
  return presentationFor(status).label;
}

export function listingStatusHint(status: ListingStatus): string {
  return presentationFor(status).hint;
}

export function ListingStatusBadge({ status }: { status: ListingStatus }) {
  const { label, tone } = presentationFor(status);
  return <Badge tone={tone}>{label}</Badge>;
}

'use server';

/**
 * Server-side quoting for the booking form (spec §6.1 step 4, §7.1).
 *
 * The price the Seeker sees is computed here, never in the browser, and the same function runs
 * again inside `createBooking`. A quote returned to the client is a display value; the booking
 * is priced independently at the moment it is created, so a tampered form cannot buy anything
 * at a price the server did not calculate.
 */
import { quoteBooking, QuoteError } from '@parking/core';
import { getAvailableSlots } from '@parking/api-client';
import { createClient } from '@/lib/supabase/server';

export interface QuoteResult {
  ok: boolean;
  /** Present when ok. All amounts in paise. */
  breakdown?: {
    durationMinutes: number;
    billableMinutes: number;
    subtotal: number;
    serviceFee: number;
    tax: number;
    total: number;
    dailyCapApplied: boolean;
  };
  /** Remaining capacity for the window, so the form can say "1 left". */
  slotsLeft?: number;
  error?: string;
}

export async function quoteForListing(
  listingId: string,
  startIso: string,
  endIso: string,
): Promise<QuoteResult> {
  const start = new Date(startIso);
  const end = new Date(endIso);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, error: 'Choose a start time and a duration.' };
  }

  const supabase = await createClient();

  // status = 'live' is re-checked here rather than trusted from the page that rendered the
  // form: a listing can be paused between page load and quote.
  const { data: listing } = await supabase
    .from('listings')
    .select('price_per_hour, price_per_day')
    .eq('id', listingId)
    .eq('status', 'live')
    .maybeSingle();

  if (!listing) {
    return { ok: false, error: 'This space is no longer available.' };
  }

  let breakdown;
  try {
    const quote = quoteBooking({
      startTime: start,
      endTime: end,
      pricePerHour: Number(listing.price_per_hour),
      pricePerDay: listing.price_per_day === null ? null : Number(listing.price_per_day),
    });

    breakdown = {
      durationMinutes: quote.durationMinutes,
      billableMinutes: quote.billableMinutes,
      subtotal: quote.subtotal,
      serviceFee: quote.serviceFee,
      tax: quote.tax,
      total: quote.total,
      dailyCapApplied: quote.dailyCapApplied,
    };
  } catch (error) {
    // QuoteError messages are written for the Seeker; anything else is not.
    if (error instanceof QuoteError) return { ok: false, error: error.message };
    return { ok: false, error: 'That booking window is not valid.' };
  }

  const slotsLeft = await getAvailableSlots(supabase, listingId, start, end);

  if (slotsLeft <= 0) {
    return {
      ok: false,
      error: 'That time has just been taken. Try a different slot.',
      slotsLeft: 0,
    };
  }

  return { ok: true, breakdown, slotsLeft };
}

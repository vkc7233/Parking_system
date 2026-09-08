import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BOOKING, PILOT_CITY } from '@parking/config';
import { Badge, Card, CardBody, Money } from '@parking/ui';
import type { SpotType } from '@parking/types';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { BookingForm } from './booking-form';
import { ListingPhoto } from '@/components/listing-photo';
import { SpotArt } from '@/components/spot-art';

interface PublicListing {
  id: string;
  host_id: string;
  title: string;
  description: string | null;
  address_line: string;
  locality: string | null;
  city: string;
  pincode: string | null;
  spot_type: SpotType;
  capacity: number;
  price_per_hour: number;
  price_per_day: number | null;
  available_from: string | null;
  available_until: string | null;
  rules: string | null;
  lat: number;
  lng: number;
  listing_photos: { id: string; storage_path: string; alt_text: string | null; position: number }[];
  host_profiles: { name: string | null; host_since: string } | null;
}

const SPOT_LABELS: Record<SpotType, string> = {
  open: 'Open / uncovered',
  covered: 'Covered',
  basement: 'Basement',
  stilt: 'Stilt',
  garage: 'Garage',
  driveway: 'Driveway',
};

/**
 * Public listing detail (spec §7.1, §8.1).
 *
 * Readable without an account: §7.4 wants these pages crawlable, and the RLS policy already
 * allows anonymous reads of live listings only. Host identity comes from the `host_profiles`
 * view, which exposes a name and a join date and deliberately cannot reach phone or email.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from('listings')
    .select('title, locality, city')
    .eq('id', id)
    .eq('status', 'live')
    .maybeSingle();

  if (!data) return { title: 'Listing not found' };

  return {
    title: data.title + ' — parking in ' + (data.locality ?? data.city),
    description:
      'Book this parking space in ' + (data.locality ? data.locality + ', ' : '') + data.city + '.',
  };
}

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from('listings')
    .select(
      'id, host_id, title, description, address_line, locality, city, pincode, spot_type, capacity, price_per_hour, price_per_day, available_from, available_until, rules, lat, lng, listing_photos(id, storage_path, alt_text, position)',
    )
    .eq('id', id)
    .eq('status', 'live')
    .maybeSingle();

  // A paused or pending listing is genuinely not available, so 404 rather than showing
  // something a seeker cannot book.
  if (!data) notFound();

  const listing = data as unknown as PublicListing;

  const { data: host } = await supabase
    .from('host_profiles')
    .select('name, host_since')
    .eq('id', listing.host_id)
    .maybeSingle();

  const { data: rating } = await supabase
    .from('listing_ratings')
    .select('average_rating, review_count')
    .eq('listing_id', listing.id)
    .maybeSingle();

  const photos = [...listing.listing_photos].sort((a, b) => a.position - b.position);
  const photoUrl = (path: string) =>
    supabase.storage.from('listing-photos').getPublicUrl(path).data.publicUrl;

  const profile = await getProfile();

  const hours =
    listing.available_from && listing.available_until
      ? listing.available_from.slice(0, 5) + ' to ' + listing.available_until.slice(0, 5)
      : 'Any time, 24 hours';

  return (
    <div className="min-h-dvh bg-slate-50">
      <SiteHeader />

      <main className="mx-auto max-w-5xl px-4 py-8">
        <Link href="/" className="text-sm text-slate-600 underline underline-offset-4">
          Back to search
        </Link>

        <header className="mt-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {listing.title}
          </h1>
          <p className="mt-1 text-slate-600">
            {listing.locality ? listing.locality + ', ' : ''}
            {listing.city}
            {rating?.average_rating
              ? ' · ★ ' +
                Number(rating.average_rating).toFixed(1) +
                ' (' +
                rating.review_count +
                ')'
              : ' · No reviews yet'}
          </p>
        </header>

        {photos.length > 0 ? (
          <ul className="mt-5 grid gap-3 sm:grid-cols-3">
            {photos.slice(0, 3).map((photo, i) => (
              <li
                key={photo.id}
                className={
                  'relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100 ' +
                  (i === 0 ? 'sm:col-span-2 sm:row-span-2 aspect-4/3' : 'aspect-4/3')
                }
              >
                <ListingPhoto
                  src={photoUrl(photo.storage_path)}
                  alt={photo.alt_text ?? listing.title}
                  spotType={listing.spot_type}
                  sizes="(max-width: 640px) 100vw, 400px"
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-5 aspect-21/9 overflow-hidden rounded-xl border border-slate-200">
            <SpotArt spotType={listing.spot_type} />
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Card>
              <CardBody className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge tone="neutral">{SPOT_LABELS[listing.spot_type]}</Badge>
                  <Badge tone="neutral">
                    {listing.capacity} vehicle{listing.capacity === 1 ? '' : 's'} at once
                  </Badge>
                  <Badge tone="neutral">{hours}</Badge>
                </div>

                {listing.description ? (
                  <p className="text-slate-700">{listing.description}</p>
                ) : null}

                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Where it is</h2>
                  <p className="mt-1 text-sm text-slate-700">
                    {listing.address_line}
                    <br />
                    {listing.locality ? listing.locality + ', ' : ''}
                    {listing.city} {listing.pincode ?? ''}
                  </p>
                  <p className="mt-1 font-mono text-xs text-slate-500">
                    {listing.lat.toFixed(5)}, {listing.lng.toFixed(5)}
                  </p>
                </div>

                {listing.rules ? (
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">House rules</h2>
                    <p className="mt-1 text-sm text-slate-700">{listing.rules}</p>
                  </div>
                ) : null}

                <div className="border-t border-slate-100 pt-4">
                  <h2 className="text-sm font-semibold text-slate-900">Your host</h2>
                  <p className="mt-1 text-sm text-slate-700">
                    {host?.name ?? 'Verified host'}
                    {host?.host_since
                      ? ' · hosting since ' +
                        new Date(host.host_since).toLocaleDateString('en-IN', {
                          month: 'long',
                          year: 'numeric',
                        })
                      : null}
                  </p>
                </div>
              </CardBody>
            </Card>
          </div>

          <aside className="lg:sticky lg:top-20 lg:self-start">
            <Card>
              <CardBody className="space-y-4">
                <div>
                  <p className="text-2xl font-semibold text-slate-900">
                    <Money paise={listing.price_per_hour} showDecimals={false} />
                    <span className="text-base font-normal text-slate-500"> / hour</span>
                  </p>
                  {listing.price_per_day ? (
                    <p className="mt-0.5 text-sm text-slate-600">
                      Capped at <Money paise={listing.price_per_day} showDecimals={false} /> for a
                      full day
                    </p>
                  ) : null}
                </div>

                <BookingForm
                  listingId={listing.id}
                  isSignedIn={profile !== null}
                  isOwnListing={profile?.id === listing.host_id}
                />
              </CardBody>
            </Card>
          </aside>
        </div>

        <p className="mt-8 text-xs text-slate-500">
          Listed in {PILOT_CITY.name}. Bookings can be made up to {BOOKING.maxAdvanceDays} days
          ahead, in {BOOKING.slotMinutes}-minute steps. By booking you accept our{' '}
          <Link href="/legal/terms" className="underline underline-offset-2">
            Terms
          </Link>{' '}
          and{' '}
          <Link href="/legal/cancellation" className="underline underline-offset-2">
            Cancellation Policy
          </Link>
          .
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}

import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ListingStatusBadge,
  Money,
} from '@parking/ui';
import type { ListingStatus, SpotType } from '@parking/types';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ListingThumbnail } from '../../host/listing-thumbnail';
import { ReviewPanel } from './review-panel';

export const metadata = { title: 'Listing approvals' };

interface QueueRow {
  id: string;
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
  rules: string | null;
  lat: number;
  lng: number;
  status: ListingStatus;
  agreement_signed_at: string | null;
  submitted_at: string | null;
  users: { name: string | null; phone: string; kyc_status: string } | null;
  listing_photos: { id: string; storage_path: string; position: number }[];
}

/**
 * Listing approval queue (spec §6.3 step 1, §7.3).
 *
 * §6.3 tells the Admin what to check: that the photos are genuine and clear, the address is
 * valid, the price is reasonable, and the agreement is signed. The card below puts all four in
 * front of them rather than making them click through to find each one.
 */
export default async function AdminListingsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data } = await supabase
    .from('listings')
    .select(
      'id, title, description, address_line, locality, city, pincode, spot_type, capacity, price_per_hour, price_per_day, rules, lat, lng, status, agreement_signed_at, submitted_at, users!listings_host_id_fkey(name, phone, kyc_status), listing_photos(id, storage_path, position)',
    )
    .eq('status', 'pending')
    .order('submitted_at', { ascending: true });

  const queue = (data ?? []) as unknown as QueueRow[];

  const publicUrl = (path: string) =>
    supabase.storage.from('listing-photos').getPublicUrl(path).data.publicUrl;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Listing approvals</h1>
        <p className="mt-1 text-slate-600">
          {queue.length === 0
            ? 'Nothing waiting for review.'
            : `${queue.length} listing${queue.length === 1 ? '' : 's'} waiting, oldest first.`}
        </p>
      </header>

      {queue.length === 0 ? (
        <Card>
          <EmptyState
            title="Queue is empty"
            description="Listings appear here as soon as a host submits them. Nothing reaches seeker search without passing through this queue."
          />
        </Card>
      ) : (
        <ul className="space-y-5">
          {queue.map((listing) => {
            const photos = [...listing.listing_photos].sort((a, b) => a.position - b.position);

            return (
              <li key={listing.id}>
                <Card>
                  <CardHeader
                    title={listing.title}
                    description={
                      <>
                        {listing.users?.name ?? 'Unknown host'} · {listing.users?.phone}
                        {listing.submitted_at
                          ? ` · submitted ${new Date(listing.submitted_at).toLocaleDateString('en-IN')}`
                          : null}
                      </>
                    }
                    action={<ListingStatusBadge status={listing.status} />}
                  />

                  <CardBody className="space-y-4">
                    {/* Check 1: are the photos genuine and clear? */}
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                        Photos ({photos.length})
                      </p>
                      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {photos.map((photo, i) => (
                          <li
                            key={photo.id}
                            className="relative aspect-4/3 overflow-hidden rounded-md border border-slate-200 bg-slate-100"
                          >
                            <ListingThumbnail
                              src={publicUrl(photo.storage_path)}
                              alt={`${listing.title} photo ${i + 1}`}
                              sizes="(max-width: 640px) 50vw, 160px"
                              className="object-cover"
                            />
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Checks 2 and 3: is the address valid, and the price reasonable? */}
                    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Address
                        </dt>
                        <dd className="text-slate-800">
                          {listing.address_line}
                          <br />
                          {listing.locality ? `${listing.locality}, ` : ''}
                          {listing.city} {listing.pincode ?? ''}
                        </dd>
                        <dd className="mt-1 font-mono text-xs text-slate-500">
                          {listing.lat.toFixed(5)}, {listing.lng.toFixed(5)}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Price and capacity
                        </dt>
                        <dd className="text-slate-800">
                          <Money paise={listing.price_per_hour} showDecimals={false} /> / hour
                          {listing.price_per_day ? (
                            <>
                              {' · '}
                              <Money paise={listing.price_per_day} showDecimals={false} /> daily cap
                            </>
                          ) : null}
                        </dd>
                        <dd className="text-slate-600">
                          {listing.spot_type} · {listing.capacity} vehicle
                          {listing.capacity === 1 ? '' : 's'} at once
                        </dd>
                      </div>
                    </dl>

                    {listing.description ? (
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Description
                        </p>
                        <p className="text-sm text-slate-700">{listing.description}</p>
                      </div>
                    ) : null}

                    {listing.rules ? (
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          House rules
                        </p>
                        <p className="text-sm text-slate-700">{listing.rules}</p>
                      </div>
                    ) : null}

                    {/* Check 4: is the Host Listing Agreement signed? */}
                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                      <Badge tone={listing.agreement_signed_at ? 'success' : 'danger'}>
                        {listing.agreement_signed_at ? 'Agreement signed' : 'Agreement missing'}
                      </Badge>
                      <Badge
                        tone={listing.users?.kyc_status === 'verified' ? 'success' : 'warning'}
                      >
                        KYC {listing.users?.kyc_status ?? 'unknown'}
                      </Badge>
                    </div>

                    <ReviewPanel
                      listingId={listing.id}
                      agreementSigned={listing.agreement_signed_at !== null}
                    />
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

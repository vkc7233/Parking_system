import Link from 'next/link';
import { requireHost } from '@/lib/auth';
import { clientEnv } from '@/lib/env';
import { ListingForm } from '../listing-form';

export const metadata = { title: 'List a space' };

/** Spec §8.2 — Add listing. Saves as a draft; photos and submission follow on the edit screen. */
export default async function NewListingPage() {
  await requireHost('/host/listings/new');

  return (
    <div className="space-y-6">
      <header>
        <Link href="/host" className="text-sm text-slate-600 underline underline-offset-4">
          Back to my listings
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">List a space</h1>
        <p className="mt-1 text-slate-600">
          This saves as a draft. Nothing is visible to seekers until you submit it and it is
          approved.
        </p>
      </header>

      <ListingForm
        mapsApiKey={clientEnv.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
        submitLabel="Save and continue"
        defaults={{
          id: null,
          title: '',
          description: '',
          spotType: 'covered',
          capacity: 1,
          pricePerHour: 3000,
          pricePerDay: null,
          availableFrom: null,
          availableUntil: null,
          rules: '',
          location: null,
        }}
      />
    </div>
  );
}

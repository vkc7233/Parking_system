import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Card, CardBody, CardHeader } from '@parking/ui';
import { requireHost } from '@/lib/auth';
import { getHostAgreement } from '@/lib/agreement';
import { createClient } from '@/lib/supabase/server';
import { AgreementSigner } from './sign-form';

export const metadata = { title: 'Host Listing Agreement' };

/**
 * Spec §6.2 step 4 — the Host reviews and digitally signs the agreement before the listing can
 * be approved. §7.2 makes the signature a hard precondition, enforced by a database trigger.
 */
export default async function AgreementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireHost(`/host/listings/${id}/agreement`);
  const supabase = await createClient();

  const { data: listing } = await supabase
    .from('listings')
    .select('id, title, agreement_signed_at')
    .eq('id', id)
    .single();

  // RLS scopes this to the host's own listings, so missing covers "not yours" too.
  if (!listing) notFound();

  const agreement = await getHostAgreement();

  const { data: existing } = await supabase
    .from('listing_agreements')
    .select('signed_name, signed_at, agreement_version')
    .eq('listing_id', id)
    .eq('agreement_version', agreement.version)
    .maybeSingle();

  // Already signed this version: nothing to do, so do not offer to sign it again.
  if (existing) redirect(`/host/listings/${id}/edit?signed=1`);

  return (
    <div className="space-y-6">
      <header>
        <Link
          href={`/host/listings/${id}/edit`}
          className="text-sm text-slate-600 underline underline-offset-4"
        >
          Back to the listing
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          {agreement.title}
        </h1>
        <p className="mt-1 text-slate-600">
          For “{listing.title}”. You sign this once per listing.
        </p>
      </header>

      <Card>
        <CardHeader
          title="Please read before signing"
          description={`Version ${agreement.version}`}
        />
        <CardBody>
          <AgreementSigner
            listingId={listing.id}
            version={agreement.version}
            hash={agreement.hash}
            accountName={profile.name}
            preamble={agreement.preamble}
            clauses={agreement.clauses}
          />
        </CardBody>
      </Card>
    </div>
  );
}

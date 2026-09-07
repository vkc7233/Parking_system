import Link from 'next/link';
import { buttonVariants, Card, CardBody, CardHeader } from '@parking/ui';
import { getOnboardingState, requireHost } from '@/lib/auth';
import { DocumentUpload } from './document-upload';

export const metadata = { title: 'Host onboarding' };

/**
 * KYC-lite onboarding (spec §6.2 step 2, §7.2).
 *
 * Three documents, manually reviewed by an Admin. Live e-KYC via DigiLocker/VAHAN is explicitly
 * deferred (spec §4.2, §9.8); when it arrives it replaces the upload control here without
 * changing the schema or this page's shape.
 */
export default async function OnboardingPage() {
  const profile = await requireHost('/host/onboarding');
  const onboarding = await getOnboardingState(profile.id);

  const rejectedFor = (type: string) => onboarding.rejected.find((d) => d.type === type);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Host onboarding</h1>
        <p className="mt-1 text-slate-600">
          We verify every host before their space goes live. This is a one-time step.
        </p>
      </header>

      <Card>
        <CardHeader
          title="Your documents"
          description="An admin reviews these, usually within one working day."
        />

        <DocumentUpload
          type="identity_proof"
          label="Identity proof"
          hint="Aadhaar, PAN, passport or driving licence."
          current={onboarding.identityProof}
          rejected={rejectedFor('identity_proof')}
        />
        <DocumentUpload
          type="address_proof"
          label="Address proof"
          hint="A utility bill, rent agreement or property document showing the address."
          current={onboarding.addressProof}
          rejected={rejectedFor('address_proof')}
        />
        <DocumentUpload
          type="bank_details"
          label="Bank details"
          hint="A cancelled cheque or bank statement header. This is where your payouts go."
          current={onboarding.bankDetails}
          rejected={rejectedFor('bank_details')}
        />
      </Card>

      <Card>
        <CardBody>
          {onboarding.complete ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {onboarding.verified
                    ? 'Onboarding complete and verified.'
                    : 'All documents received.'}
                </p>
                <p className="mt-0.5 text-sm text-slate-600">
                  {onboarding.verified
                    ? 'You can list a space and submit it for approval.'
                    : 'You can start listing now — review finishes in the background.'}
                </p>
              </div>
              <Link href="/host/listings/new" className={buttonVariants({ size: 'md' })}>
                List a space
              </Link>
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              Upload all three documents above to finish onboarding. You can create a listing as a
              draft before then, but it cannot be submitted for approval until these are on file.
            </p>
          )}
        </CardBody>
      </Card>

      <p className="text-xs text-slate-500">
        Your documents are stored privately and encrypted at rest. They are used only to verify your
        identity and to pay you, and are never shown to seekers.
      </p>
    </div>
  );
}

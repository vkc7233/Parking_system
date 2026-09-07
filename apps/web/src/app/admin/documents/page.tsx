import { Badge, Card, CardBody, CardHeader, EmptyState } from '@parking/ui';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { DocumentReview } from './document-review';

export const metadata = { title: 'Document review' };

interface PendingDoc {
  id: string;
  type: 'identity_proof' | 'address_proof' | 'bank_details';
  file_path: string;
  created_at: string;
  users: { id: string; name: string | null; phone: string } | null;
}

const TYPE_LABELS: Record<PendingDoc['type'], string> = {
  identity_proof: 'Identity proof',
  address_proof: 'Address proof',
  bank_details: 'Bank details',
};

/**
 * KYC-lite review queue (spec §4.2, §7.2).
 *
 * Documents live in a private bucket, so nothing here links to a public URL — the viewer fetches
 * a signed URL valid for two minutes, on demand, per document.
 */
export default async function AdminDocumentsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data } = await supabase
    .from('documents')
    .select('id, type, file_path, created_at, users!documents_user_id_fkey(id, name, phone)')
    .eq('verified_status', 'pending')
    .order('created_at', { ascending: true });

  const pending = (data ?? []) as unknown as PendingDoc[];

  // Grouped by host: reviewing three documents for one person together is the actual task.
  const byHost = new Map<string, { name: string; phone: string; docs: PendingDoc[] }>();
  for (const doc of pending) {
    const key = doc.users?.id ?? 'unknown';
    const entry = byHost.get(key) ?? {
      name: doc.users?.name ?? 'Unknown host',
      phone: doc.users?.phone ?? '',
      docs: [],
    };
    entry.docs.push(doc);
    byHost.set(key, entry);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Document review</h1>
        <p className="mt-1 text-slate-600">
          {pending.length === 0
            ? 'Nothing waiting for review.'
            : `${pending.length} document${pending.length === 1 ? '' : 's'} from ${byHost.size} host${byHost.size === 1 ? '' : 's'}.`}
        </p>
      </header>

      {pending.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing to review"
            description="Identity, address and bank documents appear here as hosts upload them."
          />
        </Card>
      ) : (
        <ul className="space-y-5">
          {[...byHost.entries()].map(([hostId, host]) => (
            <li key={hostId}>
              <Card>
                <CardHeader title={host.name} description={host.phone} />
                <CardBody className="space-y-4">
                  {host.docs.map((doc) => (
                    <div
                      key={doc.id}
                      className="border-b border-slate-100 pb-4 last:border-0 last:pb-0"
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-slate-900">
                          {TYPE_LABELS[doc.type]}
                        </span>
                        <Badge tone="warning">In review</Badge>
                        <span className="text-xs text-slate-500">
                          uploaded {new Date(doc.created_at).toLocaleDateString('en-IN')}
                        </span>
                      </div>
                      <DocumentReview documentId={doc.id} filePath={doc.file_path} />
                    </div>
                  ))}
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

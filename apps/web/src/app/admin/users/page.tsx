import { Badge, Card, CardBody } from '@parking/ui';
import { formatPhoneForDisplay } from '@parking/core';
import type { KycStatus, UserRole } from '@parking/types';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { SuspendControl } from './suspend-control';

export const metadata = { title: 'Users and hosts' };

interface UserRow {
  id: string;
  name: string | null;
  phone: string;
  role: UserRole;
  kyc_status: KycStatus;
  suspended_at: string | null;
  suspended_reason: string | null;
  created_at: string;
  listings: { id: string; status: string }[];
}

const KYC_TONE: Record<KycStatus, 'neutral' | 'warning' | 'success' | 'danger'> = {
  not_started: 'neutral',
  pending: 'warning',
  verified: 'success',
  rejected: 'danger',
};

/** Spec §7.3 — view, search and suspend a user or host. */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const admin = await requireAdmin();
  const { q } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from('users')
    .select(
      'id, name, phone, role, kyc_status, suspended_at, suspended_reason, created_at, listings(id, status)',
    )
    .order('created_at', { ascending: false })
    .limit(100);

  // Name or phone — what an operator actually has in front of them from a support conversation.
  const term = q?.trim();
  if (term) {
    query = query.or('name.ilike.%' + term + '%,phone.ilike.%' + term + '%');
  }

  const { data } = await query;
  const users = (data ?? []) as unknown as UserRow[];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Users and hosts</h1>
        <p className="mt-1 text-slate-600">{users.length} shown, newest first.</p>
      </header>

      <form method="get" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search by name or phone"
          aria-label="Search users"
          className="w-full max-w-sm rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
        />
        <button
          type="submit"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Search
        </button>
      </form>

      <ul className="space-y-3">
        {users.map((user) => {
          const live = user.listings.filter((l) => l.status === 'live').length;

          return (
            <li key={user.id}>
              <Card>
                <CardBody>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900">
                          {user.name ?? 'No name yet'}
                        </span>
                        <Badge tone={user.role === 'admin' ? 'info' : 'neutral'}>{user.role}</Badge>
                        <Badge tone={KYC_TONE[user.kyc_status]}>KYC {user.kyc_status}</Badge>
                        {user.suspended_at ? <Badge tone="danger">Suspended</Badge> : null}
                        {user.id === admin.id ? <Badge tone="info">You</Badge> : null}
                      </div>

                      <p className="mt-1 text-sm text-slate-600">
                        {formatPhoneForDisplay(user.phone)} · joined{' '}
                        {new Date(user.created_at).toLocaleDateString('en-IN')}
                        {user.listings.length > 0
                          ? ' · ' +
                            user.listings.length +
                            ' listing' +
                            (user.listings.length === 1 ? '' : 's') +
                            ' (' +
                            live +
                            ' live)'
                          : null}
                      </p>

                      {user.suspended_reason ? (
                        <p className="mt-1 text-sm text-red-800">{user.suspended_reason}</p>
                      ) : null}
                    </div>

                    {user.id === admin.id ? null : (
                      <SuspendControl
                        userId={user.id}
                        suspended={user.suspended_at !== null}
                        name={user.name ?? 'this host'}
                      />
                    )}
                  </div>
                </CardBody>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

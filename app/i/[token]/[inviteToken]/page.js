import { Suspense } from 'react';
import InviteAccessClient from '@/components/InviteAccessClient';

export default function NamedInviteTokenPage({ params }) {
  return (
    <Suspense fallback={null}>
      <InviteAccessClient token={params?.inviteToken} />
    </Suspense>
  );
}

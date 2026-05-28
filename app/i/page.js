import { Suspense } from 'react';
import InviteAccessClient from '@/components/InviteAccessClient';

export default function ShortInvitePage() {
  return (
    <Suspense fallback={null}>
      <InviteAccessClient />
    </Suspense>
  );
}

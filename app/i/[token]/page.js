import { Suspense } from 'react';
import InviteAccessClient from '@/components/InviteAccessClient';

export default function ShortInviteTokenPage({ params }) {
  return (
    <Suspense fallback={null}>
      <InviteAccessClient token={params?.token} />
    </Suspense>
  );
}

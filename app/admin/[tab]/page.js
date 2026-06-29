import { redirect } from 'next/navigation';

export default function AdminTabRedirect({ params, searchParams }) {
  const query = new URLSearchParams();
  Object.entries(searchParams || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(item => query.append(key, item));
    } else if (value !== undefined) {
      query.set(key, value);
    }
  });
  if (params?.tab && !query.has('tab')) query.set('tab', params.tab);
  const qs = query.toString();
  redirect(`/admin${qs ? `?${qs}` : ''}`);
}

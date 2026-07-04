import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { getAdminClient } from '@/lib/supabase-admin';
import { emailHandle } from '@/lib/chat-helpers';

function previewTextFor(message) {
  if (message.deleted_at) return 'Se eliminó este mensaje';
  if (message.body) return message.body.slice(0, 140);
  if (message.image_url) return '📷 Imagen';
  if (message.reference) return '🔗 Referencia compartida';
  return 'Nuevo mensaje';
}

// Disparado por el trigger on_chat_message_created_notify (sql/chat_push_notifications.sql)
// via pg_net en cada INSERT de chat_messages. Manda un push real a los
// miembros del canal (menos quien escribio y quien lo tiene silenciado del
// todo), respetando el nivel de silencio ('mute_sound' => push sin sonido).
export async function POST(request) {
  const secret = request.headers.get('x-webhook-secret') || '';
  if (!process.env.CHAT_WEBHOOK_SECRET || secret !== process.env.CHAT_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (!vapidPublic || !vapidPrivate) {
    return NextResponse.json({ error: 'Faltan claves VAPID en el servidor.' }, { status: 500 });
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:inkorashop@gmail.com', vapidPublic, vapidPrivate);

  const body = await request.json();
  const message = body.record;
  if (!message?.channel_id) {
    return NextResponse.json({ error: 'Payload invalido.' }, { status: 400 });
  }

  const admin = getAdminClient();

  const [{ data: channel }, { data: members }] = await Promise.all([
    admin.from('chat_channels').select('id, name, type').eq('id', message.channel_id).maybeSingle(),
    admin.from('chat_channel_members').select('email').eq('channel_id', message.channel_id),
  ]);

  const recipientEmails = (members || [])
    .map(m => m.email)
    .filter(email => email && email !== message.sender_email);

  if (recipientEmails.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const { data: muteRows } = await admin
    .from('chat_channel_member_settings')
    .select('email, mute_level')
    .eq('channel_id', message.channel_id)
    .in('email', recipientEmails);

  const muteByEmail = {};
  (muteRows || []).forEach(row => { muteByEmail[row.email] = row.mute_level; });

  const notifiableEmails = recipientEmails.filter(email => muteByEmail[email] !== 'mute_all');
  if (notifiableEmails.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const { data: subscriptions } = await admin
    .from('push_subscriptions')
    .select('*')
    .in('email', notifiableEmails);

  if (!subscriptions || subscriptions.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const title = channel ? (channel.type === 'main' ? 'General' : channel.name) : 'INKORA Chat';
  const senderName = message.sender_email ? emailHandle(message.sender_email) : 'Sistema';
  const notificationBody = `${senderName}: ${previewTextFor(message)}`;
  const url = `/admin?tab=notifications&canal=${message.channel_id}`;

  const staleEndpoints = [];
  let sent = 0;

  await Promise.all(subscriptions.map(async (sub) => {
    const silent = muteByEmail[sub.email] === 'mute_sound';
    const payload = JSON.stringify({ title, body: notificationBody, url, silent, tag: `chat-${message.channel_id}` });
    const pushSubscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };

    try {
      await webpush.sendNotification(pushSubscription, payload);
      sent += 1;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        staleEndpoints.push(sub.endpoint);
      }
    }
  }));

  if (staleEndpoints.length > 0) {
    await admin.from('push_subscriptions').delete().in('endpoint', staleEndpoints);
  }

  return NextResponse.json({ ok: true, sent });
}

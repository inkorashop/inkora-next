'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import SafeImage from '@/components/SafeImage';
import ChatReferencePicker from '@/components/chat/ChatReferencePicker';
import ChatNewChannelModal from '@/components/chat/ChatNewChannelModal';
import {
  CHAT_IMAGE_MAX_BYTES,
  CHAT_IMAGE_EXPIRY_DAYS,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_COLOR,
  buildMemberDirectory,
  displayNameForEmail,
  emailHandle,
  canEditOrDelete,
  parseMentions,
  splitBodyWithMentions,
  referenceLabel,
  resolveOrderSummary,
  resolveDesignSummary,
  formatChatTime,
  formatChatDateSeparator,
  isSameDay,
} from '@/lib/chat-helpers';

const LAST_CHANNEL_KEY = 'inkora_chat_last_channel';

const SLASH_COMMANDS = [
  { cmd: 'pedido', type: 'order', label: 'Pedido', hint: 'Referenciar un pedido' },
  { cmd: 'produccion', type: 'production', label: 'Producción', hint: 'Referenciar producción' },
  { cmd: 'diseno', type: 'design', label: 'Diseño', hint: 'Referenciar un diseño' },
];

const DIACRITICS_RANGE_START = String.fromCharCode(0x0300);
const DIACRITICS_RANGE_END = String.fromCharCode(0x036f);
const DIACRITICS_REGEX = new RegExp(`[${DIACRITICS_RANGE_START}-${DIACRITICS_RANGE_END}]`, 'g');

function normalizeAccents(str) {
  return String(str || '').toLowerCase().normalize('NFD').replace(DIACRITICS_REGEX, '');
}

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < breakpoint : false);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [breakpoint]);
  return isMobile;
}

function ReferenceCard({ reference, orders, designs, isOwn, onClick, style }) {
  const cardStyle = {
    border: `1px solid ${isOwn ? 'rgba(255,255,255,0.5)' : '#dde1ef'}`,
    background: isOwn ? 'rgba(255,255,255,0.14)' : 'white',
    color: isOwn ? 'white' : '#2d3352',
    borderRadius: 8,
    padding: '7px 9px',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
    display: 'block',
    ...style,
  };
  const linkColor = isOwn ? 'inherit' : '#2D6BE4';

  if (reference.type === 'design') {
    const summary = resolveDesignSummary(reference, designs);
    return (
      <button onClick={onClick} style={{ ...cardStyle, display: 'flex', gap: 8, alignItems: 'center' }}>
        {summary.imageUrl ? (
          <SafeImage src={summary.imageUrl} alt="" style={{ width: 38, height: 38, borderRadius: 6, objectFit: 'contain', background: '#f0f2f8', flexShrink: 0 }} />
        ) : (
          <div style={{ width: 38, height: 38, borderRadius: 6, background: '#f0f2f8', flexShrink: 0 }} />
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary.name}</div>
          <div style={{ fontSize: 10.5, opacity: 0.75 }}>{summary.productName || 'Diseño'}</div>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: linkColor, marginTop: 1 }}>Ver diseño →</div>
        </div>
      </button>
    );
  }

  const summary = resolveOrderSummary(reference, orders);
  const statusColor = ORDER_STATUS_COLOR[summary.status] || '#9aa3bc';
  const statusLabel = ORDER_STATUS_LABEL[summary.status] || summary.status || '';
  return (
    <button onClick={onClick} style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 900 }}>{summary.orderCode}</span>
        {statusLabel && <span style={{ fontSize: 9, fontWeight: 900, color: 'white', background: statusColor, borderRadius: 999, padding: '2px 7px', flexShrink: 0 }}>{statusLabel}</span>}
      </div>
      {summary.customerName && <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>{summary.customerName}</div>}
      {(summary.itemsCount > 0 || summary.total > 0) && (
        <div style={{ fontSize: 10.5, opacity: 0.7, marginTop: 2 }}>
          {summary.itemsCount > 0 && `${summary.itemsCount} ítem${summary.itemsCount !== 1 ? 's' : ''}`}
          {summary.itemsCount > 0 && summary.total > 0 && ' · '}
          {summary.total > 0 && `$${summary.total.toLocaleString('es-AR')}`}
        </div>
      )}
      <div style={{ fontSize: 10.5, fontWeight: 800, color: linkColor, marginTop: 3 }}>
        {reference.type === 'production' ? 'Ver producción →' : 'Ver pedido →'}
      </div>
    </button>
  );
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readLastReadMap() {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem('inkora_chat_last_read') || '{}'); } catch { return {}; }
}

function readLastChannelId() {
  if (typeof window === 'undefined') return null;
  try { return localStorage.getItem(LAST_CHANNEL_KEY) || null; } catch { return null; }
}

function persistLastChannelId(channelId) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(LAST_CHANNEL_KEY, channelId); } catch {}
}

export default function ChatPanel({
  supabase,
  currentUser,
  isOwner,
  admins = [],
  operators = [],
  orders = [],
  designs = [],
  adminDarkMode = false,
  activeChannelId: controlledChannelId,
  onChangeActiveChannel,
  onNavigateToOrder,
  onNavigateToProduction,
  onNavigateToDesign,
}) {
  const isMobile = useIsMobile();
  const directory = useMemo(() => buildMemberDirectory(admins, operators), [admins, operators]);

  const [channels, setChannels] = useState([]);
  const [channelMembers, setChannelMembers] = useState({});
  const [muteSettings, setMuteSettings] = useState({});
  const [muteMenuChannelId, setMuteMenuChannelId] = useState(null);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [internalChannelId, setInternalChannelId] = useState(null);
  const activeChannelId = controlledChannelId ?? internalChannelId;
  function setActiveChannel(id) {
    setInternalChannelId(id);
    onChangeActiveChannel?.(id);
  }
  const [mobileShowConversation, setMobileShowConversation] = useState(false);
  const [messagesByChannel, setMessagesByChannel] = useState({});
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [lastReadAt, setLastReadAt] = useState(readLastReadMap);

  const [composerText, setComposerText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [pendingReference, setPendingReference] = useState(null);
  const [pendingImage, setPendingImage] = useState(null);
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [openMenuId, setOpenMenuId] = useState(null);

  const [mentionQuery, setMentionQuery] = useState(null);
  const [slashQuery, setSlashQuery] = useState(null);
  const [referencePickerType, setReferencePickerType] = useState(null);
  const [showNewChannelModal, setShowNewChannelModal] = useState(false);
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);

  const textareaRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  async function loadChannels() {
    setLoadingChannels(true);
    const { data: memberRows } = await supabase.from('chat_channel_members').select('channel_id').eq('email', currentUser);
    const channelIds = [...new Set((memberRows || []).map(r => r.channel_id))];

    if (channelIds.length === 0) {
      setChannels([]);
      setChannelMembers({});
      setLoadingChannels(false);
      return;
    }

    const [{ data: channelRows }, { data: allMemberRows }, { data: lastMessages }, { data: muteRows }] = await Promise.all([
      supabase.from('chat_channels').select('*').in('id', channelIds),
      supabase.from('chat_channel_members').select('channel_id, email').in('channel_id', channelIds),
      supabase.from('chat_messages').select('channel_id, body, sender_email, created_at, reference, deleted_at, image_url')
        .in('channel_id', channelIds).order('created_at', { ascending: false }).limit(500),
      supabase.from('chat_channel_member_settings').select('channel_id, mute_level').eq('email', currentUser).in('channel_id', channelIds),
    ]);

    const membersByChannel = {};
    (allMemberRows || []).forEach(r => { (membersByChannel[r.channel_id] ||= []).push(r.email); });
    setChannelMembers(membersByChannel);

    const muteByChannel = {};
    (muteRows || []).forEach(r => { muteByChannel[r.channel_id] = r.mute_level; });
    setMuteSettings(muteByChannel);

    const lastByChannel = {};
    (lastMessages || []).forEach(m => { if (!lastByChannel[m.channel_id]) lastByChannel[m.channel_id] = m; });

    const withMeta = (channelRows || []).map(c => ({ ...c, lastMessage: lastByChannel[c.id] || null }));
    withMeta.sort((a, b) => new Date(b.lastMessage?.created_at || b.created_at) - new Date(a.lastMessage?.created_at || a.created_at));
    setChannels(withMeta);
    setLoadingChannels(false);
  }

  async function loadMessages(channelId) {
    setLoadingMessages(true);
    const { data } = await supabase.from('chat_messages').select('*').eq('channel_id', channelId).order('created_at', { ascending: true }).limit(300);
    setMessagesByChannel(prev => ({ ...prev, [channelId]: data || [] }));
    setLoadingMessages(false);
  }

  useEffect(() => {
    if (!currentUser) return;
    loadChannels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const channel = supabase
      .channel('chat-messages-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, (payload) => {
        const row = payload.new || payload.old;
        if (!row) return;
        setMessagesByChannel(prev => {
          const list = prev[row.channel_id];
          if (!list) return prev; // canal no cargado todavia, se carga entero al abrirlo
          if (payload.eventType === 'INSERT') {
            if (list.some(m => m.id === row.id)) return prev;
            return { ...prev, [row.channel_id]: [...list, row].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)) };
          }
          if (payload.eventType === 'UPDATE') {
            return { ...prev, [row.channel_id]: list.map(m => (m.id === row.id ? row : m)) };
          }
          return prev;
        });
        loadChannels();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_channel_members' }, () => loadChannels())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_channels' }, () => loadChannels())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_channel_member_settings' }, () => loadChannels())
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const activeMessageCount = (messagesByChannel[activeChannelId] || []).length;
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [activeChannelId, activeMessageCount]);

  function markRead(channelId) {
    const next = { ...lastReadAt, [channelId]: new Date().toISOString() };
    setLastReadAt(next);
    try { localStorage.setItem('inkora_chat_last_read', JSON.stringify(next)); } catch {}
  }

  // Elige el canal a mostrar apenas cargan los canales: el de la URL si vino
  // uno (?canal=); si no, en mobile siempre "General" (entrar al chat en el
  // celular tiene que arrancar ahi siempre, no en el ultimo canal visitado);
  // en desktop, el ultimo canal que el usuario dejo abierto, si no "General".
  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (autoSelectedRef.current || channels.length === 0) return;
    autoSelectedRef.current = true;
    if (controlledChannelId && channels.some(c => c.id === controlledChannelId)) return;
    const lastId = isMobile ? null : readLastChannelId();
    const fallback = (lastId && channels.find(c => c.id === lastId)) || channels.find(c => c.type === 'main') || channels[0];
    if (fallback) setActiveChannel(fallback.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels]);

  // Cualquier cambio del canal activo (click, URL, auto-seleccion) dispara
  // carga de mensajes + marcar leido + recordar para la proxima visita.
  useEffect(() => {
    if (!activeChannelId) return;
    if (!messagesByChannel[activeChannelId]) loadMessages(activeChannelId);
    markRead(activeChannelId);
    persistLastChannelId(activeChannelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannelId]);

  // Esc "suelta" el estado contextual mas reciente: menu > autocompletado > editar > responder > referencia > imagen.
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key !== 'Escape') return;
      if (lightboxImage) { setLightboxImage(null); return; }
      if (muteMenuChannelId) { setMuteMenuChannelId(null); return; }
      if (openMenuId) { setOpenMenuId(null); return; }
      if (mentionQuery) { setMentionQuery(null); return; }
      if (slashQuery) { setSlashQuery(null); return; }
      if (editingId) { setEditingId(null); setEditingText(''); return; }
      if (replyTo) { setReplyTo(null); return; }
      if (pendingReference) { setPendingReference(null); return; }
      if (pendingImage) { setPendingImage(null); return; }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [lightboxImage, muteMenuChannelId, openMenuId, mentionQuery, slashQuery, editingId, replyTo, pendingReference, pendingImage]);

  function openChannel(channel) {
    setActiveChannel(channel.id);
    setMobileShowConversation(true);
  }

  function hasUnread(channel) {
    if (!channel.lastMessage || channel.lastMessage.sender_email === currentUser) return false;
    const read = lastReadAt[channel.id];
    return !read || new Date(channel.lastMessage.created_at) > new Date(read);
  }

  async function setChannelMute(channelId, level) {
    setMuteSettings(prev => ({ ...prev, [channelId]: level }));
    setMuteMenuChannelId(null);
    await supabase.from('chat_channel_member_settings').upsert(
      { channel_id: channelId, email: currentUser, mute_level: level, updated_at: new Date().toISOString() },
      { onConflict: 'channel_id,email' }
    );
  }

  async function createChannel(name, memberEmails) {
    setCreatingChannel(true);
    try {
      const { data: created, error } = await supabase.from('chat_channels').insert({ name, type: 'group', created_by: currentUser }).select().single();
      if (error) throw error;
      const emails = [...new Set([...memberEmails, currentUser])];
      await supabase.from('chat_channel_members').insert(emails.map(email => ({ channel_id: created.id, email, added_by: currentUser })));
      setShowNewChannelModal(false);
      await loadChannels();
      openChannel(created);
    } catch (err) {
      alert('No se pudo crear el canal: ' + (err.message || err));
    } finally {
      setCreatingChannel(false);
    }
  }

  function handleComposerChange(e) {
    const value = e.target.value;
    const cursor = e.target.selectionStart ?? value.length;
    setComposerText(value);
    const upToCursor = value.slice(0, cursor);
    const wordMatch = upToCursor.match(/(^|\s)([@/][a-zA-Z0-9._-]*)$/);
    if (wordMatch) {
      const token = wordMatch[2];
      if (token.startsWith('@')) {
        setSlashQuery(null);
        setMentionQuery({ query: token.slice(1).toLowerCase(), start: cursor - token.length, end: cursor });
      } else {
        setMentionQuery(null);
        setSlashQuery({ query: normalizeAccents(token.slice(1)), start: cursor - token.length, end: cursor });
      }
    } else {
      setMentionQuery(null);
      setSlashQuery(null);
    }
  }

  function insertMention(email) {
    if (!mentionQuery) return;
    const handle = emailHandle(email);
    const before = composerText.slice(0, mentionQuery.start);
    const after = composerText.slice(mentionQuery.end);
    setComposerText(`${before}@${handle} ${after}`);
    setMentionQuery(null);
    textareaRef.current?.focus();
  }

  function pickSlashCommand(command) {
    const before = composerText.slice(0, slashQuery.start);
    const after = composerText.slice(slashQuery.end);
    setComposerText(`${before}${after}`);
    setSlashQuery(null);
    setReferencePickerType(command.type);
  }

  function handleReferenceSelected(reference) {
    setPendingReference(reference);
    setReferencePickerType(null);
    textareaRef.current?.focus();
  }

  function validateAndSetImage(file) {
    if (!file) return;
    if (file.size > CHAT_IMAGE_MAX_BYTES) {
      alert('La imagen supera 5MB. Elegí una más liviana.');
      return;
    }
    setPendingImage(file);
  }

  function handlePaste(e) {
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type?.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) validateAndSetImage(file);
        return;
      }
    }
  }

  async function sendMessage() {
    if (!activeChannelId || sending) return;
    const trimmed = composerText.trim();
    if (!trimmed && !pendingReference && !pendingImage) return;

    setSending(true);
    try {
      let imageUrl = null;
      let imageExpiresAt = null;
      if (pendingImage) {
        const base64 = await fileToBase64(pendingImage);
        const res = await fetch('/api/upload-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileBase64: base64, fileName: pendingImage.name || 'chat.png', mimeType: pendingImage.type || 'image/png', folder: 'chat' }),
        });
        const data = await res.json();
        if (data.url) {
          imageUrl = data.url;
          imageExpiresAt = new Date(Date.now() + CHAT_IMAGE_EXPIRY_DAYS * 24 * 3600 * 1000).toISOString();
        } else {
          throw new Error(data.error || 'No se pudo subir la imagen');
        }
      }

      const memberEmails = channelMembers[activeChannelId] || [];
      const mentionEmails = parseMentions(trimmed, memberEmails, directory);

      const { data: inserted, error } = await supabase
        .from('chat_messages')
        .insert({
          channel_id: activeChannelId,
          sender_email: currentUser,
          body: trimmed || null,
          reply_to_id: replyTo?.id || null,
          reference: pendingReference || null,
          image_url: imageUrl,
          image_expires_at: imageExpiresAt,
        })
        .select()
        .single();
      if (error) throw error;

      if (mentionEmails.length > 0) {
        await supabase.from('chat_message_mentions').insert(mentionEmails.map(email => ({ message_id: inserted.id, mentioned_email: email })));
      }

      setMessagesByChannel(prev => ({ ...prev, [activeChannelId]: [...(prev[activeChannelId] || []), inserted] }));
      setComposerText('');
      setReplyTo(null);
      setPendingReference(null);
      setPendingImage(null);
      loadChannels();
    } catch (err) {
      alert('No se pudo enviar el mensaje: ' + (err.message || err));
    } finally {
      setSending(false);
    }
  }

  async function saveEdit(message) {
    const trimmed = editingText.trim();
    if (!trimmed) return;
    const { error } = await supabase.from('chat_messages').update({ body: trimmed, edited_at: new Date().toISOString() }).eq('id', message.id);
    if (!error) {
      setMessagesByChannel(prev => ({
        ...prev,
        [message.channel_id]: (prev[message.channel_id] || []).map(m => (m.id === message.id ? { ...m, body: trimmed, edited_at: new Date().toISOString() } : m)),
      }));
    }
    setEditingId(null);
    setEditingText('');
  }

  async function deleteMessage(message) {
    const { error } = await supabase.from('chat_messages').update({ body: null, image_url: null, deleted_at: new Date().toISOString() }).eq('id', message.id);
    if (!error) {
      setMessagesByChannel(prev => ({
        ...prev,
        [message.channel_id]: (prev[message.channel_id] || []).map(m => (m.id === message.id ? { ...m, body: null, image_url: null, deleted_at: new Date().toISOString() } : m)),
      }));
    }
    setOpenMenuId(null);
  }

  function scrollToMessage(id) {
    document.getElementById(`chat-msg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function handleReferenceClick(reference) {
    if (!reference) return;
    if (reference.type === 'order') {
      const order = orders.find(o => o.id === reference.id);
      onNavigateToOrder?.(order || { id: reference.id });
    } else if (reference.type === 'production') {
      const order = orders.find(o => o.id === reference.id);
      onNavigateToProduction?.(order || { id: reference.id });
    } else if (reference.type === 'design') {
      const design = designs.find(d => d.id === reference.id);
      if (design) onNavigateToDesign?.(design);
    }
  }

  const activeChannel = channels.find(c => c.id === activeChannelId) || null;
  const activeMembers = channelMembers[activeChannelId] || [];
  const activeMessages = messagesByChannel[activeChannelId] || [];
  const messageIndex = useMemo(() => {
    const map = new Map();
    Object.values(messagesByChannel).forEach(list => list.forEach(m => map.set(m.id, m)));
    return map;
  }, [messagesByChannel]);

  const mentionMatches = mentionQuery
    ? activeMembers.filter(email => emailHandle(email).includes(mentionQuery.query) && email !== currentUser).slice(0, 6)
    : [];
  const slashMatches = slashQuery ? SLASH_COMMANDS.filter(c => normalizeAccents(c.cmd).startsWith(slashQuery.query)) : [];

  const showChannelList = !isMobile || !mobileShowConversation;
  const showConversation = !isMobile || mobileShowConversation;

  return (
    <div style={{ display: 'flex', height: 'min(78vh, 760px)', minHeight: 460, border: '1px solid #eef0f6', borderRadius: 12, overflow: 'hidden', background: adminDarkMode ? '#141b2c' : 'white' }}>
      {showChannelList && (
        <div style={{ width: isMobile ? '100%' : 300, minWidth: isMobile ? undefined : 300, borderRight: isMobile ? 'none' : '1px solid #eef0f6', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #eef0f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <strong style={{ fontSize: 15, color: adminDarkMode ? '#e7ecf8' : '#1B2F5E' }}>Chat</strong>
            {isOwner && (
              <button
                onClick={() => setShowNewChannelModal(true)}
                title="Nuevo canal"
                style={{ border: '1px solid #dde1ef', background: '#f8faff', color: '#2D6BE4', borderRadius: 8, width: 28, height: 28, fontSize: 16, fontWeight: 900, cursor: 'pointer', lineHeight: 1 }}
              >
                +
              </button>
            )}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loadingChannels && <div style={{ padding: 16, fontSize: 12, color: '#9aa3bc' }}>Cargando canales...</div>}
            {!loadingChannels && channels.length === 0 && <div style={{ padding: 16, fontSize: 12, color: '#9aa3bc' }}>Todavía no tenés canales.</div>}
            {channels.map(channel => {
              const unread = hasUnread(channel);
              const preview = channel.lastMessage;
              const previewText = preview?.deleted_at
                ? 'Se eliminó este mensaje'
                : preview?.body
                  ? preview.body
                  : preview?.image_url
                    ? '📷 Imagen'
                    : preview?.reference
                      ? `🔗 ${referenceLabel(preview.reference)}`
                      : 'Sin mensajes todavía';
              const muteLevel = muteSettings[channel.id] || 'none';
              return (
                <div key={channel.id} style={{ position: 'relative', borderBottom: '1px solid #f4f6fb' }}>
                  <button
                    onClick={() => openChannel(channel)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', border: 'none',
                      background: activeChannelId === channel.id ? (adminDarkMode ? 'rgba(45,107,228,0.16)' : '#f0f5ff') : 'transparent',
                      padding: '10px 34px 10px 14px', cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: adminDarkMode ? '#e7ecf8' : '#2d3352' }}>
                        {channel.type === 'main' ? '# ' : ''}{channel.name}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {preview?.created_at && <span style={{ fontSize: 10, color: '#9aa3bc' }}>{formatChatTime(preview.created_at)}</span>}
                        {unread && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2D6BE4', display: 'inline-block' }} />}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: '#9aa3bc', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {preview?.sender_email ? `${displayNameForEmail(directory, preview.sender_email)}: ` : ''}{previewText}
                    </div>
                  </button>

                  <button
                    onClick={(e) => { e.stopPropagation(); setMuteMenuChannelId(prev => (prev === channel.id ? null : channel.id)); }}
                    title="Notificaciones de este canal"
                    style={{ position: 'absolute', top: 10, right: 8, border: 'none', background: 'none', cursor: 'pointer', color: muteLevel === 'none' ? '#c4c9d9' : '#9aa3bc', fontSize: 13, padding: 4, lineHeight: 1 }}
                  >
                    {muteLevel === 'mute_all' ? '🔕' : muteLevel === 'mute_sound' ? '🔈' : '🔔'}
                  </button>

                  {muteMenuChannelId === channel.id && (
                    <div style={{ position: 'absolute', top: 32, right: 8, background: 'white', border: '1px solid #dde1ef', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.15)', zIndex: 6, minWidth: 170 }}>
                      <button onClick={() => setChannelMute(channel.id, 'none')} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: muteLevel === 'none' ? '#f0f5ff' : 'none', padding: '8px 10px', fontSize: 12, cursor: 'pointer', color: '#2d3352' }}>🔔 Notificar normal</button>
                      <button onClick={() => setChannelMute(channel.id, 'mute_sound')} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: muteLevel === 'mute_sound' ? '#f0f5ff' : 'none', padding: '8px 10px', fontSize: 12, cursor: 'pointer', color: '#2d3352' }}>🔈 Sin sonido</button>
                      <button onClick={() => setChannelMute(channel.id, 'mute_all')} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: muteLevel === 'mute_all' ? '#f0f5ff' : 'none', padding: '8px 10px', fontSize: 12, cursor: 'pointer', color: '#2d3352' }}>🔕 No notificar</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showConversation && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {!activeChannel && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9aa3bc', fontSize: 13 }}>
              Seleccioná un canal para empezar.
            </div>
          )}
          {activeChannel && (
            <>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #eef0f6', display: 'flex', alignItems: 'center', gap: 10 }}>
                {isMobile && (
                  <button onClick={() => setMobileShowConversation(false)} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: adminDarkMode ? '#e7ecf8' : '#1B2F5E' }}>←</button>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: adminDarkMode ? '#e7ecf8' : '#1B2F5E' }}>
                    {activeChannel.type === 'main' ? '# ' : ''}{activeChannel.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#9aa3bc' }}>{activeMembers.length} miembro{activeMembers.length !== 1 ? 's' : ''}</div>
                </div>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {loadingMessages && <div style={{ fontSize: 12, color: '#9aa3bc', textAlign: 'center', padding: 12 }}>Cargando mensajes...</div>}
                {activeMessages.map((message, idx) => {
                  const prev = activeMessages[idx - 1];
                  const showDateSeparator = !prev || !isSameDay(prev.created_at, message.created_at);
                  const isSystem = !message.sender_email;
                  const isOwn = message.sender_email === currentUser;
                  const groupedWithPrev = prev && prev.sender_email === message.sender_email && !showDateSeparator && (new Date(message.created_at) - new Date(prev.created_at)) < 5 * 60 * 1000;
                  const quoted = message.reply_to_id ? messageIndex.get(message.reply_to_id) : null;
                  const canEdit = canEditOrDelete(message, currentUser, isOwner);
                  const bodyParts = message.body ? splitBodyWithMentions(message.body, activeMembers, directory) : [];

                  return (
                    <div key={message.id} id={`chat-msg-${message.id}`} style={{ scrollMarginTop: 60 }}>
                      {showDateSeparator && (
                        <div style={{ textAlign: 'center', margin: '10px 0' }}>
                          <span style={{ fontSize: 10, fontWeight: 800, color: '#9aa3bc', background: adminDarkMode ? 'rgba(255,255,255,0.06)' : '#f0f2f8', borderRadius: 999, padding: '3px 10px' }}>
                            {formatChatDateSeparator(message.created_at)}
                          </span>
                        </div>
                      )}

                      {isSystem ? (
                        <div style={{ textAlign: 'center', margin: '6px 0' }}>
                          <button
                            onClick={() => message.reference && handleReferenceClick(message.reference)}
                            style={{
                              fontSize: 11, fontWeight: 700, color: '#5a6380', background: adminDarkMode ? 'rgba(255,255,255,0.06)' : '#f4f6fb',
                              border: 'none', borderRadius: 10, padding: '6px 12px', cursor: message.reference ? 'pointer' : 'default', maxWidth: '80%',
                            }}
                          >
                            {message.body}
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start', marginTop: groupedWithPrev ? 1 : 8 }}>
                          <div
                            style={{ maxWidth: '75%', position: 'relative' }}
                            onMouseEnter={() => setOpenMenuId(prevId => prevId)}
                          >
                            {!groupedWithPrev && !isOwn && (
                              <div style={{ fontSize: 11, fontWeight: 800, color: '#2D6BE4', marginBottom: 2 }}>{displayNameForEmail(directory, message.sender_email)}</div>
                            )}
                            <div
                              style={{
                                background: message.deleted_at ? (adminDarkMode ? 'rgba(255,255,255,0.04)' : '#f4f6fb') : isOwn ? '#2D6BE4' : (adminDarkMode ? 'rgba(255,255,255,0.08)' : '#f0f2f8'),
                                color: message.deleted_at ? '#9aa3bc' : isOwn ? 'white' : (adminDarkMode ? '#e7ecf8' : '#2d3352'),
                                borderRadius: 12,
                                padding: '7px 10px',
                                fontSize: 13,
                                lineHeight: 1.4,
                                fontStyle: message.deleted_at ? 'italic' : 'normal',
                                wordBreak: 'break-word',
                              }}
                            >
                              {quoted && !message.deleted_at && (
                                <button
                                  onClick={() => scrollToMessage(quoted.id)}
                                  style={{
                                    display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                                    borderLeft: `3px solid ${isOwn ? 'rgba(255,255,255,0.6)' : '#2D6BE4'}`,
                                    background: isOwn ? 'rgba(255,255,255,0.15)' : 'rgba(45,107,228,0.08)',
                                    borderRadius: 6, padding: '4px 8px', marginBottom: 5, fontSize: 11,
                                    color: isOwn ? 'rgba(255,255,255,0.9)' : '#5a6380',
                                  }}
                                >
                                  <strong>{quoted.sender_email ? displayNameForEmail(directory, quoted.sender_email) : 'Sistema'}</strong>: {quoted.deleted_at ? 'Se eliminó este mensaje' : (quoted.body || (quoted.image_url ? '📷 Imagen' : ''))}
                                </button>
                              )}

                              {message.deleted_at ? (
                                <span>Se eliminó este mensaje</span>
                              ) : (
                                <>
                                  {message.reference && (
                                    <ReferenceCard
                                      reference={message.reference}
                                      orders={orders}
                                      designs={designs}
                                      isOwn={isOwn}
                                      onClick={() => handleReferenceClick(message.reference)}
                                      style={{ marginBottom: message.body ? 5 : 0 }}
                                    />
                                  )}
                                  {message.image_url && (
                                    <button onClick={() => setLightboxImage(message.image_url)} style={{ border: 'none', padding: 0, background: 'transparent', cursor: 'zoom-in', display: 'block', marginBottom: message.body ? 5 : 0 }}>
                                      <SafeImage src={message.image_url} alt="" style={{ maxWidth: 220, maxHeight: 220, borderRadius: 8, objectFit: 'cover', display: 'block' }} />
                                    </button>
                                  )}
                                  {editingId === message.id ? (
                                    <div>
                                      <textarea
                                        value={editingText}
                                        onChange={e => setEditingText(e.target.value)}
                                        style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #dde1ef', borderRadius: 6, padding: 6, fontSize: 13, fontFamily: 'Barlow, sans-serif', color: '#2d3352' }}
                                        rows={2}
                                      />
                                      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                                        <button onClick={() => saveEdit(message)} style={{ fontSize: 11, fontWeight: 800, border: 'none', background: '#18a36a', color: 'white', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>Guardar</button>
                                        <button onClick={() => { setEditingId(null); setEditingText(''); }} style={{ fontSize: 11, fontWeight: 800, border: '1px solid #dde1ef', background: 'white', color: '#5a6380', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>Cancelar</button>
                                      </div>
                                    </div>
                                  ) : (
                                    bodyParts.map((part, i) => part.type === 'mention'
                                      ? <span key={i} style={{ fontWeight: 800, color: isOwn ? 'white' : '#2D6BE4', textDecoration: 'underline' }}>@{part.value}</span>
                                      : <span key={i}>{part.value}</span>)
                                  )}
                                </>
                              )}

                              <div style={{ fontSize: 10, color: isOwn ? 'rgba(255,255,255,0.75)' : '#9aa3bc', marginTop: 3, textAlign: 'right' }}>
                                {message.edited_at && !message.deleted_at && 'Editado · '}{formatChatTime(message.created_at)}
                              </div>
                            </div>

                            {!message.deleted_at && (
                              <div style={{ position: 'absolute', top: -8, [isOwn ? 'left' : 'right']: -8 }}>
                                <button
                                  onClick={() => setOpenMenuId(prev => (prev === message.id ? null : message.id))}
                                  style={{ border: '1px solid #dde1ef', background: 'white', borderRadius: '50%', width: 20, height: 20, fontSize: 12, color: '#9aa3bc', cursor: 'pointer', lineHeight: 1 }}
                                >
                                  ⋯
                                </button>
                                {openMenuId === message.id && (
                                  <div style={{ position: 'absolute', top: 22, [isOwn ? 'left' : 'right']: 0, background: 'white', border: '1px solid #dde1ef', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.15)', zIndex: 5, minWidth: 110 }}>
                                    <button onClick={() => { setReplyTo(message); setOpenMenuId(null); textareaRef.current?.focus(); }} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: '7px 10px', fontSize: 12, cursor: 'pointer', color: '#2d3352' }}>Responder</button>
                                    {canEdit && (
                                      <button onClick={() => { setEditingId(message.id); setEditingText(message.body || ''); setOpenMenuId(null); }} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: '7px 10px', fontSize: 12, cursor: 'pointer', color: '#2d3352' }}>Editar</button>
                                    )}
                                    {canEdit && (
                                      <button onClick={() => deleteMessage(message)} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: '7px 10px', fontSize: 12, cursor: 'pointer', color: '#b91c1c' }}>Eliminar</button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <div style={{ borderTop: '1px solid #eef0f6', padding: 10, position: 'relative' }}>
                {mentionMatches.length > 0 && (
                  <div style={{ position: 'absolute', bottom: '100%', left: 10, right: 10, background: 'white', border: '1px solid #dde1ef', borderRadius: 8, boxShadow: '0 -4px 16px rgba(0,0,0,0.1)', marginBottom: 4, maxHeight: 160, overflowY: 'auto' }}>
                    {mentionMatches.map(email => (
                      <button key={email} onClick={() => insertMention(email)} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: '7px 10px', fontSize: 12, cursor: 'pointer', color: '#2d3352' }}>
                        @{emailHandle(email)} <span style={{ color: '#9aa3bc' }}>{displayNameForEmail(directory, email)}</span>
                      </button>
                    ))}
                  </div>
                )}
                {slashMatches.length > 0 && (
                  <div style={{ position: 'absolute', bottom: '100%', left: 10, right: 10, background: 'white', border: '1px solid #dde1ef', borderRadius: 8, boxShadow: '0 -4px 16px rgba(0,0,0,0.1)', marginBottom: 4 }}>
                    {slashMatches.map(command => (
                      <button key={command.cmd} onClick={() => pickSlashCommand(command)} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: '7px 10px', fontSize: 12, cursor: 'pointer', color: '#2d3352' }}>
                        /{command.cmd} <span style={{ color: '#9aa3bc' }}>· {command.hint}</span>
                      </button>
                    ))}
                  </div>
                )}

                {replyTo && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f4f6fb', borderRadius: 8, padding: '5px 8px', marginBottom: 6, fontSize: 11 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Respondiendo a <strong>{replyTo.sender_email ? displayNameForEmail(directory, replyTo.sender_email) : 'Sistema'}</strong>: {replyTo.body || (replyTo.image_url ? '📷 Imagen' : '')}
                    </span>
                    <button onClick={() => setReplyTo(null)} style={{ border: 'none', background: 'none', color: '#9aa3bc', cursor: 'pointer', fontSize: 14 }}>×</button>
                  </div>
                )}
                {pendingReference && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
                    <div style={{ flex: 1 }}>
                      <ReferenceCard reference={pendingReference} orders={orders} designs={designs} isOwn={false} onClick={() => {}} />
                    </div>
                    <button onClick={() => setPendingReference(null)} style={{ border: 'none', background: 'none', color: '#9aa3bc', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>×</button>
                  </div>
                )}
                {pendingImage && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f4f6fb', borderRadius: 8, padding: '5px 8px', marginBottom: 6 }}>
                    <img src={URL.createObjectURL(pendingImage)} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6 }} />
                    <span style={{ fontSize: 11, color: '#5a6380', flex: 1 }}>{pendingImage.name}</span>
                    <button onClick={() => setPendingImage(null)} style={{ border: 'none', background: 'none', color: '#9aa3bc', cursor: 'pointer', fontSize: 14 }}>×</button>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={e => { if (e.target.files?.[0]) validateAndSetImage(e.target.files[0]); e.target.value = ''; }}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    title="Adjuntar imagen"
                    style={{ border: '1px solid #dde1ef', background: '#f8faff', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', color: '#5a6380', fontSize: 15, flexShrink: 0 }}
                  >
                    📎
                  </button>
                  <textarea
                    ref={textareaRef}
                    value={composerText}
                    onChange={handleComposerChange}
                    onPaste={handlePaste}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    placeholder="Escribí un mensaje... @mencionar /pedido /produccion /diseno"
                    rows={1}
                    style={{ flex: 1, resize: 'none', border: '1.5px solid #dde1ef', borderRadius: 10, padding: '8px 10px', fontSize: 13, fontFamily: 'Barlow, sans-serif', maxHeight: 90, color: '#2d3352' }}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={sending}
                    style={{ border: 'none', background: '#2D6BE4', color: 'white', borderRadius: 8, width: 34, height: 34, cursor: sending ? 'wait' : 'pointer', fontSize: 15, flexShrink: 0, opacity: sending ? 0.6 : 1 }}
                  >
                    ➤
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {referencePickerType && (
        <ChatReferencePicker
          type={referencePickerType}
          orders={orders}
          designs={designs}
          onSelect={handleReferenceSelected}
          onClose={() => setReferencePickerType(null)}
        />
      )}

      {showNewChannelModal && (
        <ChatNewChannelModal
          directory={directory}
          creating={creatingChannel}
          onCreate={createChannel}
          onClose={() => setShowNewChannelModal(false)}
        />
      )}

      {lightboxImage && (
        <div onClick={() => setLightboxImage(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 440, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <img src={lightboxImage} alt="" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}

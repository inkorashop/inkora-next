// Refresh forzado en vivo (no es modo mantenimiento): un admin dispara un
// broadcast de Supabase Realtime y quien lo tenga abierto en ese momento
// (activo o inactivo, mientras la pestaña siga abierta) recarga al instante.
// No hay tabla de por medio ni persistencia: si nadie esta conectado en el
// momento del envio, simplemente no le llega a nadie (no hay "cola" ni
// reintento) — para eso ya existe el aviso pasivo de version nueva.

export const FORCE_REFRESH_CHANNEL = 'inkora-force-refresh';
export const FORCE_REFRESH_EVENT = 'refresh';

export function broadcastForceRefresh(supabase, { audience, target = 'all' }) {
  return new Promise((resolve, reject) => {
    const channel = supabase.channel(FORCE_REFRESH_CHANNEL);
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        channel
          .send({ type: 'broadcast', event: FORCE_REFRESH_EVENT, payload: { audience, target } })
          .then(() => { supabase.removeChannel(channel); resolve(); })
          .catch(err => { supabase.removeChannel(channel); reject(err); });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        supabase.removeChannel(channel);
        reject(new Error('No se pudo conectar al canal de refresh.'));
      }
    });
  });
}

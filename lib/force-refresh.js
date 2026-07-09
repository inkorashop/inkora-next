// Refresh forzado en vivo (no es modo mantenimiento): un admin dispara un
// broadcast de Supabase Realtime y quien lo tenga abierto en ese momento
// (activo o inactivo, mientras la pestaña siga abierta) recarga al instante.
// No hay tabla de por medio ni persistencia: si nadie esta conectado en el
// momento del envio, simplemente no le llega a nadie (no hay "cola" ni
// reintento) — para eso ya existe el aviso pasivo de version nueva.

export const FORCE_REFRESH_CHANNEL = 'inkora-force-refresh';
export const FORCE_REFRESH_EVENT = 'refresh';

export async function broadcastForceRefresh(supabase, { audience, target = 'all' }) {
  // supabase.channel(topic) reusa el canal existente si ya hay uno con el
  // mismo topic (ver RealtimeClient.channel() en @supabase/realtime-js) — en
  // /admin ese canal ya existe y esta subscrito (el listener de mas abajo),
  // asi que ESTE es normalmente el mismo objeto. Por eso no hay que volver a
  // llamar .subscribe() aca: un canal ya "joined" ignora por completo un
  // segundo subscribe (nunca invoca el callback, ni con SUBSCRIBED ni con
  // error), lo que dejaba esta promesa colgada para siempre — apretar el
  // boton no hacia nada, ni feedback ni error, porque el await nunca volvia.
  // Tampoco hay que hacer removeChannel despues de mandar: al ser el MISMO
  // canal que el listener, eso lo hubiera desconectado del broadcast para
  // el resto de la sesion.
  const channel = supabase.channel(FORCE_REFRESH_CHANNEL);
  const result = await channel.send({ type: 'broadcast', event: FORCE_REFRESH_EVENT, payload: { audience, target } });
  if (result !== 'ok') {
    throw new Error(`No se pudo enviar el refresh (${result}).`);
  }
}

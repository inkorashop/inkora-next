const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:17389';
const TOKEN_STORAGE_KEY = 'inkora_print_bridge_token';
const URL_STORAGE_KEY = 'inkora_print_bridge_url';

function normalizeBridgeUrl(url) {
  const value = String(url || '').trim().replace(/\/+$/, '');
  return value || DEFAULT_BRIDGE_URL;
}

async function bridgeFetch(path, options = {}) {
  const {
    baseUrl = DEFAULT_BRIDGE_URL,
    token = '',
    method = 'GET',
    timeoutMs = 3500,
    body,
  } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {
      Accept: 'application/json',
      ...(options.headers || {}),
    };

    let requestBody = body;
    if (body !== undefined && body !== null && typeof body !== 'string') {
      requestBody = JSON.stringify(body);
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }

    if (token) {
      headers['X-Inkora-Bridge-Token'] = token;
    }

    const response = await fetch(`${normalizeBridgeUrl(baseUrl)}${path}`, {
      method,
      headers,
      body: requestBody,
      signal: controller.signal,
      cache: 'no-store',
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message = payload?.error || `Bridge HTTP ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

export function getStoredBridgeConfig() {
  if (typeof window === 'undefined') {
    return { url: DEFAULT_BRIDGE_URL, token: '' };
  }

  return {
    url: normalizeBridgeUrl(window.localStorage.getItem(URL_STORAGE_KEY)),
    token: window.localStorage.getItem(TOKEN_STORAGE_KEY) || '',
  };
}

export function saveStoredBridgeConfig({ url, token }) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(URL_STORAGE_KEY, normalizeBridgeUrl(url));
  if (token !== undefined) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, String(token || '').trim());
  }
}

export function clearStoredBridgeToken() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export async function getBridgeHealth(baseUrl) {
  return bridgeFetch('/health', { baseUrl, timeoutMs: 2500 });
}

export async function getBridgePrinters(baseUrl, token) {
  return bridgeFetch('/printers', { baseUrl, token, timeoutMs: 5000 });
}

export async function readBridgeDevMode(baseUrl, token, printerName) {
  return bridgeFetch(`/devmode?printer=${encodeURIComponent(printerName || '')}`, {
    baseUrl,
    token,
    timeoutMs: 5000,
  });
}

export async function openBridgePrinterPreferences(baseUrl, token, printerName) {
  return bridgeFetch(`/driver/open-preferences?printer=${encodeURIComponent(printerName || '')}`, {
    baseUrl,
    token,
    method: 'POST',
    timeoutMs: 5000,
  });
}

export async function openBridgePrintQueue(baseUrl, token, printerName) {
  return bridgeFetch(`/print/open-queue?printer=${encodeURIComponent(printerName || '')}`, {
    baseUrl,
    token,
    method: 'POST',
    timeoutMs: 5000,
  });
}

export async function getBridgePdfRoots(baseUrl, token) {
  return bridgeFetch('/pdf-roots', { baseUrl, token, timeoutMs: 5000 });
}

export async function addBridgePdfRoot(baseUrl, token) {
  return bridgeFetch('/pdf-roots/add-dialog', {
    baseUrl,
    token,
    method: 'POST',
    timeoutMs: 120000,
  });
}

export async function scanBridgePdfs(baseUrl, token) {
  return bridgeFetch('/pdf-scan', {
    baseUrl,
    token,
    method: 'POST',
    timeoutMs: 15000,
  });
}

export async function matchBridgeDesignPdfs(baseUrl, token, designs) {
  return bridgeFetch('/design-pdfs/match', {
    baseUrl,
    token,
    method: 'POST',
    timeoutMs: 15000,
    body: { designs: Array.isArray(designs) ? designs : [] },
  });
}

export async function getBridgePdfCatalog(baseUrl, token) {
  return bridgeFetch('/pdf-catalog', { baseUrl, token, timeoutMs: 8000 });
}

export async function printBridgeJob(baseUrl, token, request) {
  return bridgeFetch('/print', {
    baseUrl,
    token,
    method: 'POST',
    timeoutMs: 60000,
    body: request,
  });
}

export async function printBridgeDirect(baseUrl, token, { rootName, relativePath, printerName, copies }) {
  return bridgeFetch('/print-direct', {
    baseUrl,
    token,
    method: 'POST',
    timeoutMs: 60000,
    body: { rootName, relativePath, printerName, copies },
  });
}

export async function getBridgePrintQueue(baseUrl, token) {
  return bridgeFetch('/print/queue', { baseUrl, token, timeoutMs: 5000 });
}

export async function cancelBridgePrintJob(baseUrl, token, jobId) {
  return bridgeFetch(`/print/cancel?id=${encodeURIComponent(jobId || '')}`, {
    baseUrl,
    token,
    method: 'POST',
    timeoutMs: 5000,
  });
}

export async function getDevModeProfiles(baseUrl, token, printerName) {
  return bridgeFetch(`/devmode/profiles?printer=${encodeURIComponent(printerName || '')}`, {
    baseUrl,
    token,
    timeoutMs: 5000,
  });
}

export async function saveDevModeProfile(baseUrl, token, printerName, profileName) {
  return bridgeFetch(
    `/devmode/profiles/save?printer=${encodeURIComponent(printerName || '')}&name=${encodeURIComponent(profileName || '')}`,
    { baseUrl, token, method: 'POST', timeoutMs: 10000 }
  );
}

export async function applyDevModeProfile(baseUrl, token, printerName, profileName) {
  return bridgeFetch(
    `/devmode/profiles/apply?printer=${encodeURIComponent(printerName || '')}&name=${encodeURIComponent(profileName || '')}`,
    { baseUrl, token, method: 'POST', timeoutMs: 10000 }
  );
}

export async function deleteDevModeProfile(baseUrl, token, printerName, profileName) {
  return bridgeFetch(
    `/devmode/profiles/delete?printer=${encodeURIComponent(printerName || '')}&name=${encodeURIComponent(profileName || '')}`,
    { baseUrl, token, method: 'POST', timeoutMs: 5000 }
  );
}

export async function applyBridgeUpdate(baseUrl, token, downloadUrl) {
  return bridgeFetch('/update/apply', {
    baseUrl,
    token,
    method: 'POST',
    timeoutMs: 10000,
    body: { downloadUrl },
  });
}

export { DEFAULT_BRIDGE_URL };

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon' };
const allowed = new Set(['index.html', 'style.css', 'script.js', 'monitor.js']);
const Monitor = require('./monitor');

function createDashboardHandler({ env = process.env, fetchImpl = fetch } = {}) {
  const url = env.SUPABASE_URL || '';
  const key = env.SUPABASE_KEY || '';
  const demo = env.IOT_DEMO_MODE === 'true' || (!url && !key && env.IOT_DEMO_MODE !== 'false');
  const demoEvents = Monitor.combineReadings(Monitor.demoReadings(), Monitor.normalizeActivity(Array.from({ length: 126 }, (_, i) => ({ id: i + 1, data_hora: new Date(Date.now() - (i * 76 + 10) * 60000).toISOString() }))));
  function json(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  }
  return async function dashboard(req, res) {
    const requestUrl = new URL(req.url, 'http://localhost');
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return json(res, 405, { error: 'Método não permitido.' }); }
    const hours = Number(requestUrl.searchParams.get('hours') || 24);
    if (![1, 24, 168].includes(hours)) return json(res, 400, { error: 'Período inválido.' });
    if (demo) return json(res, 200, { mode: 'demo', events: demoEvents, latest: demoEvents[0], device: Monitor.normalizeDeviceStatus({ id: 1, status: 'online', data_hora: new Date().toISOString() }), deviceUnavailable: false, duplicates: 0, undated: 0, limited: false });
    try {
      const projectUrl = new URL(url);
      if (!key || projectUrl.protocol !== 'https:' || !projectUrl.hostname.endsWith('.supabase.co') || projectUrl.username || projectUrl.password || projectUrl.port) throw new Error('Invalid server configuration');
      const headers = { apikey: key };
      if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
      const results = await Promise.allSettled([
        ['eventos', { select: 'id,numero_evento,data_hora', order: 'id.desc', limit: '1000' }],
        ['atividade_sensor', { select: 'id,data_hora', order: 'data_hora.desc.nullslast,id.desc', limit: '1000' }],
        ['status_dispositivo', { select: 'id,data_hora,status', order: 'data_hora.desc.nullslast,id.desc', limit: '1' }]
      ].map(async ([table, query]) => {
        const response = await fetchImpl(`${projectUrl.origin}/rest/v1/${table}?${new URLSearchParams(query)}`, { headers, signal: AbortSignal.timeout(12000), cache: 'no-store' });
        if (!response.ok) throw new Error('Upstream unavailable');
        const rows = await response.json();
        if (!Array.isArray(rows)) throw new Error('Invalid readings');
        return rows;
      }));
      if (results.slice(0, 2).some(result => result.status === 'rejected')) throw new Error('Upstream unavailable');
      let device = null;
      let deviceUnavailable = results[2].status === 'rejected';
      if (!deviceUnavailable) {
        try { device = Monitor.normalizeDeviceStatus(results[2].value[0]); }
        catch { deviceUnavailable = true; }
      }
      const [data, activity] = results.map(result => result.value);
      const normalized = Monitor.normalizeEvents(data);
      const events = Monitor.combineReadings(normalized.events, Monitor.normalizeActivity(activity));
      return json(res, 200, { mode: 'live', ...normalized, events, device, deviceUnavailable, latest: events[0] || null, undated: events.filter(row => !row.recorded_at).length, limited: data.length >= 1000 || activity.length >= 1000 });
    } catch {
      return json(res, 503, { error: 'Não foi possível atualizar o monitoramento. Tentaremos novamente em alguns segundos.' });
    }
  }
}

function createServer({ env = process.env, fetchImpl = fetch } = {}) {
  const dashboard = createDashboardHandler({ env, fetchImpl });
  return http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  if (pathname === '/api/dashboard') { void dashboard(req, res); return; }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) || (!allowed.has(relative) && !/^assets\/[a-zA-Z0-9_.-]+$/.test(relative))) { res.writeHead(404).end('Não encontrado'); return; }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404).end('Não encontrado'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
  });
}
if (require.main === module) {
  if (fs.existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));
  createServer().listen(Number(process.env.PORT) || 3000, process.env.HOST || '127.0.0.1', () => console.log('ESP32 IoT disponível em http://localhost:' + (process.env.PORT || 3000)));
}
module.exports = { createServer, createDashboardHandler };

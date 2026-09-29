const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer, createDashboardHandler } = require('../server');

async function start(t, options) {
  const server = createServer(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}
test('server owns configuration and only exposes sensor data', async t => {
  const env = { SUPABASE_URL: 'https://private-project.supabase.co', SUPABASE_KEY: 'sb_publishable_private_test' };
  const requests = [];
  const row = { id: 1, numero_evento: 17, data_hora: '28/09/2026 12:00:00', private_field: 'do-not-expose' };
  const base = await start(t, { env, fetchImpl: async (url, options) => { requests.push({ url, options }); return Response.json([row]); } });
  const response = await fetch(`${base}/api/dashboard?hours=1&device_id=other&supabaseUrl=https://other.example`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.mode, 'live');
  assert.equal(data.latest.numero_evento, 17);
  assert.equal(data.latest.recorded_at, '2026-09-28T15:00:00.000Z');
  assert.equal(requests.length, 1);
  const request = requests[0];
  assert.equal(new URL(request.url).pathname, '/rest/v1/eventos');
  assert.equal(new URL(request.url).searchParams.get('select'), 'id,numero_evento,data_hora');
  assert.equal(new URL(request.url).searchParams.get('order'), 'id.desc');
  assert.equal(new URL(request.url).searchParams.get('limit'), '1000');
  assert.equal(request.options.headers.apikey, env.SUPABASE_KEY);
  const body = JSON.stringify(data);
  for (const secret of [env.SUPABASE_URL, env.SUPABASE_KEY, 'do-not-expose']) assert.ok(!body.includes(secret));
  for (const file of ['/.env', '/.env.example', '/config.js', '/server.js', '/package.json']) assert.equal((await fetch(base + file)).status, 404);
  assert.equal((await fetch(`${base}/api/dashboard`, { method: 'POST', body: '{}' })).status, 405);
  assert.equal((await fetch(`${base}/api/dashboard?hours=999`)).status, 400);
});
test('server errors never reveal upstream secrets or silently enter demo mode', async t => {
  const base = await start(t, { env: { SUPABASE_URL: 'https://private.supabase.co', SUPABASE_KEY: 'private-key' }, fetchImpl: async () => { throw new Error('private-key private.supabase.co'); } });
  const response = await fetch(`${base}/api/dashboard`);
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes('private'));
});

test('demo is selected on server; a disabled demo with missing configuration fails', async t => {
  const demo = await start(t, { env: {} });
  assert.equal((await (await fetch(`${demo}/api/dashboard`)).json()).mode, 'demo');
  const live = await start(t, { env: { IOT_DEMO_MODE: 'false' } });
  assert.equal((await fetch(`${live}/api/dashboard`)).status, 503);
});

test('dashboard handler supports the Vercel request and response interface', async () => {
  const handler = createDashboardHandler({ env: { IOT_DEMO_MODE: 'true' } });
  const result = await new Promise(resolve => {
    const response = {
      headers: {},
      writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); },
      setHeader(name, value) { this.headers[name] = value; },
      end(body) { resolve({ status: this.status, headers: this.headers, body: JSON.parse(body) }); }
    };
    handler({ method: 'GET', url: '/api/dashboard?hours=24' }, response);
  });
  assert.equal(result.status, 200);
  assert.equal(result.headers['Content-Type'], 'application/json; charset=utf-8');
  assert.equal(result.body.mode, 'demo');
  assert.ok(Array.isArray(result.body.events));
});

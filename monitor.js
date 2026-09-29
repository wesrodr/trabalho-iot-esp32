(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Monitor = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const timeZone = 'Etc/GMT+3'; // The firmware uses a fixed UTC-3 offset.
  function parseDeviceDate(value) {
    const match = typeof value === 'string' && /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(value.trim());
    if (!match) return null;
    const [, d, m, y, h, min, s] = match.map(Number);
    if (y < 1970 || m < 1 || m > 12 || d < 1 || h > 23 || min > 59 || s > 59) return null;
    const local = new Date(Date.UTC(y, m - 1, d, h, min, s));
    if (local.getUTCFullYear() !== y || local.getUTCMonth() !== m - 1 || local.getUTCDate() !== d) return null;
    return new Date(local.getTime() + 3 * 3600000).toISOString();
  }
  const integer = value => (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) || (typeof value === 'string' && /^\d+$/.test(value));
  function validReading(row) {
    return !!row && integer(row.id) && (row.numero_evento === null || integer(row.numero_evento)) && (row.data_hora === null || typeof row.data_hora === 'string') && (row.recorded_at === null || (typeof row.recorded_at === 'string' && Number.isFinite(Date.parse(row.recorded_at))));
  }
  function normalizeEvents(rows) {
    const seen = new Set();
    let duplicates = 0;
    const events = [];
    for (const row of rows) {
      if (!row || !integer(row.id) || (row.numero_evento !== null && !integer(row.numero_evento)) || (row.data_hora !== null && typeof row.data_hora !== 'string')) throw new Error('Invalid eventos row');
      const recorded_at = parseDeviceDate(row.data_hora);
      const key = recorded_at && row.numero_evento !== null ? `${BigInt(row.numero_evento)}|${recorded_at}` : null;
      // The serial S command can resend an event without deleting the local copy.
      // Counter alone is not an ID: the serial R command resets it.
      if (key && seen.has(key)) { duplicates++; continue; }
      if (key) seen.add(key);
      events.push({ id: row.id, numero_evento: row.numero_evento, data_hora: row.data_hora, recorded_at, source: 'eventos' });
    }
    events.sort((a, b) => {
      const dateDiff = (Date.parse(b.recorded_at) || 0) - (Date.parse(a.recorded_at) || 0);
      if (dateDiff) return dateDiff;
      return BigInt(a.id) > BigInt(b.id) ? -1 : BigInt(a.id) < BigInt(b.id) ? 1 : 0;
    });
    return { events, latest: events.find(row => row.recorded_at) || events[0] || null, duplicates, undated: events.filter(row => !row.recorded_at).length };
  }
  function inPeriod(row, hours, now = Date.now()) {
    const time = Date.parse(row.recorded_at);
    return Number.isFinite(time) && time >= now - hours * 3600000 && time <= now;
  }
  function normalizeActivity(rows) {
    return rows.map(row => {
      if (!row || !integer(row.id) || (row.data_hora !== null && (typeof row.data_hora !== 'string' || !Number.isFinite(Date.parse(row.data_hora))))) throw new Error('Invalid atividade_sensor row');
      const recorded_at = row.data_hora === null ? null : new Date(row.data_hora).toISOString();
      return { id: row.id, numero_evento: null, data_hora: recorded_at ? deviceDate(Date.parse(recorded_at)) : null, recorded_at, source: 'atividade_sensor' };
    });
  }
  function combineReadings(events, activity) {
    // IDs belong to different tables and must never be deduplicated across sources.
    return [...events, ...activity].sort((a, b) => (Date.parse(b.recorded_at) || 0) - (Date.parse(a.recorded_at) || 0) || (a.source || 'eventos').localeCompare(b.source || 'eventos') || (BigInt(a.id) > BigInt(b.id) ? -1 : BigInt(a.id) < BigInt(b.id) ? 1 : 0));
  }
  function normalizeDeviceStatus(row) {
    if (!row) return null;
    if (!integer(row.id) || (row.status !== null && typeof row.status !== 'string') || (row.data_hora !== null && (typeof row.data_hora !== 'string' || !Number.isFinite(Date.parse(row.data_hora))))) throw new Error('Invalid status_dispositivo row');
    const value = (row.status || '').trim().toLowerCase();
    const state = value === 'online' ? 'active' : 'unknown';
    return { id: row.id, status: row.status, state, recorded_at: row.data_hora === null ? null : new Date(row.data_hora).toISOString() };
  }
  function deviceHeartbeatState(device, now = Date.now()) {
    if (!device || (device.status || '').trim().toLowerCase() !== 'online' || !device.recorded_at) return 'unknown';
    const time = Date.parse(device.recorded_at);
    if (!Number.isFinite(time) || time > now) return 'unknown';
    return now - time <= 120000 ? 'active' : 'inactive';
  }
  function aggregate(readings, hours, now = Date.now()) {
    const count = hours === 1 ? 12 : hours === 168 ? 7 : 24;
    const step = hours * 3600000 / count;
    const start = now - hours * 3600000;
    const bins = Array.from({ length: count }, (_, index) => ({ start: start + index * step, end: start + (index + 1) * step, count: 0, inactive: 0 }));
    for (const row of readings) {
      if (!validReading(row) || !inPeriod(row, hours, now)) continue;
      bins[Math.min(count - 1, Math.floor((Date.parse(row.recorded_at) - start) / step))][row.source === 'atividade_sensor' ? 'inactive' : 'count']++;
    }
    return bins;
  }
  function dateKey(value) {
    if (!value) return '';
    return new Date(Date.parse(value) - 3 * 3600000).toISOString().slice(0, 10);
  }
  function filterReadings(readings, status = 'all', date = '') {
    return readings.filter(row => (!date || dateKey(row.recorded_at) === date) && (status === 'all' || (status === 'motion' ? row.source !== 'atividade_sensor' : status === 'inactive' ? row.source === 'atividade_sensor' : status === 'dated' ? !!row.recorded_at : !row.recorded_at)));
  }
  function deviceDate(value) {
    const d = new Date(value - 3 * 3600000);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  }
  function demoReadings(now = Date.now()) {
    const rows = [];
    for (let i = 0; i < 126; i++) rows.push({ id: 126 - i, numero_evento: 126 - i, data_hora: deviceDate(now - (i === 0 ? 0 : (i * 76 + i % 7) * 60000)) });
    return normalizeEvents(rows).events;
  }
  function csv(readings) {
    const escape = value => '"' + String(value ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""') + '"';
    return '\uFEFF' + ['ID no banco;Numero do evento;Data e hora (UTC-3);Status;Tabela', ...readings.map(row => [row.id, row.numero_evento, row.recorded_at ? row.data_hora : 'Data indisponível', row.source === 'atividade_sensor' ? 'Sem movimento' : 'Movimento detectado', row.source || 'eventos'].map(escape).join(';'))].join('\r\n');
  }
  return { timeZone, parseDeviceDate, normalizeEvents, normalizeActivity, normalizeDeviceStatus, deviceHeartbeatState, combineReadings, validReading, inPeriod, dateKey, deviceDate, aggregate, filterReadings, demoReadings, csv };
});

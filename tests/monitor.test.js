const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDeviceDate, normalizeEvents, aggregate, filterReadings, demoReadings, csv, deviceDate } = require('../monitor.js');
const now = Date.parse('2026-09-28T15:00:00Z');
const { normalizeActivity, combineReadings } = require('../monitor');

test('inactivity uses timestamptz and stays separate from executions with the same ID', () => {
  const motion = normalizeEvents([{ id: 1, numero_evento: 3, data_hora: '28/09/2026 11:59:00' }]).events;
  const activity = normalizeActivity([{ id: 1, data_hora: '2026-09-28T12:00:00-03:00' }, { id: 2, data_hora: null }]);
  const rows = combineReadings(motion, activity);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].source, 'atividade_sensor');
  assert.equal(rows[0].recorded_at, '2026-09-28T15:00:00.000Z');
  const bins = aggregate(rows, 1, now);
  assert.equal(bins.at(-1).count, 1);
  assert.equal(bins.at(-1).inactive, 1);
  assert.equal(filterReadings(rows, 'inactive').length, 2);
  assert.equal(filterReadings(rows, 'motion').length, 1);
  assert.equal(filterReadings(rows, 'inactive', '2026-09-28').length, 1);
  assert.ok(csv(rows).includes('Sem movimento'));
  assert.ok(csv(rows).includes('atividade_sensor'));
  assert.throws(() => normalizeActivity([{ id: 3, data_hora: 'invalid' }]));
});
const event = (numero_evento, minutesAgo = 0, id = numero_evento) => ({
  id,
  numero_evento,
  data_hora: deviceDate(now - minutesAgo * 60000),
});

test('parses the ESP32 Brasília timestamp and rejects unavailable or invalid dates', () => {
  assert.equal(parseDeviceDate('28/09/2026 12:00:00'), '2026-09-28T15:00:00.000Z');
  assert.equal(parseDeviceDate('data_indisponivel'), null);
  assert.equal(parseDeviceDate('31/02/2026 12:00:00'), null);
});

test('normalizes, sorts, and groups resent offline events', () => {
  const duplicate = event(7, 0, 3);
  const result = normalizeEvents([event(6, 10, 2), duplicate, { ...duplicate, id: 4 }]);
  assert.equal(result.events.length, 2);
  assert.equal(result.duplicates, 1);
  assert.equal(result.latest.numero_evento, 7);
  assert.equal(result.latest.recorded_at, '2026-09-28T15:00:00.000Z');
});

test('chart counts events within the selected time window', () => {
  const rows = normalizeEvents([event(1, 0), event(2, 60), event(3, 61)]).events;
  const bins = aggregate(rows, 1, now);
  assert.equal(bins.length, 12);
  assert.equal(bins.reduce((sum, bin) => sum + bin.count, 0), 2);
});

test('latest events are aggregated into the rightmost interval of the 24-hour chart', () => {
  const rows = normalizeEvents([event(1, 4), event(2, 6)]).events;
  const bins = aggregate(rows, 24, now);
  assert.equal(bins[0].count, 0);
  assert.equal(bins.at(-1).count, 2);
});

test('history filters events by status and Brasília calendar date', () => {
  const rows = normalizeEvents([event(1), { id: 2, numero_evento: 2, data_hora: 'data_indisponivel' }]).events;
  assert.equal(filterReadings(rows, 'all', '2026-09-28').length, 1);
  assert.equal(filterReadings(rows, 'dated').length, 1);
  assert.equal(filterReadings(rows, 'undated').length, 1);
});

test('demo events are ordered and cover a week', () => {
  const rows = demoReadings(now);
  assert.ok(Date.parse(rows.at(-1).recorded_at) < now - 6 * 86400000);
  assert.ok(rows.every((row, index) => !index || Date.parse(rows[index - 1].recorded_at) >= Date.parse(row.recorded_at)));
});

test('CSV exports the event number and ESP32 timestamp', () => {
  const output = csv(normalizeEvents([event(12)]).events);
  assert.ok(output.startsWith('\uFEFF'));
  assert.ok(output.includes('"12"'));
  assert.ok(output.includes('"28/09/2026 12:00:00"'));
  assert.ok(output.includes('"Movimento detectado"'));
});

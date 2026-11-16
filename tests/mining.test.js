const test = require("node:test");
const assert = require("node:assert/strict");
const DataMining = require("../mining");

test("aggregateEvents groups timestamps into time intervals and avoids duplicates", () => {
  const events = [
    { id: 1, numero_evento: 1, data_hora: "16/11/2026 10:05:00" },
    { id: 2, numero_evento: 2, data_hora: "16/11/2026 10:15:00" },
    { id: 3, numero_evento: 2, data_hora: "16/11/2026 10:15:00" }, // duplicado
    { id: 4, numero_evento: 3, data_hora: "16/11/2026 10:45:00" },
    { id: 5, numero_evento: 4, data_hora: "16/11/2026 11:10:00" },
  ];

  const intervals = DataMining.aggregateEvents(events, 30);
  assert.equal(intervals.length, 3);
  // Intervalo 1: 10:00 a 10:30 (tem 2 eventos válidos)
  assert.equal(intervals[0].motionCount, 2);
  // Intervalo 2: 10:30 a 11:00 (tem 1 evento)
  assert.equal(intervals[1].motionCount, 1);
  // Intervalo 3: 11:00 a 11:30 (tem 1 evento)
  assert.equal(intervals[2].motionCount, 1);
});

test("runKMeans creates K clusters and orders them by mean motion", () => {
  // Cria períodos com 3 perfis claros: baixo, médio, alto
  const data = [
    { hour: 2, dayOfWeek: 1, motionCount: 1, frequency: 0.03 },
    { hour: 3, dayOfWeek: 1, motionCount: 2, frequency: 0.06 },
    { hour: 4, dayOfWeek: 1, motionCount: 1, frequency: 0.03 },
    { hour: 9, dayOfWeek: 2, motionCount: 10, frequency: 0.33 },
    { hour: 10, dayOfWeek: 2, motionCount: 12, frequency: 0.40 },
    { hour: 11, dayOfWeek: 2, motionCount: 11, frequency: 0.36 },
    { hour: 14, dayOfWeek: 3, motionCount: 50, frequency: 1.66 },
    { hour: 15, dayOfWeek: 3, motionCount: 55, frequency: 1.83 },
    { hour: 16, dayOfWeek: 3, motionCount: 48, frequency: 1.60 },
  ];

  const res = DataMining.runKMeans(data, 3);
  assert.equal(res.clusters.length, 3);

  // O primeiro cluster deve ser Baixa movimentação
  assert.equal(res.clusters[0].label, "Baixa movimentação");
  // O segundo deve ser Média movimentação
  assert.equal(res.clusters[1].label, "Média movimentação");
  // O terceiro deve ser Alta movimentação
  assert.equal(res.clusters[2].label, "Alta movimentação");

  // Garante ordenação estrita das médias
  assert.ok(res.clusters[0].meanMotion <= res.clusters[1].meanMotion);
  assert.ok(res.clusters[1].meanMotion <= res.clusters[2].meanMotion);
});

test("runIsolationForest flags statistical outliers correctly", () => {
  // Conjunto regular com movimentos baixos em horários diurnos
  const data = [];
  for (let i = 0; i < 20; i++) {
    data.push({
      hour: 9 + (i % 8),
      dayOfWeek: 1 + (i % 5),
      motionCount: 5 + (i % 3),
      frequency: 0.16,
    });
  }

  // Adiciona anomalia extrema: 90 movimentos às 03:00 da madrugada
  data.push({
    hour: 3,
    dayOfWeek: 0,
    motionCount: 90,
    frequency: 3.0,
  });

  const res = DataMining.runIsolationForest(data, 0.1, 100, 42);
  assert.ok(res.anomalyCount >= 1);
  assert.equal(res.totalAnalyzed, 21);

  // A anomalia deve ter o maior score de anomalia
  const topAnomaly = res.anomalies[0];
  assert.equal(topAnomaly.motionCount, 90);
  assert.equal(topAnomaly.hour, 3);
  assert.ok(topAnomaly.anomalyScore > 0.6);
});

test("analyze returns clean message when data is insufficient", () => {
  const emptyRes = DataMining.analyze([]);
  assert.equal(emptyRes.status, "dados_insuficientes");

  const fewRes = DataMining.analyze([
    { id: 1, numero_evento: 1, data_hora: "16/11/2026 10:00:00" },
  ]);
  assert.equal(fewRes.status, "dados_insuficientes");
});

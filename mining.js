// MINING: Algoritmos de Mineração de Dados (K-Means e Isolation Forest)
// Módulo UMD: funciona no navegador (window.DataMining) e no Node.js (require).
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DataMining = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Constante de Euler-Mascheroni para o cálculo do Isolation Forest
  const EULER_MASCHERONI = 0.5772156649;

  // Converte objeto Date ou ISO string para componentes no fuso horário de Brasília (UTC-3)
  function getBrasiliaDateParts(dateInput) {
    const dt = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (!Number.isFinite(dt.getTime())) return null;

    // Ajuste para UTC-3 fixo
    const offsetMs = -3 * 3600 * 1000;
    const local = new Date(dt.getTime() + offsetMs);

    return {
      year: local.getUTCFullYear(),
      month: local.getUTCMonth() + 1,
      day: local.getUTCDate(),
      hour: local.getUTCHours(),
      minute: local.getUTCMinutes(),
      second: local.getUTCSeconds(),
      dayOfWeek: local.getUTCDay(), // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
      iso: dt.toISOString(),
    };
  }

  // Prepara e agrega os eventos do sensor PIR em janelas de tempo (ex: 30 minutos)
  function aggregateEvents(events, intervalMinutes = 30) {
    if (!Array.isArray(events) || events.length === 0) return [];

    const intervalMs = intervalMinutes * 60 * 1000;
    // Map para agrupar contagens por timestamp inicial do intervalo
    const buckets = new Map();
    const seen = new Set();

    for (const ev of events) {
      if (!ev) continue;
      // Aceita recorded_at (ISO) ou data_hora do ESP32
      let timeMs = null;
      if (ev.recorded_at && Number.isFinite(Date.parse(ev.recorded_at))) {
        timeMs = Date.parse(ev.recorded_at);
      } else if (typeof ev.data_hora === "string") {
        // Tenta converter formato DD/MM/YYYY HH:mm:ss
        const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(ev.data_hora.trim());
        if (match) {
          const [, d, m, y, h, min, s] = match.map(Number);
          const local = new Date(Date.UTC(y, m - 1, d, h, min, s));
          timeMs = local.getTime() + 3 * 3600000;
        }
      }

      if (!timeMs || !Number.isFinite(timeMs)) continue;

      // Desduplicação por numero_evento + tempo
      const key = ev.numero_evento !== null && ev.numero_evento !== undefined
        ? `${ev.numero_evento}|${timeMs}`
        : `${ev.id}|${timeMs}`;

      if (seen.has(key)) continue;
      seen.add(key);

      // Início do balde de tempo
      const bucketTime = Math.floor(timeMs / intervalMs) * intervalMs;
      const current = buckets.get(bucketTime) || { count: 0, events: [] };
      current.count += 1;
      current.events.push(ev);
      buckets.set(bucketTime, current);
    }

    const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const result = [];

    // Ordena as janelas cronologicamente
    const sortedBucketTimes = Array.from(buckets.keys()).sort((a, b) => a - b);

    for (const timeMs of sortedBucketTimes) {
      const { count } = buckets.get(timeMs);
      const parts = getBrasiliaDateParts(timeMs);
      if (!parts) continue;

      const pad = (n) => String(n).padStart(2, "0");
      const dateStr = `${pad(parts.day)}/${pad(parts.month)}/${parts.year}`;
      const timeStr = `${pad(parts.hour)}:${pad(parts.minute)}`;

      result.push({
        timestamp: new Date(timeMs).toISOString(),
        timeMs,
        date: dateStr,
        timeStr,
        hour: parts.hour,
        minute: parts.minute,
        dayOfWeek: parts.dayOfWeek,
        dayName: dayNames[parts.dayOfWeek],
        motionCount: count,
        frequency: Number((count / intervalMinutes).toFixed(3)), // movimentos por minuto
      });
    }

    return result;
  }

  // =========================================================================
  // ALGORITMO 01: K-MEANS CLUSTERING (Lloyd's com K-Means++)
  // =========================================================================

  function runKMeans(data, k = 3, maxIterations = 100) {
    if (!Array.isArray(data) || data.length < k) {
      return {
        error: `Dados insuficientes para formar ${k} grupos. Mínimo de ${k} períodos necessários.`,
        clusters: [],
        assigned: data,
      };
    }

    // Features: [hora / 24, diaOfWeek / 7, motionCount normalizado, frequency normalizada]
    const maxMotion = Math.max(...data.map((d) => d.motionCount), 1);
    const maxFreq = Math.max(...data.map((d) => d.frequency), 0.1);

    const vectors = data.map((d) => [
      d.hour / 24,
      d.dayOfWeek / 7,
      d.motionCount / maxMotion,
      d.frequency / maxFreq,
    ]);

    const numPoints = vectors.length;
    const numFeatures = vectors[0].length;

    // Distância Euclidiana ao quadrado
    function distSq(a, b) {
      let sum = 0;
      for (let i = 0; i < numFeatures; i++) {
        const diff = a[i] - b[i];
        sum += diff * diff;
      }
      return sum;
    }

    // Inicialização K-Means++
    const centroids = [];
    // 1º centroide escolhido deterministicamente no índice 0 para reprodutibilidade
    centroids.push([...vectors[0]]);

    for (let c = 1; c < k; c++) {
      const distances = [];
      let totalDistSq = 0;

      for (let i = 0; i < numPoints; i++) {
        let minDist = Infinity;
        for (const centroid of centroids) {
          const d = distSq(vectors[i], centroid);
          if (d < minDist) minDist = d;
        }
        distances.push(minDist);
        totalDistSq += minDist;
      }

      // Escolhe ponto com maior distância mínima acumulada
      let bestIdx = 0;
      let maxDist = -1;
      for (let i = 0; i < numPoints; i++) {
        if (distances[i] > maxDist) {
          maxDist = distances[i];
          bestIdx = i;
        }
      }
      centroids.push([...vectors[bestIdx]]);
    }

    // Loop de convergência
    const assignments = new Int32Array(numPoints);
    let converged = false;
    let iteration = 0;

    while (!converged && iteration < maxIterations) {
      converged = true;
      iteration++;

      // Etapa 1: Atribuição de clusters
      for (let i = 0; i < numPoints; i++) {
        let bestCluster = 0;
        let bestDist = Infinity;
        for (let c = 0; c < k; c++) {
          const d = distSq(vectors[i], centroids[c]);
          if (d < bestDist) {
            bestDist = d;
            bestCluster = c;
          }
        }
        if (assignments[i] !== bestCluster) {
          assignments[i] = bestCluster;
          converged = false;
        }
      }

      // Etapa 2: Atualização dos centroides
      const counts = new Int32Array(k);
      const newCentroids = Array.from({ length: k }, () => new Float64Array(numFeatures));

      for (let i = 0; i < numPoints; i++) {
        const c = assignments[i];
        counts[c]++;
        for (let f = 0; f < numFeatures; f++) {
          newCentroids[c][f] += vectors[i][f];
        }
      }

      for (let c = 0; c < k; c++) {
        if (counts[c] > 0) {
          for (let f = 0; f < numFeatures; f++) {
            centroids[c][f] = newCentroids[c][f] / counts[c];
          }
        }
      }
    }

    // IMPORTANTE: Ordenar os clusters pelos valores médios reais de movimentação
    // e associar as categorias: Baixa, Média, Alta movimentação
    const clusterStats = [];
    for (let c = 0; c < k; c++) {
      const points = [];
      let motionSum = 0;
      let hourSum = 0;
      for (let i = 0; i < numPoints; i++) {
        if (assignments[i] === c) {
          points.push(data[i]);
          motionSum += data[i].motionCount;
          hourSum += data[i].hour;
        }
      }

      const count = points.length;
      const meanMotion = count > 0 ? motionSum / count : 0;
      const meanHour = count > 0 ? hourSum / count : 0;

      clusterStats.push({
        rawId: c,
        count,
        percent: Number(((count / numPoints) * 100).toFixed(1)),
        meanMotion: Number(meanMotion.toFixed(2)),
        meanHour: Number(meanHour.toFixed(1)),
        points,
      });
    }

    // Ordena do menor movimento para o maior
    clusterStats.sort((a, b) => a.meanMotion - b.meanMotion);

    const defaultLabels = ["Baixa movimentação", "Média movimentação", "Alta movimentação"];
    const defaultColors = ["#009e80", "#2379f5", "#fa6c7e"]; // Verde, Azul, Coral

    const clusterMap = new Map();
    const finalClusters = clusterStats.map((item, index) => {
      let label = defaultLabels[index];
      if (k !== 3) {
        label = `Nível ${index + 1} (${item.meanMotion} mov/int)`;
      }
      const color = defaultColors[index] || `hsl(${Math.round((index / k) * 360)}, 70%, 50%)`;

      clusterMap.set(item.rawId, {
        rank: index,
        label,
        color,
      });

      return {
        rank: index,
        rawId: item.rawId,
        label,
        color,
        count: item.count,
        percent: item.percent,
        meanMotion: item.meanMotion,
        meanHour: item.meanHour,
      };
    });

    // Mapeia de volta para cada ponto original
    const assignedPoints = data.map((d, i) => {
      const rawC = assignments[i];
      const info = clusterMap.get(rawC) || { rank: 0, label: "Desconhecido", color: "#74839b" };
      return {
        ...d,
        clusterRank: info.rank,
        clusterLabel: info.label,
        clusterColor: info.color,
      };
    });

    return {
      k,
      iterations: iteration,
      clusters: finalClusters,
      assigned: assignedPoints,
    };
  }

  // =========================================================================
  // ALGORITMO 02: ISOLATION FOREST
  // =========================================================================

  // Comprimento médio da busca sem sucesso em uma árvore binária de busca c(n)
  function averagePathLength(n) {
    if (n <= 1) return 0;
    if (n === 2) return 1;
    // c(n) = 2 * (ln(n - 1) + 0.5772156649) - (2 * (n - 1) / n)
    return 2 * (Math.log(n - 1) + EULER_MASCHERONI) - (2 * (n - 1)) / n;
  }

  // Constrói uma Isolation Tree (iTree) recursivamente
  function buildITree(X, currentDepth, maxDepth, rng) {
    const numSamples = X.length;
    if (currentDepth >= maxDepth || numSamples <= 1) {
      return { size: numSamples, isLeaf: true };
    }

    const numFeatures = X[0].length;
    // Escolhe aleatoriamente uma feature
    const q = Math.floor(rng() * numFeatures);

    let minVal = Infinity;
    let maxVal = -Infinity;
    for (let i = 0; i < numSamples; i++) {
      const v = X[i][q];
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
    }

    // Se todos os valores da feature forem iguais, não é possível dividir
    if (maxVal === minVal) {
      return { size: numSamples, isLeaf: true };
    }

    // Valor de corte aleatório uniforme entre min e max
    const p = minVal + rng() * (maxVal - minVal);

    const left = [];
    const right = [];
    for (let i = 0; i < numSamples; i++) {
      if (X[i][q] < p) left.push(X[i]);
      else right.push(X[i]);
    }

    return {
      isLeaf: false,
      splitFeature: q,
      splitValue: p,
      left: buildITree(left, currentDepth + 1, maxDepth, rng),
      right: buildITree(right, currentDepth + 1, maxDepth, rng),
    };
  }

  // Calcula o comprimento do caminho h(x) para um ponto x em uma iTree
  function pathLength(x, tree, currentDepth = 0) {
    if (tree.isLeaf) {
      return currentDepth + averagePathLength(tree.size);
    }
    const a = tree.splitFeature;
    if (x[a] < tree.splitValue) {
      return pathLength(x, tree.left, currentDepth + 1);
    } else {
      return pathLength(x, tree.right, currentDepth + 1);
    }
  }

  // Gerador pseudo-aleatório simples (LCG) com seed para determinismo e testes
  function createRNG(seed = 42) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  function runIsolationForest(data, contamination = 0.08, numTrees = 100, seed = 42) {
    if (!Array.isArray(data) || data.length < 5) {
      return {
        error: "Dados insuficientes para detecção de anomalias com Isolation Forest (mínimo de 5 períodos).",
        totalAnalyzed: data ? data.length : 0,
        anomalyCount: 0,
        anomalyPercent: 0,
        anomalies: [],
        assigned: data,
      };
    }

    const rng = createRNG(seed);
    const n = data.length;
    const subSampleSize = Math.min(256, n);
    const maxDepth = Math.ceil(Math.log2(subSampleSize));

    // Vetores de características: [motionCount, frequency, hour, dayOfWeek]
    const X = data.map((d) => [d.motionCount, d.frequency, d.hour, d.dayOfWeek]);

    // Constrói floresta de árvores de isolamento
    const forest = [];
    for (let t = 0; t < numTrees; t++) {
      // Amostragem aleatória sem reposição
      const sampleIndices = new Set();
      while (sampleIndices.size < subSampleSize) {
        sampleIndices.add(Math.floor(rng() * n));
      }
      const subSample = Array.from(sampleIndices).map((idx) => X[idx]);
      const tree = buildITree(subSample, 0, maxDepth, rng);
      forest.push(tree);
    }

    // Calcula comprimento médio de caminho E(h(x)) para cada ponto
    const cN = averagePathLength(subSampleSize);
    const scores = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      let totalPath = 0;
      for (let t = 0; t < numTrees; t++) {
        totalPath += pathLength(X[i], forest[t]);
      }
      const avgPath = totalPath / numTrees;
      // Anomaly Score s(x, n) = 2^(- avgPath / c(n))
      scores[i] = cN > 0 ? Math.pow(2, -avgPath / cN) : 0.5;
    }

    // Determina o limiar com base na contaminação (percentil superior dos scores)
    const sortedScores = Array.from(scores).sort((a, b) => b - a);
    const thresholdIndex = Math.max(0, Math.floor(contamination * n) - 1);
    const threshold = sortedScores[thresholdIndex] || 0.6;

    let anomalyCount = 0;
    const assigned = data.map((d, i) => {
      const score = Number(scores[i].toFixed(4));
      // É anomalia se score >= threshold e score > 0.5 (acima do comportamento neutro)
      const isAnomaly = score >= threshold && score > 0.5;
      if (isAnomaly) anomalyCount++;

      return {
        ...d,
        anomalyScore: score,
        isAnomaly,
      };
    });

    const anomalies = assigned
      .filter((d) => d.isAnomaly)
      .sort((a, b) => b.anomalyScore - a.anomalyScore);

    return {
      totalAnalyzed: n,
      anomalyCount,
      anomalyPercent: Number(((anomalyCount / n) * 100).toFixed(1)),
      threshold: Number(threshold.toFixed(4)),
      anomalies,
      assigned,
    };
  }

  // =========================================================================
  // PIPELINE COMPLETO DE MINERAÇÃO DE DADOS
  // =========================================================================

  function analyze(events, options = {}) {
    const startTime = Date.now();
    const intervalMinutes = options.intervalMinutes || 30;
    const k = options.k || 3;
    const contamination = options.contamination || 0.08;

    if (!Array.isArray(events) || events.length < 4) {
      return {
        status: "dados_insuficientes",
        message:
          "Dados insuficientes para análise. É necessário acumular mais registros do sensor PIR para executar o K-Means e o Isolation Forest com significância estatística.",
        totalRawEvents: events ? events.length : 0,
        totalPeriods: 0,
      };
    }

    const periods = aggregateEvents(events, intervalMinutes);

    if (periods.length < k) {
      return {
        status: "dados_insuficientes",
        message: `Foram encontrados registros, mas agregados em menos de ${k} janelas de ${intervalMinutes} min. Continue captando dados.`,
        totalRawEvents: events.length,
        totalPeriods: periods.length,
      };
    }

    const kmeansResult = runKMeans(periods, k);
    const isoResult = runIsolationForest(kmeansResult.assigned, contamination);

    // Identifica horários de pico e calmaria
    const hourMap = new Map();
    for (const p of isoResult.assigned) {
      const h = p.hour;
      const prev = hourMap.get(h) || { count: 0, totalMotion: 0 };
      prev.count++;
      prev.totalMotion += p.motionCount;
      hourMap.set(h, prev);
    }

    let maxAvgMotion = -1;
    let minAvgMotion = Infinity;
    let peakHour = 0;
    let calmHour = 0;

    for (const [h, stat] of hourMap.entries()) {
      const avg = stat.totalMotion / stat.count;
      if (avg > maxAvgMotion) {
        maxAvgMotion = avg;
        peakHour = h;
      }
      if (avg < minAvgMotion) {
        minAvgMotion = avg;
        calmHour = h;
      }
    }

    const pad = (n) => String(n).padStart(2, "0");
    const peakPeriodStr = `${pad(peakHour)}:00 às ${pad((peakHour + 1) % 24)}:00`;
    const calmPeriodStr = `${pad(calmHour)}:00 às ${pad((calmHour + 1) % 24)}:00`;

    const durationMs = Date.now() - startTime;

    return {
      status: "sucesso",
      executionTimestamp: new Date().toISOString(),
      durationMs,
      totalRawEvents: events.length,
      totalPeriods: periods.length,
      intervalMinutes,
      peakPeriod: peakPeriodStr,
      calmPeriod: calmPeriodStr,
      kmeans: kmeansResult,
      isolationForest: isoResult,
      points: isoResult.assigned,
    };
  }

  return {
    aggregateEvents,
    runKMeans,
    runIsolationForest,
    analyze,
  };
});

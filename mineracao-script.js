(() => {
  "use strict";

  // Ícones SVG para os elementos com [data-icon]
  const icons = {
    moon: '<path d="M20.5 13a8.5 8.5 0 0 1-9.5-9.5A8.5 8.5 0 1 0 20.5 13Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    home: '<path d="m3 10 9-7 9 7M5 9v11h5v-7h4v7h5V9"/>',
    chart: '<path d="M5 20V11m7 9V4m7 16V8" stroke-width="3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
    "chevron-down": '<path d="m7 10 5 5 5-5"/>',
    "chevron-right": '<path d="m9 6 6 6-6 6"/>',
    "chevron-left": '<path d="m15 6-6 6 6 6"/>',
    "arrow-right": '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    walk: '<circle cx="14" cy="4" r="2"/><path d="m7 12 2-5 4 1 3 5h4m-8-5-2 8 4 3-1 4m-3-7-3 4-4 2"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM9 12l2 2 4-4"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9"/>',
    calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 11h16"/>',
    graduation: '<path d="m2 8 10-5 10 5-10 5zM6 10v7l6 4 6-4v-7M22 8v8"/>',
    cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 3v3m6-3v3M9 18v3m6-3v3M3 9h3m-3 6h3m12-6h3m-3 6h3"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
    x: '<path d="m6 6 12 12M6 18 18 6"/>',
  };

  // Renderiza ícones SVG
  document.querySelectorAll("[data-icon]").forEach((element) => {
    element.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[element.dataset.icon] || icons.info}</svg>`;
  });

  const $ = (id) => document.getElementById(id);

  // TEMA (Claro / Escuro compartilhado com index.html)
  const systemTheme = matchMedia("(prefers-color-scheme: dark)");
  let preferredTheme = null;
  try {
    preferredTheme = localStorage.getItem("iot-theme");
  } catch {}
  if (!["light", "dark"].includes(preferredTheme)) preferredTheme = null;

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const label = theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro";
    $("theme-toggle").setAttribute("aria-label", label);
    $("theme-toggle").title = label;
    document.querySelector('meta[name="theme-color"]').content =
      theme === "dark" ? "#101827" : "#f5f9ff";
  }
  applyTheme(preferredTheme || (systemTheme.matches ? "dark" : "light"));

  $("theme-toggle").addEventListener("click", () => {
    preferredTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(preferredTheme);
    try {
      localStorage.setItem("iot-theme", preferredTheme);
    } catch {}
  });

  systemTheme.addEventListener("change", (e) => {
    if (!preferredTheme) applyTheme(e.matches ? "dark" : "light");
  });

  // MODAIS (Histórico e Sobre)
  document.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dialog = $(btn.dataset.open);
      if (dialog && typeof dialog.showModal === "function") dialog.showModal();
    });
  });

  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dialog = btn.closest("dialog");
      if (dialog) dialog.close();
    });
  });

  // ESTADO DA APLICAÇÃO
  let rawEvents = [];
  let currentAnalysis = null;
  let lastDataFingerprint = "";
  let isBusy = false;
  let pollTimer = null;

  function formatTime(isoOrDate) {
    if (!isoOrDate) return "—";
    const d = new Date(isoOrDate);
    return isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  // BUSCA DADOS NA API
  async function fetchMiningData(force = false) {
    if (isBusy && !force) return;
    isBusy = true;
    $("refresh-button").classList.add("spinning");

    const kVal = Number($("select-k").value || 3);
    const intervalVal = Number($("select-interval").value || 30);
    const contamVal = Number($("select-contamination").value || 0.08);

    try {
      // Tenta rota dedicada /api/mining com fallback para /api/dashboard
      let response;
      try {
        response = await fetch(`/api/mining?interval=${intervalVal}&k=${kVal}&contamination=${contamVal}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(12000),
        });
      } catch {
        response = null;
      }

      let data;
      if (response && response.ok) {
        data = await response.json();
      } else {
        // Fallback: consulta /api/dashboard e executa DataMining no navegador
        const dashResp = await fetch(`/api/dashboard?hours=168`, {
          cache: "no-store",
          signal: AbortSignal.timeout(12000),
        });
        if (!dashResp.ok) throw new Error("Erro de comunicação com o servidor.");
        const dashData = await dashResp.json();
        const events = (dashData.events || []).filter((e) => e.source === "eventos");
        data = {
          mode: dashData.mode,
          ...DataMining.analyze(events, { intervalMinutes: intervalVal, k: kVal, contamination: contamVal }),
        };
      }

      $("connection-error").hidden = true;

      // Verifica impressão digital para evitar reprocessamento inútil
      const fingerprint = `${data.totalRawEvents || 0}|${data.totalPeriods || 0}|${kVal}|${intervalVal}|${contamVal}|${data.status}`;
      if (fingerprint !== lastDataFingerprint || force) {
        lastDataFingerprint = fingerprint;
        currentAnalysis = data;
        renderAll(data);
      }

      updateStatusHeader(data);
    } catch (err) {
      console.error(err);
      $("connection-error").textContent = "Não foi possível carregar os dados. Tentaremos novamente em instantes.";
      $("connection-error").hidden = false;
      $("refresh-dot").className = "dot red";
      $("refresh-label").textContent = "Falha de conexão";
    } finally {
      isBusy = false;
      $("refresh-button").classList.remove("spinning");
    }
  }

  // ATUALIZA STATUS NO CABEÇALHO
  function updateStatusHeader(data) {
    const isLive = data.mode === "live";
    const modeBadge = $("mode-badge");
    modeBadge.textContent = isLive ? "DADOS REAIS" : "DEMONSTRAÇÃO";
    modeBadge.className = isLive ? "badge normal" : "badge demo-badge";

    $("refresh-dot").className = "dot green";
    const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    $("refresh-label").textContent = `${isLive ? "Supabase conectado" : "Modo Demonstração"} • ${hora}`;
  }

  // RENDERIZAÇÃO COMPLETA DA PÁGINA
  function renderAll(data) {
    if (data.status === "dados_insuficientes") {
      $("insufficient-data-banner").hidden = false;
      $("insufficient-msg").textContent = data.message || "Aguardando mais eventos do sensor PIR.";
      $("kpi-total-movimentos").textContent = data.totalRawEvents || 0;
      $("kpi-total-periodos").textContent = "0";
      $("kpi-anomalias-detectadas").textContent = "0";
      return;
    }

    $("insufficient-data-banner").hidden = true;

    // 1. Indicadores gerais (KPIs)
    $("kpi-total-movimentos").textContent = data.totalRawEvents || 0;
    $("kpi-total-periodos").textContent = data.totalPeriods || 0;
    $("kpi-sub-periodos").textContent = `Janelas de ${data.intervalMinutes || 30} min`;
    $("kpi-padroes-identificados").textContent = (data.kmeans && data.kmeans.clusters ? data.kmeans.clusters.length : 3);

    const iso = data.isolationForest || {};
    $("kpi-anomalias-detectadas").textContent = iso.anomalyCount || 0;
    $("kpi-sub-anomalias").textContent = `${iso.anomalyPercent || 0}% dos períodos analisados`;
    $("anomaly-badge").textContent = `${iso.anomalyCount || 0} ANOMALIAS`;

    // 2. K-Means
    renderClusterCards(data.kmeans);
    $("highlight-peak-period").textContent = data.peakPeriod || "—";
    $("highlight-calm-period").textContent = data.calmPeriod || "—";
    renderScatterPlot(data.points);
    renderHourlyChart(data.points);

    // 3. Isolation Forest
    renderAnomalyTimeline(data.points);
    renderAnomaliesTable(iso.anomalies || []);

    // 4. Metadados de execução
    $("meta-timestamp").textContent = formatTime(data.executionTimestamp || new Date());
    $("meta-duration").textContent = `${data.durationMs || 0} ms`;
    $("meta-records").textContent = `${data.totalRawEvents || 0} eventos`;
    $("meta-status").textContent = "Algoritmos executados com sucesso";
    $("meta-status").style.color = "var(--green)";

    // Renderiza lista de histórico bruto no modal
    renderRawHistoryModal(data.points);
  }

  // RENDERIZA CARDS DE CLUSTERS (Baixa, Média, Alta movimentação)
  function renderClusterCards(kmeans) {
    const container = $("cluster-cards-container");
    container.innerHTML = "";
    if (!kmeans || !Array.isArray(kmeans.clusters)) return;

    const classNames = ["cluster-low", "cluster-med", "cluster-high"];
    const colorClasses = ["green", "blue", "coral"];

    kmeans.clusters.forEach((cluster, idx) => {
      const card = document.createElement("div");
      card.className = `cluster-card ${classNames[idx] || "cluster-med"}`;

      card.innerHTML = `
        <div class="cluster-card-header">
          <span class="cluster-card-title">
            <span class="dot ${colorClasses[idx] || 'blue'}"></span>
            ${cluster.label}
          </span>
          <span class="badge ${colorClasses[idx] === 'green' ? 'normal' : colorClasses[idx] === 'coral' ? 'alert' : 'demo-badge'}">
            ${cluster.percent}%
          </span>
        </div>
        <div class="cluster-metric">
          <div class="cluster-metric-val">${cluster.count} <span style="font-size: 14px; font-weight: normal; color: var(--muted);">períodos</span></div>
          <div class="cluster-metric-sub">Média: <strong>${cluster.meanMotion}</strong> mov/janela | Horário médio: <strong>${cluster.meanHour}h</strong></div>
        </div>
        <div class="cluster-progress-bar">
          <div class="cluster-progress-fill ${colorClasses[idx] || 'blue'}" style="width: ${cluster.percent}%"></div>
        </div>
      `;
      container.appendChild(card);
    });
  }

  // RENDERIZA GRÁFICO DE DISPERSÃO (Hora x Movimentos)
  function renderScatterPlot(points) {
    const svg = $("scatter-chart");
    const tooltip = $("scatter-tooltip");
    if (!svg || !Array.isArray(points) || points.length === 0) return;

    const width = 600;
    const height = 240;
    const padX = 45;
    const padY = 30;
    const chartW = width - padX - 20;
    const chartH = height - padY - 30;

    const maxMotion = Math.max(...points.map((p) => p.movimentos || p.motionCount), 5);

    let html = `
      <!-- Eixos e Linhas de Grade -->
      <line x1="${padX}" y1="${height - padY}" x2="${width - 15}" y2="${height - padY}" stroke="var(--border)" stroke-width="1"/>
      <line x1="${padX}" y1="20" x2="${padX}" y2="${height - padY}" stroke="var(--border)" stroke-width="1"/>
    `;

    // Linhas horizontais e labels no eixo Y
    const yTicks = 4;
    for (let i = 0; i <= yTicks; i++) {
      const yVal = Math.round((maxMotion / yTicks) * i);
      const yPos = height - padY - (i / yTicks) * chartH;
      html += `
        <line x1="${padX}" y1="${yPos}" x2="${width - 15}" y2="${yPos}" stroke="var(--border)" stroke-dasharray="3 3" opacity="0.6"/>
        <text x="${padX - 8}" y="${yPos + 4}" font-size="10" fill="var(--muted)" text-anchor="end">${yVal}</text>
      `;
    }

    // Labels no eixo X (Horas do dia: 0h a 24h)
    for (let h = 0; h <= 24; h += 4) {
      const xPos = padX + (h / 24) * chartW;
      html += `
        <text x="${xPos}" y="${height - 10}" font-size="10" fill="var(--muted)" text-anchor="middle">${h}h</text>
      `;
    }

    // Plotagem dos pontos de dispersão
    points.forEach((p, idx) => {
      const hourVal = p.hora !== undefined ? p.hora + (p.minuto || p.minute || 0) / 60 : p.hour;
      const motionVal = p.movimentos !== undefined ? p.movimentos : p.motionCount;
      const color = p.clusterColor || (p.clusterRank === 0 ? "#009e80" : p.clusterRank === 2 ? "#fa6c7e" : "#2379f5");

      const cx = padX + (hourVal / 24) * chartW;
      const cy = height - padY - (motionVal / maxMotion) * chartH;

      html += `
        <circle cx="${cx}" cy="${cy}" r="5" fill="${color}" fill-opacity="0.8" stroke="#fff" stroke-width="1.5"
                data-idx="${idx}" class="scatter-point" style="cursor: pointer; transition: r 0.2s;" />
      `;
    });

    svg.innerHTML = html;

    // Interatividade com Tooltip
    svg.querySelectorAll(".scatter-point").forEach((circle) => {
      circle.addEventListener("mouseenter", (e) => {
        const pt = points[Number(circle.dataset.idx)];
        circle.setAttribute("r", "8");
        tooltip.hidden = false;
        tooltip.innerHTML = `
          <strong>${pt.data || pt.date} às ${pt.hora_str || pt.timeStr}</strong> (${pt.nome_dia || pt.dayName})<br>
          Movimentos: <strong>${pt.movimentos || pt.motionCount}</strong><br>
          Grupo: <strong style="color:${pt.clusterColor || 'var(--blue)'};">${pt.clusterLabel}</strong>
        `;
        const rect = svg.getBoundingClientRect();
        tooltip.style.left = `${e.clientX - rect.left + 10}px`;
        tooltip.style.top = `${e.clientY - rect.top - 40}px`;
      });

      circle.addEventListener("mouseleave", () => {
        circle.setAttribute("r", "5");
        tooltip.hidden = true;
      });
    });
  }

  // RENDERIZA GRÁFICO DE MÉDIA POR HORÁRIO
  function renderHourlyChart(points) {
    const svg = $("hourly-chart");
    const tooltip = $("hourly-tooltip");
    if (!svg || !Array.isArray(points)) return;

    const width = 450;
    const height = 240;
    const padX = 35;
    const padY = 30;
    const chartW = width - padX - 15;
    const chartH = height - padY - 30;

    // Agrupa médias por hora
    const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0, totalMotion: 0, clusters: {} }));
    points.forEach((p) => {
      const h = p.hora !== undefined ? p.hora : p.hour;
      const m = p.movimentos !== undefined ? p.movimentos : p.motionCount;
      if (h >= 0 && h < 24) {
        hourly[h].count++;
        hourly[h].totalMotion += m;
        const cLabel = p.clusterLabel || "Média";
        hourly[h].clusters[cLabel] = (hourly[h].clusters[cLabel] || 0) + 1;
      }
    });

    const maxAvg = Math.max(...hourly.map((h) => (h.count > 0 ? h.totalMotion / h.count : 0)), 3);

    let html = `
      <line x1="${padX}" y1="${height - padY}" x2="${width - 10}" y2="${height - padY}" stroke="var(--border)" stroke-width="1"/>
    `;

    const barW = chartW / 24;
    hourly.forEach((h, i) => {
      const avg = h.count > 0 ? h.totalMotion / h.count : 0;
      const barH = (avg / maxAvg) * chartH;
      const x = padX + i * barW;
      const y = height - padY - barH;

      // Cor com base na intensidade média
      const color = avg > maxAvg * 0.65 ? "#fa6c7e" : avg > maxAvg * 0.3 ? "#2379f5" : "#009e80";

      html += `
        <rect x="${x + 2}" y="${y}" width="${Math.max(1, barW - 4)}" height="${barH}" rx="2" fill="${color}" opacity="0.85"
              data-hour="${h.hour}" data-avg="${avg.toFixed(1)}" data-count="${h.count}" class="hourly-bar" style="cursor: pointer;"/>
      `;

      if (i % 4 === 0) {
        html += `<text x="${x + barW / 2}" y="${height - 10}" font-size="10" fill="var(--muted)" text-anchor="middle">${i}h</text>`;
      }
    });

    svg.innerHTML = html;

    svg.querySelectorAll(".hourly-bar").forEach((bar) => {
      bar.addEventListener("mouseenter", (e) => {
        bar.setAttribute("opacity", "1");
        tooltip.hidden = false;
        tooltip.innerHTML = `
          <strong>Faixa das ${bar.dataset.hour}:00</strong><br>
          Média: <strong>${bar.dataset.avg} mov/intervalo</strong><br>
          Amostras: ${bar.dataset.count} janelas
        `;
        const rect = svg.getBoundingClientRect();
        tooltip.style.left = `${e.clientX - rect.left + 10}px`;
        tooltip.style.top = `${e.clientY - rect.top - 30}px`;
      });
      bar.addEventListener("mouseleave", () => {
        bar.setAttribute("opacity", "0.85");
        tooltip.hidden = true;
      });
    });
  }

  // RENDERIZA LINHA TEMPORAL COM ANOMALIAS (Isolation Forest)
  function renderAnomalyTimeline(points) {
    const svg = $("anomaly-chart");
    const tooltip = $("anomaly-tooltip");
    if (!svg || !Array.isArray(points) || points.length === 0) return;

    const width = 800;
    const height = 240;
    const padX = 40;
    const padY = 30;
    const chartW = width - padX - 20;
    const chartH = height - padY - 30;

    const maxMotion = Math.max(...points.map((p) => p.movimentos || p.motionCount), 5);
    const n = points.length;

    let html = `
      <line x1="${padX}" y1="${height - padY}" x2="${width - 15}" y2="${height - padY}" stroke="var(--border)" stroke-width="1"/>
      <line x1="${padX}" y1="20" x2="${padX}" y2="${height - padY}" stroke="var(--border)" stroke-width="1"/>
    `;

    // Linhas de grade
    for (let i = 0; i <= 3; i++) {
      const yVal = Math.round((maxMotion / 3) * i);
      const yPos = height - padY - (i / 3) * chartH;
      html += `
        <line x1="${padX}" y1="${yPos}" x2="${width - 15}" y2="${yPos}" stroke="var(--border)" stroke-dasharray="3 3" opacity="0.6"/>
        <text x="${padX - 8}" y="${yPos + 4}" font-size="10" fill="var(--muted)" text-anchor="end">${yVal}</text>
      `;
    }

    // Traça a linha contínua conectando os pontos no tempo
    let pathD = "";
    points.forEach((p, i) => {
      const motionVal = p.movimentos !== undefined ? p.movimentos : p.motionCount;
      const x = padX + (i / Math.max(1, n - 1)) * chartW;
      const y = height - padY - (motionVal / maxMotion) * chartH;
      pathD += (i === 0 ? "M " : "L ") + `${x} ${y} `;
    });

    html += `<path d="${pathD}" fill="none" stroke="#2379f5" stroke-width="2" opacity="0.4" />`;

    // Plotagem dos círculos
    points.forEach((p, i) => {
      const motionVal = p.movimentos !== undefined ? p.movimentos : p.motionCount;
      const isAnomaly = p.is_anomalia !== undefined ? p.is_anomalia : p.isAnomaly;
      const x = padX + (i / Math.max(1, n - 1)) * chartW;
      const y = height - padY - (motionVal / maxMotion) * chartH;

      if (isAnomaly) {
        // Destaque para ponto anômalo (círculo com anel)
        html += `
          <circle cx="${x}" cy="${y}" r="10" fill="#fa6c7e" fill-opacity="0.25" stroke="#fa6c7e" stroke-width="1.5" />
          <circle cx="${x}" cy="${y}" r="6" fill="#fa6c7e" stroke="#fff" stroke-width="2" class="timeline-point" data-idx="${i}" style="cursor: pointer;" />
        `;
      } else {
        html += `
          <circle cx="${x}" cy="${y}" r="3.5" fill="#2379f5" fill-opacity="0.75" class="timeline-point" data-idx="${i}" style="cursor: pointer;" />
        `;
      }
    });

    svg.innerHTML = html;

    svg.querySelectorAll(".timeline-point").forEach((pt) => {
      pt.addEventListener("mouseenter", (e) => {
        const item = points[Number(pt.dataset.idx)];
        const isAnom = item.is_anomalia !== undefined ? item.is_anomalia : item.isAnomaly;
        tooltip.hidden = false;
        tooltip.innerHTML = `
          <strong>${item.data || item.date} às ${item.hora_str || item.timeStr}</strong><br>
          Movimentos: <strong>${item.movimentos || item.motionCount}</strong><br>
          Score: <strong>${(item.anomaly_score || item.anomalyScore || 0).toFixed(4)}</strong><br>
          Status: <strong style="color: ${isAnom ? 'var(--coral)' : 'var(--green)'};">${isAnom ? 'ANOMALIA ESTATÍSTICA' : 'Normal'}</strong>
        `;
        const rect = svg.getBoundingClientRect();
        tooltip.style.left = `${e.clientX - rect.left + 10}px`;
        tooltip.style.top = `${e.clientY - rect.top - 40}px`;
      });
      pt.addEventListener("mouseleave", () => {
        tooltip.hidden = true;
      });
    });
  }

  // RENDERIZA TABELA DE ANOMALIAS
  function renderAnomaliesTable(anomalies) {
    const tbody = $("anomalies-table-body");
    $("anomaly-table-count").textContent = `${anomalies.length} registros incomuns`;

    if (!Array.isArray(anomalies) || anomalies.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--muted); padding: 24px;">
            Nenhuma anomalia estatística detectada nos registros analisados.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = anomalies
      .map((a) => {
        const dataStr = a.data || a.date;
        const horaStr = a.hora_str || a.timeStr;
        const diaStr = a.nome_dia || a.dayName;
        const mov = a.movimentos !== undefined ? a.movimentos : a.motionCount;
        const freq = a.frequencia !== undefined ? a.frequencia : a.frequency;
        const score = (a.anomaly_score !== undefined ? a.anomaly_score : a.anomalyScore || 0).toFixed(4);

        return `
        <tr>
          <td><strong>${dataStr}</strong></td>
          <td>${horaStr}</td>
          <td>${diaStr}</td>
          <td><strong>${mov}</strong></td>
          <td>${freq} /min</td>
          <td><code style="font-weight: 700; color: #fa6c7e;">${score}</code></td>
          <td><span class="anomaly-tag is-anomaly">Incomum</span></td>
        </tr>
      `;
      })
      .join("");
  }

  // PREENCHE TABELA NO MODAL HISTÓRICO
  function renderRawHistoryModal(points) {
    const tbody = $("history-events-body");
    if (!tbody || !Array.isArray(points)) return;
    tbody.innerHTML = points
      .slice(0, 50)
      .map(
        (p, idx) => `
      <tr>
        <td>${p.data || p.date}</td>
        <td>${p.hora_str || p.timeStr}</td>
        <td>Janela #${idx + 1}</td>
        <td><span class="badge ${p.is_anomalia || p.isAnomaly ? 'alert' : 'normal'}">${p.is_anomalia || p.isAnomaly ? 'Anômalo' : 'Normal'}</span></td>
      </tr>
    `,
      )
      .join("");
  }

  // EVENTOS DE BOTÕES E FILTROS
  $("refresh-button").addEventListener("click", () => fetchMiningData(true));
  $("btn-recalcular").addEventListener("click", () => fetchMiningData(true));
  $("select-k").addEventListener("change", () => fetchMiningData(true));
  $("select-interval").addEventListener("change", () => fetchMiningData(true));
  $("select-contamination").addEventListener("change", () => fetchMiningData(true));

  // INICIALIZAÇÃO E POLLING INTELIGENTE (5 SEGUNDOS)
  fetchMiningData(true);

  // Polling automático a cada 5 segundos quando a aba estiver visível
  pollTimer = setInterval(() => {
    if (!document.hidden) {
      fetchMiningData(false);
    }
  }, 5000);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      fetchMiningData(false);
    }
  });
})();

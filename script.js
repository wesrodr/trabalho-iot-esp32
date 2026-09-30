(() => {
  "use strict";
  // Ícones SVG (apenas o traçado) usados pelos elementos com [data-icon]
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
    "arrow-up-right": '<path d="M6 18 18 6M6 6h12v12"/>',
    power: '<path d="M12 3v9M6.4 5.6a9 9 0 1 0 11.2 0"/>',
    walk: '<circle cx="14" cy="4" r="2"/><path d="m7 12 2-5 4 1 3 5h4m-8-5-2 8 4 3-1 4m-3-7-3 4-4 2"/>',
    database:
      '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM9 12l2 2 4-4"/>',
    radio:
      '<path d="M5 4a11 11 0 0 0 0 16M19 4a11 11 0 0 1 0 16M8 7a7 7 0 0 0 0 10M16 7a7 7 0 0 1 0 10"/><circle cx="12" cy="12" r="2"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9"/>',
    calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 11h16"/>',
    flask: '<path d="M9 3h6m-5 0v7l-6 9a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2l-6-9V3M7 15h10"/>',
    graduation: '<path d="m2 8 10-5 10 5-10 5zM6 10v7l6 4 6-4v-7M22 8v8"/>',
    cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 3v3m6-3v3M9 18v3m6-3v3M3 9h3m-3 6h3m12-6h3m-3 6h3"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
    heart:
      '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',
    x: '<path d="m6 6 12 12M6 18 18 6"/>',
    link: '<path d="m10 13 4-4m-6 1-3 3a4 4 0 0 0 6 6l3-3m-4-8 3-3a4 4 0 0 1 6 6l-3 3"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  };
  // Injeta o SVG correspondente em cada elemento [data-icon]
  document.querySelectorAll("[data-icon]").forEach((element) => {
    element.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[element.dataset.icon] || icons.info}</svg>`;
  });
  const $ = (id) => document.getElementById(id);
  // TEMA: usa a preferência salva; se não houver, a do sistema
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
  systemTheme.addEventListener("change", (event) => {
    if (!preferredTheme) applyTheme(event.matches ? "dark" : "light");
  });
  // FUNÇÕES AUXILIARES: texto, data/hora e escape de HTML
  const text = (id, value) => {
    $(id).textContent = value;
  };
  const formatTime = (date) =>
    date ? new Date(date).toLocaleTimeString("pt-BR", { timeZone: Monitor.timeZone }) : "—";
  const formatDate = (date) =>
    date
      ? new Date(date).toLocaleDateString("pt-BR", { timeZone: Monitor.timeZone })
      : "Data indisponível";
  const escape = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  // Remove settings left by older versions; the server owns configuration now.
  try {
    localStorage.removeItem("esp32-connection");
  } catch {
    /* Storage may be disabled. */
  }
  // ESTADO da tela: dados, filtros e paginação
  let isDemo = false;
  let loaded = false;
  let readings = [];
  let latest = null;
  let device = null;
  let deviceUnavailable = false;
  let failed = false;
  let limited = false;
  let lastRefresh = null;
  let hours = 24;
  let page = 1;
  let requestVersion = 0;
  let busy = false;
  let toastTimer;
  const pageSize = 8;
  const recentPageSize = 5;
  let recentPage = 1;
  const visibleReadings = () =>
    readings.filter((row) => !row.recorded_at || Monitor.inPeriod(row, hours));
  // Tempo decorrido desde a última atualização ("agora", "há 12 s", "há 3 min")
  function ago(timestamp) {
    const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
    if (seconds < 5) return "agora";
    return seconds < 60 ? `há ${seconds} s` : `há ${Math.floor(seconds / 60)} min`;
  }
  // Mostra uma mensagem temporária (toast)
  function notify(message) {
    clearTimeout(toastTimer);
    text("toast", message);
    $("toast").hidden = false;
    toastTimer = setTimeout(() => {
      $("toast").hidden = true;
    }, 4000);
  }
  // RENDERIZAÇÃO — Texto do status de um registro
  function statusLabel(row) {
    return `<span class="status-label"><span class="dot ${row.source === "atividade_sensor" ? "green" : "coral"}"></span>${row.source === "atividade_sensor" ? "Sem movimento" : "Movimento detectado"}</span>`;
  }
  // Painel "Último registro": radar, badge e estado do ESP32
  function renderStatus() {
    const knownDate = latest?.recorded_at;
    text("environment-badge", failed ? "SEM ATUALIZAÇÃO" : latest ? "REGISTRADO" : "AGUARDANDO");
    $("environment-badge").className = `badge ${failed || !latest ? "offline" : "normal"}`;
    $("radar").className =
      `radar ${failed || !latest ? "is-offline" : latest.source !== "atividade_sensor" ? "is-motion" : ""}`;
    text(
      "environment-title",
      latest?.source === "atividade_sensor"
        ? "Sem movimento"
        : latest
          ? `Evento ${latest.numero_evento === null ? "sem número" : "#" + latest.numero_evento}`
          : "Nenhum registro recebido",
    );
    text(
      "environment-description",
      latest
        ? knownDate
          ? `${formatDate(knownDate)} às ${formatTime(knownDate)}`
          : "Leitura registrada sem data válida."
        : "Aguardando registros do sensor.",
    );
    const deviceState =
      failed || deviceUnavailable ? "unavailable" : Monitor.deviceHeartbeatState(device);
    text("environment-footer", deviceState === "active" ? "ESP32 ONLINE" : "ESP32 OFFLINE");
    $("environment-footer").dataset.state = deviceState === "active" ? "active" : "inactive";
    text(
      "device-updated",
      deviceState === "unavailable"
        ? "Não foi possível consultar o sinal do dispositivo."
        : deviceState === "unknown"
          ? "Nenhum sinal válido recebido."
          : `Último sinal: ${formatDate(device.recorded_at)} às ${formatTime(device.recorded_at)}${deviceState === "inactive" ? " · Mais de 2 minutos sem sinal." : ""}`,
    );
    text("mode-badge", !loaded ? "AGUARDANDO" : isDemo ? "DEMONSTRAÇÃO" : "HISTÓRICO");
    $("mode-badge").className = `badge ${!loaded ? "offline" : isDemo ? "demo-badge" : "normal"}`;
    $("demo-toolbar").hidden = !isDemo || failed;
    text("refresh-label", lastRefresh ? `Atualizado ${ago(lastRefresh)}` : "Buscando dados…");
    $("refresh-dot").className = `dot ${failed ? "amber" : "green"}`;
    text(
      "recent-footer-text",
      failed
        ? "Últimos dados disponíveis · Brasília (UTC−3)"
        : "Horário da leitura · Brasília (UTC−3)",
    );
    $("recent-dot").className = `dot ${failed ? "amber" : "green"}`;
  }
  // Tabela de registros recentes (com paginação)
  function renderRecent() {
    const rows = visibleReadings();
    const pages = Math.max(1, Math.ceil(rows.length / recentPageSize));
    recentPage = Math.min(recentPage, pages);
    const start = (recentPage - 1) * recentPageSize;
    const pageRows = rows.slice(start, start + recentPageSize);
    const skeletonRow =
      '<tr class="skeleton-row"><td><span class="skeleton"></span></td><td><span class="skeleton"></span></td></tr>';
    $("recent-events").innerHTML =
      !loaded && !failed
        ? skeletonRow.repeat(recentPageSize)
        : pageRows.length
          ? pageRows
              .map(
                (row) =>
                  `<tr><td title="${escape(formatDate(row.recorded_at))}">${row.recorded_at ? formatTime(row.recorded_at) : "Sem data"}<small class="event-number">${row.source === "atividade_sensor" ? "Leitura #" + escape(row.id) : "Evento " + escape(row.numero_evento ?? "—")}</small></td><td>${statusLabel(row)}</td></tr>`,
              )
              .join("")
          : '<tr><td class="empty-cell" colspan="2">Nenhum registro neste período.</td></tr>';
    $("recent-pagination").hidden = rows.length <= recentPageSize;
    text(
      "recent-count",
      `${start + 1}–${Math.min(start + recentPageSize, rows.length)} de ${rows.length} registros`,
    );
    text("recent-page-label", `${recentPage} de ${pages}`);
    $("recent-previous").disabled = recentPage <= 1;
    $("recent-next").disabled = recentPage >= pages;
  }
  // Gráfico SVG de atividade por período
  function renderChart() {
    const bins = Monitor.aggregate(readings, hours);
    const total = bins.reduce((sum, bin) => sum + bin.count, 0);
    text("detection-count", total);
    const inactive = bins.reduce((sum, bin) => sum + bin.inactive, 0);
    text("inactive-count", `${inactive} sem movimento`);
    text(
      "chart-subtitle",
      hours === 1
        ? "na última hora"
        : hours === 168
          ? "nos últimos 7 dias"
          : "nas últimas 24 horas",
    );
    const max = Math.max(4, ...bins.flatMap((bin) => [bin.count, bin.inactive]));
    const ceiling = Math.ceil(max / 4) * 4;
    // Use CSS pixels so the labels stay readable on small screens.
    const chartWidth = Math.max(240, $("chart-area").clientWidth);
    const chartHeight = Math.max(230, $("chart-area").clientHeight);
    $("activity-chart").setAttribute("viewBox", `0 0 ${chartWidth} ${chartHeight}`);
    const left = 34,
      top = 14,
      width = chartWidth - 52,
      height = chartHeight - 60;
    let svg = "";
    for (let i = 0; i <= 4; i++) {
      const y = top + height - (i * height) / 4;
      svg += `<line x1="${left}" y1="${y}" x2="${left + width}" y2="${y}" stroke="${i ? "#e5ecf5" : "#58bda5"}" stroke-width="1"/><text x="23" y="${y + 5}" text-anchor="end" fill="#5e718c" font-size="14" font-family="DM Sans,sans-serif">${(ceiling * i) / 4}</text>`;
    }
    const slot = width / bins.length;
    const barWidth = Math.min(slot * 0.32, hours === 168 ? 26 : hours === 1 ? 16 : 10);
    const labelEvery = Math.ceil(bins.length / Math.max(3, Math.floor(width / 72)));
    const endX = left + width;
    const endLabel = new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: Monitor.timeZone,
    });
    svg += `<line x1="${endX}" y1="${top}" x2="${endX}" y2="${top + height}" stroke="#f0f3f8"/><text data-axis-end="now" x="${endX - 2}" y="${chartHeight - 17}" text-anchor="end" fill="#5e718c" font-size="14" font-family="DM Sans,sans-serif"><title>Horário atual</title>${endLabel}</text>`;
    bins.forEach((bin, index) => {
      const x = left + (index + 0.5) * slot;
      const label =
        hours === 168
          ? new Date(bin.start).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              timeZone: Monitor.timeZone,
            })
          : new Date(bin.start).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: Monitor.timeZone,
            });
      const end =
        hours === 168
          ? new Date(bin.end).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              timeZone: Monitor.timeZone,
            })
          : new Date(bin.end).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: Monitor.timeZone,
            });

      if (index % labelEvery === 0) {
        svg += `<line x1="${x}" y1="${top}" x2="${x}" y2="${top + height}" stroke="#f0f3f8"/><text x="${Math.max(left + 17, Math.min(x, chartWidth - 24))}" y="${chartHeight - 17}" text-anchor="middle" fill="#5e718c" font-size="14" font-family="DM Sans,sans-serif">${label}</text>`;
      }
      [
        ["count", "Movimento detectado", -1],
        ["inactive", "Sem movimento", 1],
      ].forEach(([key, status, direction]) => {
        const value = bin[key];
        if (!value) return;
        const barHeight = (value / ceiling) * height;
        const tooltip = `${label}–${end}: ${value} registros — ${status}`;
        svg += `<rect class="chart-bar ${key === "inactive" ? "chart-bar-inactive" : ""}" x="${x + (direction * barWidth) / 2 - barWidth / 2}" y="${top + height - barHeight}" width="${barWidth}" height="${barHeight}" rx="2" tabindex="0" role="img" aria-label="${tooltip}" data-tooltip="${tooltip}"><title>${tooltip}</title></rect>`;
      });
    });
    $("activity-chart").innerHTML = svg;
    $("activity-chart").setAttribute(
      "aria-label",
      `${total} detecções de movimento e ${inactive} registros sem movimento ${$("chart-subtitle").textContent}. Gráfico com ${bins.length} intervalos.`,
    );
    $("chart-tooltip").hidden = true;
    $("activity-chart")
      .querySelectorAll("[data-tooltip]")
      .forEach((bar) => {
        const show = () => {
          text("chart-tooltip", bar.dataset.tooltip);
          $("chart-tooltip").hidden = false;
        };
        const hide = () => {
          $("chart-tooltip").hidden = true;
        };
        bar.addEventListener("click", show);
        bar.addEventListener("mouseenter", show);
        bar.addEventListener("focus", show);
        bar.addEventListener("mouseleave", hide);
        bar.addEventListener("blur", hide);
      });
  }
  // Histórico completo: filtros, tabela e paginação
  function historyRows() {
    return Monitor.filterReadings(
      visibleReadings(),
      $("history-filter").value,
      $("history-date").value,
    );
  }
  function renderHistory() {
    const rows = historyRows();
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    page = Math.min(page, pages);
    $("history-events").innerHTML = rows.length
      ? rows
          .slice((page - 1) * pageSize, page * pageSize)
          .map(
            (row) =>
              `<tr><td data-label="Data">${formatDate(row.recorded_at)}</td><td data-label="Horário">${formatTime(row.recorded_at)}</td><td data-label="Evento">${escape(row.numero_evento ?? "—")}</td><td data-label="Status">${statusLabel(row)}</td></tr>`,
          )
          .join("")
      : '<tr><td class="empty-cell" colspan="4">Nenhum registro encontrado para estes filtros.</td></tr>';
    text(
      "history-count",
      `${rows.length} ${rows.length === 1 ? "registro" : "registros"}${isDemo ? " de demonstração" : ""}`,
    );
    text("page-label", `${page} de ${pages}`);
    $("previous-page").disabled = page <= 1;
    $("next-page").disabled = page >= pages;
    $("export-button").disabled = !rows.length;
    text(
      "history-intro",
      `${$("chart-period").selectedOptions[0].textContent} e registros sem data. Horários de Brasília (UTC−3). ${isDemo ? "Dados de demonstração." : "Até 1.000 registros por tabela, ordenados pela data da leitura. Reenvios de eventos agrupados."}`,
    );
  }
  // Redesenha todos os painéis
  function render() {
    renderStatus();
    renderRecent();
    renderChart();
    $("activity-chart").classList.toggle("is-loading", !loaded && !failed);
    if ($("history-dialog").open) renderHistory();
  }
  // DADOS — Busca os registros na API e atualiza a tela
  async function refresh(manual = false) {
    if (busy) return;
    busy = true;
    const version = requestVersion;
    $("refresh-button").classList.add("spinning");
    try {
      const response = await fetch(`/api/dashboard?hours=${hours}`, {
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Monitoramento indisponível");
      const result = await response.json();
      if (
        !["demo", "live"].includes(result.mode) ||
        !Array.isArray(result.events) ||
        !result.events.every(Monitor.validReading) ||
        (result.latest !== null && !Monitor.validReading(result.latest))
      )
        throw new Error("Resposta inválida");
      if (version !== requestVersion) return;
      if (!loaded || !isDemo || result.mode !== "demo") {
        readings = result.events;
        latest = result.latest;
      }
      limited = result.limited === true;
      device = result.device || null;
      deviceUnavailable = result.deviceUnavailable === true;
      $("data-limit").hidden = !limited;
      isDemo = result.mode === "demo";
      loaded = true;
      failed = false;
      lastRefresh = Date.now();
      $("connection-error").hidden = true;
      render();
      if (manual) notify("Dados atualizados.");
    } catch (error) {
      if (version !== requestVersion) return;
      failed = true;
      text(
        "connection-error",
        "Não foi possível atualizar o monitoramento. Tentaremos novamente automaticamente.",
      );
      $("connection-error").hidden = false;
      renderStatus();
    } finally {
      if (version === requestVersion) {
        busy = false;
        $("refresh-button").classList.remove("spinning");
      }
    }
  }
  // Cancela a requisição em andamento
  function cancelCurrent() {
    requestVersion++;
    busy = false;
    $("refresh-button").classList.remove("spinning");
  }
  // Modo demonstração: simula uma detecção de movimento
  function addDemoEvent() {
    const id = Math.max(0, ...readings.map((row) => Number(row.id))) + 1;
    latest = {
      id,
      numero_evento: id,
      data_hora: Monitor.deviceDate(Date.now()),
      recorded_at: Monitor.parseDeviceDate(Monitor.deviceDate(Date.now())),
    };
    readings.unshift(latest);
    render();
  }
  // EVENTOS — Abrir e fechar diálogos
  document.querySelectorAll("[data-open]").forEach((button) =>
    button.addEventListener("click", () => {
      const dialog = $(button.dataset.open);
      if (dialog.id === "history-dialog") {
        page = 1;
        renderHistory();
      }
      dialog.showModal();
    }),
  );
  document
    .querySelectorAll("[data-close]")
    .forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
  document.querySelectorAll("dialog").forEach((dialog) =>
    dialog.addEventListener("click", (event) => {
      const rect = dialog.getBoundingClientRect();
      if (
        event.target === dialog &&
        (event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom)
      )
        dialog.close();
    }),
  );
  // Destaque do item ativo do menu
  document.querySelectorAll("[data-nav]").forEach((link) =>
    link.addEventListener("click", () => {
      document
        .querySelectorAll("[data-nav]")
        .forEach((item) => item.classList.toggle("active", item === link));
    }),
  );
  const dashboardNav = document.querySelector('[data-nav="dashboard"]');
  const homeNav = document.querySelector('[data-nav="inicio"]');
  if (dashboardNav && homeNav) {
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        dashboardNav.classList.toggle("active", entry.isIntersecting);
        homeNav.classList.toggle("active", !entry.isIntersecting);
      },
      { rootMargin: "-110px 0px -55% 0px" },
    );
    observer.observe($("dashboard"));
  }
  // Toque fora das barras fecha o tooltip do gráfico
  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-tooltip]")) $("chart-tooltip").hidden = true;
  });
  // Botões, paginação e filtros
  $("refresh-button").addEventListener("click", () => refresh(true));
  $("recent-previous").addEventListener("click", () => {
    recentPage--;
    renderRecent();
  });
  $("recent-next").addEventListener("click", () => {
    recentPage++;
    renderRecent();
  });
  $("simulate-motion").addEventListener("click", () => {
    if (!isDemo || failed) return;
    addDemoEvent();
    notify("Nova detecção adicionada à demonstração.");
  });
  $("chart-period").addEventListener("change", () => {
    hours = Number($("chart-period").value);
    page = 1;
    recentPage = 1;
    cancelCurrent();
    render();
    refresh();
  });
  ["history-filter", "history-date"].forEach((id) =>
    $(id).addEventListener("change", () => {
      page = 1;
      renderHistory();
    }),
  );
  $("previous-page").addEventListener("click", () => {
    page--;
    renderHistory();
  });
  $("next-page").addEventListener("click", () => {
    page++;
    renderHistory();
  });
  // Exporta o histórico filtrado em CSV
  $("export-button").addEventListener("click", () => {
    const blob = new Blob([Monitor.csv(historyRows())], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `esp32-${isDemo ? "demonstracao-" : ""}${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Histórico exportado.");
  });
  // INICIALIZAÇÃO
  render();
  refresh();
  // Redesenha o gráfico quando a área dele muda de tamanho
  let chartRenderedWidth = $("chart-area").clientWidth;
  let chartRenderedHeight = $("chart-area").clientHeight;
  new ResizeObserver(() => {
    const width = $("chart-area").clientWidth;
    const height = $("chart-area").clientHeight;
    if (width !== chartRenderedWidth || height !== chartRenderedHeight) {
      chartRenderedWidth = width;
      chartRenderedHeight = height;
      renderChart();
    }
  }).observe($("chart-area"));
  // Mantém o "há X s" correto entre uma busca e outra
  setInterval(() => {
    if (lastRefresh) text("refresh-label", `Atualizado ${ago(lastRefresh)}`);
  }, 1000);
  // Atualização automática a cada 5 s (pausa quando a aba está oculta)
  setInterval(() => {
    if (!document.hidden) {
      renderStatus();
      refresh();
    }
  }, 5000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
  });
})();
// SERVIDOR LOCAL E API DO PAINEL
// Serve os arquivos do painel e a rota /api/dashboard, que consulta o Supabase
// (ou devolve dados de demonstração quando não há credenciais).
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = __dirname;
// Tipos MIME dos arquivos servidos
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};
// Arquivos da raiz que podem ser acessados (todo o resto é bloqueado)
const allowed = new Set(["index.html", "style.css", "script.js", "monitor.js"]);
const Monitor = require("./monitor");

// Cria o manipulador de /api/dashboard.
// Recebe env e fetchImpl como parâmetros para facilitar os testes.
function createDashboardHandler({ env = process.env, fetchImpl = fetch } = {}) {
  const url = env.SUPABASE_URL || "";
  const key = env.SUPABASE_KEY || "";
  // Modo demonstração: IOT_DEMO_MODE=true, ou quando não há credenciais do Supabase
  const demo = env.IOT_DEMO_MODE === "true" || (!url && !key && env.IOT_DEMO_MODE !== "false");
  // Dados fictícios: 126 leituras de movimento + 126 de "sem movimento"
  const demoEvents = Monitor.combineReadings(
    Monitor.demoReadings(),
    Monitor.normalizeActivity(
      Array.from({ length: 126 }, (_, i) => ({
        id: i + 1,
        data_hora: new Date(Date.now() - (i * 76 + 10) * 60000).toISOString(),
      })),
    ),
  );
  // Envia uma resposta JSON sem cache
  function json(res, status, body) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(body));
  }
  // Manipulador de GET /api/dashboard?hours=1|24|168
  return async function dashboard(req, res) {
    const requestUrl = new URL(req.url, "http://localhost");
    // Aceita somente GET
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return json(res, 405, { error: "Método não permitido." });
    }
    // Período do gráfico: apenas 1, 24 ou 168 horas
    const hours = Number(requestUrl.searchParams.get("hours") || 24);
    if (![1, 24, 168].includes(hours)) return json(res, 400, { error: "Período inválido." });
    // Modo demonstração: responde sem consultar o Supabase
    if (demo)
      return json(res, 200, {
        mode: "demo",
        events: demoEvents,
        latest: demoEvents[0],
        device: Monitor.normalizeDeviceStatus({
          id: 1,
          status: "online",
          data_hora: new Date().toISOString(),
        }),
        deviceUnavailable: false,
        duplicates: 0,
        undated: 0,
        limited: false,
      });
    try {
      // Modo real: valida a URL e a chave (somente HTTPS em *.supabase.co, sem usuário, senha ou porta)
      const projectUrl = new URL(url);
      if (
        !key ||
        projectUrl.protocol !== "https:" ||
        !projectUrl.hostname.endsWith(".supabase.co") ||
        projectUrl.username ||
        projectUrl.password ||
        projectUrl.port
      )
        throw new Error("Invalid server configuration");
      // Autenticação: a chave sempre vai em apikey; chaves JWT (eyJ...) também como Bearer
      const headers = { apikey: key };
      if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
      // Consulta as 3 tabelas em paralelo: eventos, atividade_sensor (sem movimento) e status_dispositivo
      const results = await Promise.allSettled(
        [
          ["eventos", { select: "id,numero_evento,data_hora", order: "id.desc", limit: "1000" }],
          [
            "atividade_sensor",
            { select: "id,data_hora", order: "data_hora.desc.nullslast,id.desc", limit: "1000" },
          ],
          [
            "status_dispositivo",
            {
              select: "id,data_hora,status",
              order: "data_hora.desc.nullslast,id.desc",
              limit: "1",
            },
          ],
        ].map(async ([table, query]) => {
          const response = await fetchImpl(
            `${projectUrl.origin}/rest/v1/${table}?${new URLSearchParams(query)}`,
            { headers, signal: AbortSignal.timeout(12000), cache: "no-store" },
          );
          if (!response.ok) throw new Error("Upstream unavailable");
          const rows = await response.json();
          if (!Array.isArray(rows)) throw new Error("Invalid readings");
          return rows;
        }),
      );
      // Eventos e atividade são obrigatórios; o status do dispositivo é opcional
      if (results.slice(0, 2).some((result) => result.status === "rejected"))
        throw new Error("Upstream unavailable");
      // Se o status do dispositivo falhar, o painel continua funcionando (marcado como indisponível)
      let device = null;
      let deviceUnavailable = results[2].status === "rejected";
      if (!deviceUnavailable) {
        try {
          device = Monitor.normalizeDeviceStatus(results[2].value[0]);
        } catch {
          deviceUnavailable = true;
        }
      }
      // Normaliza e combina as leituras das duas tabelas
      const [data, activity] = results.map((result) => result.value);
      const normalized = Monitor.normalizeEvents(data);
      const events = Monitor.combineReadings(
        normalized.events,
        Monitor.normalizeActivity(activity),
      );
      // Resposta do modo real
      return json(res, 200, {
        mode: "live",
        ...normalized,
        events,
        device,
        deviceUnavailable,
        latest: events[0] || null,
        undated: events.filter((row) => !row.recorded_at).length,
        limited: data.length >= 1000 || activity.length >= 1000,
      });
      // Qualquer falha vira 503, sem expor detalhes internos
    } catch {
      return json(res, 503, {
        error:
          "Não foi possível atualizar o monitoramento. Tentaremos novamente em alguns segundos.",
      });
    }
  };
}

// Cria o servidor HTTP: rota da API + arquivos estáticos
function createServer({ env = process.env, fetchImpl = fetch } = {}) {
  const dashboard = createDashboardHandler({ env, fetchImpl });
  return http.createServer((req, res) => {
    // Decodifica o caminho da URL (400 se for inválido)
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    // Rota da API
    if (pathname === "/api/dashboard") {
      void dashboard(req, res);
      return;
    }
    // Arquivos estáticos: somente GET e HEAD
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    // Resolve o arquivo e bloqueia acessos fora da raiz do projeto ou fora da lista permitida
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const file = path.resolve(root, relative);
    if (
      !file.startsWith(root + path.sep) ||
      (!allowed.has(relative) && !/^assets\/[a-zA-Z0-9_.-]+$/.test(relative))
    ) {
      res.writeHead(404).end("Não encontrado");
      return;
    }
    // Lê e envia o arquivo
    fs.readFile(file, (error, data) => {
      if (error) {
        res.writeHead(404).end("Não encontrado");
        return;
      }
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(req.method === "HEAD" ? undefined : data);
    });
  });
}
// Execução direta (npm start): carrega o .env e inicia o servidor
if (require.main === module) {
  if (fs.existsSync(path.join(root, ".env"))) process.loadEnvFile(path.join(root, ".env"));
  createServer().listen(Number(process.env.PORT) || 3000, process.env.HOST || "127.0.0.1", () =>
    console.log("ESP32 IoT disponível em http://localhost:" + (process.env.PORT || 3000)),
  );
}
module.exports = { createServer, createDashboardHandler };
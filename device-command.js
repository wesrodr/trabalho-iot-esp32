"use strict";

function createDeviceCommandHandler({ env = process.env, fetchImpl = fetch } = {}) {
  const supabaseUrl = env.SUPABASE_URL || "";
  const supabaseKey = env.SUPABASE_KEY || "";

  function json(res, status, body) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(body));
  }

  async function readBody(req) {
    if (req.body && typeof req.body === "object") return req.body;
    if (typeof req.body === "string") return JSON.parse(req.body || "{}");
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 1024) throw new Error("Request too large");
    }
    return JSON.parse(body || "{}");
  }

  return async function deviceCommand(req, res) {
    if (!supabaseUrl || !supabaseKey || env.IOT_DEMO_MODE === "true")
      return json(res, 503, { error: "Controle do ESP32 indisponível neste modo." });

    let project;
    try {
      project = new URL(supabaseUrl);
      if (
        project.protocol !== "https:" ||
        !project.hostname.endsWith(".supabase.co") ||
        project.username || project.password || project.port
      ) throw new Error("Invalid Supabase URL");
    } catch {
      return json(res, 503, { error: "Configuração do Supabase inválida." });
    }

    const headers = { apikey: supabaseKey, "Content-Type": "application/json" };
    if (supabaseKey.startsWith("eyJ")) headers.Authorization = `Bearer ${supabaseKey}`;

    try {
      let response;
      if (req.method === "GET") {
        const query = new URLSearchParams({ select: "id,led", id: "eq.1", limit: "1" });
        response = await fetchImpl(
          `${project.origin}/rest/v1/comando_dispositivo?${query}`,
          { headers, signal: AbortSignal.timeout(10000), cache: "no-store" },
        );
      } else if (req.method === "POST") {
        const body = await readBody(req);
        if (!body || typeof body.led !== "boolean")
          return json(res, 400, { error: "O estado do LED precisa ser true ou false." });
        const query = new URLSearchParams({ on_conflict: "id" });
        headers.Prefer = "resolution=merge-duplicates,return=representation";
        response = await fetchImpl(
          `${project.origin}/rest/v1/comando_dispositivo?${query}`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              id: 1,
              led: body.led,
              mensagem: "Comando recebido do painel",
            }),
            signal: AbortSignal.timeout(10000),
            cache: "no-store",
          },
        );
      } else {
        res.setHeader("Allow", "GET, POST");
        return json(res, 405, { error: "Método não permitido." });
      }

      if (!response.ok) return json(res, 502, { error: "Não foi possível enviar o comando ao ESP32." });
      const rows = await response.json();
      const command = Array.isArray(rows) ? rows[0] || null : null;
      return json(res, 200, { command });
    } catch {
      return json(res, 502, { error: "Não foi possível conectar ao Supabase." });
    }
  };
}

module.exports = { createDeviceCommandHandler };

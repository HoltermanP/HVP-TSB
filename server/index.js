/*
 * HVP-TSB server.
 * Serveert de web-app en biedt een REST API voor formats en projecten,
 * inclusief Excel- en PDF-export.
 */
const path = require("path");
const express = require("express");
const store = require("./store");
const { exportExcel } = require("./export-excel");
const { exportPdf } = require("./export-pdf");
const { buildFacts, streamNarrative } = require("./ai-report");

// Start de initialisatie alvast (schema + seed bij lege database).
store.init().catch((e) => console.error("Init-fout:", e.message));

const app = express();
app.use(express.json({ limit: "10mb" }));

const PUBLIC_DIR = path.join(__dirname, "..", "public");
app.use(express.static(PUBLIC_DIR));

function safeName(s) {
  return String(s || "tsb").replace(/[^a-z0-9_\- ]/gi, "_").trim() || "tsb";
}
// Wikkelt async handlers zodat fouten netjes als 500 terugkomen.
function wrap(fn) {
  return function (req, res) {
    Promise.resolve(fn(req, res)).catch((e) => {
      console.error(e);
      if (!res.headersSent) res.status(500).json({ error: "Serverfout: " + e.message });
    });
  };
}

/* ---------- Instellingen ---------- */
app.get("/api/settings", wrap(async (req, res) => res.json(await store.getSettings())));
app.put("/api/settings", wrap(async (req, res) => res.json(await store.updateSettings(req.body))));

/* ---------- Formats ---------- */
app.get("/api/formats", wrap(async (req, res) => res.json(await store.listFormats())));

app.get("/api/formats/:id", wrap(async (req, res) => {
  const f = await store.getFormat(req.params.id);
  if (!f) return res.status(404).json({ error: "Format niet gevonden" });
  res.json(f);
}));

app.post("/api/formats", wrap(async (req, res) => {
  const f = await store.createFormat(req.body);
  res.status(201).json(f);
}));

app.put("/api/formats/:id", wrap(async (req, res) => {
  const f = await store.updateFormat(req.params.id, req.body);
  if (!f) return res.status(404).json({ error: "Format niet gevonden" });
  res.json(f);
}));

app.post("/api/formats/:id/duplicate", wrap(async (req, res) => {
  const f = await store.getFormat(req.params.id);
  if (!f) return res.status(404).json({ error: "Format niet gevonden" });
  const copy = JSON.parse(JSON.stringify(f));
  copy.name = (f.name || "Format") + " (kopie)";
  delete copy.id;
  res.status(201).json(await store.createFormat(copy));
}));

app.delete("/api/formats/:id", wrap(async (req, res) => {
  const ok = await store.deleteFormat(req.params.id);
  if (!ok) return res.status(404).json({ error: "Format niet gevonden" });
  res.json({ ok: true });
}));

/* ---------- Projecten ---------- */
app.get("/api/projects", wrap(async (req, res) => res.json(await store.listProjects())));

app.get("/api/projects/full", wrap(async (req, res) => res.json(await store.getAllProjects())));

app.get("/api/projects/:id", wrap(async (req, res) => {
  const p = await store.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: "Project niet gevonden" });
  res.json(p);
}));

app.post("/api/projects", wrap(async (req, res) => {
  const { formatId } = req.body || {};
  if (!formatId) return res.status(400).json({ error: "formatId is verplicht" });
  const p = await store.createProjectFromFormat(formatId, req.body);
  if (!p) return res.status(404).json({ error: "Format niet gevonden" });
  res.status(201).json(p);
}));

app.put("/api/projects/:id", wrap(async (req, res) => {
  const p = await store.updateProject(req.params.id, req.body);
  if (!p) return res.status(404).json({ error: "Project niet gevonden" });
  res.json(p);
}));

app.delete("/api/projects/:id", wrap(async (req, res) => {
  const ok = await store.deleteProject(req.params.id);
  if (!ok) return res.status(404).json({ error: "Project niet gevonden" });
  res.json({ ok: true });
}));

/* ---------- AI-rapportage (live, Server-Sent Events) ---------- */
app.post("/api/report/stream", async (req, res) => {
  function send(event, data) {
    res.write("event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n");
    if (res.flush) res.flush();
  }
  try {
    const all = await store.getAllProjects();
    const settings = await store.getSettings();
    const facts = buildFacts(all, settings, req.body || {});

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // schakel proxy-buffering uit
    if (res.flushHeaders) res.flushHeaders();

    send("facts", facts);
    const result = await streamNarrative(facts, (chunk) => send("delta", chunk));
    send("done", { aiUsed: result.aiUsed, markdown: result.markdown });
    res.end();
  } catch (e) {
    console.error(e);
    try { send("error", { message: e.message }); res.end(); }
    catch (_) { if (!res.headersSent) res.status(500).json({ error: e.message }); }
  }
});

/* ---------- Export ---------- */
app.get("/api/projects/:id/export.xlsx", wrap(async (req, res) => {
  const p = await store.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: "Project niet gevonden" });
  const buf = await exportExcel(p);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="TSB ${safeName(p.name)}.xlsx"`);
  res.send(Buffer.from(buf));
}));

app.get("/api/projects/:id/export.pdf", wrap(async (req, res) => {
  const p = await store.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: "Project niet gevonden" });
  const buf = await exportPdf(p);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="TSB ${safeName(p.name)}.pdf"`);
  res.send(buf);
}));

// Lokaal/als server starten; op Vercel wordt de app als handler geïmporteerd.
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`\n  HVP-TSB draait op  http://localhost:${PORT}\n`);
  });
}

module.exports = app;

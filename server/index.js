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

store.load();

const app = express();
app.use(express.json({ limit: "10mb" }));

const PUBLIC_DIR = path.join(__dirname, "..", "public");
app.use(express.static(PUBLIC_DIR));

function safeName(s) {
  return String(s || "tsb").replace(/[^a-z0-9_\- ]/gi, "_").trim() || "tsb";
}

/* ---------- Instellingen ---------- */
app.get("/api/settings", (req, res) => res.json(store.getSettings()));
app.put("/api/settings", (req, res) => res.json(store.updateSettings(req.body)));

/* ---------- Formats ---------- */
app.get("/api/formats", (req, res) => res.json(store.listFormats()));

app.get("/api/formats/:id", (req, res) => {
  const f = store.getFormat(req.params.id);
  if (!f) return res.status(404).json({ error: "Format niet gevonden" });
  res.json(f);
});

app.post("/api/formats", (req, res) => {
  const f = store.createFormat(req.body);
  res.status(201).json(f);
});

app.put("/api/formats/:id", (req, res) => {
  const f = store.updateFormat(req.params.id, req.body);
  if (!f) return res.status(404).json({ error: "Format niet gevonden" });
  res.json(f);
});

app.post("/api/formats/:id/duplicate", (req, res) => {
  const f = store.getFormat(req.params.id);
  if (!f) return res.status(404).json({ error: "Format niet gevonden" });
  const copy = JSON.parse(JSON.stringify(f));
  copy.name = (f.name || "Format") + " (kopie)";
  delete copy.id;
  res.status(201).json(store.createFormat(copy));
});

app.delete("/api/formats/:id", (req, res) => {
  const ok = store.deleteFormat(req.params.id);
  if (!ok) return res.status(404).json({ error: "Format niet gevonden" });
  res.json({ ok: true });
});

/* ---------- Projecten ---------- */
app.get("/api/projects", (req, res) => res.json(store.listProjects()));

app.get("/api/projects/full", (req, res) => res.json(store.getAllProjects()));

app.get("/api/projects/:id", (req, res) => {
  const p = store.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: "Project niet gevonden" });
  res.json(p);
});

app.post("/api/projects", (req, res) => {
  const { formatId } = req.body || {};
  if (!formatId) return res.status(400).json({ error: "formatId is verplicht" });
  const p = store.createProjectFromFormat(formatId, req.body);
  if (!p) return res.status(404).json({ error: "Format niet gevonden" });
  res.status(201).json(p);
});

app.put("/api/projects/:id", (req, res) => {
  const p = store.updateProject(req.params.id, req.body);
  if (!p) return res.status(404).json({ error: "Project niet gevonden" });
  res.json(p);
});

app.delete("/api/projects/:id", (req, res) => {
  const ok = store.deleteProject(req.params.id);
  if (!ok) return res.status(404).json({ error: "Project niet gevonden" });
  res.json({ ok: true });
});

/* ---------- Export ---------- */
app.get("/api/projects/:id/export.xlsx", async (req, res) => {
  const p = store.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: "Project niet gevonden" });
  try {
    const buf = await exportExcel(p);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="TSB ${safeName(p.name)}.xlsx"`);
    res.send(Buffer.from(buf));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Excel-export mislukt: " + e.message });
  }
});

app.get("/api/projects/:id/export.pdf", async (req, res) => {
  const p = store.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: "Project niet gevonden" });
  try {
    const buf = await exportPdf(p);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="TSB ${safeName(p.name)}.pdf"`);
    res.send(buf);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "PDF-export mislukt: " + e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  HVP-TSB draait op  http://localhost:${PORT}\n`);
});

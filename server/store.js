/*
 * Opslag voor formats en projecten (als JSONB-documenten).
 *  - Met DATABASE_URL (Neon / Postgres): persistente opslag in de database.
 *  - Zonder DATABASE_URL: lokaal bestand data/db.json (met seed.json fallback).
 * Bij een lege database wordt eenmalig geseed vanuit data/seed.json.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
const SEED_FILE = path.join(DATA_DIR, "seed.json");
// Schrijfbare opslag voor de bestand-backend: lokaal data/db.json; op Vercel /tmp.
const WRITABLE_FILE = process.env.VERCEL ? "/tmp/hvp-tsb-db.json" : path.join(DATA_DIR, "db.json");

// Connectiestring kan onder verschillende namen staan (Neon/Vercel-integratie).
const PG_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  "";
const USE_PG = !!PG_URL;
let sql = null;
if (USE_PG) {
  const { neon } = require("@neondatabase/serverless");
  sql = neon(PG_URL);
}

function uid() {
  return crypto.randomUUID();
}
function nowIso() {
  return new Date().toISOString();
}
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return null;
  }
}
function loadSeed() {
  const data = fs.existsSync(SEED_FILE) ? readJson(SEED_FILE) : null;
  return data || { formats: [buildSeedFormat()], projects: [], settings: { capacityPerWeek: {} } };
}

/* ---------------- Initialisatie (lazy, één keer per proces) ---------------- */
let readyPromise = null;
function ready() {
  if (!readyPromise) readyPromise = init();
  return readyPromise;
}
async function init() {
  return USE_PG ? pgInit() : fileInit();
}

async function pgInit() {
  await sql`CREATE TABLE IF NOT EXISTS formats  (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS projects (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS settings (id text PRIMARY KEY, data jsonb NOT NULL)`;
  const c = await sql`SELECT count(*)::int AS n FROM formats`;
  if (c[0].n === 0) {
    const seed = loadSeed();
    for (const f of seed.formats || []) {
      await sql`INSERT INTO formats (id, data) VALUES (${f.id}, ${JSON.stringify(f)}::jsonb) ON CONFLICT (id) DO NOTHING`;
    }
    for (const p of seed.projects || []) {
      await sql`INSERT INTO projects (id, data) VALUES (${p.id}, ${JSON.stringify(p)}::jsonb) ON CONFLICT (id) DO NOTHING`;
    }
    const s = seed.settings || { capacityPerWeek: {} };
    await sql`INSERT INTO settings (id, data) VALUES ('global', ${JSON.stringify(s)}::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`;
    console.log("Neon: lege database geseed vanuit seed.json");
  }
}

/* ---------------- Bestand-backend (lokaal) ---------------- */
let db = { formats: [], projects: [], settings: { capacityPerWeek: {} } };

function ensureDir() {
  try {
    const dir = path.dirname(WRITABLE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (e) { /* read-only FS */ }
}
function fileInit() {
  ensureDir();
  let data = fs.existsSync(WRITABLE_FILE) ? readJson(WRITABLE_FILE) : null;
  if (!data && fs.existsSync(SEED_FILE)) data = readJson(SEED_FILE);
  db = data || { formats: [], projects: [] };
  if (!db.formats) db.formats = [];
  if (!db.projects) db.projects = [];
  if (!db.settings) db.settings = { capacityPerWeek: {} };
  if (!db.settings.capacityPerWeek) db.settings.capacityPerWeek = {};
  if (db.formats.length === 0) {
    db.formats.push(buildSeedFormat());
    fileSave();
  }
}
function fileSave() {
  try {
    ensureDir();
    const tmp = WRITABLE_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, WRITABLE_FILE);
  } catch (e) {
    console.warn("Opslaan niet mogelijk (read-only FS), alleen in-memory:", e.message);
  }
}

/* ---------------- Formats ---------------- */
function summaryFormat(f) {
  return {
    id: f.id, name: f.name, createdAt: f.createdAt, updatedAt: f.updatedAt,
    roleCount: (f.roles || []).length, sectionCount: (f.sections || []).length,
  };
}

async function listFormats() {
  await ready();
  if (USE_PG) { const rows = await sql`SELECT data FROM formats`; return rows.map((r) => summaryFormat(r.data)); }
  return db.formats.map(summaryFormat);
}

async function getFormat(id) {
  await ready();
  if (USE_PG) { const r = await sql`SELECT data FROM formats WHERE id = ${id}`; return r[0] ? r[0].data : null; }
  return db.formats.find((f) => f.id === id) || null;
}

async function createFormat(data) {
  await ready();
  const f = normalizeFormat(data || {});
  f.id = uid();
  f.createdAt = nowIso();
  f.updatedAt = f.createdAt;
  if (USE_PG) await sql`INSERT INTO formats (id, data) VALUES (${f.id}, ${JSON.stringify(f)}::jsonb)`;
  else { db.formats.push(f); fileSave(); }
  return f;
}

async function updateFormat(id, data) {
  await ready();
  const existing = await getFormat(id);
  if (!existing) return null;
  const f = normalizeFormat(data || {});
  f.id = id;
  f.createdAt = existing.createdAt;
  f.updatedAt = nowIso();
  if (USE_PG) await sql`UPDATE formats SET data = ${JSON.stringify(f)}::jsonb, updated_at = now() WHERE id = ${id}`;
  else { const idx = db.formats.findIndex((x) => x.id === id); db.formats[idx] = f; fileSave(); }
  return f;
}

async function deleteFormat(id) {
  await ready();
  if (USE_PG) { const r = await sql`DELETE FROM formats WHERE id = ${id} RETURNING id`; return r.length > 0; }
  const before = db.formats.length;
  db.formats = db.formats.filter((f) => f.id !== id);
  const changed = db.formats.length !== before;
  if (changed) fileSave();
  return changed;
}

/* ---------------- Projecten ---------------- */
function summaryProject(p) {
  return {
    id: p.id, name: p.name, client: p.client, projectNumber: p.projectNumber,
    date: p.date, formatName: p.formatName, createdAt: p.createdAt, updatedAt: p.updatedAt,
  };
}

async function listProjects() {
  await ready();
  if (USE_PG) { const rows = await sql`SELECT data FROM projects`; return rows.map((r) => summaryProject(r.data)); }
  return db.projects.map(summaryProject);
}

async function getProject(id) {
  await ready();
  if (USE_PG) { const r = await sql`SELECT data FROM projects WHERE id = ${id}`; return r[0] ? r[0].data : null; }
  return db.projects.find((p) => p.id === id) || null;
}

async function getAllProjects() {
  await ready();
  if (USE_PG) { const rows = await sql`SELECT data FROM projects`; return rows.map((r) => r.data); }
  return db.projects;
}

async function createProjectFromFormat(formatId, meta) {
  await ready();
  const fmt = await getFormat(formatId);
  if (!fmt) return null;
  const clone = JSON.parse(JSON.stringify(fmt));
  const project = {
    id: uid(),
    name: (meta && meta.name) || "Nieuw project",
    client: (meta && meta.client) || "",
    projectNumber: (meta && meta.projectNumber) || "",
    date: (meta && meta.date) || nowIso().slice(0, 10),
    notes: (meta && meta.notes) || "",
    formatId: fmt.id,
    formatName: fmt.name,
    roles: clone.roles,
    sections: clone.sections,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  // Zorg dat elk item een hoeveelheid heeft.
  (project.sections || []).forEach((s) =>
    (s.groups || []).forEach((g) =>
      (g.items || []).forEach((it) => { if (it.quantity == null) it.quantity = 0; })
    )
  );
  if (USE_PG) await sql`INSERT INTO projects (id, data) VALUES (${project.id}, ${JSON.stringify(project)}::jsonb)`;
  else { db.projects.push(project); fileSave(); }
  return project;
}

async function updateProject(id, data) {
  await ready();
  const existing = await getProject(id);
  if (!existing) return null;
  const merged = Object.assign({}, existing, data, { id, createdAt: existing.createdAt, updatedAt: nowIso() });
  if (USE_PG) await sql`UPDATE projects SET data = ${JSON.stringify(merged)}::jsonb, updated_at = now() WHERE id = ${id}`;
  else { const idx = db.projects.findIndex((p) => p.id === id); db.projects[idx] = merged; fileSave(); }
  return merged;
}

async function deleteProject(id) {
  await ready();
  if (USE_PG) { const r = await sql`DELETE FROM projects WHERE id = ${id} RETURNING id`; return r.length > 0; }
  const before = db.projects.length;
  db.projects = db.projects.filter((p) => p.id !== id);
  const changed = db.projects.length !== before;
  if (changed) fileSave();
  return changed;
}

/* ---------------- Instellingen ---------------- */
async function getSettings() {
  await ready();
  if (USE_PG) { const r = await sql`SELECT data FROM settings WHERE id = 'global'`; return r[0] ? r[0].data : { capacityPerWeek: {} }; }
  return db.settings;
}

async function updateSettings(data) {
  await ready();
  if (USE_PG) {
    const cur = await getSettings();
    const merged = Object.assign({}, cur, data || {});
    if (!merged.capacityPerWeek) merged.capacityPerWeek = {};
    await sql`INSERT INTO settings (id, data) VALUES ('global', ${JSON.stringify(merged)}::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`;
    return merged;
  }
  db.settings = Object.assign({}, db.settings, data || {});
  if (!db.settings.capacityPerWeek) db.settings.capacityPerWeek = {};
  fileSave();
  return db.settings;
}

/* ---------------- Normalisatie ---------------- */

function normalizeFormat(data) {
  const roles = (data.roles || []).map((r) => ({
    id: r.id || uid(),
    code: r.code || "",
    name: r.name || "",
    rate: Number(r.rate) || 0,
  }));
  const sections = (data.sections || []).map((s) => ({
    id: s.id || uid(),
    code: s.code || "",
    name: s.name || "",
    groups: (s.groups || []).map((g) => ({
      id: g.id || uid(),
      name: g.name || "",
      items: (g.items || []).map((it) => normalizeItem(it, roles)),
    })),
  }));
  return { name: data.name || "Naamloos format", roles, sections };
}

function normalizeItem(it, roles) {
  const inzet = {};
  roles.forEach((r) => {
    inzet[r.id] = Number((it.inzet || {})[r.id]) || 0;
  });
  const unit = it.unit || "st";
  return {
    id: it.id || uid(),
    name: it.name || "",
    unit,
    inzetLabel: it.inzetLabel || "uur/" + unit,
    priceUnit: it.priceUnit || undefined,
    priceFactor: it.priceFactor != null ? Number(it.priceFactor) : undefined,
    inzet,
    quantity: it.quantity != null ? Number(it.quantity) : undefined,
  };
}

/* ---------------- Seed format (uit het CSV) ---------------- */

function buildSeedFormat() {
  const roleDefs = [
    ["110010", "PL/PM", 150],
    ["110020", "Aanspreek TM", 140],
    ["110030", "Aanspreek OM", 130],
    ["110040", "Aanspreek Proces", 130],
    ["122010", "Junior Engineer", 100],
    ["122020", "Medior Engineer", 120],
    ["122011", "Tekenaar", 100],
    ["122021", "Uitvoerder", 100],
    ["124010", "Werkvoorbereider", 100],
    ["124020", "Calculator", 100],
    ["122030", "Boorspecialist", 100],
    ["123030", "Adviseur vergunningen", 100],
    ["124011", "Risicomanager", 100],
    ["124012", "Planner", 100],
  ];
  const roles = roleDefs.map(([code, name, rate]) => ({ id: uid(), code, name, rate }));
  const roleByName = {};
  roles.forEach((r) => (roleByName[r.name] = r.id));

  function item(name, unit, inzet) {
    const inz = {};
    roles.forEach((r) => (inz[r.id] = 0));
    if (inzet) Object.keys(inzet).forEach((nm) => { if (roleByName[nm]) inz[roleByName[nm]] = inzet[nm]; });
    return {
      id: uid(),
      name,
      unit,
      inzetLabel: "uur/" + unit,
      inzet: inz,
    };
  }

  const sections = [
    {
      id: uid(),
      code: "402010",
      name: "Flexibele schil VO-fase",
      groups: [
        {
          id: uid(),
          name: "Ontwerpen VO",
          items: [
            item("Opstellen VO-tekeningen", "km", { "PL/PM": 5, "Aanspreek TM": 3, "Aanspreek OM": 1 }),
            item("Opstellen ontwerpnota", "km", { "PL/PM": 2 }),
            item("Opstellen raakvlakkenregister", "st"),
            item("Opstellen trade-off matrix", "st"),
            item("Vaststellen VO", "keer"),
            item("VO in GIS verwerken", "km"),
          ],
        },
        {
          id: uid(),
          name: "Werkplannen en overige documenten",
          items: [
            item("Proefsleuvenplan", "km"),
            item("Rapport proefsleuvenonderzoek", "km"),
            item("Materiaallijst", "km"),
            item("VGM plan ontwerpfase VO", "st"),
            item("VO-begroting", "st"),
            item("Projectplanning", "km"),
            item("Eisenverificatie", "st"),
            item("Offertes aanvragen bodemonderzoeken", "st"),
            item("Vergunningenoverzicht", "st"),
          ],
        },
        {
          id: uid(),
          name: "Periodieke acties",
          items: [
            item("Weekly", "week"),
            item("Bouwteamplanning actualiseren", "week"),
            item("Risicomanagement", "week"),
          ],
        },
      ],
    },
    {
      id: uid(),
      code: "402020",
      name: "Flexibele schil DO-fase",
      groups: [
        {
          id: uid(),
          name: "Ontwerpen DO",
          items: [
            item("Opstellen DO-tekeningen", "km"),
            item("Opstellen ontwerpnota", "km"),
            item("Opstellen raakvlakkenregister", "st"),
            item("Opstellen trade-off matrix", "st"),
            item("Vooroverleg 1 OIV-er - assistentie", "keer"),
            item("Vaststellen DO", "keer"),
            item("DO in GIS verwerken", "km"),
          ],
        },
        {
          id: uid(),
          name: "Werkplannen en overige documenten",
          items: [
            item("Proefsleuvenplan", "km"),
            item("Rapport proefsleuvenonderzoek", "km"),
            item("Boorprofiel", "st"),
            item("Boorplan", "st"),
            item("Materiaallijst", "km"),
            item("VGM plan ontwerpfase DO (update)", "st"),
            item("DO-begroting", "st"),
            item("Projectplanning", "km"),
            item("Eisenverificatie", "st"),
            item("Offertes aanvragen bodemonderzoeken", "st"),
            item("Vergunningenoverzicht", "st"),
            item("Vergunningsaanvragen indienen", "st"),
            item("Vergunningsaanvragen opvolgen + bespreken + dossier", "st"),
            item("Opstellen BLVC-plan", "st"),
          ],
        },
        {
          id: uid(),
          name: "Periodieke acties",
          items: [
            item("Weekly", "week"),
            item("Bouwteamplanning actualiseren", "week"),
            item("Risicomanagement", "week"),
            item("Stakeholdersmanagement", "week"),
          ],
        },
      ],
    },
    {
      id: uid(),
      code: "402030",
      name: "Flexibele schil UO-fase",
      groups: [
        {
          id: uid(),
          name: "Ontwerpen UO",
          items: [
            item("Opstellen UO-tekeningen", "km"),
            item("Opstellen ontwerpnota", "km"),
            item("Opstellen raakvlakkenregister", "st"),
            item("Opstellen trade-off matrix", "st"),
            item("Vooroverleg OIV-er - assistentie", "keer"),
            item("Vaststellen UO", "keer"),
            item("UO in GIS verwerken", "km"),
          ],
        },
        {
          id: uid(),
          name: "Werkplannen en overige documenten",
          items: [
            item("Algemeen werkplan", "st"),
            item("Civiele werkplannen", "st"),
            item("Keuringsplan", "st"),
            item("Maatregelenplan K&L derden CROW500", "st"),
            item("Materiaallijst", "km"),
            item("VGM plan ontwerpfase UO (update)", "st"),
            item("UO-begroting", "st"),
            item("Projectplanning", "km"),
            item("Eisenverificatie", "st"),
            item("Offertes aanvragen bodemonderzoeken", "st"),
            item("Vergunningenoverzicht updaten", "st"),
            item("Vaststellen maatregelen tbv vergunningen in uitvoeringsdocumenten", "st"),
            item("Projectspecifiek inrichten klachtenprocedure", "st"),
            item("Inkopen uitvoeringsbegeleiding onderzoeken", "keer"),
          ],
        },
        {
          id: uid(),
          name: "Periodieke acties",
          items: [
            item("Weekly", "week"),
            item("Bouwteamplanning actualiseren", "week"),
            item("Risicomanagement", "week"),
            item("Stakeholdersmanagement", "week"),
          ],
        },
      ],
    },
  ];

  return {
    id: uid(),
    name: "Standaard TSB-format (VO/DO/UO)",
    roles,
    sections,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

module.exports = {
  load: ready,
  init: ready,
  getSettings,
  updateSettings,
  listFormats,
  getFormat,
  createFormat,
  updateFormat,
  deleteFormat,
  listProjects,
  getProject,
  getAllProjects,
  createProjectFromFormat,
  updateProject,
  deleteProject,
};

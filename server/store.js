/*
 * Eenvoudige, robuuste JSON-opslag (geen externe database nodig).
 * Data wordt centraal bewaard in data/db.json zodat collega's die op
 * dezelfde server werken hetzelfde format en dezelfde projecten delen.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

function uid() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db = { formats: [], projects: [] };

function load() {
  ensureDir();
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    } catch (e) {
      console.error("Kon db.json niet lezen, start met lege database:", e.message);
      db = { formats: [], projects: [] };
    }
  }
  if (!db.formats) db.formats = [];
  if (!db.projects) db.projects = [];
  if (!db.settings) db.settings = { capacityPerWeek: {} };
  if (!db.settings.capacityPerWeek) db.settings.capacityPerWeek = {};
  if (db.formats.length === 0) {
    db.formats.push(buildSeedFormat());
    save();
  }
}

/* ---------------- Instellingen ---------------- */
function getSettings() {
  return db.settings;
}
function updateSettings(data) {
  db.settings = Object.assign({}, db.settings, data || {});
  if (!db.settings.capacityPerWeek) db.settings.capacityPerWeek = {};
  save();
  return db.settings;
}

function save() {
  ensureDir();
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE); // atomaire vervanging
}

/* ---------------- Formats ---------------- */

function listFormats() {
  return db.formats.map((f) => ({
    id: f.id,
    name: f.name,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    roleCount: (f.roles || []).length,
    sectionCount: (f.sections || []).length,
  }));
}

function getFormat(id) {
  return db.formats.find((f) => f.id === id) || null;
}

function createFormat(data) {
  const f = normalizeFormat(data || {});
  f.id = uid();
  f.createdAt = nowIso();
  f.updatedAt = f.createdAt;
  db.formats.push(f);
  save();
  return f;
}

function updateFormat(id, data) {
  const idx = db.formats.findIndex((f) => f.id === id);
  if (idx === -1) return null;
  const f = normalizeFormat(data || {});
  f.id = id;
  f.createdAt = db.formats[idx].createdAt;
  f.updatedAt = nowIso();
  db.formats[idx] = f;
  save();
  return f;
}

function deleteFormat(id) {
  const before = db.formats.length;
  db.formats = db.formats.filter((f) => f.id !== id);
  const changed = db.formats.length !== before;
  if (changed) save();
  return changed;
}

/* ---------------- Projecten ---------------- */

function listProjects() {
  return db.projects.map((p) => ({
    id: p.id,
    name: p.name,
    client: p.client,
    projectNumber: p.projectNumber,
    date: p.date,
    formatName: p.formatName,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));
}

function getProject(id) {
  return db.projects.find((p) => p.id === id) || null;
}

function getAllProjects() {
  return db.projects;
}

function createProjectFromFormat(formatId, meta) {
  const fmt = getFormat(formatId);
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
      (g.items || []).forEach((it) => {
        if (it.quantity == null) it.quantity = 0;
      })
    )
  );
  db.projects.push(project);
  save();
  return project;
}

function updateProject(id, data) {
  const idx = db.projects.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const existing = db.projects[idx];
  const merged = Object.assign({}, existing, data, {
    id,
    createdAt: existing.createdAt,
    updatedAt: nowIso(),
  });
  db.projects[idx] = merged;
  save();
  return merged;
}

function deleteProject(id) {
  const before = db.projects.length;
  db.projects = db.projects.filter((p) => p.id !== id);
  const changed = db.projects.length !== before;
  if (changed) save();
  return changed;
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
  load,
  save,
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

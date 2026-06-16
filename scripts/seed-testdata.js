/*
 * Vult de app met realistische testdata voor 20kV middenspannings-
 * netuitbreidingsprojecten (incl. MS-stations) in de Noordoostpolder
 * en Friesland-Zuid.
 *
 *  - 1 realistisch format: "Netuitbreiding 20kV MS incl. stations (VO/DO/UO)"
 *  - 4 demoprojecten: Urk-Noord, Lemmer, Wolvega, Joure (20-35 km)
 *
 * Draai de server (npm start) en voer dan uit: node scripts/seed-testdata.js
 */
const BASE = process.env.BASE || "http://localhost:3000";
const TSB = require("../public/compute.js");

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(method + " " + path + " -> " + res.status + " " + (await res.text()));
  return res.json();
}

/* ---------------- Rollen ---------------- */
const ROLES = [
  ["110010", "PL/PM", 150],
  ["110020", "Asset / Technisch Manager", 140],
  ["110030", "Omgevingsmanager", 130],
  ["110040", "Procesmanager", 130],
  ["122010", "Junior Engineer", 95],
  ["122020", "Medior Engineer E-techniek", 120],
  ["122025", "Netberekenaar 20kV", 125],
  ["122011", "Tekenaar", 95],
  ["124010", "Werkvoorbereider", 100],
  ["124015", "Uitvoeringsbegeleider", 105],
  ["124020", "Calculator", 100],
  ["122030", "Boorspecialist (HDD)", 110],
  ["123030", "Adviseur vergunningen", 110],
  ["123035", "Grondverwerver / Zakelijk recht", 110],
  ["124011", "Risicomanager", 120],
  ["124012", "Planner", 100],
];
const roleId = {}; // naam -> id
const roles = ROLES.map(([code, name, rate], i) => {
  const id = "r" + (i + 1);
  roleId[name] = id;
  return { id, code, name, rate };
});

function item(name, unit, inzetByName) {
  const inzet = {};
  roles.forEach((r) => (inzet[r.id] = 0));
  Object.keys(inzetByName || {}).forEach((nm) => {
    if (roleId[nm] != null) inzet[roleId[nm]] = inzetByName[nm];
    else throw new Error("Onbekende rol in inzet: " + nm);
  });
  return { name, unit, inzetLabel: "uur/" + unit, inzet };
}

/* ---------------- Structuur (VO / DO / UO) ---------------- */
const sections = [
  {
    code: "402010",
    name: "Voorontwerp (VO) – tracé & stationslocaties",
    groups: [
      {
        name: "Ontwerp 20kV MS-verbinding",
        items: [
          item("Tracéstudie 20kV MS-verbinding", "km", { "Medior Engineer E-techniek": 3, "Junior Engineer": 4, "Tekenaar": 2, "PL/PM": 0.5 }),
          item("Opstellen VO-tracétekeningen", "km", { "Tekenaar": 5, "Junior Engineer": 3, "Medior Engineer E-techniek": 1 }),
          item("Netberekening / belastingstudie 20kV", "st", { "Netberekenaar 20kV": 40, "Medior Engineer E-techniek": 8 }),
          item("Locatiestudie MS-stations", "st", { "Medior Engineer E-techniek": 16, "Adviseur vergunningen": 8, "Omgevingsmanager": 6 }),
          item("Opstellen ontwerpnota VO", "st", { "Medior Engineer E-techniek": 16, "PL/PM": 4 }),
          item("Raakvlakkenanalyse K&L derden", "km", { "Junior Engineer": 1.5, "Medior Engineer E-techniek": 0.5 }),
          item("Trade-off matrix tracévarianten", "st", { "Medior Engineer E-techniek": 12, "PL/PM": 4 }),
          item("Vaststellen VO", "keer", { "PL/PM": 8, "Asset / Technisch Manager": 6, "Medior Engineer E-techniek": 4 }),
        ],
      },
      {
        name: "Onderzoeken & vergunningen",
        items: [
          item("KLIC-melding en inventarisatie K&L", "km", { "Werkvoorbereider": 1 }),
          item("Vooronderzoek bodem / archeologie / NGE", "km", { "Adviseur vergunningen": 1 }),
          item("Vergunningenscan & omgevingsanalyse", "st", { "Adviseur vergunningen": 24, "Omgevingsmanager": 8 }),
          item("Inventarisatie grondeigenaren / zakelijk recht", "km", { "Grondverwerver / Zakelijk recht": 2 }),
        ],
      },
      {
        name: "Periodieke acties",
        items: [
          item("Projectmanagement", "week", { "PL/PM": 6, "Asset / Technisch Manager": 2 }),
          item("Risicomanagement", "week", { "Risicomanager": 3, "PL/PM": 1 }),
          item("Omgevings- & stakeholdersmanagement", "week", { "Omgevingsmanager": 6 }),
        ],
      },
    ],
  },
  {
    code: "402020",
    name: "Definitief Ontwerp (DO)",
    groups: [
      {
        name: "Detailontwerp",
        items: [
          item("Opstellen DO-tracétekeningen 20kV", "km", { "Tekenaar": 7, "Junior Engineer": 3, "Medior Engineer E-techniek": 1 }),
          item("Detailontwerp MS-stations", "st", { "Medior Engineer E-techniek": 40, "Tekenaar": 24, "Netberekenaar 20kV": 8 }),
          item("Kabelberekening / kortsluitvastheid", "st", { "Netberekenaar 20kV": 24, "Medior Engineer E-techniek": 4 }),
          item("Ontwerp gestuurde boringen (HDD)", "st", { "Boorspecialist (HDD)": 8, "Medior Engineer E-techniek": 2 }),
          item("Dwarsprofielen en detailtekeningen", "km", { "Tekenaar": 3, "Junior Engineer": 2 }),
          item("Materiaalspecificatie 20kV", "km", { "Werkvoorbereider": 2, "Calculator": 1 }),
          item("Opstellen ontwerpnota DO", "st", { "Medior Engineer E-techniek": 16, "PL/PM": 2 }),
          item("DO-begroting", "st", { "Calculator": 40, "PL/PM": 4 }),
          item("Eisenverificatie", "st", { "Medior Engineer E-techniek": 12, "PL/PM": 2 }),
          item("Projectplanning DO", "st", { "Planner": 24, "PL/PM": 4 }),
        ],
      },
      {
        name: "Vergunningen & zakelijk recht",
        items: [
          item("Omgevingsvergunning MS-stations aanvragen", "st", { "Adviseur vergunningen": 24 }),
          item("Vergunningen kabeltracé (wegen/watergangen)", "st", { "Adviseur vergunningen": 16 }),
          item("Zakelijk recht-overeenkomsten opstellen", "km", { "Grondverwerver / Zakelijk recht": 4 }),
        ],
      },
      {
        name: "Periodieke acties",
        items: [
          item("Projectmanagement", "week", { "PL/PM": 6, "Asset / Technisch Manager": 2 }),
          item("Risicomanagement", "week", { "Risicomanager": 3, "PL/PM": 1 }),
          item("Omgevings- & stakeholdersmanagement", "week", { "Omgevingsmanager": 6 }),
        ],
      },
    ],
  },
  {
    code: "402030",
    name: "Uitvoeringsontwerp (UO) & werkvoorbereiding",
    groups: [
      {
        name: "Uitvoeringsdocumenten",
        items: [
          item("UO- / montagetekeningen 20kV", "km", { "Tekenaar": 6, "Junior Engineer": 3 }),
          item("Werkplan kabelaanleg 20kV", "st", { "Werkvoorbereider": 40, "Uitvoeringsbegeleider": 16 }),
          item("Werkplan plaatsing MS-stations", "st", { "Werkvoorbereider": 24, "Uitvoeringsbegeleider": 12 }),
          item("Boorplan HDD detaillering", "st", { "Boorspecialist (HDD)": 12, "Werkvoorbereider": 4 }),
          item("VGM- / V&G-plan ontwerpfase", "st", { "Risicomanager": 16, "Werkvoorbereider": 8 }),
          item("BLVC-plan", "st", { "Adviseur vergunningen": 24, "Omgevingsmanager": 8 }),
          item("Maatregelenplan K&L derden CROW500", "st", { "Adviseur vergunningen": 16, "Werkvoorbereider": 8 }),
          item("Keuringsplan & opleverdossier", "st", { "Werkvoorbereider": 16 }),
          item("UO-begroting / inkoopspecificatie", "st", { "Calculator": 32, "PL/PM": 4 }),
          item("Materiaallijst definitief", "km", { "Werkvoorbereider": 1.5, "Calculator": 1 }),
          item("Revisie- / as-built voorbereiding", "km", { "Tekenaar": 1.5, "Junior Engineer": 1 }),
        ],
      },
      {
        name: "Inkoop & uitvoeringsbegeleiding",
        items: [
          item("Inkoop aannemer & onderaannemers", "keer", { "PL/PM": 16, "Werkvoorbereider": 24, "Calculator": 8 }),
          item("Uitvoeringsbegeleiding voorbereiden", "st", { "Uitvoeringsbegeleider": 24, "PL/PM": 4 }),
        ],
      },
      {
        name: "Periodieke acties",
        items: [
          item("Projectmanagement", "week", { "PL/PM": 6, "Asset / Technisch Manager": 2 }),
          item("Risicomanagement", "week", { "Risicomanager": 3, "PL/PM": 1 }),
          item("Omgevings- & stakeholdersmanagement", "week", { "Omgevingsmanager": 6 }),
          item("Uitvoeringsbegeleiding op de bouw", "week", { "Uitvoeringsbegeleider": 20 }),
        ],
      },
    ],
  },
];

/* ---------------- Demoprojecten ---------------- */
const PROJECTS = [
  { name: "Netuitbreiding 20kV Urk-Noord", client: "Liander N.V.", projectNumber: "LIA-NOP-2026-021",
    date: "2026-02-09", km: 22, stations: 4, phases: { VO: 16, DO: 24, UO: 20 } },
  { name: "Netuitbreiding 20kV Lemmer", client: "Liander N.V.", projectNumber: "LIA-FRL-2026-038",
    date: "2026-03-16", km: 28, stations: 5, phases: { VO: 18, DO: 26 } },
  { name: "Netuitbreiding 20kV Wolvega", client: "Liander N.V.", projectNumber: "LIA-FRL-2026-045",
    date: "2026-01-12", km: 35, stations: 6, phases: { VO: 20, DO: 30, UO: 26 } },
  { name: "Netuitbreiding 20kV Joure", client: "Liander N.V.", projectNumber: "LIA-FRL-2026-052",
    date: "2026-04-27", km: 20, stations: 3, phases: { VO: 14 } },
];

function phaseKey(code) {
  return code === "402010" ? "VO" : code === "402020" ? "DO" : code === "402030" ? "UO" : null;
}

function addDaysStr(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function qtyFor(it, cfg, weeks, active) {
  if (!active) return 0;
  const u = it.unit;
  if (u === "km" || u === "m") return cfg.km;
  if (u === "week") return weeks;
  if (u === "keer") return 1;
  // st: stationsgebonden items schalen met aantal stations
  if (/station/i.test(it.name)) return cfg.stations;
  return 1;
}

// Demodata: geboekte (werkelijke) uren afgeleid van de planning t/m vandaag.
// Per fase wordt het verstreken deel van de begrote uren per rol verdeeld over
// de maanden, met een lichte afwijking zodat begroot != werkelijk.
function buildActuals(proj) {
  const today = new Date();
  const totals = TSB.computeBudget(proj);
  const roleName = {};
  proj.roles.forEach((r) => (roleName[r.id] = r.name));
  const map = {}; // "period|role" -> uren

  proj.sections.forEach((sec, pi) => {
    const sTot = totals.sections.find((s) => s.id === sec.id);
    if (!sTot || sTot.uren <= 0) return;
    const start = new Date((sec.startDate || "") + "T00:00:00");
    const end = new Date((sec.endDate || "") + "T00:00:00");
    if (isNaN(start) || isNaN(end)) return;
    if (today < start) return; // fase nog niet begonnen -> niets geboekt
    const effEnd = today < end ? today : end;
    const durDays = Math.floor((end - start) / 86400000) + 1;

    Object.keys(sTot.perRole).forEach((rid, ri) => {
      const planned = sTot.perRole[rid].duur;
      if (planned <= 0) return;
      const factor = 0.82 + ((ri * 5 + pi * 11) % 28) / 100; // 0.82 - 1.09
      const perDay = (planned / durDays) * factor;
      // verdeel over maanden tussen start en effEnd
      let c = new Date(start.getFullYear(), start.getMonth(), 1);
      while (c <= effEnd) {
        const mStart = new Date(c.getFullYear(), c.getMonth(), 1);
        const mEnd = new Date(c.getFullYear(), c.getMonth() + 1, 0);
        const os = start > mStart ? start : mStart;
        const oe = effEnd < mEnd ? effEnd : mEnd;
        const days = Math.floor((oe - os) / 86400000) + 1;
        if (days > 0) {
          const key = c.getFullYear() + "-" + String(c.getMonth() + 1).padStart(2, "0") + "|" + roleName[rid];
          map[key] = (map[key] || 0) + perDay * days;
        }
        c = new Date(c.getFullYear(), c.getMonth() + 1, 1);
      }
    });
  });

  return Object.keys(map).map((k) => {
    const [period, role] = k.split("|");
    return { period, role, hours: Math.round(map[k] * 10) / 10 };
  }).sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));
}

function projectTotal(p) {
  const rate = {};
  p.roles.forEach((r) => (rate[r.id] = r.rate));
  let total = 0;
  p.sections.forEach((s) => s.groups.forEach((g) => g.items.forEach((it) => {
    p.roles.forEach((r) => (total += (it.inzet[r.id] || 0) * (it.quantity || 0) * rate[r.id]));
  })));
  return total;
}

async function main() {
  // Opruimen: bestaande projecten en formats weg
  const oldProjects = await api("GET", "/api/projects");
  for (const p of oldProjects) await api("DELETE", "/api/projects/" + p.id);
  const oldFormats = await api("GET", "/api/formats");
  for (const f of oldFormats) await api("DELETE", "/api/formats/" + f.id);
  console.log(`Opgeruimd: ${oldProjects.length} project(en), ${oldFormats.length} format(s).`);

  // Format aanmaken
  const fmt = await api("POST", "/api/formats", {
    name: "Netuitbreiding 20kV MS incl. stations (VO/DO/UO)",
    roles, sections,
  });
  let items = 0;
  fmt.sections.forEach((s) => s.groups.forEach((g) => (items += g.items.length)));
  console.log(`Format aangemaakt: ${fmt.roles.length} rollen, ${fmt.sections.length} fasen, ${items} regelitems.`);

  // Projecten aanmaken + hoeveelheden invullen
  for (const cfg of PROJECTS) {
    const created = await api("POST", "/api/projects", {
      formatId: fmt.id, name: cfg.name, client: cfg.client,
      projectNumber: cfg.projectNumber, date: cfg.date,
    });
    const proj = await api("GET", "/api/projects/" + created.id);
    let cursor = cfg.date; // fasen achter elkaar plannen vanaf de projectdatum
    proj.sections.forEach((s) => {
      const pk = phaseKey(s.code);
      const active = pk && cfg.phases[pk] != null;
      const weeks = active ? cfg.phases[pk] : 0;
      s.groups.forEach((g) => g.items.forEach((it) => { it.quantity = qtyFor(it, cfg, weeks, active); }));
      if (active) {
        s.startDate = cursor;
        s.endDate = addDaysStr(cursor, weeks * 7 - 1);
        cursor = addDaysStr(s.endDate, 1);
      }
    });
    proj.actuals = buildActuals(proj);
    const saved = await api("PUT", "/api/projects/" + proj.id, proj);
    const geboekt = proj.actuals.reduce((a, e) => a + e.hours, 0);
    console.log(`Project '${cfg.name}': ${cfg.km} km, ${cfg.stations} stations, fasen ${Object.keys(cfg.phases).join("+")} -> € ${projectTotal(saved).toLocaleString("nl-NL", { minimumFractionDigits: 2 })}  |  geboekt ${Math.round(geboekt)} u`);
  }
  console.log("\nKlaar. Ververs de app om de testdata te zien.");
}

main().catch((e) => { console.error("FOUT:", e.message); process.exit(1); });

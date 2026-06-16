/*
 * Genereert managementrapportages over de TSB-projecten.
 *  - buildFacts(): rekent de cijfers uit (begroot, werkelijk, per rol/fase/maand).
 *  - generateNarrative(): laat Claude de analyse/tekst schrijven (AI).
 *  - fallbackNarrative(): nette tekst zonder AI (als ANTHROPIC_API_KEY ontbreekt).
 */
const TSB = require("../public/compute.js");

const MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const DAY = 86400000;

function phaseKey(sec) {
  if (sec.code === "402010") return "VO";
  if (sec.code === "402020") return "DO";
  if (sec.code === "402030") return "UO";
  return (sec.name || "fase").slice(0, 6);
}
function monthLabel(m) {
  if (!m) return "Volledige looptijd";
  const [y, mm] = m.split("-");
  return MONTHS[parseInt(mm, 10) - 1] + " " + y;
}
function round(n) { return Math.round(n || 0); }

/* ---------------- Feiten/cijfers ---------------- */
function buildFacts(allProjects, settings, opts) {
  opts = opts || {};
  const ids = opts.projectIds && opts.projectIds.length ? new Set(opts.projectIds) : null;
  const projects = (allProjects || []).filter((p) => !ids || ids.has(p.id));
  const month = opts.month || null;
  const cap = (settings && settings.capacityPerWeek) || {};
  const today = new Date();

  const portfolio = { projectCount: projects.length, begrootBedrag: 0, begrootUren: 0, werkelijkUren: 0, werkelijkBedrag: 0, maandWerkelijkUren: 0, maandWerkelijkBedrag: 0 };
  const roleAgg = {};
  const phaseAgg = {};
  const monthPlan = {};
  const projectFacts = [];

  function ensureRole(n) {
    if (!roleAgg[n]) roleAgg[n] = { name: n, begrootUren: 0, werkelijkUren: 0, begrootBedrag: 0, werkelijkBedrag: 0, maandUren: 0, capPerWeek: cap[n] != null ? cap[n] : null };
    return roleAgg[n];
  }

  let monthStart = null, monthEnd = null;
  if (month) {
    const [y, mm] = month.split("-").map(Number);
    monthStart = new Date(y, mm - 1, 1);
    monthEnd = new Date(y, mm, 0);
  }

  projects.forEach((p) => {
    const t = TSB.computeBudget(p);
    const roleName = {}, rate = {};
    p.roles.forEach((r) => { roleName[r.id] = r.name; rate[r.name] = r.rate; });
    portfolio.begrootBedrag += t.grand.bedrag;
    portfolio.begrootUren += t.grand.uren;

    t.sections.forEach((s) => {
      const sec = p.sections.find((x) => x.id === s.id);
      const pk = phaseKey(sec);
      if (!phaseAgg[pk]) phaseAgg[pk] = { key: pk, bedrag: 0, uren: 0 };
      phaseAgg[pk].bedrag += s.bedrag;
      phaseAgg[pk].uren += s.uren;
      Object.keys(s.perRole).forEach((rid) => {
        const ra = ensureRole(roleName[rid]);
        ra.begrootUren += s.perRole[rid].duur;
        ra.begrootBedrag += s.perRole[rid].bedrag;
      });
      // maandplanning: verdeel fase-uren per rol over de looptijd, neem deze maand
      if (month) {
        const sec2 = p.sections.find((x) => x.id === s.id);
        const sd = sec2.startDate ? new Date(sec2.startDate + "T00:00:00") : null;
        const ed = sec2.endDate ? new Date(sec2.endDate + "T00:00:00") : null;
        if (sd && ed && ed >= sd) {
          const totalDays = Math.floor((ed - sd) / DAY) + 1;
          const os = sd > monthStart ? sd : monthStart;
          const oe = ed < monthEnd ? ed : monthEnd;
          const overlap = Math.floor((oe - os) / DAY) + 1;
          if (overlap > 0) {
            Object.keys(s.perRole).forEach((rid) => {
              const frac = s.perRole[rid].duur / totalDays * overlap;
              const nm = roleName[rid];
              monthPlan[nm] = (monthPlan[nm] || 0) + frac;
            });
          }
        }
      }
    });

    let actUren = 0, actBedrag = 0, monthUren = 0;
    (p.actuals || []).forEach((a) => {
      actUren += a.hours;
      const b = a.hours * (rate[a.role] || 0);
      actBedrag += b;
      const ra = ensureRole(a.role);
      ra.werkelijkUren += a.hours;
      ra.werkelijkBedrag += b;
      if (month && a.period === month) {
        monthUren += a.hours;
        ra.maandUren += a.hours;
        portfolio.maandWerkelijkUren += a.hours;
        portfolio.maandWerkelijkBedrag += b;
      }
    });
    portfolio.werkelijkUren += actUren;
    portfolio.werkelijkBedrag += actBedrag;

    const phases = [];
    (p.sections || []).forEach((sec) => {
      const st = t.sections.find((x) => x.id === sec.id);
      if (!st || st.uren <= 0) return;
      let status = "—";
      if (sec.startDate && sec.endDate) {
        const sd = new Date(sec.startDate + "T00:00:00"), ed = new Date(sec.endDate + "T00:00:00");
        status = today < sd ? "gepland" : today > ed ? "afgerond" : "lopend";
      }
      phases.push({ key: phaseKey(sec), name: sec.name, start: sec.startDate || null, end: sec.endDate || null, uren: round(st.uren), bedrag: round(st.bedrag), status });
    });

    projectFacts.push({
      id: p.id, name: p.name, client: p.client, projectNumber: p.projectNumber,
      begrootBedrag: round(t.grand.bedrag), begrootUren: round(t.grand.uren),
      werkelijkUren: round(actUren), werkelijkBedrag: round(actBedrag),
      pctBesteed: t.grand.uren > 0 ? Math.round(actUren / t.grand.uren * 100) : 0,
      maandUren: round(monthUren), phases,
    });
  });

  const roles = Object.values(roleAgg).filter((r) => r.begrootUren > 0 || r.werkelijkUren > 0)
    .map((r) => ({ name: r.name, begrootUren: round(r.begrootUren), werkelijkUren: round(r.werkelijkUren), begrootBedrag: round(r.begrootBedrag), werkelijkBedrag: round(r.werkelijkBedrag), maandUren: round(r.maandUren), capPerWeek: r.capPerWeek }))
    .sort((a, b) => b.begrootUren - a.begrootUren);

  const phases = Object.values(phaseAgg).map((p) => ({ key: p.key, bedrag: round(p.bedrag), uren: round(p.uren) }));

  let monthPlanning = null;
  if (month) {
    const daysInMonth = monthEnd.getDate();
    monthPlanning = Object.keys(monthPlan).map((nm) => {
      const planned = monthPlan[nm];
      const capWk = cap[nm];
      const capacityUren = capWk ? capWk * (daysInMonth / 7) : null;
      return { role: nm, plannedUren: round(planned), capacityUren: capacityUren ? round(capacityUren) : null, utilization: capacityUren ? Math.round(planned / capacityUren * 100) : null };
    }).filter((r) => r.plannedUren > 0).sort((a, b) => b.plannedUren - a.plannedUren);
  }

  portfolio.begrootBedrag = round(portfolio.begrootBedrag);
  portfolio.begrootUren = round(portfolio.begrootUren);
  portfolio.werkelijkUren = round(portfolio.werkelijkUren);
  portfolio.werkelijkBedrag = round(portfolio.werkelijkBedrag);
  portfolio.maandWerkelijkUren = round(portfolio.maandWerkelijkUren);
  portfolio.maandWerkelijkBedrag = round(portfolio.maandWerkelijkBedrag);
  portfolio.pctBesteed = portfolio.begrootUren > 0 ? Math.round(portfolio.werkelijkUren / portfolio.begrootUren * 100) : 0;

  return {
    title: opts.title || ("Managementrapportage — " + monthLabel(month)),
    period: month || null,
    periodLabel: monthLabel(month),
    portfolio, projects: projectFacts, roles, phases, monthPlanning,
  };
}

/* ---------------- AI-narratief (streaming Markdown) ---------------- */
const SYSTEM_PROMPT = [
  "Je bent een ervaren projectbeheersings-/PMO-analist bij een ingenieursbureau dat 20kV middenspannings-netuitbreidingen ontwerpt.",
  "Schrijf een uitgebreide, zakelijke managementrapportage in het Nederlands in Markdown, uitsluitend op basis van de aangeleverde cijfers (JSON).",
  "Gebruik exact deze secties als '##'-koppen, in deze volgorde: Managementsamenvatting, Kerncijfers, Projecten, Personeelsbezetting, Risico's, Aanbevelingen, Conclusie.",
  "Onder 'Projecten' geef je per project een '###'-kop met de projectnaam, gevolgd door een korte analyse. Onder 'Risico's' en 'Aanbevelingen' gebruik je opsommingen met '- '.",
  "Begin NIET met een '#'-titel (die staat al boven het rapport). Wees concreet met de werkelijke getallen (euro's, uren, percentages); signaleer over- en onderbesteding en bezettings-/capaciteitsknelpunten. Verzin niets buiten de data.",
].join(" ");

// Streamt de AI-analyse als Markdown. onDelta(chunk) wordt per tekstfragment
// aangeroepen. Geeft { aiUsed, markdown } terug; valt terug op een sjabloon
// wanneer er geen API-sleutel/SDK is of een fout optreedt vóór output.
async function streamNarrative(facts, onDelta) {
  if (!process.env.ANTHROPIC_API_KEY) return { aiUsed: false, markdown: fallbackMarkdown(facts) };
  let Anthropic;
  try {
    const mod = require("@anthropic-ai/sdk");
    Anthropic = mod.default || mod;
  } catch (e) {
    console.warn("Anthropic SDK niet beschikbaar:", e.message);
    return { aiUsed: false, markdown: fallbackMarkdown(facts) };
  }
  const client = new Anthropic();
  const user = [
    "Stel de managementrapportage op voor de periode: " + facts.periodLabel + ".",
    "Hieronder de cijfers als JSON.",
    "",
    JSON.stringify(facts),
  ].join("\n");
  let full = "";
  try {
    const stream = client.messages.stream({
      model: "claude-opus-4-8",
      max_tokens: 12000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: user }],
    });
    stream.on("text", (delta) => { full += delta; if (onDelta) onDelta(delta); });
    await stream.finalMessage();
    return { aiUsed: true, markdown: full };
  } catch (e) {
    console.error("AI-rapportage mislukt:", e.message);
    if (full.trim()) return { aiUsed: true, markdown: full }; // gedeeltelijk resultaat behouden
    return { aiUsed: false, markdown: fallbackMarkdown(facts) };
  }
}

/* ---------------- Markdown-sjabloon zonder AI ---------------- */
function euro(n) { return "€ " + (n || 0).toLocaleString("nl-NL"); }
function fallbackMarkdown(facts) {
  const p = facts.portfolio;
  const lines = [];
  lines.push("## Managementsamenvatting", "");
  lines.push("Deze rapportage beslaat " + facts.periodLabel.toLowerCase() + " en omvat **" + p.projectCount + "** project(en). " +
    "Het totaal begrote bedrag is **" + euro(p.begrootBedrag) + "** (" + p.begrootUren + " uur). " +
    "Tot nu toe is **" + p.werkelijkUren + " uur** geboekt (" + p.pctBesteed + "% van de begrote uren), met een waarde van " + euro(p.werkelijkBedrag) + ".", "");
  lines.push("## Kerncijfers", "");
  lines.push("- Begroot: **" + euro(p.begrootBedrag) + "** / " + p.begrootUren + " uur");
  lines.push("- Werkelijk geboekt: **" + p.werkelijkUren + " uur** (" + euro(p.werkelijkBedrag) + ")");
  if (facts.period) lines.push("- In deze periode geboekt: " + p.maandWerkelijkUren + " uur (" + euro(p.maandWerkelijkBedrag) + ")");
  lines.push("");
  lines.push("## Projecten", "");
  facts.projects.forEach((pr) => {
    lines.push("### " + pr.name);
    lines.push((pr.client ? pr.client + ". " : "") + "Begroot " + euro(pr.begrootBedrag) + " / " + pr.begrootUren +
      " uur; geboekt " + pr.werkelijkUren + " uur (" + pr.pctBesteed + "%). Fasen: " +
      pr.phases.map((f) => f.key + " (" + f.status + ")").join(", ") + ".", "");
  });
  lines.push("## Personeelsbezetting", "");
  lines.push(facts.monthPlanning && facts.monthPlanning.length
    ? "Geplande inzet deze periode per rol: " + facts.monthPlanning.map((r) => r.role + " " + r.plannedUren + " u" + (r.utilization != null ? " (" + r.utilization + "%)" : "")).join("; ") + "."
    : "Stel capaciteit per rol in en kies een maand om de bezetting te analyseren.", "");
  lines.push("## Risico's", "");
  lines.push("- Afwijkingen tussen begrote en werkelijke uren kunnen wijzen op scope- of inschattingsverschillen.");
  lines.push("- Rollen met meer dan 100% bezetting in een maand vormen een planningsrisico.", "");
  lines.push("## Aanbevelingen", "");
  lines.push("- Monitor projecten met een hoog bestedingspercentage maar onafgeronde fasen.");
  lines.push("- Stem de capaciteit per rol af op de piekmaanden in de planning.", "");
  lines.push("## Conclusie", "");
  lines.push("Het portfolio omvat " + p.projectCount + " project(en) met een totale begroting van " + euro(p.begrootBedrag) +
    ". Stel `ANTHROPIC_API_KEY` in voor een uitgebreide AI-analyse.");
  return lines.join("\n");
}

module.exports = { buildFacts, streamNarrative, fallbackMarkdown };

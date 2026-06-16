/* HVP-TSB frontend (vanilla JS, geen build-stap nodig). */
(function () {
  "use strict";

  var UNITS = ["km", "m", "st", "keer", "week", "dag", "uur"];

  var state = {
    view: "projects",
    formats: [],
    projects: [],
    project: null, // huidig geopend project
    format: null, // huidig geopend format
    dirty: false,
  };

  var app = document.getElementById("app");

  /* ---------------- API ---------------- */
  var api = {
    get: function (url) {
      return fetch(url).then(handle);
    },
    send: function (method, url, body) {
      return fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      }).then(handle);
    },
  };
  function handle(r) {
    if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || r.statusText); });
    return r.json();
  }

  /* ---------------- Helpers ---------------- */
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") n.className = attrs[k];
      else if (k === "html") n.innerHTML = attrs[k];
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c == null) return;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return n;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function svgEl(tag, attrs, children) {
    var n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (attrs[k] != null) n.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) {
      if (c == null) return;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return n;
  }
  var PALETTE = ["#1f4e79", "#2e8b57", "#d97706", "#7c3aed", "#0891b2", "#be185d", "#65a30d", "#dc2626", "#0369a1", "#9333ea", "#ca8a04", "#15803d", "#b91c1c", "#1d4ed8", "#c026d3", "#047857"];
  // Vaste kleuren per fase op basis van de code (VO/DO/UO).
  function phaseColor(section, idx) {
    var map = { "402010": "#1f4e79", "402020": "#2e8b57", "402030": "#d97706" };
    return map[section.code] || PALETTE[idx % PALETTE.length];
  }
  function euro(n) {
    if (n == null || !isFinite(n)) return "—";
    return "€ " + n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function nf(n) {
    if (n == null || !isFinite(n)) return "0";
    return n.toLocaleString("nl-NL", { maximumFractionDigits: 2 });
  }
  function parseNum(v) {
    var n = parseFloat(String(v).replace(",", "."));
    return isFinite(n) ? n : 0;
  }
  function uid() {
    return "id-" + Math.random().toString(36).slice(2) + "-" + (uid._c = (uid._c || 0) + 1);
  }
  var toastEl = document.getElementById("toast");
  var toastTimer;
  function toast(msg, isError) {
    toastEl.textContent = msg;
    toastEl.className = "toast show" + (isError ? " error" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.className = "toast"; }, 3000);
  }

  /* ---------------- Modal ---------------- */
  function modal(title, contentNodes, footerNodes) {
    var overlay = el("div", { class: "modal-overlay" });
    var m = el("div", { class: "modal" }, [el("h3", null, [title])].concat(contentNodes));
    if (footerNodes) {
      var foot = el("div", { class: "row", style: "margin-top:18px;justify-content:flex-end" }, footerNodes);
      m.appendChild(foot);
    }
    overlay.appendChild(m);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
    function close() { document.body.removeChild(overlay); }
    return { close: close, root: overlay };
  }

  /* ---------------- Navigatie ---------------- */
  document.getElementById("nav").addEventListener("click", function (e) {
    var b = e.target.closest("[data-view]");
    if (!b) return;
    navTo(b.getAttribute("data-view"));
  });
  function setActiveNav(view) {
    document.querySelectorAll(".navbtn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-view") === view);
    });
  }
  function navTo(view) {
    if (state.dirty && !confirm("Er zijn niet-opgeslagen wijzigingen. Toch verlaten?")) return;
    state.dirty = false;
    state.view = view;
    state.project = null;
    state.format = null;
    render();
  }

  function render() {
    setActiveNav(state.view === "formatEditor" ? "formats" : state.view === "projectEditor" ? "projects" : state.view);
    clear(app);
    if (state.view === "projects") renderProjects();
    else if (state.view === "planning") renderPlanning();
    else if (state.view === "report") renderReport();
    else if (state.view === "formats") renderFormats();
    else if (state.view === "projectEditor") renderProjectEditor();
    else if (state.view === "formatEditor") renderFormatEditor();
  }

  /* ==================================================================
     PROJECTEN
  ================================================================== */
  function renderProjects() {
    api.get("/api/projects").then(function (list) {
      state.projects = list;
      clear(app);
      app.appendChild(el("div", { class: "row" }, [
        el("h1", null, ["Projecten"]),
        el("div", { class: "spacer" }),
        el("button", { class: "btn secondary", onclick: importActualsDialog }, ["⬆ Uren importeren"]),
        el("button", { class: "btn", onclick: newProjectDialog }, ["+ Nieuw project"]),
      ]));
      if (!list.length) {
        app.appendChild(el("div", { class: "empty" }, ["Nog geen projecten. Maak een nieuw project aan op basis van een format."]));
        return;
      }
      list.forEach(function (p) {
        var metaText = ([p.projectNumber, p.client].filter(Boolean).join(" · ") || "—") +
          "  •  format: " + (p.formatName || "?") +
          "  •  " + (p.date || "");
        var item = el("div", { class: "list-item", onclick: function () { openProject(p.id); } }, [
          el("div", null, [
            el("div", { class: "title" }, [p.name || "(naamloos)"]),
            el("div", { class: "meta" }, [metaText]),
          ]),
          el("div", { class: "spacer" }),
          el("button", { class: "icon", title: "Verwijderen", onclick: function (e) { e.stopPropagation(); deleteProject(p); } }, ["🗑"]),
        ]);
        app.appendChild(item);
      });
    }).catch(function (e) { toast(e.message, true); });
  }

  function newProjectDialog() {
    api.get("/api/formats").then(function (formats) {
      if (!formats.length) { toast("Maak eerst een format aan.", true); return; }
      var sel = el("select", { class: "full" }, formats.map(function (f) {
        return el("option", { value: f.id }, [f.name]);
      }));
      var name = el("input", { placeholder: "Projectnaam" });
      var number = el("input", { placeholder: "Projectnummer" });
      var client = el("input", { placeholder: "Opdrachtgever" });
      var date = el("input", { type: "date", value: new Date().toISOString().slice(0, 10) });
      var m = modal("Nieuw project", [
        el("div", { class: "grid2" }, [
          el("label", { class: "field full" }, ["Format", sel]),
          el("label", { class: "field" }, ["Projectnaam", name]),
          el("label", { class: "field" }, ["Projectnummer", number]),
          el("label", { class: "field" }, ["Opdrachtgever", client]),
          el("label", { class: "field" }, ["Datum", date]),
        ]),
      ], [
        el("button", { class: "btn secondary", onclick: function () { m.close(); } }, ["Annuleren"]),
        el("button", { class: "btn", onclick: function () {
          api.send("POST", "/api/projects", {
            formatId: sel.value, name: name.value || "Nieuw project",
            projectNumber: number.value, client: client.value, date: date.value,
          }).then(function (p) { m.close(); openProject(p.id); toast("Project aangemaakt"); })
            .catch(function (e) { toast(e.message, true); });
        } }, ["Aanmaken"]),
      ]);
    });
  }

  // Stub: importeren van werkelijk geboekte uren. Functionaliteit volgt zodra
  // het importformaat bekend is; deze dialoog laat alvast de plek/flow zien.
  function importActualsDialog() {
    var file = el("input", { type: "file", disabled: "disabled", style: "margin-top:6px" });
    var src = el("select", { disabled: "disabled" }, [
      el("option", null, ["Excel / CSV-export uit urenregistratie"]),
      el("option", null, ["Koppeling urenregistratiesysteem (API)"]),
    ]);
    var m = modal("Werkelijke uren importeren", [
      el("div", { class: "card", style: "background:#fff8e6;border-color:#f0d27a" }, [
        el("b", null, ["Nog niet actief — voorbeeldfunctie."]),
        el("div", { style: "font-size:13px;color:var(--muted);margin-top:4px" }, [
          "Het definitieve importformaat is nog niet bepaald. Zodra dat er is, koppel je hier een bestand of bron en worden de geboekte uren per project, rol en periode ingelezen.",
        ]),
      ]),
      el("label", { class: "field", style: "margin-top:12px" }, ["Bron", src]),
      el("label", { class: "field", style: "margin-top:10px" }, ["Bestand (.xlsx / .csv)", file]),
      el("div", { style: "font-size:12px;color:var(--muted);margin-top:10px" }, [
        "Verwacht (concept): kolommen projectnummer, rol, periode (jjjj-mm of datum), uren.",
      ]),
    ], [
      el("button", { class: "btn secondary", onclick: function () { m.close(); } }, ["Sluiten"]),
      el("button", { class: "btn", disabled: "disabled", title: "Beschikbaar zodra het importformaat is vastgesteld" }, ["Importeren"]),
    ]);
  }

  function deleteProject(p) {
    if (!confirm('Project "' + (p.name || "") + '" verwijderen?')) return;
    api.send("DELETE", "/api/projects/" + p.id).then(function () { toast("Verwijderd"); renderProjects(); })
      .catch(function (e) { toast(e.message, true); });
  }

  function openProject(id) {
    api.get("/api/projects/" + id).then(function (p) {
      state.project = p;
      state.view = "projectEditor";
      state.dirty = false;
      render();
    }).catch(function (e) { toast(e.message, true); });
  }

  /* ------------------ PROJECT EDITOR (TSB grid) ------------------ */
  function renderProjectEditor() {
    var p = state.project;
    var roles = p.roles;
    clear(app);

    app.appendChild(el("div", { class: "breadcrumb", onclick: function () { navTo("projects"); } }, ["← Projecten"]));
    app.appendChild(el("div", { class: "row" }, [
      el("h1", null, [p.name || "(naamloos)"]),
      el("span", { class: "tag" }, [p.formatName || ""]),
      el("div", { class: "spacer" }),
      el("button", { class: "btn secondary small", title: "Standaard inzet (uren) opnieuw overnemen uit het gekoppelde format", onclick: syncInzetFromFormat }, ["↻ Inzet uit format"]),
      el("button", { class: "btn secondary small", onclick: editProjectMeta }, ["Gegevens bewerken"]),
      el("button", { class: "btn secondary small", onclick: function () { window.open("/api/projects/" + p.id + "/export.xlsx"); } }, ["⬇ Excel"]),
      el("button", { class: "btn secondary small", onclick: function () { window.open("/api/projects/" + p.id + "/export.pdf"); } }, ["⬇ PDF"]),
      el("button", { class: "btn", onclick: saveProject }, ["Opslaan"]),
    ]));
    app.appendChild(el("div", { class: "meta", style: "color:var(--muted);margin-bottom:12px" }, [
      [p.projectNumber, p.client, p.date].filter(Boolean).join("  ·  "),
    ]));

    // Fasering: begin- en einddatum per fase (gebruikt in de Planning).
    var phaseCard = el("div", { class: "card" });
    phaseCard.appendChild(el("div", { style: "font-weight:600;margin-bottom:8px" }, ["Fasering (begin- en einddatum per fase)"]));
    var phaseTbl = el("table", { class: "editor-table", style: "max-width:760px" });
    phaseTbl.appendChild(el("thead", null, [el("tr", null, [
      el("th", null, ["Fase"]), el("th", null, ["Begindatum"]), el("th", null, ["Einddatum"]), el("th", null, ["Uren"]),
    ])]));
    var phaseBody = el("tbody");
    var totalsForDates = TSB.computeBudget(p);
    p.sections.forEach(function (section) {
      var sTot = totalsForDates.sections.find(function (s) { return s.id === section.id; });
      var sd = el("input", { type: "date", value: section.startDate || "" });
      sd.addEventListener("change", function () { section.startDate = sd.value; markDirty(); });
      var ed = el("input", { type: "date", value: section.endDate || "" });
      ed.addEventListener("change", function () { section.endDate = ed.value; markDirty(); });
      phaseBody.appendChild(el("tr", null, [
        el("td", null, [(section.code ? section.code + " " : "") + section.name]),
        el("td", null, [sd]),
        el("td", null, [ed]),
        el("td", { class: "muted" }, [sTot ? nf(sTot.uren) + " u" : "0 u"]),
      ]));
    });
    phaseTbl.appendChild(phaseBody);
    phaseCard.appendChild(phaseTbl);
    app.appendChild(phaseCard);

    // Bouw de tabel
    var wrap = el("div", { class: "tsb-wrap" });
    var table = el("table", { class: "tsb" });

    // Koprij
    var thead = el("thead");
    var hr = el("tr");
    hr.appendChild(el("th", { class: "name" }, ["Omschrijving"]));
    hr.appendChild(el("th", null, ["Ehd"]));
    hr.appendChild(el("th", null, ["Hv"]));
    roles.forEach(function (r) {
      var th = el("th", null, [r.name, el("span", { class: "role-rate" }, ["€ " + nf(r.rate)])]);
      hr.appendChild(th);
    });
    hr.appendChild(el("th", null, ["Tot. uren"]));
    hr.appendChild(el("th", null, ["Tot. bedrag"]));
    hr.appendChild(el("th", null, ["Prijs/ehd"]));
    thead.appendChild(hr);
    table.appendChild(thead);

    var tbody = el("tbody");
    var colCount = 3 + roles.length + 3;

    p.sections.forEach(function (section) {
      var sr = el("tr", { class: "section" });
      sr.appendChild(el("td", { class: "name", colspan: colCount }, [(section.code ? section.code + "  " : "") + section.name]));
      tbody.appendChild(sr);

      section.groups.forEach(function (group) {
        var gr = el("tr", { class: "group" });
        gr.appendChild(el("td", { class: "name", colspan: colCount }, [group.name]));
        tbody.appendChild(gr);

        group.items.forEach(function (item) {
          tbody.appendChild(buildItemRow(item, roles));
        });
      });

      // sectietotaal-rij
      var tr = el("tr", { class: "subtotal" });
      tr.appendChild(el("td", { class: "name" }, ["Totaal " + section.name]));
      tr.appendChild(el("td"));
      tr.appendChild(el("td"));
      roles.forEach(function (r) {
        tr.appendChild(el("td", { id: "sd-" + section.id + "-" + r.id }, ["0"]));
      });
      tr.appendChild(el("td", { id: "su-" + section.id }, ["0"]));
      tr.appendChild(el("td", { class: "bedrag", id: "sb-" + section.id }, ["—"]));
      tr.appendChild(el("td"));
      tbody.appendChild(tr);
    });

    // eindtotaal
    var gtr = el("tr", { class: "grand" });
    gtr.appendChild(el("td", { class: "name" }, ["EINDTOTAAL"]));
    gtr.appendChild(el("td"));
    gtr.appendChild(el("td"));
    roles.forEach(function (r) { gtr.appendChild(el("td", { id: "gd-" + r.id }, ["0"])); });
    gtr.appendChild(el("td", { id: "gu" }, ["0"]));
    gtr.appendChild(el("td", { class: "bedrag", id: "gb" }, ["—"]));
    gtr.appendChild(el("td"));
    tbody.appendChild(gtr);

    table.appendChild(tbody);
    wrap.appendChild(table);
    app.appendChild(wrap);

    recompute();
  }

  function buildItemRow(item, roles) {
    var tr = el("tr", { "data-item": item.id });
    tr.appendChild(el("td", { class: "name" }, [item.name]));
    tr.appendChild(el("td", { class: "muted" }, [item.unit]));

    // hoeveelheid-invoer
    var qty = el("input", { class: "qty", type: "number", step: "any", value: item.quantity || 0 });
    qty.addEventListener("input", function () { item.quantity = parseNum(qty.value); markDirty(); recompute(); });
    tr.appendChild(el("td", null, [qty]));

    // inzet per rol
    roles.forEach(function (r) {
      var cell = el("td");
      var inp = el("input", { type: "number", step: "any", value: item.inzet[r.id] || 0, title: "Inzet (uur/" + item.unit + ") — " + r.name });
      inp.addEventListener("input", function () { item.inzet[r.id] = parseNum(inp.value); markDirty(); recompute(); });
      cell.appendChild(inp);
      cell.appendChild(el("div", { id: "d-" + item.id + "-" + r.id, style: "font-size:10px;color:var(--muted)" }, ["0"]));
      tr.appendChild(cell);
    });

    tr.appendChild(el("td", { id: "iu-" + item.id }, ["0"]));
    tr.appendChild(el("td", { class: "bedrag", id: "ib-" + item.id }, ["—"]));
    tr.appendChild(el("td", { class: "muted", id: "ip-" + item.id }, ["—"]));
    return tr;
  }

  function setText(id, txt) {
    var n = document.getElementById(id);
    if (n) n.textContent = txt;
  }

  function recompute() {
    var p = state.project;
    var roles = p.roles;
    var totals = TSB.computeBudget(p);

    p.sections.forEach(function (section) {
      var sTot = totals.sections.find(function (s) { return s.id === section.id; });
      section.groups.forEach(function (group) {
        group.items.forEach(function (item) {
          var c = sTot ? findItemCompute(totals, item.id) : null;
          if (!c) return;
          setText("iu-" + item.id, nf(c.totaalUren));
          setText("ib-" + item.id, euro(c.totaalBedrag));
          var pu = item.priceUnit || TSB.unitDefaults(item.unit).priceUnit;
          setText("ip-" + item.id, c.prijs == null ? "—" : euro(c.prijs) + " " + pu);
          roles.forEach(function (r) {
            setText("d-" + item.id + "-" + r.id, nf(c.duur[r.id]));
          });
        });
      });
      if (sTot) {
        setText("su-" + section.id, nf(sTot.uren));
        setText("sb-" + section.id, euro(sTot.bedrag));
        roles.forEach(function (r) { setText("sd-" + section.id + "-" + r.id, nf(sTot.perRole[r.id].duur)); });
      }
    });

    setText("gu", nf(totals.grand.uren));
    setText("gb", euro(totals.grand.bedrag));
    roles.forEach(function (r) { setText("gd-" + r.id, nf(totals.grand.perRole[r.id].duur)); });
  }

  function findItemCompute(totals, itemId) {
    for (var i = 0; i < totals.sections.length; i++) {
      var groups = totals.sections[i].groups;
      for (var j = 0; j < groups.length; j++) {
        if (groups[j].items[itemId]) return groups[j].items[itemId];
      }
    }
    return null;
  }

  function markDirty() { state.dirty = true; }

  function saveProject() {
    var p = state.project;
    api.send("PUT", "/api/projects/" + p.id, p).then(function (saved) {
      state.project = saved;
      state.dirty = false;
      toast("Project opgeslagen");
    }).catch(function (e) { toast(e.message, true); });
  }

  function syncInzetFromFormat() {
    var p = state.project;
    if (!p.formatId) { toast("Dit project heeft geen gekoppeld format meer.", true); return; }
    if (!confirm("Standaard inzet (uren) opnieuw overnemen uit het format?\n\nIngevulde hoeveelheden blijven behouden. Handmatig in dit project aangepaste uren worden overschreven met de format-waarden.")) return;
    api.get("/api/formats/" + p.formatId).then(function (fmt) {
      var map = {};
      fmt.sections.forEach(function (s) { s.groups.forEach(function (g) { g.items.forEach(function (it) { map[it.id] = it.inzet || {}; }); }); });
      var applied = 0, missing = 0;
      p.sections.forEach(function (s) { s.groups.forEach(function (g) { g.items.forEach(function (it) {
        if (map[it.id]) {
          var src = map[it.id];
          p.roles.forEach(function (r) { it.inzet[r.id] = Number(src[r.id]) || 0; });
          applied++;
        } else { missing++; }
      }); }); });
      markDirty();
      render();
      toast(applied + " regelitems bijgewerkt" + (missing ? " (" + missing + " niet in format gevonden)" : ""));
    }).catch(function (e) { toast(e.message, true); });
  }

  function editProjectMeta() {
    var p = state.project;
    var name = el("input", { value: p.name || "" });
    var number = el("input", { value: p.projectNumber || "" });
    var client = el("input", { value: p.client || "" });
    var date = el("input", { type: "date", value: p.date || "" });
    var m = modal("Projectgegevens", [
      el("div", { class: "grid2" }, [
        el("label", { class: "field" }, ["Projectnaam", name]),
        el("label", { class: "field" }, ["Projectnummer", number]),
        el("label", { class: "field" }, ["Opdrachtgever", client]),
        el("label", { class: "field" }, ["Datum", date]),
      ]),
    ], [
      el("button", { class: "btn secondary", onclick: function () { m.close(); } }, ["Annuleren"]),
      el("button", { class: "btn", onclick: function () {
        p.name = name.value; p.projectNumber = number.value; p.client = client.value; p.date = date.value;
        m.close(); markDirty(); render();
      } }, ["OK"]),
    ]);
  }

  /* ==================================================================
     FORMATS
  ================================================================== */
  function renderFormats() {
    api.get("/api/formats").then(function (list) {
      state.formats = list;
      clear(app);
      app.appendChild(el("div", { class: "row" }, [
        el("h1", null, ["Formats"]),
        el("div", { class: "spacer" }),
        el("button", { class: "btn", onclick: newFormatDialog }, ["+ Nieuw format"]),
      ]));
      app.appendChild(el("p", { style: "color:var(--muted);margin-top:-4px" }, [
        "Een format bepaalt de rollen + tarieven en de structuur (fasen, groepen, regelitems) waarop je projecten worden gebaseerd.",
      ]));
      list.forEach(function (f) {
        app.appendChild(el("div", { class: "list-item", onclick: function () { openFormat(f.id); } }, [
          el("div", null, [
            el("div", { class: "title" }, [f.name]),
            el("div", { class: "meta" }, [f.roleCount + " rollen · " + f.sectionCount + " secties"]),
          ]),
          el("div", { class: "spacer" }),
          el("button", { class: "icon", title: "Dupliceren", onclick: function (e) { e.stopPropagation(); duplicateFormat(f); } }, ["⧉"]),
          el("button", { class: "icon", title: "Verwijderen", onclick: function (e) { e.stopPropagation(); deleteFormat(f); } }, ["🗑"]),
        ]));
      });
    }).catch(function (e) { toast(e.message, true); });
  }

  function newFormatDialog() {
    var name = el("input", { placeholder: "Naam van het format", class: "full" });
    var m = modal("Nieuw format", [
      el("label", { class: "field full" }, ["Naam", name]),
    ], [
      el("button", { class: "btn secondary", onclick: function () { m.close(); } }, ["Annuleren"]),
      el("button", { class: "btn", onclick: function () {
        var fmt = {
          name: name.value || "Nieuw format",
          roles: [{ id: uid(), code: "", name: "Medewerker", rate: 100 }],
          sections: [],
        };
        api.send("POST", "/api/formats", fmt).then(function (f) { m.close(); openFormat(f.id); })
          .catch(function (e) { toast(e.message, true); });
      } }, ["Aanmaken"]),
    ]);
  }

  function duplicateFormat(f) {
    api.send("POST", "/api/formats/" + f.id + "/duplicate").then(function () { toast("Gedupliceerd"); renderFormats(); })
      .catch(function (e) { toast(e.message, true); });
  }
  function deleteFormat(f) {
    if (!confirm('Format "' + f.name + '" verwijderen?')) return;
    api.send("DELETE", "/api/formats/" + f.id).then(function () { toast("Verwijderd"); renderFormats(); })
      .catch(function (e) { toast(e.message, true); });
  }
  function openFormat(id) {
    api.get("/api/formats/" + id).then(function (f) {
      state.format = f; state.view = "formatEditor"; state.dirty = false; render();
    }).catch(function (e) { toast(e.message, true); });
  }

  /* ------------------ FORMAT EDITOR ------------------ */
  function renderFormatEditor() {
    var f = state.format;
    clear(app);
    app.appendChild(el("div", { class: "breadcrumb", onclick: function () { navTo("formats"); } }, ["← Formats"]));

    var nameInput = el("input", { value: f.name, style: "font-size:18px;font-weight:600;min-width:340px" });
    nameInput.addEventListener("input", function () { f.name = nameInput.value; markDirty(); });
    app.appendChild(el("div", { class: "row" }, [
      nameInput,
      el("div", { class: "spacer" }),
      el("button", { class: "btn", onclick: saveFormat }, ["Format opslaan"]),
    ]));

    // ---- Rollen ----
    app.appendChild(el("h2", null, ["Rollen & tarieven"]));
    var rolesCard = el("div", { class: "card" });
    var rt = el("table", { class: "editor-table" });
    var rhead = el("tr", null, [
      el("th", null, ["Code"]), el("th", null, ["Rol"]), el("th", null, ["Tarief (€/uur)"]), el("th", null, [""]),
    ]);
    rt.appendChild(el("thead", null, [rhead]));
    var rbody = el("tbody");
    f.roles.forEach(function (role) {
      var code = el("input", { value: role.code || "", class: "num" });
      code.addEventListener("input", function () { role.code = code.value; markDirty(); });
      var nm = el("input", { value: role.name || "" });
      nm.addEventListener("input", function () { role.name = nm.value; markDirty(); });
      var rate = el("input", { type: "number", step: "any", value: role.rate, class: "num" });
      rate.addEventListener("input", function () { role.rate = parseNum(rate.value); markDirty(); });
      var del = el("button", { class: "icon", title: "Rol verwijderen", onclick: function () {
        if (!confirm("Rol verwijderen? Inzet voor deze rol gaat verloren.")) return;
        f.roles = f.roles.filter(function (x) { return x !== role; });
        f.sections.forEach(function (s) { s.groups.forEach(function (g) { g.items.forEach(function (it) { delete it.inzet[role.id]; }); }); });
        markDirty(); renderFormatEditor();
      } }, ["🗑"]);
      rbody.appendChild(el("tr", null, [el("td", null, [code]), el("td", null, [nm]), el("td", null, [rate]), el("td", null, [del])]));
    });
    rt.appendChild(rbody);
    rolesCard.appendChild(rt);
    rolesCard.appendChild(el("button", { class: "btn secondary small", style: "margin-top:10px", onclick: function () {
      var r = { id: uid(), code: "", name: "Nieuwe rol", rate: 100 };
      f.roles.push(r);
      f.sections.forEach(function (s) { s.groups.forEach(function (g) { g.items.forEach(function (it) { it.inzet[r.id] = 0; }); }); });
      markDirty(); renderFormatEditor();
    } }, ["+ Rol toevoegen"]));
    app.appendChild(rolesCard);

    // ---- Secties ----
    app.appendChild(el("h2", null, ["Structuur (fasen → groepen → regelitems)"]));
    f.sections.forEach(function (section) { app.appendChild(buildSectionEditor(f, section)); });
    app.appendChild(el("button", { class: "btn secondary", onclick: function () {
      f.sections.push({ id: uid(), code: "", name: "Nieuwe fase", groups: [] });
      markDirty(); renderFormatEditor();
    } }, ["+ Fase toevoegen"]));
  }

  function buildSectionEditor(f, section) {
    var block = el("div", { class: "section-block" });
    var code = el("input", { value: section.code || "", placeholder: "Code", style: "width:90px" });
    code.addEventListener("input", function () { section.code = code.value; markDirty(); });
    var nm = el("input", { value: section.name || "", placeholder: "Naam fase", style: "min-width:260px;font-weight:600" });
    nm.addEventListener("input", function () { section.name = nm.value; markDirty(); });
    block.appendChild(el("div", { class: "section-head" }, [
      code, nm, el("div", { class: "spacer" }),
      el("button", { class: "icon", title: "Fase verwijderen", onclick: function () {
        if (!confirm("Fase verwijderen?")) return;
        f.sections = f.sections.filter(function (x) { return x !== section; });
        markDirty(); renderFormatEditor();
      } }, ["🗑"]),
    ]));

    section.groups.forEach(function (group) { block.appendChild(buildGroupEditor(f, section, group)); });
    var addG = el("div", { class: "group-block" }, [
      el("button", { class: "btn secondary small", onclick: function () {
        section.groups.push({ id: uid(), name: "Nieuwe groep", items: [] });
        markDirty(); renderFormatEditor();
      } }, ["+ Groep toevoegen"]),
    ]);
    block.appendChild(addG);
    return block;
  }

  function buildGroupEditor(f, section, group) {
    var gb = el("div", { class: "group-block" });
    var gn = el("input", { value: group.name || "", placeholder: "Naam groep", style: "min-width:260px;font-weight:600" });
    gn.addEventListener("input", function () { group.name = gn.value; markDirty(); });
    gb.appendChild(el("div", { class: "group-head" }, [
      gn, el("div", { class: "spacer" }),
      el("button", { class: "btn secondary small", onclick: function () {
        var inz = {};
        f.roles.forEach(function (r) { inz[r.id] = 0; });
        group.items.push({ id: uid(), name: "Nieuw regelitem", unit: "st", inzetLabel: "uur/st", inzet: inz });
        markDirty(); renderFormatEditor();
      } }, ["+ Regelitem"]),
      el("button", { class: "icon", title: "Groep verwijderen", onclick: function () {
        if (!confirm("Groep verwijderen?")) return;
        section.groups = section.groups.filter(function (x) { return x !== group; });
        markDirty(); renderFormatEditor();
      } }, ["🗑"]),
    ]));

    // Compacte tabel: één rij per regelitem, rollen als verticale kolomkoppen.
    var wrap = el("div", { class: "fmt-grid-wrap" });
    var table = el("table", { class: "fmt-grid" });
    var head = el("tr", null, [
      el("th", { class: "h-naam" }, ["Omschrijving"]),
      el("th", { class: "h-ehd" }, ["Ehd"]),
    ].concat(f.roles.map(function (r) {
      return el("th", { class: "role", title: r.name }, [el("span", { class: "lbl" }, [r.name])]);
    })).concat([el("th", { class: "h-del" }, [""])]));
    table.appendChild(el("thead", null, [head]));

    var tbody = el("tbody");
    group.items.forEach(function (item) { tbody.appendChild(buildItemRowEditor(f, group, item)); });
    table.appendChild(tbody);
    wrap.appendChild(table);
    gb.appendChild(wrap);
    return gb;
  }

  function buildItemRowEditor(f, group, item) {
    var nm = el("input", { class: "iname", value: item.name || "", placeholder: "Omschrijving" });
    nm.addEventListener("input", function () { item.name = nm.value; markDirty(); });
    var unit = el("select", { class: "iunit" }, UNITS.map(function (u) {
      return el("option", { value: u, selected: u === item.unit ? "selected" : null }, [u]);
    }));
    unit.addEventListener("change", function () { item.unit = unit.value; item.inzetLabel = "uur/" + unit.value; markDirty(); });
    var del = el("button", { class: "icon", title: "Regelitem verwijderen", onclick: function () {
      group.items = group.items.filter(function (x) { return x !== item; });
      markDirty(); renderFormatEditor();
    } }, ["🗑"]);

    var cells = [el("td", { class: "c-naam" }, [nm]), el("td", { class: "c-ehd" }, [unit])];
    f.roles.forEach(function (r) {
      var inp = el("input", { class: "inz", type: "number", step: "any", value: item.inzet[r.id] || 0, title: r.name + " — uur per " + item.unit });
      inp.addEventListener("input", function () { item.inzet[r.id] = parseNum(inp.value); markDirty(); });
      cells.push(el("td", null, [inp]));
    });
    cells.push(el("td", null, [del]));
    return el("tr", null, cells);
  }

  function saveFormat() {
    var f = state.format;
    api.send("PUT", "/api/formats/" + f.id, f).then(function (saved) {
      state.format = saved; state.dirty = false; toast("Format opgeslagen");
    }).catch(function (e) { toast(e.message, true); });
  }

  /* ==================================================================
     PLANNING (urenbezetting per rol over de tijd)
  ================================================================== */
  var planState = { granularity: "month", projects: null, settings: null, filter: {} };

  function parseDate(s) {
    if (!s) return null;
    var d = new Date(s + "T00:00:00");
    return isNaN(d.getTime()) ? null : d;
  }
  function dayMs() { return 86400000; }
  function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
  function startOfWeek(d) { // maandag
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var wd = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - wd);
    return x;
  }
  var MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  function overlapDays(s1, e1, s2, e2) {
    var s = s1 > s2 ? s1 : s2;
    var e = e1 < e2 ? e1 : e2;
    var d = Math.floor((e - s) / dayMs()) + 1;
    return d > 0 ? d : 0;
  }

  // Bouw de tijd-buckets (maand of week) tussen min en max datum.
  function buildBuckets(minD, maxD, gran) {
    var buckets = [];
    if (gran === "week") {
      var cur = startOfWeek(minD);
      while (cur <= maxD) {
        var end = new Date(cur); end.setDate(end.getDate() + 6);
        buckets.push({ start: new Date(cur), end: end, days: 7,
          label: "wk " + isoWeek(cur), sub: cur.getDate() + " " + MONTHS[cur.getMonth()] });
        cur = new Date(cur); cur.setDate(cur.getDate() + 7);
      }
    } else {
      var c = startOfMonth(minD);
      while (c <= maxD) {
        var e = endOfMonth(c);
        buckets.push({ start: new Date(c), end: e, days: e.getDate(),
          label: MONTHS[c.getMonth()], sub: String(c.getFullYear()) });
        c = new Date(c.getFullYear(), c.getMonth() + 1, 1);
      }
    }
    return buckets;
  }
  function isoWeek(d) {
    var date = new Date(d.getTime());
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
    var week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date - week1) / dayMs() - 3 + ((week1.getDay() + 6) % 7)) / 7);
  }

  function renderPlanning() {
    clear(app);
    app.appendChild(el("div", { class: "row" }, [
      el("h1", null, ["Planning – urenbezetting"]),
      el("div", { class: "spacer" }),
      el("label", { class: "field", style: "flex-direction:row;align-items:center;gap:8px" }, [
        "Weergave:",
        (function () {
          var sel = el("select", null, [
            el("option", { value: "month", selected: planState.granularity === "month" ? "selected" : null }, ["Per maand"]),
            el("option", { value: "week", selected: planState.granularity === "week" ? "selected" : null }, ["Per week"]),
          ]);
          sel.addEventListener("change", function () { planState.granularity = sel.value; drawPlanning(); });
          return sel;
        })(),
      ]),
    ]));

    var holder = el("div", { id: "planning-holder" }, ["Laden…"]);
    app.appendChild(holder);

    Promise.all([api.get("/api/projects/full"), api.get("/api/settings")])
      .then(function (res) {
        planState.projects = res[0];
        planState.settings = res[1] || { capacityPerWeek: {} };
        if (planState.projects.some(function (p) { return planState.filter[p.id] === undefined; })) {
          planState.projects.forEach(function (p) { if (planState.filter[p.id] === undefined) planState.filter[p.id] = true; });
        }
        drawPlanning();
      })
      .catch(function (e) { holder.textContent = ""; holder.appendChild(el("div", { class: "empty" }, [e.message])); });
  }

  function drawPlanning() {
    var holder = document.getElementById("planning-holder");
    if (!holder) return;
    clear(holder);

    var projects = planState.projects || [];
    var gran = planState.granularity;
    var cap = (planState.settings && planState.settings.capacityPerWeek) || {};

    // Projectfilter
    var filterRow = el("div", { class: "card", style: "padding:10px 14px" }, [
      el("span", { style: "color:var(--muted);font-size:13px;margin-right:8px" }, ["Projecten:"]),
    ]);
    projects.forEach(function (p) {
      var cb = el("input", { type: "checkbox" });
      cb.checked = planState.filter[p.id] !== false;
      cb.addEventListener("change", function () { planState.filter[p.id] = cb.checked; drawPlanning(); });
      filterRow.appendChild(el("label", { style: "margin-right:14px;font-size:13px;cursor:pointer" }, [cb, " " + p.name]));
    });
    holder.appendChild(filterRow);

    var active = projects.filter(function (p) { return planState.filter[p.id] !== false; });

    // Verzamel gedateerde fasen + ontbrekende
    var dated = [];
    var missing = [];
    var minD = null, maxD = null;
    active.forEach(function (p) {
      var totals = TSB.computeBudget(p);
      var roleName = {};
      p.roles.forEach(function (r) { roleName[r.id] = r.name; });
      p.sections.forEach(function (section) {
        var sTot = totals.sections.find(function (s) { return s.id === section.id; });
        var hrs = sTot ? sTot.uren : 0;
        if (hrs <= 0) return;
        var s = parseDate(section.startDate), e = parseDate(section.endDate);
        if (!s || !e || e < s) { missing.push(p.name + " – " + section.name); return; }
        if (!minD || s < minD) minD = s;
        if (!maxD || e > maxD) maxD = e;
        dated.push({ project: p, section: section, start: s, end: e, perRole: sTot.perRole, roleName: roleName });
      });
    });

    if (missing.length) {
      holder.appendChild(el("div", { class: "card", style: "border-color:#f3c2bd;background:#fef6f5" }, [
        el("b", null, ["Zonder datum (niet meegenomen): "]),
        missing.join("  ·  "),
        el("div", { style: "color:var(--muted);font-size:12px;margin-top:4px" }, ["Vul begin- en einddatum in bij het project (kop 'Fasering') om deze mee te tellen."]),
      ]));
    }

    if (!dated.length) {
      holder.appendChild(el("div", { class: "empty" }, ["Geen gedateerde fasen met uren. Vul per project de fasering (begin/eind) in."]));
      return;
    }

    // Visuele planning (Gantt) per project/fase
    buildGantt(holder, dated, minD, maxD);

    holder.appendChild(el("h2", null, ["Urenbezetting per rol"]));

    var buckets = buildBuckets(minD, maxD, gran);

    // Aggregatie: rolnaam -> array van uren per bucket
    var roleNames = [];
    var grid = {}; // role -> [hours per bucket]
    function ensureRole(name) {
      if (!grid[name]) { grid[name] = buckets.map(function () { return 0; }); roleNames.push(name); }
      return grid[name];
    }
    dated.forEach(function (d) {
      var totalDays = Math.floor((d.end - d.start) / dayMs()) + 1;
      Object.keys(d.perRole).forEach(function (rid) {
        var h = d.perRole[rid].duur;
        if (h <= 0) return;
        var name = d.roleName[rid];
        var arr = ensureRole(name);
        var perDay = h / totalDays;
        buckets.forEach(function (b, i) {
          var od = overlapDays(d.start, d.end, b.start, b.end);
          if (od > 0) arr[i] += perDay * od;
        });
      });
    });
    roleNames.sort();

    // Tabel
    var wrap = el("div", { class: "tsb-wrap", style: "margin-top:12px" });
    var table = el("table", { class: "tsb plan" });
    var thead = el("thead");
    var hr = el("tr");
    hr.appendChild(el("th", { class: "name" }, ["Rol"]));
    hr.appendChild(el("th", null, ["Cap. u/wk"]));
    buckets.forEach(function (b) {
      hr.appendChild(el("th", null, [b.label, el("span", { class: "role-rate" }, [b.sub])]));
    });
    hr.appendChild(el("th", null, ["Totaal"]));
    thead.appendChild(hr);
    table.appendChild(thead);

    var tbody = el("tbody");
    var colTotals = buckets.map(function () { return 0; });
    var grandTotal = 0;

    roleNames.forEach(function (name) {
      var arr = grid[name];
      var tr = el("tr");
      tr.appendChild(el("td", { class: "name" }, [name]));
      // capaciteit-invoer
      var capInp = el("input", { type: "number", step: "any", value: cap[name] != null ? cap[name] : "", placeholder: "—", style: "width:64px" });
      capInp.addEventListener("change", function () {
        var v = capInp.value === "" ? null : parseNum(capInp.value);
        if (v == null) delete planState.settings.capacityPerWeek[name];
        else planState.settings.capacityPerWeek[name] = v;
        api.send("PUT", "/api/settings", planState.settings).then(function (s) { planState.settings = s; drawPlanning(); })
          .catch(function (e) { toast(e.message, true); });
      });
      tr.appendChild(el("td", null, [capInp]));

      var rowTotal = 0;
      arr.forEach(function (h, i) {
        rowTotal += h; colTotals[i] += h;
        var td = el("td", null, [h ? nf(Math.round(h)) : ""]);
        var capWk = cap[name];
        if (capWk && h > 0) {
          var availableHrs = capWk * (buckets[i].days / 7);
          var util = availableHrs > 0 ? h / availableHrs : 0;
          td.style.background = util > 1.0 ? "#f8c9c2" : util > 0.85 ? "#fde2b8" : "#d7eccc";
          td.title = name + " — " + Math.round(h) + " u van " + Math.round(availableHrs) + " u (" + Math.round(util * 100) + "%)";
        }
        tr.appendChild(td);
      });
      grandTotal += rowTotal;
      tr.appendChild(el("td", { class: "bedrag" }, [nf(Math.round(rowTotal)) + " u"]));
      tbody.appendChild(tr);
    });

    // Totaalrij
    var tr = el("tr", { class: "subtotal" });
    tr.appendChild(el("td", { class: "name" }, ["Totaal (alle rollen)"]));
    tr.appendChild(el("td"));
    colTotals.forEach(function (t) { tr.appendChild(el("td", null, [t ? nf(Math.round(t)) : ""])); });
    tr.appendChild(el("td", null, [nf(Math.round(grandTotal)) + " u"]));
    tbody.appendChild(tr);

    table.appendChild(tbody);
    wrap.appendChild(table);
    holder.appendChild(wrap);

    holder.appendChild(el("div", { style: "color:var(--muted);font-size:12px;margin-top:8px" }, [
      "Uren per fase worden evenredig over de looptijd (kalenderdagen) verdeeld. Vul 'Cap. u/wk' per rol in voor kleuring: ",
      el("span", { style: "background:#d7eccc;padding:1px 6px;border-radius:3px" }, ["< 85%"]), " ",
      el("span", { style: "background:#fde2b8;padding:1px 6px;border-radius:3px" }, ["85–100%"]), " ",
      el("span", { style: "background:#f8c9c2;padding:1px 6px;border-radius:3px" }, ["> 100% (overbezet)"]),
    ]));
  }

  // Visuele planning: gekleurde fasebalken per project op een maand-as.
  function buildGantt(holder, dated, minD, maxD) {
    var ganttMin = startOfMonth(minD), ganttMax = endOfMonth(maxD);
    var total = (ganttMax - ganttMin) + dayMs(); // inclusief laatste dag
    function pct(d) { return ((d - ganttMin) / total) * 100; }

    // groepeer per project (in volgorde van eerste fase)
    var order = [], byProj = {};
    dated.forEach(function (d) {
      var id = d.project.id;
      if (!byProj[id]) { byProj[id] = { project: d.project, phases: [] }; order.push(id); }
      byProj[id].phases.push(d);
    });

    var card = el("div", { class: "card" });
    card.appendChild(el("div", { style: "font-weight:600;margin-bottom:10px" }, ["Visuele planning per fase"]));

    // maand-as
    var months = buildBuckets(minD, maxD, "month");
    var axis = el("div", { class: "gantt-axis" }, [el("div", { class: "gantt-label" }, [""])]);
    var axisTrack = el("div", { class: "gantt-track-wrap" });
    months.forEach(function (m) {
      axisTrack.appendChild(el("div", { class: "gantt-axis-tick", style: "left:" + pct(m.start) + "%" }, [
        el("span", null, [m.label + " " + m.sub.slice(2)]),
      ]));
    });
    axis.appendChild(axisTrack);
    card.appendChild(axis);

    // vandaag-lijn
    var today = new Date();
    var todayPct = (today >= ganttMin && today <= ganttMax) ? pct(today) : null;

    order.forEach(function (id) {
      var grp = byProj[id];
      var track = el("div", { class: "gantt-track-wrap" });
      if (todayPct != null) track.appendChild(el("div", { class: "gantt-today", style: "left:" + todayPct + "%" }));
      grp.phases.forEach(function (ph, i) {
        var left = pct(ph.start);
        var right = pct(new Date(ph.end.getTime() + dayMs()));
        var w = Math.max(right - left, 1.2);
        var uren = ph.perRole ? Object.keys(ph.perRole).reduce(function (a, rid) { return a + ph.perRole[rid].duur; }, 0) : 0;
        var bar = el("div", { class: "gantt-bar", title: grp.project.name + " — " + ph.section.name + "\n" + fmtDate(ph.start) + " t/m " + fmtDate(ph.end) + "  ·  " + nf(Math.round(uren)) + " u",
          style: "left:" + left + "%;width:" + w + "%;background:" + phaseColor(ph.section, i) },
          [shortPhase(ph.section)]);
        track.appendChild(bar);
      });
      var row = el("div", { class: "gantt-row" }, [
        el("div", { class: "gantt-label", title: grp.project.name }, [grp.project.name.replace(/^Netuitbreiding 20kV /, "")]),
        track,
      ]);
      card.appendChild(row);
    });

    // legenda
    var legend = el("div", { class: "gantt-axis" }, [el("div", { class: "gantt-label" }, [""])]);
    var leg = el("div", { style: "display:flex;gap:16px;font-size:12px;color:var(--muted);align-items:center;padding-top:6px" }, [
      legendDot("#1f4e79", "VO"), legendDot("#2e8b57", "DO"), legendDot("#d97706", "UO"),
      el("span", null, [" | "]), el("span", { style: "border-left:2px solid #e11;padding-left:6px" }, ["vandaag"]),
    ]);
    legend.appendChild(leg);
    card.appendChild(legend);

    holder.appendChild(card);
  }
  function legendDot(color, label) {
    return el("span", { style: "display:inline-flex;align-items:center;gap:5px" }, [
      el("span", { style: "width:12px;height:12px;border-radius:3px;background:" + color + ";display:inline-block" }), label,
    ]);
  }
  function shortPhase(section) {
    if (section.code === "402010") return "VO";
    if (section.code === "402020") return "DO";
    if (section.code === "402030") return "UO";
    return (section.name || "").slice(0, 8);
  }
  function fmtDate(d) {
    return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear();
  }

  /* ==================================================================
     MANAGEMENTRAPPORTAGE
  ================================================================== */
  var reportState = { projects: null, projSel: {}, month: "" };

  function renderReport() {
    clear(app);
    app.appendChild(el("div", { class: "row" }, [
      el("h1", null, ["Managementrapportage"]),
      el("div", { class: "spacer" }),
      el("button", { class: "btn", onclick: generateReportDialog }, ["✨ Genereer rapportage (AI)"]),
      el("button", { class: "btn secondary", onclick: importActualsDialog }, ["⬆ Uren importeren"]),
    ]));
    var holder = el("div", { id: "report-holder" }, ["Laden…"]);
    app.appendChild(holder);

    api.get("/api/projects/full").then(function (projects) {
      reportState.projects = projects;
      projects.forEach(function (p) { if (reportState.projSel[p.id] === undefined) reportState.projSel[p.id] = true; });
      drawReportDashboard();
    }).catch(function (e) { clear(holder); holder.appendChild(el("div", { class: "empty" }, [e.message])); });
  }

  function shortName(n) { return (n || "").replace(/^Netuitbreiding 20kV /, ""); }

  // Verzamel beschikbare maanden (uit geboekte uren + gedateerde fasen).
  function availableMonths(projects) {
    var set = {};
    projects.forEach(function (p) {
      (p.actuals || []).forEach(function (a) { if (a.period) set[a.period] = true; });
      (p.sections || []).forEach(function (s) {
        if (s.startDate && s.endDate) {
          var d = new Date(s.startDate + "T00:00:00"), e = new Date(s.endDate + "T00:00:00");
          var c = new Date(d.getFullYear(), d.getMonth(), 1);
          while (c <= e) { set[c.getFullYear() + "-" + String(c.getMonth() + 1).padStart(2, "0")] = true; c = new Date(c.getFullYear(), c.getMonth() + 1, 1); }
        }
      });
    });
    return Object.keys(set).sort();
  }
  function monthLabelStr(m) {
    if (!m) return "Volledige looptijd";
    var nm = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
    var parts = m.split("-"); return nm[parseInt(parts[1], 10) - 1] + " " + parts[0];
  }

  function drawReportDashboard() {
    var holder = document.getElementById("report-holder");
    if (!holder) return;
    clear(holder);
    var projects = reportState.projects || [];
    if (!projects.length) { holder.appendChild(el("div", { class: "empty" }, ["Nog geen projecten."])); return; }

    // ---- Filterbalk ----
    var chips = el("div", { class: "chips" });
    projects.forEach(function (p) {
      var on = reportState.projSel[p.id] !== false;
      chips.appendChild(el("button", { class: "chip" + (on ? " active" : ""), onclick: function () {
        reportState.projSel[p.id] = !on; drawReportDashboard();
      } }, [shortName(p.name)]));
    });
    var quick = el("div", { class: "chip-actions" }, [
      el("button", { class: "linkbtn", onclick: function () { projects.forEach(function (p) { reportState.projSel[p.id] = true; }); drawReportDashboard(); } }, ["alle"]),
      el("span", null, ["·"]),
      el("button", { class: "linkbtn", onclick: function () { projects.forEach(function (p) { reportState.projSel[p.id] = false; }); drawReportDashboard(); } }, ["geen"]),
    ]);

    var months = availableMonths(projects);
    var monthSel = el("select", null, [el("option", { value: "" }, ["Volledige looptijd"])].concat(months.map(function (m) {
      return el("option", { value: m, selected: m === reportState.month ? "selected" : null }, [monthLabelStr(m)]);
    })));
    monthSel.addEventListener("change", function () { reportState.month = monthSel.value; drawReportDashboard(); });

    var filterCard = el("div", { class: "card filterbar" }, [
      el("div", { class: "filter-group", style: "flex:1;min-width:280px" }, [
        el("div", { class: "fl-lbl" }, ["Projecten", quick]),
        chips,
      ]),
      el("div", { class: "filter-group" }, [
        el("div", { class: "fl-lbl" }, ["Periode"]),
        monthSel,
      ]),
    ]);
    holder.appendChild(filterCard);

    var active = projects.filter(function (p) { return reportState.projSel[p.id] !== false; });
    if (!active.length) { holder.appendChild(el("div", { class: "empty" }, ["Selecteer minstens één project."])); return; }

    // ---- Aggregatie ----
    var perProject = [], phaseAgg = {}, roleAgg = {};
    var grandBedrag = 0, grandUren = 0, grandActualUren = 0, grandActualBedrag = 0, monthActualUren = 0, monthActualBedrag = 0;
    var month = reportState.month;
    active.forEach(function (p) {
      var t = TSB.computeBudget(p);
      var roleName = {}, rateByName = {};
      p.roles.forEach(function (r) { roleName[r.id] = r.name; rateByName[r.name] = r.rate; });
      var actUren = 0, actBedrag = 0;
      (p.actuals || []).forEach(function (a) {
        actUren += a.hours; var b = a.hours * (rateByName[a.role] || 0); actBedrag += b;
        if (!roleAgg[a.role]) roleAgg[a.role] = { uren: 0, bedrag: 0, actUren: 0, actBedrag: 0 };
        roleAgg[a.role].actUren += a.hours; roleAgg[a.role].actBedrag += b;
        if (month && a.period === month) { monthActualUren += a.hours; monthActualBedrag += b; }
      });
      perProject.push({ name: shortName(p.name), bedrag: t.grand.bedrag, uren: t.grand.uren, actUren: actUren });
      grandBedrag += t.grand.bedrag; grandUren += t.grand.uren; grandActualUren += actUren; grandActualBedrag += actBedrag;
      t.sections.forEach(function (s) {
        var sec = p.sections.find(function (x) { return x.id === s.id; });
        var pk = shortPhase(sec);
        if (!phaseAgg[pk]) phaseAgg[pk] = { bedrag: 0, uren: 0 };
        phaseAgg[pk].bedrag += s.bedrag; phaseAgg[pk].uren += s.uren;
        Object.keys(s.perRole).forEach(function (rid) {
          var nm = roleName[rid];
          if (!roleAgg[nm]) roleAgg[nm] = { uren: 0, bedrag: 0, actUren: 0, actBedrag: 0 };
          roleAgg[nm].bedrag += s.perRole[rid].bedrag; roleAgg[nm].uren += s.perRole[rid].duur;
        });
      });
    });

    var pctBesteed = grandUren > 0 ? Math.round(grandActualUren / grandUren * 100) : 0;
    holder.appendChild(el("div", { class: "kpi-grid" }, [
      kpiCard("Projecten", String(active.length), "in selectie"),
      kpiCard("Totaal begroot", euro(grandBedrag), nf(Math.round(grandUren)) + " uur"),
      month ? kpiCard("Geboekt in " + monthLabelStr(month), nf(Math.round(monthActualUren)) + " u", euro(monthActualBedrag))
            : kpiCard("Werkelijk geboekt", nf(Math.round(grandActualUren)) + " u", pctBesteed + "% van begroot · " + euro(grandActualBedrag)),
      kpiCard("Resterend begroot", nf(Math.round(grandUren - grandActualUren)) + " u", "nog te besteden"),
    ]));

    var chartsRow = el("div", { class: "report-grid" });
    perProject.sort(function (a, b) { return b.bedrag - a.bedrag; });
    chartsRow.appendChild(reportCard("Begroot bedrag per project",
      hBarChart(perProject.map(function (p, i) { return { label: p.name, value: p.bedrag, color: PALETTE[i % PALETTE.length] }; }), { fmt: euro })));
    var phaseKeys = ["VO", "DO", "UO"].filter(function (k) { return phaseAgg[k]; });
    var phaseData = phaseKeys.map(function (k) { return { label: k, value: phaseAgg[k].bedrag, sub: nf(Math.round(phaseAgg[k].uren)) + " u", color: { VO: "#1f4e79", DO: "#2e8b57", UO: "#d97706" }[k] }; });
    chartsRow.appendChild(reportCard("Verdeling per fase (bedrag)", donutChart(phaseData, { fmt: euro })));
    holder.appendChild(chartsRow);

    holder.appendChild(reportCard("Begroot vs. werkelijk geboekte uren — per project",
      twoSeriesHBar(perProject.slice().sort(function (a, b) { return b.uren - a.uren; }).map(function (p) { return { label: p.name, a: p.uren, b: p.actUren }; }),
        { seriesA: { name: "Begroot", color: "#94a8c4" }, seriesB: { name: "Werkelijk", color: "#1f4e79" }, fmt: function (v) { return nf(Math.round(v)) + " u"; } })));

    var roleArr = Object.keys(roleAgg).map(function (nm) { return { name: nm, uren: roleAgg[nm].uren, actUren: roleAgg[nm].actUren || 0 }; })
      .filter(function (r) { return r.uren > 0; })
      .sort(function (a, b) { return b.uren - a.uren; });
    var row2 = el("div", { class: "report-grid" });
    row2.appendChild(reportCard("Begrote uren per rol",
      hBarChart(roleArr.map(function (r, i) { return { label: r.name, value: r.uren, color: PALETTE[i % PALETTE.length] }; }), { fmt: function (v) { return nf(Math.round(v)) + " u"; } })));
    row2.appendChild(reportCard("Begroot vs. werkelijk per rol",
      twoSeriesHBar(roleArr.map(function (r) { return { label: r.name, a: r.uren, b: r.actUren }; }),
        { seriesA: { name: "Begroot", color: "#94a8c4" }, seriesB: { name: "Werkelijk", color: "#2e8b57" }, fmt: function (v) { return nf(Math.round(v)) + " u"; } })));
    holder.appendChild(row2);
  }

  /* ----------- AI-rapportage genereren + exporteren ----------- */
  function generateReportDialog() {
    var projects = reportState.projects || [];
    var months = availableMonths(projects.filter(function (p) { return reportState.projSel[p.id] !== false; }));
    var title = el("input", { value: "Maandrapportage netuitbreiding 20kV", class: "full" });
    var monthSel = el("select", null, [el("option", { value: "" }, ["Volledige looptijd (alle data)"])].concat(months.map(function (m) {
      return el("option", { value: m, selected: m === reportState.month ? "selected" : null }, [monthLabelStr(m)]);
    })));
    var scope = el("select", null, [
      el("option", { value: "sel" }, ["Huidige projectselectie"]),
      el("option", { value: "all" }, ["Alle projecten"]),
    ]);
    var m = modal("Rapportage genereren", [
      el("p", { style: "color:var(--muted);font-size:13px;margin-top:0" }, ["De data wordt door AI geanalyseerd en omgezet in een opgemaakt rapport met tabellen en grafieken (HTML + PDF)."]),
      el("div", { class: "grid2" }, [
        el("label", { class: "field full" }, ["Titel", title]),
        el("label", { class: "field" }, ["Periode", monthSel]),
        el("label", { class: "field" }, ["Omvang", scope]),
      ]),
    ], [
      el("button", { class: "btn secondary", onclick: function () { m.close(); } }, ["Annuleren"]),
      el("button", { class: "btn", onclick: function () {
        var ids = scope.value === "all" ? [] : (reportState.projects || []).filter(function (p) { return reportState.projSel[p.id] !== false; }).map(function (p) { return p.id; });
        var body = { projectIds: ids, month: monthSel.value || null, title: title.value };
        m.close();
        generateReportLive(body);
      } }, ["Genereren"]),
    ]);
  }

  // SSE over fetch (POST met body). Roept handlers aan per event.
  // Valt terug op het niet-streamende /api/report als streaming niet beschikbaar is.
  function streamReport(body, onFacts, onDelta, onDone, onError) {
    function fallbackJson() {
      api.send("POST", "/api/report", body)
        .then(function (resp) { onFacts(resp.facts); onDone({ markdown: resp.markdown, aiUsed: resp.aiUsed }); })
        .catch(onError);
    }
    fetch("/api/report/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (res) {
      var ct = res.headers.get("content-type") || "";
      if (!res.ok || ct.indexOf("text/event-stream") < 0 || !res.body) { fallbackJson(); return; }
      var reader = res.body.getReader(), dec = new TextDecoder(), buf = "";
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) return;
          buf += dec.decode(r.value, { stream: true });
          var blocks = buf.split("\n\n"); buf = blocks.pop();
          blocks.forEach(function (block) {
            var ev = "message", data = "";
            block.split("\n").forEach(function (line) {
              if (line.indexOf("event:") === 0) ev = line.slice(6).trim();
              else if (line.indexOf("data:") === 0) data += line.slice(5).replace(/^ /, "");
            });
            if (!data) return;
            var parsed; try { parsed = JSON.parse(data); } catch (_) { parsed = data; }
            if (ev === "facts") onFacts(parsed);
            else if (ev === "delta") onDelta(parsed);
            else if (ev === "done") onDone(parsed);
            else if (ev === "error") onError(new Error((parsed && parsed.message) || "fout"));
          });
          return pump();
        });
      }
      return pump();
    }).catch(function () { fallbackJson(); });
  }

  // Live-weergave: dashboard + AI-analyse die live wordt geschreven, met download.
  function generateReportLive(body) {
    state.view = "report";
    setActiveNav("report");
    clear(app);
    app.appendChild(el("div", { class: "breadcrumb", onclick: function () { renderReport(); } }, ["← Terug naar rapportage"]));

    var badge = el("span", { class: "tag" }, ["bezig…"]);
    var dlHtml = el("button", { class: "btn secondary small", disabled: "disabled" }, ["⬇ HTML"]);
    var dlPdf = el("button", { class: "btn small", disabled: "disabled" }, ["⬇ PDF / Print"]);
    app.appendChild(el("div", { class: "row", style: "margin-bottom:10px" }, [
      el("h1", null, [body.title || "Rapportage"]),
      el("div", { class: "spacer" }), badge, dlHtml, dlPdf,
    ]));

    var dash = el("div");
    var loader = el("div", { class: "ai-loading" }, [el("span", { class: "hourglass" }, ["⏳"]), el("span", null, ["AI-analyse wordt voorbereid…"])]);
    var live = el("div", { class: "md-report" }, [loader]);
    app.appendChild(dash);
    app.appendChild(el("div", { class: "card" }, [el("div", { style: "font-weight:600;margin-bottom:8px" }, ["AI-analyse"]), live]));

    var facts = null, md = "", aiUsed = false, started = false, dirty = false;
    function scheduleRender() {
      if (dirty) return; dirty = true;
      requestAnimationFrame(function () { dirty = false; live.innerHTML = mdToHtml(md); });
    }
    function enableDownloads() {
      var html = buildReportHtml(facts, md, aiUsed);
      var frame = el("iframe", { id: "report-frame", style: "display:none" });
      frame.srcdoc = html; document.body.appendChild(frame);
      dlHtml.disabled = false; dlPdf.disabled = false;
      dlHtml.onclick = function () { downloadFile((body.title || "rapport") + ".html", html, "text/html"); };
      dlPdf.onclick = function () { var f = document.getElementById("report-frame"); if (f && f.contentWindow) { f.contentWindow.focus(); f.contentWindow.print(); } };
    }

    streamReport(body,
      function (f) { facts = f; clear(dash); dash.appendChild(renderFactsDashboard(f)); },
      function (chunk) { if (!started) { started = true; md = ""; } md += chunk; scheduleRender(); },
      function (done) { md = done.markdown || md; aiUsed = !!done.aiUsed; live.innerHTML = mdToHtml(md); badge.textContent = aiUsed ? "AI-analyse" : "zonder AI"; if (!aiUsed) badge.setAttribute("style", "background:#fde2b8;color:#92400e"); enableDownloads(); toast("Rapportage gereed"); },
      function (err) { badge.textContent = "fout"; toast(err.message, true); live.innerHTML = "<p style='color:#b42318'>" + esc(err.message) + "</p>"; }
    );
  }

  // Dashboard (KPI's + grafieken + tabellen) als DOM, uit facts.
  function renderFactsDashboard(f) {
    var euroStr = function (v) { return "€ " + (v || 0).toLocaleString("nl-NL"); };
    var uStr = function (v) { return nf(Math.round(v || 0)) + " u"; };
    var p = f.portfolio;
    var wrap = el("div");
    wrap.appendChild(el("div", { class: "kpi-grid" }, [
      kpiCard("Projecten", String(p.projectCount), "in rapportage"),
      kpiCard("Totaal begroot", euroStr(p.begrootBedrag), uStr(p.begrootUren)),
      kpiCard("Werkelijk geboekt", uStr(p.werkelijkUren), p.pctBesteed + "% · " + euroStr(p.werkelijkBedrag)),
      f.period ? kpiCard("Geboekt " + f.periodLabel, uStr(p.maandWerkelijkUren), euroStr(p.maandWerkelijkBedrag))
               : kpiCard("Resterend begroot", uStr(p.begrootUren - p.werkelijkUren), "nog te besteden"),
    ]));
    var projSorted = f.projects.slice().sort(function (a, b) { return b.begrootBedrag - a.begrootBedrag; });
    var phaseColors = { VO: "#1f4e79", DO: "#2e8b57", UO: "#d97706" };
    var row = el("div", { class: "report-grid" });
    row.appendChild(reportCard("Begroot bedrag per project",
      hBarChart(projSorted.map(function (pr, i) { return { label: shortName(pr.name), value: pr.begrootBedrag, color: PALETTE[i % PALETTE.length] }; }), { fmt: euroStr })));
    row.appendChild(reportCard("Verdeling per fase",
      donutChart(f.phases.map(function (ph) { return { label: ph.key, value: ph.bedrag, sub: uStr(ph.uren), color: phaseColors[ph.key] || "#1f4e79" }; }), { fmt: euroStr })));
    wrap.appendChild(row);
    wrap.appendChild(reportCard("Begroot vs. werkelijk geboekte uren — per project",
      twoSeriesHBar(projSorted.map(function (pr) { return { label: shortName(pr.name), a: pr.begrootUren, b: pr.werkelijkUren }; }),
        { seriesA: { name: "Begroot", color: "#94a8c4" }, seriesB: { name: "Werkelijk", color: "#1f4e79" }, fmt: uStr })));
    var rolesSorted = f.roles.slice().sort(function (a, b) { return b.begrootUren - a.begrootUren; });
    wrap.appendChild(reportCard("Begroot vs. werkelijk per rol",
      twoSeriesHBar(rolesSorted.map(function (r) { return { label: r.name, a: r.begrootUren, b: r.werkelijkUren }; }),
        { seriesA: { name: "Begroot", color: "#94a8c4" }, seriesB: { name: "Werkelijk", color: "#2e8b57" }, fmt: uStr })));
    // tabellen (zelfde HTML als in de download)
    var tables = el("div", { class: "card" });
    tables.innerHTML = "<div style='font-weight:600;margin-bottom:10px'>Onderbouwende cijfers</div><h3>Projecten</h3>" + projTableHtml(f) +
      "<h3>Inzet per rol</h3>" + roleTableHtml(f) + planTableHtml(f);
    wrap.appendChild(tables);
    return wrap;
  }
  function downloadFile(name, content, mime) {
    var blob = new Blob([content], { type: mime + ";charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = el("a", { href: url, download: (name || "rapport").replace(/[^a-z0-9_\-. ]/gi, "_") });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // Mini-markdown -> HTML (alinea's, **vet**, opsommingen).
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function mdToHtml(text) {
    var lines = String(text || "").split(/\n/);
    var out = [], i = 0, list = null, para = [];
    function flushPara() { if (para.length) { out.push("<p>" + inline(para.join(" ")) + "</p>"); para = []; } }
    function flushList() { if (list) { out.push("<ul>" + list.join("") + "</ul>"); list = null; } }
    function inline(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`(.+?)`/g, "<code>$1</code>"); }
    function cells(line) { return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(function (c) { return c.trim(); }); }
    while (i < lines.length) {
      var t = lines[i].trim();
      if (!t) { flushPara(); flushList(); i++; continue; }
      // Markdown-tabel: koprij + scheidingsrij (|---|---|) + body
      if (/^\|.*\|$/.test(t) && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
        flushPara(); flushList();
        var header = cells(t); i += 2; var body = [];
        while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) { body.push(cells(lines[i].trim())); i++; }
        out.push("<table class='rep'><thead><tr>" + header.map(function (h) { return "<th>" + inline(h) + "</th>"; }).join("") + "</tr></thead><tbody>" +
          body.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + inline(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>");
        continue;
      }
      var h = t.match(/^(#{1,4})\s+(.*)$/);
      if (h) { flushPara(); flushList(); var lvl = Math.min(h[1].length + 1, 4); out.push("<h" + lvl + ">" + inline(h[2]) + "</h" + lvl + ">"); i++; continue; }
      if (/^[-*]\s+/.test(t)) { flushPara(); if (!list) list = []; list.push("<li>" + inline(t.replace(/^[-*]\s+/, "")) + "</li>"); i++; continue; }
      flushList(); para.push(t); i++;
    }
    flushPara(); flushList();
    return out.join("\n");
  }
  function svgHtml(node) { return node ? node.outerHTML : ""; }

  // Herbruikbare tabel-HTML (live-weergave én download).
  function rEuro(v) { return "€ " + (v || 0).toLocaleString("nl-NL"); }
  function rUur(v) { return nf(Math.round(v || 0)) + " u"; }
  function projTableHtml(f) {
    var rows = f.projects.map(function (p) {
      return "<tr><td>" + esc(p.name) + "</td><td>" + esc(p.client || "") + "</td><td class='r'>" + rEuro(p.begrootBedrag) +
        "</td><td class='r'>" + rUur(p.begrootUren) + "</td><td class='r'>" + rUur(p.werkelijkUren) + "</td><td class='r'>" + p.pctBesteed + "%</td></tr>";
    }).join("");
    return "<table class='rep'><thead><tr><th>Project</th><th>Opdrachtgever</th><th class='r'>Begroot</th><th class='r'>Begrote uren</th><th class='r'>Werkelijk</th><th class='r'>Besteed</th></tr></thead><tbody>" + rows + "</tbody></table>";
  }
  function roleTableHtml(f) {
    var rows = f.roles.slice().sort(function (a, b) { return b.begrootUren - a.begrootUren; }).map(function (r) {
      return "<tr><td>" + esc(r.name) + "</td><td class='r'>" + rUur(r.begrootUren) + "</td><td class='r'>" + rUur(r.werkelijkUren) +
        "</td><td class='r'>" + rEuro(r.begrootBedrag) + "</td></tr>";
    }).join("");
    return "<table class='rep'><thead><tr><th>Rol / functie</th><th class='r'>Begrote uren</th><th class='r'>Werkelijke uren</th><th class='r'>Begroot bedrag</th></tr></thead><tbody>" + rows + "</tbody></table>";
  }
  function planTableHtml(f) {
    if (!f.monthPlanning || !f.monthPlanning.length) return "";
    var rows = f.monthPlanning.map(function (r) {
      var u = r.utilization;
      var col = u == null ? "" : u > 100 ? "background:#f8c9c2" : u > 85 ? "background:#fde2b8" : "background:#d7eccc";
      return "<tr><td>" + esc(r.role) + "</td><td class='r'>" + rUur(r.plannedUren) + "</td><td class='r'>" + (r.capacityUren != null ? rUur(r.capacityUren) : "—") +
        "</td><td class='r' style='" + col + "'>" + (u != null ? u + "%" : "—") + "</td></tr>";
    }).join("");
    return "<h3>Bezetting per rol — " + esc(f.periodLabel) + "</h3><table class='rep'><thead><tr><th>Rol</th><th class='r'>Gepland</th><th class='r'>Capaciteit</th><th class='r'>Bezetting</th></tr></thead><tbody>" + rows + "</tbody></table>";
  }

  function buildReportHtml(facts, markdown, aiUsed) {
    var f = facts;
    var euroStr = function (v) { return "€ " + (v || 0).toLocaleString("nl-NL"); };
    var uStr = function (v) { return nf(Math.round(v || 0)) + " u"; };

    var projSorted = f.projects.slice().sort(function (a, b) { return b.begrootBedrag - a.begrootBedrag; });
    var phaseColors = { VO: "#1f4e79", DO: "#2e8b57", UO: "#d97706" };
    var chartBedrag = hBarChart(projSorted.map(function (p, i) { return { label: shortName(p.name), value: p.begrootBedrag, color: PALETTE[i % PALETTE.length] }; }), { fmt: euroStr });
    var chartFase = donutChart(f.phases.map(function (p) { return { label: p.key, value: p.bedrag, sub: uStr(p.uren), color: phaseColors[p.key] || "#1f4e79" }; }), { fmt: euroStr });
    var chartBvw = twoSeriesHBar(projSorted.map(function (p) { return { label: shortName(p.name), a: p.begrootUren, b: p.werkelijkUren }; }),
      { seriesA: { name: "Begroot", color: "#94a8c4" }, seriesB: { name: "Werkelijk", color: "#1f4e79" }, fmt: uStr });
    var rolesSorted = f.roles.slice().sort(function (a, b) { return b.begrootUren - a.begrootUren; });
    var chartRol = twoSeriesHBar(rolesSorted.map(function (r) { return { label: r.name, a: r.begrootUren, b: r.werkelijkUren }; }),
      { seriesA: { name: "Begroot", color: "#94a8c4" }, seriesB: { name: "Werkelijk", color: "#2e8b57" }, fmt: uStr });

    var p = f.portfolio;
    var kpis =
      kpiHtml("Projecten", String(p.projectCount), "in rapportage") +
      kpiHtml("Totaal begroot", euroStr(p.begrootBedrag), uStr(p.begrootUren)) +
      kpiHtml("Werkelijk geboekt", uStr(p.werkelijkUren), p.pctBesteed + "% · " + euroStr(p.werkelijkBedrag)) +
      (f.period ? kpiHtml("Geboekt deze periode", uStr(p.maandWerkelijkUren), euroStr(p.maandWerkelijkBedrag))
                : kpiHtml("Resterend begroot", uStr(p.begrootUren - p.werkelijkUren), "nog te besteden"));

    var genStamp = new Date().toLocaleString("nl-NL");
    var css = "*{box-sizing:border-box}body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c2733;margin:0 auto;padding:32px;max-width:980px;line-height:1.5}" +
      "h1{font-size:26px;color:#1f4e79;margin:0 0 4px}h2{font-size:18px;color:#1f4e79;border-bottom:2px solid #d9e1f2;padding-bottom:4px;margin:28px 0 12px}h3{font-size:15px;margin:16px 0 4px}h4{font-size:13px;margin:12px 0 4px}" +
      ".sub{color:#6b7785;font-size:13px;margin-bottom:18px}p{margin:0 0 10px}ul{margin:0 0 10px 18px}" +
      ".kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}.kpi{border:1px solid #d8dde3;border-radius:10px;padding:12px}.kpi .t{color:#6b7785;font-size:12px}.kpi .v{font-size:20px;font-weight:700;color:#1f4e79}.kpi .s{color:#6b7785;font-size:11px}" +
      ".charts{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start}.chart{border:1px solid #eee;border-radius:8px;padding:10px}.chart .ct{font-weight:600;margin-bottom:8px;font-size:14px}" +
      "table.rep{border-collapse:collapse;width:100%;font-size:13px;margin:6px 0 16px}table.rep th,table.rep td{border:1px solid #e6eaef;padding:5px 8px;text-align:left}table.rep th{background:#f0f3f7}td.r,th.r{text-align:right}" +
      ".muted{color:#6b7785}.footer{margin-top:30px;color:#6b7785;font-size:11px;border-top:1px solid #e6eaef;padding-top:8px}" +
      "@media print{body{padding:0}h2{page-break-after:avoid}table.rep,.chart{page-break-inside:avoid}}";

    return "<!doctype html><html lang='nl'><head><meta charset='utf-8'><title>" + esc(f.title) + "</title><style>" + css + "</style></head><body>" +
      "<h1>" + esc(f.title) + "</h1>" +
      "<div class='sub'>" + esc(f.periodLabel) + " · gegenereerd op " + esc(genStamp) + (aiUsed ? " · AI-analyse" : " · zonder AI") + "</div>" +
      "<div class='kpis'>" + kpis + "</div>" +
      "<div class='charts'>" +
        "<div class='chart'><div class='ct'>Begroot bedrag per project</div>" + svgHtml(chartBedrag) + "</div>" +
        "<div class='chart'><div class='ct'>Verdeling per fase</div>" + svgHtml(chartFase) + "</div>" +
      "</div>" +
      "<div class='chart' style='margin-top:18px'><div class='ct'>Begroot vs. werkelijk geboekte uren — per project</div>" + svgHtml(chartBvw) + "</div>" +
      mdToHtml(markdown) +
      "<h2>Onderbouwende cijfers</h2>" +
      "<h3>Projecten</h3>" + projTableHtml(f) +
      "<h3>Inzet per rol</h3>" + roleTableHtml(f) +
      "<div class='chart'><div class='ct'>Begroot vs. werkelijk per rol</div>" + svgHtml(chartRol) + "</div>" +
      planTableHtml(f) +
      "<div class='footer'>HVP-TSB · " + esc(f.periodLabel) + " · " + esc(genStamp) + "</div>" +
      "</body></html>";
  }
  function kpiHtml(t, v, s) {
    return "<div class='kpi'><div class='t'>" + esc(t) + "</div><div class='v'>" + esc(v) + "</div><div class='s'>" + esc(s || "") + "</div></div>";
  }

  function kpiCard(title, value, sub) {
    return el("div", { class: "kpi-card" }, [
      el("div", { class: "kpi-title" }, [title]),
      el("div", { class: "kpi-value" }, [value]),
      el("div", { class: "kpi-sub" }, [sub || ""]),
    ]);
  }
  function reportCard(title, node) {
    return el("div", { class: "card" }, [el("div", { style: "font-weight:600;margin-bottom:10px" }, [title]), node]);
  }

  // Horizontale staafgrafiek (SVG).
  function hBarChart(data, opts) {
    opts = opts || {};
    var fmt = opts.fmt || function (v) { return nf(v); };
    var labelW = 190, barH = 24, gap = 10, w = 720, padR = 110;
    var h = data.length * (barH + gap) + 8;
    var max = data.reduce(function (m, d) { return Math.max(m, d.value); }, 0) || 1;
    var scaleW = w - labelW - padR;
    var kids = [];
    data.forEach(function (d, i) {
      var y = i * (barH + gap) + 4;
      var bw = Math.max((d.value / max) * scaleW, d.value > 0 ? 2 : 0);
      kids.push(svgEl("text", { x: labelW - 8, y: y + barH / 2 + 4, "text-anchor": "end", class: "svg-lbl" }, [d.label.length > 30 ? d.label.slice(0, 29) + "…" : d.label]));
      kids.push(svgEl("rect", { x: labelW, y: y, width: bw, height: barH, rx: 4, fill: d.color || "#1f4e79" }));
      kids.push(svgEl("text", { x: labelW + bw + 6, y: y + barH / 2 + 4, class: "svg-val" }, [fmt(d.value)]));
    });
    return svgEl("svg", { viewBox: "0 0 " + w + " " + h, width: "100%", height: h, style: "max-width:" + w + "px" }, kids);
  }

  // Twee-serie horizontale staafgrafiek (begroot vs. werkelijk).
  function twoSeriesHBar(rows, opts) {
    opts = opts || {};
    var fmt = opts.fmt || function (v) { return nf(v); };
    var A = opts.seriesA || { name: "A", color: "#94a8c4" };
    var B = opts.seriesB || { name: "B", color: "#1f4e79" };
    var labelW = 190, barH = 11, gapIn = 2, gap = 14, w = 720, padR = 110;
    var groupH = barH * 2 + gapIn;
    var h = rows.length * (groupH + gap) + 26;
    var max = rows.reduce(function (m, d) { return Math.max(m, d.a, d.b); }, 0) || 1;
    var scaleW = w - labelW - padR;
    var kids = [];
    // legenda bovenaan
    kids.push(svgEl("rect", { x: labelW, y: 0, width: 11, height: 11, rx: 2, fill: A.color }));
    kids.push(svgEl("text", { x: labelW + 16, y: 9, class: "svg-val" }, [A.name]));
    kids.push(svgEl("rect", { x: labelW + 90, y: 0, width: 11, height: 11, rx: 2, fill: B.color }));
    kids.push(svgEl("text", { x: labelW + 106, y: 9, class: "svg-val" }, [B.name]));
    rows.forEach(function (d, i) {
      var y = 22 + i * (groupH + gap);
      var aw = Math.max((d.a / max) * scaleW, d.a > 0 ? 2 : 0);
      var bw = Math.max((d.b / max) * scaleW, d.b > 0 ? 2 : 0);
      kids.push(svgEl("text", { x: labelW - 8, y: y + groupH / 2 + 4, "text-anchor": "end", class: "svg-lbl" }, [d.label.length > 30 ? d.label.slice(0, 29) + "…" : d.label]));
      kids.push(svgEl("rect", { x: labelW, y: y, width: aw, height: barH, rx: 3, fill: A.color }));
      kids.push(svgEl("text", { x: labelW + aw + 6, y: y + barH - 1, class: "svg-val" }, [fmt(d.a)]));
      kids.push(svgEl("rect", { x: labelW, y: y + barH + gapIn, width: bw, height: barH, rx: 3, fill: B.color }));
      var pct = d.a > 0 ? Math.round(d.b / d.a * 100) + "%" : "";
      kids.push(svgEl("text", { x: labelW + bw + 6, y: y + barH * 2 + gapIn - 1, class: "svg-val" }, [fmt(d.b) + (pct ? "  (" + pct + ")" : "")]));
    });
    return svgEl("svg", { viewBox: "0 0 " + w + " " + h, width: "100%", height: h, style: "max-width:" + w + "px" }, kids);
  }

  // Donut-grafiek (SVG) met legenda.
  function donutChart(data, opts) {
    opts = opts || {};
    var fmt = opts.fmt || function (v) { return nf(v); };
    var total = data.reduce(function (a, d) { return a + d.value; }, 0) || 1;
    var size = 200, cx = size / 2, cy = size / 2, R = 90, r = 54;
    function polar(cxx, cyy, rr, ang) { var a = (ang - 90) * Math.PI / 180; return [cxx + rr * Math.cos(a), cyy + rr * Math.sin(a)]; }
    var acc = 0, slices = [];
    data.forEach(function (d) {
      var a0 = acc / total * 360, a1 = (acc + d.value) / total * 360; acc += d.value;
      var large = (a1 - a0) > 180 ? 1 : 0;
      var o0 = polar(cx, cy, R, a0), o1 = polar(cx, cy, R, a1);
      var i1 = polar(cx, cy, r, a1), i0 = polar(cx, cy, r, a0);
      var path = ["M", o0[0], o0[1], "A", R, R, 0, large, 1, o1[0], o1[1], "L", i1[0], i1[1], "A", r, r, 0, large, 0, i0[0], i0[1], "Z"].join(" ");
      slices.push(svgEl("path", { d: path, fill: d.color }));
    });
    var svg = svgEl("svg", { viewBox: "0 0 " + size + " " + size, width: size, height: size }, slices);
    var legend = el("div", { style: "display:flex;flex-direction:column;gap:8px;justify-content:center" }, data.map(function (d) {
      return el("div", { style: "display:flex;align-items:center;gap:8px;font-size:13px" }, [
        el("span", { style: "width:12px;height:12px;border-radius:3px;background:" + d.color }),
        el("b", null, [d.label]),
        el("span", { style: "color:var(--muted)" }, [fmt(d.value) + (d.sub ? " · " + d.sub : "") + "  (" + Math.round(d.value / total * 100) + "%)"]),
      ]);
    }));
    return el("div", { style: "display:flex;gap:24px;align-items:center;flex-wrap:wrap" }, [svg, legend]);
  }

  /* ---------------- Start ---------------- */
  window.addEventListener("beforeunload", function (e) {
    if (state.dirty) { e.preventDefault(); e.returnValue = ""; }
  });
  render();
})();

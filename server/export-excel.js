/*
 * Excel-export van een project-TSB.
 * Produceert de volledige matrix (Inzet / Duur / Bedrag per rol),
 * vergelijkbaar met het oorspronkelijke begrotingsformat.
 */
const ExcelJS = require("exceljs");
const TSB = require("../public/compute.js");

const EUR = '€ #,##0.00;[Red]-€ #,##0.00';

async function buildWorkbook(project) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "HVP-TSB";
  wb.created = new Date();

  const roles = project.roles || [];
  const totals = TSB.computeBudget(project);

  const ws = wb.addWorksheet("TSB", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 6 }],
  });

  // Kolomopzet: A omschrijving, B eenheid, C hoeveelheid,
  // dan per rol: Inzet, Duur, Bedrag (3 kolommen),
  // daarna Totaal uren, Totaal bedrag, Prijs/ehd.
  const baseCols = 3;
  const perRole = 3;
  const roleStart = baseCols + 1; // 1-indexed kolom

  // Titelblok
  ws.mergeCells(1, 1, 1, baseCols + roles.length * perRole + 3);
  ws.getCell(1, 1).value = "Technische Staat van Begroting (TSB)";
  ws.getCell(1, 1).font = { bold: true, size: 16 };

  const metaLines = [
    ["Project", project.name || ""],
    ["Opdrachtgever", project.client || ""],
    ["Projectnummer", project.projectNumber || ""],
    ["Datum", project.date || ""],
  ];
  metaLines.forEach((m, i) => {
    ws.getCell(2 + Math.floor(i / 2), 1 + (i % 2) * 4).value = m[0] + ":";
    ws.getCell(2 + Math.floor(i / 2), 1 + (i % 2) * 4).font = { bold: true };
    ws.getCell(2 + Math.floor(i / 2), 2 + (i % 2) * 4).value = m[1];
  });

  // Kopregels (rij 5 = groepslabel per rol, rij 6 = subkoppen)
  const headRow1 = 5;
  const headRow2 = 6;
  ws.getCell(headRow2, 1).value = "Omschrijving";
  ws.getCell(headRow2, 2).value = "Eenheid";
  ws.getCell(headRow2, 3).value = "Hoeveelheid";

  roles.forEach((role, ri) => {
    const c0 = roleStart + ri * perRole;
    ws.mergeCells(headRow1, c0, headRow1, c0 + 2);
    ws.getCell(headRow1, c0).value = role.name + " (€ " + role.rate + ")";
    ws.getCell(headRow1, c0).alignment = { horizontal: "center" };
    ws.getCell(headRow2, c0).value = "Inzet";
    ws.getCell(headRow2, c0 + 1).value = "Duur";
    ws.getCell(headRow2, c0 + 2).value = "Bedrag";
  });
  const totUrenCol = roleStart + roles.length * perRole;
  const totBedragCol = totUrenCol + 1;
  const prijsCol = totUrenCol + 2;
  ws.getCell(headRow2, totUrenCol).value = "Totaal uren";
  ws.getCell(headRow2, totBedragCol).value = "Totaal bedrag";
  ws.getCell(headRow2, prijsCol).value = "Prijs/ehd";

  [headRow1, headRow2].forEach((r) => {
    ws.getRow(r).font = { bold: true };
    ws.getRow(r).alignment = { vertical: "middle" };
  });

  let row = headRow2 + 1;

  function styleFill(cell, color) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
  }

  (project.sections || []).forEach((section) => {
    const sTotal = totals.sections.find((s) => s.id === section.id);
    // Sectiekop
    const sRow = ws.getRow(row);
    sRow.getCell(1).value = (section.code ? section.code + "  " : "") + section.name;
    sRow.font = { bold: true, size: 12 };
    for (let c = 1; c <= prijsCol; c++) styleFill(sRow.getCell(c), "FFD9E1F2");
    row++;

    (section.groups || []).forEach((group) => {
      const gRow = ws.getRow(row);
      gRow.getCell(1).value = "   " + group.name;
      gRow.font = { italic: true, bold: true };
      for (let c = 1; c <= prijsCol; c++) styleFill(gRow.getCell(c), "FFF2F2F2");
      row++;

      (group.items || []).forEach((it) => {
        const c = TSB.computeItem(it, roles);
        const r = ws.getRow(row);
        r.getCell(1).value = "      " + it.name;
        r.getCell(2).value = it.unit;
        r.getCell(3).value = c.quantity;
        roles.forEach((role, ri) => {
          const c0 = roleStart + ri * perRole;
          r.getCell(c0).value = it.inzet[role.id] || 0;
          r.getCell(c0 + 1).value = c.duur[role.id] || 0;
          const bcell = r.getCell(c0 + 2);
          bcell.value = c.bedrag[role.id] || 0;
          bcell.numFmt = EUR;
        });
        r.getCell(totUrenCol).value = c.totaalUren;
        const tb = r.getCell(totBedragCol);
        tb.value = c.totaalBedrag;
        tb.numFmt = EUR;
        const pc = r.getCell(prijsCol);
        if (c.prijs != null) {
          pc.value = c.prijs;
          pc.numFmt = EUR + ' "' + (it.priceUnit || TSB.unitDefaults(it.unit).priceUnit) + '"';
        } else {
          pc.value = "-";
        }
        row++;
      });
    });

    // Sectietotaal
    const tRow = ws.getRow(row);
    tRow.getCell(1).value = "   Totaal " + section.name;
    tRow.font = { bold: true };
    roles.forEach((role, ri) => {
      const c0 = roleStart + ri * perRole;
      tRow.getCell(c0 + 1).value = sTotal.perRole[role.id].duur;
      const bcell = tRow.getCell(c0 + 2);
      bcell.value = sTotal.perRole[role.id].bedrag;
      bcell.numFmt = EUR;
    });
    tRow.getCell(totUrenCol).value = sTotal.uren;
    const stb = tRow.getCell(totBedragCol);
    stb.value = sTotal.bedrag;
    stb.numFmt = EUR;
    for (let cc = 1; cc <= prijsCol; cc++) styleFill(tRow.getCell(cc), "FFE2EFDA");
    row += 2;
  });

  // Eindtotaal
  const eRow = ws.getRow(row);
  eRow.getCell(1).value = "EINDTOTAAL";
  eRow.font = { bold: true, size: 13 };
  eRow.getCell(totUrenCol).value = totals.grand.uren;
  eRow.getCell(totUrenCol).font = { bold: true };
  const etb = eRow.getCell(totBedragCol);
  etb.value = totals.grand.bedrag;
  etb.numFmt = EUR;
  etb.font = { bold: true, size: 13 };
  for (let cc = 1; cc <= prijsCol; cc++) styleFill(eRow.getCell(cc), "FFFCE4D6");

  // Kolombreedtes
  ws.getColumn(1).width = 42;
  ws.getColumn(2).width = 10;
  ws.getColumn(3).width = 12;
  for (let c = roleStart; c < totUrenCol; c++) ws.getColumn(c).width = 10;
  ws.getColumn(totUrenCol).width = 12;
  ws.getColumn(totBedragCol).width = 16;
  ws.getColumn(prijsCol).width = 16;

  return wb;
}

async function exportExcel(project) {
  const wb = await buildWorkbook(project);
  return wb.xlsx.writeBuffer();
}

module.exports = { exportExcel };

/*
 * PDF-export van een project-TSB: een nette, afdrukbare samenvatting
 * (offerte-stijl) met per fase de regelitems, subtotalen en eindtotaal.
 */
const PDFDocument = require("pdfkit");
const TSB = require("../public/compute.js");

function euro(n) {
  if (n == null || !isFinite(n)) return "-";
  return "€ " + n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function exportPdf(project) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40, layout: "portrait" });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const roles = project.roles || [];
    const totals = TSB.computeBudget(project);

    // Kolommen voor de tabel
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;
    const col = {
      naam: left,
      ehd: left + width * 0.58,
      hv: left + width * 0.68,
      uren: left + width * 0.78,
      bedrag: left + width * 0.86,
    };

    // Titel
    doc.font("Helvetica-Bold").fontSize(18).text("Technische Staat van Begroting (TSB)", { align: "left" });
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(10).fillColor("#444");
    doc.text(`Project: ${project.name || "-"}`);
    if (project.client) doc.text(`Opdrachtgever: ${project.client}`);
    if (project.projectNumber) doc.text(`Projectnummer: ${project.projectNumber}`);
    doc.text(`Datum: ${project.date || ""}`);
    doc.fillColor("#000");
    doc.moveDown(0.6);

    function ensureSpace(h) {
      if (doc.y + h > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        tableHeader();
      }
    }

    function tableHeader() {
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#000");
      const y = doc.y;
      doc.text("Omschrijving", col.naam, y, { width: col.ehd - col.naam - 4 });
      doc.text("Ehd", col.ehd, y, { width: col.hv - col.ehd - 4 });
      doc.text("Hv", col.hv, y, { width: col.uren - col.hv - 4, align: "right" });
      doc.text("Uren", col.uren, y, { width: col.bedrag - col.uren - 4, align: "right" });
      doc.text("Bedrag", col.bedrag, y, { width: right - col.bedrag, align: "right" });
      doc.moveTo(left, doc.y + 1).lineTo(right, doc.y + 1).strokeColor("#999").stroke();
      doc.moveDown(0.3);
    }

    tableHeader();

    (project.sections || []).forEach((section) => {
      const sTotal = totals.sections.find((s) => s.id === section.id);
      ensureSpace(40);
      doc.moveDown(0.2);
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#1f4e79");
      doc.text((section.code ? section.code + "  " : "") + section.name, col.naam);
      doc.fillColor("#000");
      doc.moveDown(0.1);

      (section.groups || []).forEach((group) => {
        const hasFilled = (group.items || []).some((it) => TSB.computeItem(it, roles).totaalBedrag > 0);
        ensureSpace(20);
        doc.font("Helvetica-Oblique").fontSize(9).fillColor("#555");
        doc.text("  " + group.name, col.naam);
        doc.fillColor("#000");

        (group.items || []).forEach((it) => {
          const c = TSB.computeItem(it, roles);
          ensureSpace(14);
          const y = doc.y;
          doc.font("Helvetica").fontSize(8.5);
          doc.text("    " + it.name, col.naam, y, { width: col.ehd - col.naam - 4 });
          const y2 = doc.y; // na mogelijk wrappen
          doc.text(it.unit, col.ehd, y, { width: col.hv - col.ehd - 4 });
          doc.text(String(c.quantity), col.hv, y, { width: col.uren - col.hv - 4, align: "right" });
          doc.text(String(c.totaalUren), col.uren, y, { width: col.bedrag - col.uren - 4, align: "right" });
          doc.text(euro(c.totaalBedrag), col.bedrag, y, { width: right - col.bedrag, align: "right" });
          if (doc.y < y2) doc.y = y2;
        });
      });

      // Subtotaal sectie
      ensureSpace(18);
      doc.moveTo(left, doc.y + 1).lineTo(right, doc.y + 1).strokeColor("#ccc").stroke();
      doc.moveDown(0.2);
      const y = doc.y;
      doc.font("Helvetica-Bold").fontSize(9);
      doc.text("Subtotaal " + section.name, col.naam, y, { width: col.uren - col.naam - 4 });
      doc.text(String(sTotal.uren), col.uren, y, { width: col.bedrag - col.uren - 4, align: "right" });
      doc.text(euro(sTotal.bedrag), col.bedrag, y, { width: right - col.bedrag, align: "right" });
      doc.moveDown(0.6);
    });

    // Eindtotaal
    ensureSpace(30);
    doc.moveTo(left, doc.y + 2).lineTo(right, doc.y + 2).strokeColor("#000").lineWidth(1.2).stroke();
    doc.moveDown(0.3);
    const y = doc.y;
    doc.font("Helvetica-Bold").fontSize(12);
    doc.text("EINDTOTAAL", col.naam, y, { width: col.uren - col.naam - 4 });
    doc.text(String(totals.grand.uren) + " u", col.uren, y, { width: col.bedrag - col.uren - 4, align: "right" });
    doc.text(euro(totals.grand.bedrag), col.bedrag, y, { width: right - col.bedrag, align: "right" });

    doc.end();
  });
}

module.exports = { exportPdf };

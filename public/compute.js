/*
 * Gedeelde berekeningslogica voor TSB's.
 * Werkt zowel in de browser (window.TSB) als in Node (module.exports).
 *
 * Rekenregels (afgeleid uit het oorspronkelijke begrotingsformat):
 *   inzet[rol]   = aantal uren van die rol per eenheid
 *   duur[rol]    = inzet[rol] * hoeveelheid
 *   bedrag[rol]  = duur[rol] * tarief[rol]
 *   totaalBedrag = som van alle bedrag[rol]
 *   prijs/ehd    = totaalBedrag / (hoeveelheid * prijsFactor)
 *
 * prijsFactor zet de hoeveelheid om naar de prijseenheid.
 * Bijv. eenheid "km" met prijs "/m" -> prijsFactor 1000.
 */
(function (root) {
  "use strict";

  // Standaard afleiding van eenheid -> prijseenheid + factor.
  var UNIT_DEFAULTS = {
    km: { priceUnit: "/m", priceFactor: 1000 },
    m: { priceUnit: "/m", priceFactor: 1 },
    st: { priceUnit: "/st", priceFactor: 1 },
    keer: { priceUnit: "/keer", priceFactor: 1 },
    week: { priceUnit: "/week", priceFactor: 1 },
    dag: { priceUnit: "/dag", priceFactor: 1 },
    uur: { priceUnit: "/uur", priceFactor: 1 },
  };

  function unitDefaults(unit) {
    return UNIT_DEFAULTS[unit] || { priceUnit: "/" + (unit || "st"), priceFactor: 1 };
  }

  function num(v) {
    var n = typeof v === "number" ? v : parseFloat(v);
    return isFinite(n) ? n : 0;
  }

  // Bereken één regelitem op basis van de rollen (met tarieven).
  function computeItem(item, roles) {
    var quantity = num(item.quantity);
    var inzet = item.inzet || {};
    var priceFactor = item.priceFactor != null ? num(item.priceFactor) : unitDefaults(item.unit).priceFactor;

    var duur = {};
    var bedrag = {};
    var totaalUren = 0;
    var totaalBedrag = 0;

    roles.forEach(function (role) {
      var hpu = num(inzet[role.id]);
      var d = hpu * quantity;
      var b = d * num(role.rate);
      duur[role.id] = d;
      bedrag[role.id] = b;
      totaalUren += d;
      totaalBedrag += b;
    });

    var denom = quantity * priceFactor;
    var prijs = denom > 0 ? totaalBedrag / denom : null;

    return {
      quantity: quantity,
      duur: duur,
      bedrag: bedrag,
      totaalUren: totaalUren,
      totaalBedrag: totaalBedrag,
      prijs: prijs,
    };
  }

  // Bereken een hele begroting (alle secties/groepen/items) + totalen.
  function computeBudget(doc) {
    var roles = doc.roles || [];
    var sectionTotals = [];
    var grand = { uren: 0, bedrag: 0, perRole: {} };
    roles.forEach(function (r) {
      grand.perRole[r.id] = { duur: 0, bedrag: 0 };
    });

    (doc.sections || []).forEach(function (section) {
      var sTotal = { id: section.id, uren: 0, bedrag: 0, perRole: {}, groups: [] };
      roles.forEach(function (r) {
        sTotal.perRole[r.id] = { duur: 0, bedrag: 0 };
      });

      (section.groups || []).forEach(function (group) {
        var gTotal = { id: group.id, uren: 0, bedrag: 0, perRole: {}, items: {} };
        roles.forEach(function (r) {
          gTotal.perRole[r.id] = { duur: 0, bedrag: 0 };
        });

        (group.items || []).forEach(function (item) {
          var c = computeItem(item, roles);
          gTotal.items[item.id] = c;
          gTotal.uren += c.totaalUren;
          gTotal.bedrag += c.totaalBedrag;
          roles.forEach(function (r) {
            gTotal.perRole[r.id].duur += c.duur[r.id];
            gTotal.perRole[r.id].bedrag += c.bedrag[r.id];
          });
        });

        sTotal.uren += gTotal.uren;
        sTotal.bedrag += gTotal.bedrag;
        roles.forEach(function (r) {
          sTotal.perRole[r.id].duur += gTotal.perRole[r.id].duur;
          sTotal.perRole[r.id].bedrag += gTotal.perRole[r.id].bedrag;
        });
        sTotal.groups.push(gTotal);
      });

      grand.uren += sTotal.uren;
      grand.bedrag += sTotal.bedrag;
      roles.forEach(function (r) {
        grand.perRole[r.id].duur += sTotal.perRole[r.id].duur;
        grand.perRole[r.id].bedrag += sTotal.perRole[r.id].bedrag;
      });
      sectionTotals.push(sTotal);
    });

    return { sections: sectionTotals, grand: grand };
  }

  var TSB = {
    UNIT_DEFAULTS: UNIT_DEFAULTS,
    unitDefaults: unitDefaults,
    computeItem: computeItem,
    computeBudget: computeBudget,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = TSB;
  } else {
    root.TSB = TSB;
  }
})(typeof self !== "undefined" ? self : this);

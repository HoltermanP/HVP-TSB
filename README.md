# HVP-TSB

Applicatie om **TSB's (kostenbegrotingen)** op te stellen. Je stelt eerst een
herbruikbaar **format** in (rollen + tarieven en de structuur van fasen,
groepen en regelitems). Vervolgens maak je per project een TSB op basis van dat
format, vult de hoeveelheden en inzet in, en exporteert het resultaat naar
**Excel** of **PDF**.

## Installeren

Vereist [Node.js](https://nodejs.org) 18 of hoger.

```bash
cd HVP-TSB
npm install
```

## Starten

```bash
npm start
```

Open daarna in je browser: **http://localhost:3000**

De server slaat alle data centraal op in `data/db.json`. Draai je de server op
één machine in het netwerk, dan delen collega's automatisch dezelfde formats en
projecten. Bij de eerste start wordt een standaard-format (VO/DO/UO) aangemaakt
op basis van het oorspronkelijke begrotingsformat.

## Gebruik

1. **Formats** – beheer rollen + uurtarieven en de structuur (fasen → groepen →
   regelitems). Per regelitem stel je een eenheid in (km, st, keer, week, …) en
   de standaard inzet (uren per eenheid) per rol.
2. **Projecten** – maak een nieuw project op basis van een format. In de
   TSB-tabel vul je per regelitem de hoeveelheid (Hv) en eventueel afwijkende
   inzet in. Bedragen, uren en de prijs per eenheid worden automatisch berekend,
   met subtotalen per fase en een eindtotaal.
3. **Export** – exporteer een project naar Excel (volledige matrix) of PDF
   (nette samenvatting).

## Rekenregels

```
duur[rol]    = inzet[rol] × hoeveelheid
bedrag[rol]  = duur[rol] × tarief[rol]
totaalbedrag = som van alle bedragen
prijs/ehd    = totaalbedrag / (hoeveelheid × prijsfactor)
```

De prijsfactor zet de hoeveelheid om naar de prijseenheid (bijv. eenheid `km`
met prijs `/m` → factor 1000).

## Configuratie

- `PORT` – poort van de server (standaard `3000`).

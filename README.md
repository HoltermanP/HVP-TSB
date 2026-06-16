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

## Opslag

- **Lokaal zonder database**: data staat in `data/db.json` (met `data/seed.json` als
  startdata). Geen configuratie nodig.
- **Met Neon / Postgres** (aanbevolen voor productie/Vercel): zet de
  omgevingsvariabele `DATABASE_URL` op de Neon-connectiestring. De app maakt dan
  automatisch de tabellen `formats`, `projects` en `settings` (JSONB) aan en vult
  een lege database eenmalig met `data/seed.json`.

### Neon koppelen

1. Maak een database aan op [neon.tech](https://neon.tech) (of via de Neon-integratie
   in Vercel) en kopieer de **pooled** connectiestring.
2. Op Vercel: voeg deze toe als project-environmentvariabele `DATABASE_URL`
   (Settings → Environment Variables) en deploy opnieuw.
3. Lokaal testen: `export DATABASE_URL="postgres://...neon.tech/...?sslmode=require"`
   en dan `npm start`.
4. Database (her)vullen vanuit de seed:
   `DATABASE_URL="..." node scripts/seed-neon.js` (leegt en vult de tabellen).

## Deploy naar Vercel

`vercel.json` draait de Express-app als serverless functie (`api/index.js`).
Zonder `DATABASE_URL` toont Vercel de demodata read-only (wijzigingen blijven niet
bewaard); mét `DATABASE_URL` worden wijzigingen persistent opgeslagen in Neon.

## Managementrapportage (AI)

Onder de tab **Rapportage** kun je filteren op project en functie (rol) en op
periode (maand). Met **"✨ Genereer rapportage (AI)"** maak je een opgemaakt
rapport: de cijfers worden berekend en door **Claude** geanalyseerd tot een
managementrapportage met samenvatting, per-project-analyse, bezetting, risico's
en aanbevelingen — inclusief tabellen en grafieken. Het rapport is te downloaden
als **HTML** en als **PDF** (via Print → Opslaan als pdf).

- Zet `ANTHROPIC_API_KEY` om de AI-analyse te activeren (model `claude-opus-4-8`).
  Zonder deze sleutel wordt een nette rapportage zonder AI-tekst gegenereerd.
- Op Vercel: voeg `ANTHROPIC_API_KEY` toe als environmentvariabele.

## Configuratie

- `PORT` – poort van de server (standaard `3000`).
- `DATABASE_URL` – Neon/Postgres-connectiestring (optioneel; zonder dit draait de
  bestand-backend).
- `ANTHROPIC_API_KEY` – sleutel voor de AI-rapportage (optioneel).

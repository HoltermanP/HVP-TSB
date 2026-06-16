/*
 * Laadt data/seed.json in een Neon/Postgres-database (forceert opnieuw vullen).
 * Gebruik:  DATABASE_URL="postgres://...neon.tech/..." node scripts/seed-neon.js
 *
 * Let op: dit LEEGT de tabellen formats/projects/settings en vult ze opnieuw.
 */
const fs = require("fs");
const path = require("path");
const { neon } = require("@neondatabase/serverless");

if (!process.env.DATABASE_URL) {
  console.error("Zet eerst DATABASE_URL (de Neon-connectiestring).");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);
const seed = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "seed.json"), "utf8"));

(async () => {
  await sql`CREATE TABLE IF NOT EXISTS formats  (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS projects (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS settings (id text PRIMARY KEY, data jsonb NOT NULL)`;

  await sql`TRUNCATE formats`;
  await sql`TRUNCATE projects`;
  await sql`TRUNCATE settings`;

  for (const f of seed.formats || []) {
    await sql`INSERT INTO formats (id, data) VALUES (${f.id}, ${JSON.stringify(f)}::jsonb)`;
  }
  for (const p of seed.projects || []) {
    await sql`INSERT INTO projects (id, data) VALUES (${p.id}, ${JSON.stringify(p)}::jsonb)`;
  }
  const s = seed.settings || { capacityPerWeek: {} };
  await sql`INSERT INTO settings (id, data) VALUES ('global', ${JSON.stringify(s)}::jsonb)`;

  console.log(`Klaar: ${(seed.formats || []).length} format(s), ${(seed.projects || []).length} project(en) geladen in Neon.`);
})().catch((e) => { console.error("FOUT:", e.message); process.exit(1); });

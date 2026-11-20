#!/usr/bin/env node
/**
 * Restaure une sauvegarde A.C.T.E.S (fichier actes-sauvegarde-*.json du dossier Drive « Sauvegardes A.C.T.E.S »).
 *
 *   SUPABASE_URL=https://qmggmwdfzsacjpykvjvf.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=…(Supabase › Project Settings › API keys › service_role) \
 *   node scripts/restaurer.mjs chemin/actes-sauvegarde-AAAA-MM-JJ_HH-MM.json [--collection crm_actes_resas] [--remplacer]
 *
 * Par défaut : remet chaque élément de la sauvegarde tel qu'il était (les éléments créés depuis sont conservés).
 * --collection X : ne restaure que cette collection (ex. crm_actes_resas, chalet_config…).
 * --remplacer    : supprime d'abord les éléments des collections restaurées qui n'existaient pas dans la sauvegarde.
 * Les suppressions passent par la corbeille du logiciel (gardée 90 jours).
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const fichier = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--collection");
const iCol = args.indexOf("--collection");
const seule = iCol >= 0 ? args[iCol + 1] : null;
const remplacer = args.includes("--remplacer");
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!fichier || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Usage : SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/restaurer.mjs fichier.json [--collection X] [--remplacer]");
  process.exit(1);
}
const s = JSON.parse(readFileSync(fichier, "utf8"));
if (s.format !== "actes-sauvegarde-1") throw new Error("Ce fichier n'est pas une sauvegarde A.C.T.E.S.");
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const docs = s.documents.filter((d) => !seule || d.collection === seule);
console.log(`Sauvegarde du ${s.cree_le} — ${docs.length} éléments à restaurer${seule ? " (collection " + seule + ")" : ""}.`);

if (remplacer) {
  for (const col of [...new Set(docs.map((d) => d.collection))]) {
    const garder = new Set(docs.filter((d) => d.collection === col).map((d) => d.id));
    const { data, error } = await sb.from("documents").select("id").eq("collection", col);
    if (error) throw error;
    const enTrop = (data || []).map((r) => r.id).filter((id) => !garder.has(id));
    for (let i = 0; i < enTrop.length; i += 200) {
      const { error: e } = await sb.from("documents").delete().eq("collection", col).in("id", enTrop.slice(i, i + 200));
      if (e) throw e;
    }
    if (enTrop.length) console.log(`  ${col} : ${enTrop.length} élément(s) récent(s) retiré(s).`);
  }
}
for (let i = 0; i < docs.length; i += 500) {
  const lot = docs.slice(i, i + 500).map((d) => ({ collection: d.collection, id: d.id, data: d.data }));
  const { error } = await sb.from("documents").upsert(lot, { onConflict: "collection,id" });
  if (error) throw error;
}
if (!seule && Array.isArray(s.acces) && s.acces.length) {
  const { error } = await sb.from("acces").upsert(s.acces.map((a) => ({ email: a.email, nom: a.nom, role: a.role })), { onConflict: "email" });
  if (error) throw error;
}
console.log("Restauration terminée.");

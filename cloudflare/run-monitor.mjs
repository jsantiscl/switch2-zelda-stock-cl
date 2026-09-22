import { runMonitor } from "./src/monitor-core.js";

const repo = process.env.GITHUB_REPOSITORY || "jsantiscl/switch2-zelda-stock-cl";
const [owner, name] = repo.split("/");

const scheduledRaw = process.env.SCHEDULED_TIME || "";
const scheduledTime = scheduledRaw ? Date.parse(scheduledRaw) : Date.now();

if (!Number.isFinite(scheduledTime)) {
  throw new Error(`Invalid SCHEDULED_TIME: ${scheduledRaw}`);
}

const env = {
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  GITHUB_OWNER: owner,
  GITHUB_REPO: name,
};

if (!env.GITHUB_TOKEN) {
  throw new Error("Missing GITHUB_TOKEN in GitHub Actions");
}

const result = await runMonitor(env, scheduledTime, false);

console.log(
  [
    "MONITOR GITHUB OK",
    `${result.checked_stores} tiendas`,
    `${result.reliable_stores} lecturas fiables`,
    `${result.skipped_stores} bloqueadas/no concluyentes`,
    `${result.alerts} alertas`,
    `Mercado Libre: ${result.mercado_libre}`,
    `Zona Gamer: ${result.zona_gamer}`,
    `social: ${result.social_ran ? "sí" : "no"}`,
    `búsqueda amplia: ${result.discovery_ran ? "sí" : "no"}`,
    `nuevas: ${result.discovered_new}`,
  ].join(" · "),
);

console.log(JSON.stringify({ ok: true, scheduled_time: new Date(scheduledTime).toISOString(), ...result }));

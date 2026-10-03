import { appendFile } from "node:fs/promises";
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
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
};

if (!env.GITHUB_TOKEN) {
  throw new Error("Missing GITHUB_TOKEN in GitHub Actions");
}

function statusText(status) {
  return {
    available: "🟢 Disponible / preventa",
    unavailable: "🔴 Agotado / sin stock",
    page_missing: "⚪ Página no disponible",
    unknown: "🟡 No concluyente",
    error: "⚠️ Bloqueado / error",
  }[status] || String(status || "—");
}

function priceText(value) {
  if (value == null) return "—";
  return "$" + new Intl.NumberFormat("es-CL").format(value);
}

function safeCell(value) {
  return String(value ?? "—")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

function sourceText(value) {
  const labels = {
    not_found: "⚪ No encontrada",
    not_checked: "⏭️ No correspondía revisar",
    candidate_detected: "🟢 Candidata detectada",
    blocked_or_challenge: "⚠️ Bloqueada / challenge",
    fetch_error: "⚠️ Error de lectura",
  };
  return labels[value] || String(value || "—");
}

async function writeSummary(result) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  const rows = (result.stores || []).map((store) =>
    `| ${safeCell(store.name)} | ${safeCell(statusText(store.status))} | ${safeCell(priceText(store.price_clp))} | ${safeCell(store.http ?? "—")} |`
  );

  const telegram = result.telegram_sent
    ? "✅ Enviado"
    : result.telegram_reason === "no_alerts"
      ? "ℹ️ Sin alertas"
      : result.telegram_reason === "not_configured"
        ? "⚠️ No configurado"
        : `⚠️ ${result.telegram_reason || "No enviado"}`;

  const markdown = [
    "# 🎮 Monitor Switch 2 Zelda 40th",
    "",
    `**Revisión:** ${new Date(scheduledTime).toISOString()}  `,
    `**Resultado:** ${result.alerts > 0 ? "🚨 " + result.alerts + " alerta(s)" : "✅ Sin novedades accionables"}`,
    "",
    "## Tiendas conocidas",
    "",
    "| Tienda | Estado | Precio | HTTP |",
    "|---|---|---:|---:|",
    ...(rows.length ? rows : ["| — | — | — | — |"]),
    "",
    "## Fuentes adicionales",
    "",
    "| Fuente | Resultado |",
    "|---|---|",
    `| Mercado Libre · Nintendo Oficial | ${safeCell(sourceText(result.mercado_libre))} |`,
    `| Catálogos Chile | ${safeCell(result.retailer_catalogs || "not_checked")} |`,
    `| Zona Gamer Iquique | ${safeCell(result.zona_gamer || "not_checked")} |`,
    `| Redes sociales | ${result.social_ran ? "✅ Revisadas" : "⏭️ No correspondía revisar"} |`,
    `| Búsqueda ampliada | ${result.discovery_ran ? "✅ Ejecutada" : "⏭️ No correspondía revisar"} |`,
    "",
    "## Estado del monitor",
    "",
    `- **Lecturas fiables:** ${result.reliable_stores} de ${result.checked_stores}`,
    `- **Bloqueadas/no concluyentes:** ${result.skipped_stores}`,
    `- **Nuevas publicaciones detectadas:** ${result.discovered_new}`,
    `- **Confirmaciones de disponibilidad pendientes:** ${result.pending_availability_confirmations || 0}`,
    `- **Telegram:** ${telegram}`,
    "",
  ].join("\n");

  await appendFile(summaryPath, markdown, "utf8");
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
    `Catálogos Chile: ${result.retailer_catalogs || "not_checked"}`,
    `Zona Gamer: ${result.zona_gamer}`,
    `social: ${result.social_ran ? "sí" : "no"}`,
    `búsqueda amplia: ${result.discovery_ran ? "sí" : "no"}`,
    `nuevas: ${result.discovered_new}`,
    `confirmaciones pendientes: ${result.pending_availability_confirmations || 0}`,
    `Telegram: ${result.telegram_sent ? "enviado" : result.telegram_reason}`,
  ].join(" · "),
);

await writeSummary(result);

console.log(
  JSON.stringify({
    ok: true,
    scheduled_time: new Date(scheduledTime).toISOString(),
    ...result,
  }),
);

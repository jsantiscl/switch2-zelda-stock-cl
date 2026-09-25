const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!token) throw new Error("Falta TELEGRAM_BOT_TOKEN");
if (!chatId) throw new Error("Falta TELEGRAM_CHAT_ID");

const text = [
  "✅ PRUEBA DEL MONITOR ZELDA",
  "",
  "El bot de Telegram quedó conectado correctamente.",
  "Cuando aparezca stock o preventa de la Nintendo Switch 2 Zelda 40th Anniversary, el monitor avisará aquí además de GitHub.",
].join("\n");

const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  }),
});

const body = await r.text();
if (!r.ok) {
  throw new Error(`Telegram respondió ${r.status}: ${body}`);
}

console.log("TELEGRAM TEST OK · mensaje enviado correctamente");

const STORES = [
  {
    name: "Bestmart",
    url: "https://bestmart.cl/products/consola-nintendo-switch-2-the-legend-of-zelda-edicion-40-aniversario",
  },
  {
    name: "Santo Games",
    url: "https://www.santogames.cl/nintendo-switch-2-the-legend-of-zelda-40%C2%BA-aniversario",
  },
  {
    name: "Play Service",
    url: "https://playservice.cl/producto/preventa-consola-nintendo-switch-2-the-legend-of-zelda-40th-anniversary/",
  },
  {
    name: "Mathogames",
    url: "https://www.mathogames.cl/consolas-switch-2/2538-preventa-dia-1-consola-nintendo-switch-2-the-legend-of-zelda-40th-anniversary.html",
  },
  {
    name: "TodoJuegos",
    url: "https://www.todojuegos.cl/Productos/NS2/Consola-Switch-2-Zelda-40th-Aniversario/",
  },
  {
    name: "WePlay",
    url: "https://www.weplay.cl/preventa-consola-switch-2-the-legend-of-zelda-40th-aniversario.html",
  },
];

const ML_STORE_URL = "https://www.mercadolibre.cl/tienda/nintendo";
const ZONA_GAMER_FB_URL = "https://web.facebook.com/p/Zona-Gamer-Iquique-100063732433382/";
const ZONA_GAMER_MIRROR_URL = "https://www.govern1.com/CL/Iquique/100213088361257/Zona-Gamer-Iquique";
const STATE_PATH = "state/cloudflare-state.json";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126 Safari/537.36 Switch2ZeldaCloudflareMonitor/1.0";

const NEGATIVE = [
  "agotado",
  "sin existencias",
  "sin stock",
  "fuera de stock",
  "sold out",
  "out of stock",
  "producto no disponible",
  "temporalmente agotado",
  "no tendra preventa",
  "no tendrá preventa",
];

const POSITIVE = [
  "agregar al carrito",
  "añadir al carrito",
  "anadir al carrito",
  "comprar ahora",
  "en stock",
  "disponible",
  "preventa",
  "pre-order",
  "reservar",
  "reserva ahora",
];

const PREORDER_TERMS = [
  "preventa",
  "pre venta",
  "pre-venta",
  "reserva",
  "reservas",
  "reservar",
  "preorder",
  "pre-order",
  "pre order",
  "presale",
  "pre-sale",
];

const EDITION_TERMS = [
  "40th",
  "40.º",
  "40º",
  "40°",
  "40 aniversario",
  "aniversario 40",
  "40 años",
  "40th anniversary",
  "edición 40",
  "edicion 40",
  "edición zelda",
  "edicion zelda",
  "zelda edition",
  "zelda edición",
  "zelda edicion",
  "edición especial zelda",
  "edicion especial zelda",
];

const CHALLENGE = [
  "just a moment",
  "un momento",
  "checking your browser",
  "verify you are human",
  "verifique que es humano",
  "enable javascript and cookies",
  "attention required",
  "cf-chl-",
  "cloudflare ray id",
];

function normalize(text = "") {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function pageTitle(html = "") {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? normalize(m[1]) : null;
}

function money(value) {
  if (value == null) return null;
  let s = String(value).replace(/CLP/gi, "").replace(/\$/g, "").replace(/\s/g, "").trim();
  if (/^\d{1,3}(?:\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  else if (/^\d+(?:\.\d{1,2})$/.test(s)) s = s.split(".")[0];
  const digits = s.replace(/\D/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return n >= 500000 && n <= 2000000 ? n : null;
}

function walk(value, cb) {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, cb);
  } else if (value && typeof value === "object") {
    cb(value);
    for (const item of Object.values(value)) walk(item, cb);
  }
}

function parseJsonLd(html) {
  const scripts = [...html.matchAll(/<script[^>]+type=["'][^"']*ld\+json[^"']*["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const candidates = [];

  for (const match of scripts) {
    try {
      const data = JSON.parse(match[1]);
      walk(data, (obj) => {
        const types = Array.isArray(obj["@type"]) ? obj["@type"] : [obj["@type"]];
        if (!types.includes("Product")) return;
        const name = String(obj.name || "");
        const low = name.toLowerCase();
        const score = ["switch", "zelda", "40"].reduce((n, token) => n + (low.includes(token) ? 1 : 0), 0);
        if (score >= 3) candidates.push({ score, obj });
      });
    } catch (_) {}
  }

  if (!candidates.length) return { price: null, availability: null, name: null };
  candidates.sort((a, b) => b.score - a.score);
  const obj = candidates[0].obj;
  const offers = Array.isArray(obj.offers) ? obj.offers : [obj.offers];
  const prices = [];
  let availability = null;

  for (const offer of offers) {
    if (!offer || typeof offer !== "object") continue;
    const currency = String(offer.priceCurrency || "").toUpperCase();
    const p = money(offer.price);
    if (p && (!currency || currency === "CLP")) prices.push(p);
    if (offer.availability) availability = String(offer.availability);
  }

  return {
    price: prices.length ? Math.min(...prices) : null,
    availability,
    name: obj.name ? String(obj.name) : null,
  };
}

function fallbackPrice(text) {
  const values = [];
  for (const m of text.matchAll(/\$\s*([0-9]{1,3}(?:[.\s][0-9]{3})+|[0-9]{6,7})/g)) {
    const n = money(m[1]);
    if (n) values.push(n);
  }
  return values.length ? Math.min(...values) : null;
}

function availabilityStatus(text, availability, http) {
  if (http === 404) return "page_missing";
  const low = normalize(text).toLowerCase();
  if (NEGATIVE.some((x) => low.includes(x))) return "unavailable";

  const av = String(availability || "").toLowerCase();
  if (["outofstock", "soldout", "discontinued"].some((x) => av.includes(x))) return "unavailable";
  if (["instock", "preorder", "presale", "limitedavailability"].some((x) => av.includes(x))) return "available";
  if (POSITIVE.some((x) => low.includes(x))) return "available";
  return "unknown";
}

async function inspectStore(store) {
  try {
    const response = await fetch(store.url, {
      redirect: "follow",
      headers: {
        "user-agent": USER_AGENT,
        "accept-language": "es-CL,es;q=0.9,en;q=0.7",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    const http = response.status;
    if (http === 404) return { ...store, http, status: "page_missing", price_clp: null, title: null };
    if ([403, 429].includes(http) || http >= 500) return { ...store, http, status: "error", price_clp: null, title: null };

    const html = await response.text();
    const title = pageTitle(html);
    const first = `${title || ""} ${normalize(html.slice(0, 30000))}`.toLowerCase();
    if (CHALLENGE.some((x) => first.includes(x))) {
      return { ...store, http, status: "error", price_clp: null, title };
    }

    const jsonld = parseJsonLd(html);
    const visible = normalize(html);
    let price = jsonld.price || fallbackPrice(visible);
    let status = availabilityStatus(visible, jsonld.availability, http);
    const host = new URL(store.url).hostname.toLowerCase();

    if (host.includes("todojuegos.cl") && visible.toLowerCase().includes("precio x confirmar")) price = null;
    if (host.includes("santogames.cl") && price == null) status = "unavailable";

    return {
      ...store,
      http,
      status,
      price_clp: price,
      title: jsonld.name || title,
    };
  } catch (_) {
    return { ...store, http: null, status: "error", price_clp: null, title: null };
  }
}

function hasPreorderSignal(text) {
  const low = normalize(text).toLowerCase();
  return PREORDER_TERMS.some((term) => low.includes(term));
}

function target40Nearby(text) {
  const low = normalize(text).toLowerCase();
  const strictPatterns = [
    /switch\s*2.{0,260}zelda.{0,260}(?:40(?:th|\.?º|°)?|40\s*(?:aniversario|anniversary|años)|aniversario\s*40)/i,
    /zelda.{0,260}(?:40(?:th|\.?º|°)?|40\s*(?:aniversario|anniversary|años)|aniversario\s*40).{0,260}switch\s*2/i,
    /(?:40(?:th|\.?º|°)?|40\s*(?:aniversario|anniversary|años)|aniversario\s*40).{0,260}zelda.{0,260}switch\s*2/i,
  ];
  if (strictPatterns.some((re) => re.test(low))) return true;

  // Variante frecuente en preventas: la tienda omite "40th" del título y usa
  // "edición Zelda", "edición especial Zelda", etc.
  const hasSwitch2 = /switch\s*2|nintendo\s*switch\s*2/i.test(low);
  const hasZelda = low.includes("zelda");
  const hasEdition = EDITION_TERMS.some((term) => low.includes(term));
  const hasPreorder = PREORDER_TERMS.some((term) => low.includes(term));
  const looksLikeConsole = /consola|console|sistema|bundle|pack/i.test(low);

  return hasSwitch2 && hasZelda && hasEdition && hasPreorder && looksLikeConsole;
}

async function inspectMercadoLibreOfficial() {
  try {
    const response = await fetch(ML_STORE_URL, {
      headers: { "user-agent": USER_AGENT, "accept-language": "es-CL,es;q=0.9" },
      redirect: "follow",
    });

    if (!response.ok) {
      return { monitor_status: `http_${response.status}`, item: null };
    }

    const html = await response.text();
    const title = pageTitle(html);
    const first = `${title || ""} ${normalize(html.slice(0, 25000))}`.toLowerCase();

    if (CHALLENGE.some((x) => first.includes(x))) {
      return { monitor_status: "blocked_or_challenge", item: null };
    }

    if (!target40Nearby(html)) {
      return { monitor_status: "not_found", item: null };
    }

    const visible = normalize(html);
    const price = fallbackPrice(visible);

    return {
      monitor_status: "candidate_detected",
      item: {
        name: "Mercado Libre · Nintendo Oficial",
        url: ML_STORE_URL,
        http: response.status,
        status: "available",
        price_clp: price,
        title: "Nintendo Switch 2 Zelda 40th Anniversary detectada en Tienda Oficial Nintendo",
        source: "mercadolibre_official",
      },
    };
  } catch (_) {
    return { monitor_status: "fetch_error", item: null };
  }
}


function targetExcerpt(text) {
  const normalized = normalize(text);
  const lower = normalized.toLowerCase();
  const anchors = [
    "zelda", "switch 2", "40th", "40 aniversario", "aniversario 40",
    "40º", "40°", "40 años", "preventa", "pre venta", "pre-venta",
    "reserva", "pre-order", "edición zelda", "edicion zelda"
  ];

  for (const anchor of anchors) {
    let index = lower.indexOf(anchor);
    while (index >= 0) {
      const start = Math.max(0, index - 600);
      const end = Math.min(normalized.length, index + 900);
      const excerpt = normalized.slice(start, end);
      if (target40Nearby(excerpt)) return excerpt;
      index = lower.indexOf(anchor, index + anchor.length);
    }
  }
  return target40Nearby(normalized) ? normalized.slice(0, 1400) : null;
}

function fingerprint(text) {
  let hash = 2166136261;
  const value = normalize(text).toLowerCase();
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

async function inspectZonaGamerIquique(includeSearch = false) {
  const candidates = [];
  const statuses = [];

  // 1) Intento directo a la página pública de Facebook.
  try {
    const r = await fetch(ZONA_GAMER_FB_URL, {
      redirect: "follow",
      headers: {
        "user-agent": USER_AGENT,
        "accept-language": "es-CL,es;q=0.9",
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (!r.ok) {
      statuses.push(`facebook_http_${r.status}`);
    } else {
      const html = await r.text();
      const title = pageTitle(html) || "";
      const first = `${title} ${normalize(html.slice(0, 30000))}`.toLowerCase();
      const fbBlocked = [
        ...CHALLENGE,
        "log in to facebook",
        "inicia sesión en facebook",
        "create new account",
      ].some((x) => first.includes(x));

      if (fbBlocked) {
        statuses.push("facebook_blocked_or_login");
      } else {
        const excerpt = targetExcerpt(html);
        if (excerpt) {
          candidates.push({
            name: "Zona Gamer Iquique · Facebook",
            url: ZONA_GAMER_FB_URL,
            status: "available",
            price_clp: fallbackPrice(excerpt),
            title: "Posible publicación Switch 2 Zelda 40th en Zona Gamer Iquique",
            source: "zona_gamer_facebook",
            fingerprint: fingerprint(excerpt),
          });
          statuses.push("facebook_candidate_detected");
        } else {
          statuses.push("facebook_not_found");
        }
      }
    }
  } catch (_) {
    statuses.push("facebook_fetch_error");
  }

  // 2) Espejo público de publicaciones de Zona Gamer Iquique.
  try {
    const r = await fetch(ZONA_GAMER_MIRROR_URL, {
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, "accept-language": "es-CL,es;q=0.9" },
    });
    if (!r.ok) {
      statuses.push(`mirror_http_${r.status}`);
    } else {
      const html = await r.text();
      const excerpt = targetExcerpt(html);
      if (excerpt) {
        candidates.push({
          name: "Zona Gamer Iquique · publicación pública",
          url: ZONA_GAMER_MIRROR_URL,
          status: "available",
          price_clp: fallbackPrice(excerpt),
          title: "Posible publicación Switch 2 Zelda 40th en Zona Gamer Iquique",
          source: "zona_gamer_mirror",
          fingerprint: fingerprint(excerpt),
        });
        statuses.push("mirror_candidate_detected");
      } else {
        statuses.push("mirror_not_found");
      }
    }
  } catch (_) {
    statuses.push("mirror_fetch_error");
  }

  // 3) Respaldo por buscador. Solo se usa en las rondas amplias.
  if (includeSearch) {
    const queries = [
      '"Zona Gamer Iquique" "Switch 2" Zelda 40',
      '"Zona Gamer Iquique" "Nintendo Switch 2" "40th"',
      '"Zona Gamer Iquique" preventa "Switch 2" Zelda',
      '"Zona Gamer Iquique" reserva "Switch 2" Zelda',
      '"Zona Gamer Iquique" "edición Zelda" "Switch 2"',
    ];

    for (const query of queries) {
      for (const item of await bingRss(query)) {
        const corpus = `${item.title || ""} ${item.description || ""}`;
        const excerpt = targetExcerpt(corpus);
        if (!excerpt) continue;

        candidates.push({
          name: "Zona Gamer Iquique · resultado indexado",
          url: item.url || ZONA_GAMER_FB_URL,
          status: "available",
          price_clp: fallbackPrice(excerpt),
          title: item.title || "Publicación Zona Gamer Iquique",
          source: "zona_gamer_search",
          fingerprint: fingerprint(excerpt),
        });
      }
    }
    statuses.push("search_checked");
  }

  const unique = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const key = candidate.fingerprint || candidate.url;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }

  return {
    monitor_status: statuses.join("+") || "not_checked",
    candidates: unique,
  };
}

function xmlDecode(s = "") {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function bingRss(query) {
  const url = `https://www.bing.com/search?${new URLSearchParams({ q: query, format: "rss", cc: "cl", setlang: "es" })}`;
  try {
    const r = await fetch(url, { headers: { "user-agent": USER_AGENT } });
    if (!r.ok) return [];
    const xml = await r.text();
    const out = [];
    for (const item of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
      const block = item[1];
      const title = block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "";
      const link = block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "";
      const description = block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || "";
      if (link) out.push({
        title: xmlDecode(title).trim(),
        url: xmlDecode(link).trim(),
        description: normalize(xmlDecode(description)),
      });
    }
    return out;
  } catch (_) {
    return [];
  }
}

async function discoverNewStores(knownUrls) {
  const queries = [
    '"Nintendo Switch 2" Zelda "40th Anniversary" Chile',
    '"Nintendo Switch 2" Zelda "40 aniversario" Chile',
    '"Switch 2" Zelda 40 preventa Chile',
    '"Switch 2" Zelda "pre-venta" Chile',
    '"Switch 2" Zelda reserva Chile',
    '"Switch 2" "edición Zelda" preventa Chile',
    '"Switch 2" "edicion Zelda" preventa Chile',
    '"Consola Switch 2" Zelda preventa Chile',
    '"Nintendo Switch 2" Zelda preorder Chile',
    '"Nintendo Switch 2" Zelda "40 años" Chile',
    '"The Legend of Zelda" "Switch 2" preventa Chile',
    '"Zelda 40th" "Switch 2" preventa',
  ];
  const found = [];
  const seen = new Set(knownUrls);

  for (const query of queries) {
    for (const item of await bingRss(query)) {
      let url;
      try {
        const u = new URL(item.url.split("#", 1)[0]);
        if (!u.hostname.endsWith(".cl") && u.hostname !== "mercadolibre.cl" && !u.hostname.endsWith(".mercadolibre.cl")) continue;
        if (u.hostname === "mercadolibre.cl" || u.hostname.endsWith(".mercadolibre.cl")) continue;
        url = u.toString();
      } catch (_) {
        continue;
      }
      if (seen.has(url)) continue;
      seen.add(url);

      try {
        const r = await fetch(url, { headers: { "user-agent": USER_AGENT, "accept-language": "es-CL,es;q=0.9" }, redirect: "follow" });
        if (!r.ok) continue;
        const html = await r.text();
        if (!target40Nearby(`${item.title} ${html}`)) continue;
        const current = await inspectStore({ name: new URL(url).hostname.replace(/^www\./, ""), url });
        if (!["error", "unknown", "page_missing"].includes(current.status)) found.push({ ...current, source: "discovery" });
      } catch (_) {}
    }
  }
  return found;
}


const SOCIAL_HOSTS = [
  "facebook.com",
  "web.facebook.com",
  "instagram.com",
  "www.instagram.com",
  "threads.net",
  "www.threads.net",
];

function isSocialHost(hostname) {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return SOCIAL_HOSTS.some((allowed) => {
    const clean = allowed.replace(/^www\./, "");
    return host === clean || host.endsWith("." + clean);
  });
}

async function discoverSocialPreorders() {
  const queries = [
    'site:facebook.com "Switch 2" Zelda preventa Chile',
    'site:facebook.com "Nintendo Switch 2" "edición Zelda" Chile',
    'site:facebook.com "Switch 2" Zelda "40 aniversario" Chile',
    'site:instagram.com "Switch 2" Zelda preventa Chile',
    'site:instagram.com "Nintendo Switch 2" Zelda "40th" Chile',
    'site:instagram.com "edición Zelda" "Switch 2" preventa Chile',
  ];

  const found = [];
  const seen = new Set();

  for (const query of queries) {
    for (const item of await bingRss(query)) {
      let host = "";
      try {
        host = new URL(item.url).hostname;
      } catch (_) {
        continue;
      }
      if (!isSocialHost(host)) continue;

      const corpus = `${item.title || ""} ${item.description || ""}`;
      if (!target40Nearby(corpus)) continue;
      if (!hasPreorderSignal(corpus)) continue;

      const key = `${item.url}|${normalize(corpus).toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const excerpt = targetExcerpt(corpus) || corpus;
      found.push({
        name: `Red social · ${host.replace(/^www\\./, "")}`,
        url: item.url,
        status: "available",
        price_clp: fallbackPrice(excerpt),
        title: item.title || "Posible preventa Switch 2 Zelda",
        source: "social_search",
        fingerprint: fingerprint(excerpt),
      });
    }
  }

  return found;
}

function formatPrice(n) {
  if (n == null) return "—";
  return `$${new Intl.NumberFormat("es-CL").format(n)}`;
}

function statusLabel(status) {
  return {
    available: "🟢 disponible / preventa",
    unavailable: "🔴 agotado / sin stock",
    page_missing: "⚪ página retirada",
    unknown: "🟡 no concluyente",
    error: "⚠️ error temporal",
  }[status] || status;
}

function actionableChange(oldSnap, current, isNew = false) {
  if (isNew) return true;
  if (!oldSnap) return false;
  if (oldSnap.status !== "available" && current.status === "available") return true;
  if (current.price_clp != null && oldSnap.price_clp !== current.price_clp) return true;
  return false;
}

function sameSnapshot(a, b) {
  return (
    a?.status === b?.status &&
    a?.price_clp === b?.price_clp &&
    a?.http === b?.http &&
    a?.title === b?.title
  );
}

function describe(current, oldSnap = null, isNew = false) {
  let heading = `### 🔔 Cambio detectado: ${current.name}`;
  if (isNew) heading = `### 🆕 Nueva publicación: ${current.name}`;
  else if (oldSnap?.status !== "available" && current.status === "available") heading = `### 🚨 STOCK / PREVENTA DISPONIBLE: ${current.name}`;
  else if (oldSnap?.price_clp !== current.price_clp && current.price_clp != null) heading = `### 💰 Cambio de precio: ${current.name}`;

  return [
    heading,
    "",
    `- Estado: ${oldSnap ? statusLabel(oldSnap.status) : "—"} → **${statusLabel(current.status)}**`,
    `- Precio: ${formatPrice(oldSnap?.price_clp)} → **${formatPrice(current.price_clp)}**`,
    `- Enlace: ${current.url}`,
  ].join("\n");
}

function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToUtf8(text) {
  const clean = text.replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function githubHeaders(env) {
  return {
    authorization: `Bearer ${env.GITHUB_TOKEN}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "switch2-zelda-cloudflare-worker",
  };
}

async function loadState(env) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${STATE_PATH}`;
  const r = await fetch(url, { headers: githubHeaders(env) });
  if (r.status === 404) {
    return {
      sha: null,
      state: { version: 1, initialized: false, stores: {}, discovered: {} },
    };
  }
  if (!r.ok) throw new Error(`GitHub state GET failed: ${r.status}`);
  const payload = await r.json();
  return { sha: payload.sha, state: JSON.parse(base64ToUtf8(payload.content)) };
}

async function saveState(env, state, sha) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${STATE_PATH}`;
  const body = {
    message: "chore: actualizar estado Cloudflare monitor [skip ci]",
    content: utf8ToBase64(`${JSON.stringify(state, null, 2)}\n`),
    branch: "main",
  };
  if (sha) body.sha = sha;

  const r = await fetch(url, {
    method: "PUT",
    headers: { ...githubHeaders(env), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`GitHub state PUT failed: ${r.status} ${await r.text()}`);
}

async function createIssue(env, title, body) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues`;
  const notifyUser = "Baaaaar1";
  const mentionedBody =
    `📣 Aviso también para @${notifyUser}\n\n` + body;

  // Intentamos asignar el Issue a ambos usuarios.
  let payload = {
    title,
    body: mentionedBody,
    assignees: [env.GITHUB_OWNER, notifyUser],
  };

  let r = await fetch(url, {
    method: "POST",
    headers: { ...githubHeaders(env), "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  // GitHub puede rechazar un assignee que no tenga permisos suficientes en el repo.
  // En ese caso creamos igualmente el Issue asignado al dueño y mantenemos la
  // mención @Baaaaar1 en el cuerpo, que sirve como notificación alternativa.
  if (r.status === 422) {
    payload = {
      title,
      body: mentionedBody,
      assignees: [env.GITHUB_OWNER],
    };
    r = await fetch(url, {
      method: "POST",
      headers: { ...githubHeaders(env), "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  if (!r.ok) {
    throw new Error(`GitHub issue POST failed: ${r.status} ${await r.text()}`);
  }
}

async function runMonitor(env, scheduledTime = Date.now(), forceDiscovery = false) {
  if (!env.GITHUB_TOKEN) throw new Error("Missing GITHUB_TOKEN secret");
  const { sha, state } = await loadState(env);
  state.stores ||= {};
  state.discovered ||= {};
  const initialized = Boolean(state.initialized);
  const alerts = [];
  const checks = [];
  let dirty = false;
  let reliableStores = 0;
  let skippedStores = 0;
  let discoveredNew = 0;

  for (const store of STORES) {
    const current = await inspectStore(store);
    checks.push({
      name: store.name,
      status: current.status,
      price_clp: current.price_clp,
      http: current.http,
    });

    if (["error", "unknown"].includes(current.status)) {
      skippedStores += 1;
      continue;
    }

    reliableStores += 1;

    const old = state.stores[current.url]?.snapshot || null;
    const snapshot = {
      http: current.http,
      status: current.status,
      price_clp: current.price_clp,
      title: current.title,
    };

    if (initialized && old && actionableChange(old, current, false)) alerts.push(describe(current, old, false));
    if (!old || !sameSnapshot(old, snapshot)) {
      state.stores[current.url] = {
        name: current.name,
        snapshot,
        last_changed_at: new Date(scheduledTime).toISOString(),
      };
      dirty = true;
    }
  }

  const mlCheck = await inspectMercadoLibreOfficial();
  const mercadoLibreResult = mlCheck.monitor_status;
  const ml = mlCheck.item;
  if (ml) {
    const key = "mercadolibre:nintendo-official:zelda40";
    const old = state.stores[key]?.snapshot || null;
    const snapshot = {
      http: ml.http,
      status: ml.status,
      price_clp: ml.price_clp,
      title: ml.title,
      url: ml.url,
    };
    if (initialized && (!old || actionableChange(old, ml, !old))) alerts.push(describe(ml, old, !old));
    if (!old || !sameSnapshot(old, snapshot)) {
      state.stores[key] = {
        name: ml.name,
        snapshot,
        last_changed_at: new Date(scheduledTime).toISOString(),
      };
      dirty = true;
    }
  }

  const minute = new Date(scheduledTime).getUTCMinutes();
  const discoveryRan = forceDiscovery || minute % 15 === 0;
  const socialRan = forceDiscovery || minute % 5 === 0;
  let zonaGamerResult = "not_checked";

  if (socialRan) {
    const zona = await inspectZonaGamerIquique(discoveryRan);
    zonaGamerResult = zona.monitor_status;
    state.social_discovered ||= {};

    for (const current of zona.candidates) {
      const key = `zona-gamer:${current.fingerprint}`;
      if (state.social_discovered[key]) continue;

      state.social_discovered[key] = {
        name: current.name,
        url: current.url,
        source: current.source,
        fingerprint: current.fingerprint,
        found_at: new Date(scheduledTime).toISOString(),
      };

      if (initialized) {
        alerts.push(describe(current, null, true));
      }
      dirty = true;
    }
  }
  if (discoveryRan) {
    state.social_discovered ||= {};
    for (const current of await discoverSocialPreorders()) {
      const key = `social-search:${current.fingerprint}`;
      if (state.social_discovered[key]) continue;

      state.social_discovered[key] = {
        name: current.name,
        url: current.url,
        source: current.source,
        fingerprint: current.fingerprint,
        found_at: new Date(scheduledTime).toISOString(),
      };

      if (initialized) alerts.push(describe(current, null, true));
      discoveredNew += 1;
      dirty = true;
    }

    const knownUrls = new Set([
      ...STORES.map((s) => s.url),
      ...Object.keys(state.discovered),
    ]);
    const found = await discoverNewStores(knownUrls);
    for (const current of found) {
      if (state.discovered[current.url]) continue;
      state.discovered[current.url] = {
        name: current.name,
        url: current.url,
        found_at: new Date(scheduledTime).toISOString(),
      };
      state.stores[current.url] = {
        name: current.name,
        snapshot: {
          http: current.http,
          status: current.status,
          price_clp: current.price_clp,
          title: current.title,
        },
        last_changed_at: new Date(scheduledTime).toISOString(),
      };
      if (initialized) alerts.push(describe(current, null, true));
      discoveredNew += 1;
      dirty = true;
    }
  }

  if (!initialized) {
    state.initialized = true;
    dirty = true;
  }
  state.version = 1;

  if (dirty) await saveState(env, state, sha);

  if (alerts.length) {
    const body = [
      "# Switch 2 Zelda 40th — alerta Cloudflare",
      "",
      ...alerts,
      "",
      "---",
      `Revisión: ${new Date(scheduledTime).toISOString()}`,
      "El monitor Cloudflare se ejecuta cada 1 minuto.",
    ].join("\n");
    await createIssue(env, `🚨 Switch 2 Zelda 40th: ${alerts.length} novedad(es)`, body);
  }

  return {
    alerts: alerts.length,
    dirty,
    initialized: true,
    checked_stores: STORES.length,
    reliable_stores: reliableStores,
    skipped_stores: skippedStores,
    mercado_libre: mercadoLibreResult,
    zona_gamer: zonaGamerResult,
    social_ran: socialRan,
    discovery_ran: discoveryRan,
    discovered_new: discoveredNew,
    stores: checks,
  };
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      runMonitor(env, controller.scheduledTime)
        .then((result) => {
          const readable =
            `MONITOR OK · ${result.checked_stores} tiendas · ` +
            `${result.reliable_stores} lecturas fiables · ` +
            `${result.skipped_stores} bloqueadas/no concluyentes · ` +
            `${result.alerts} alertas · ` +
            `Mercado Libre: ${result.mercado_libre} · ` +
            `Zona Gamer: ${result.zona_gamer} · ` +
            `social: ${result.social_ran ? "sí" : "no"} · ` +
            `búsqueda amplia: ${result.discovery_ran ? "sí" : "no"} · ` +
            `nuevas: ${result.discovered_new}`;

          console.log(readable);
          console.log(JSON.stringify({
            event: "monitor_cycle",
            ok: true,
            scheduled_time: new Date(controller.scheduledTime).toISOString(),
            ...result,
          }));
        })
        .catch((err) => {
          console.error(JSON.stringify({
            event: "monitor_cycle",
            ok: false,
            scheduled_time: new Date(controller.scheduledTime).toISOString(),
            error: err?.stack || String(err),
          }));
          throw err;
        }),
    );
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "switch2-zelda-stock-cl",
        scheduler: "Cloudflare Cron",
        cron: "* * * * *",
        interval: "1 minute",
        known_stores: STORES.map((s) => s.name),
        mercado_libre_official: true,
        zona_gamer_iquique_facebook: true,
        social_every_minutes: 5,
        discovery_every_minutes: 15,
        expanded_preorder_search: true,
        social_search: ["facebook", "instagram"],
        github_token_configured: Boolean(env.GITHUB_TOKEN),
        notification_users: [env.GITHUB_OWNER, "Baaaaar1"],
        now: new Date().toISOString(),
      });
    }

    if (url.pathname === "/run") {
      const auth = request.headers.get("authorization") || "";
      if (!env.RUN_TOKEN || auth !== `Bearer ${env.RUN_TOKEN}`) {
        return new Response("Unauthorized", { status: 401 });
      }
      const result = await runMonitor(env, Date.now(), true);
      console.log(`MANUAL RUN OK · ${result.checked_stores} tiendas · ${result.alerts} alertas · nuevas: ${result.discovered_new}`);
      return Response.json({ ok: true, ...result });
    }

    return new Response("Not found", { status: 404 });
  },
};


export { runMonitor };

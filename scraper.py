from __future__ import annotations

import html
import json
import re
import time
import urllib.parse
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Any

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

TIMEOUT = 25
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 "
    "Switch2ZeldaStockMonitor/1.1"
)

NEGATIVE = (
    "agotado", "sin existencias", "sin stock", "fuera de stock",
    "sold out", "out of stock", "producto no disponible", "temporalmente agotado",
    "no tendrá preventa", "no tendra preventa",
)
POSITIVE = (
    "agregar al carrito", "añadir al carrito", "anadir al carrito",
    "comprar ahora", "en stock", "disponible", "preventa", "pre-order",
    "reservar", "reserva ahora",
)

@dataclass
class Product:
    name: str
    url: str
    http: int | None
    title: str | None
    status: str
    price_clp: int | None

    def snapshot(self) -> dict[str, Any]:
        return {
            "http": self.http,
            "title": self.title,
            "status": self.status,
            "price_clp": self.price_clp,
        }

def make_session() -> requests.Session:
    s = requests.Session()
    retry = Retry(
        total=2,
        backoff_factor=0.8,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"],
    )
    s.mount("https://", HTTPAdapter(max_retries=retry))
    s.headers.update({
        "User-Agent": UA,
        "Accept-Language": "es-CL,es;q=0.9,en;q=0.7",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    })
    return s

def money(value: Any) -> int | None:
    if value is None:
        return None
    s = str(value).strip().replace("CLP", "").replace("$", "").replace(" ", "")
    if re.fullmatch(r"\d{1,3}(?:\.\d{3})+", s):
        s = s.replace(".", "")
    elif re.fullmatch(r"\d+(?:\.\d{1,2})", s):
        s = s.split(".")[0]
    digits = re.sub(r"\D", "", s)
    if not digits:
        return None
    n = int(digits)
    # Esta edición de consola se mueve muy por encima de accesorios/juegos.
    # El piso evita tomar cuotas y productos relacionados como si fueran el precio de la consola.
    return n if 500_000 <= n <= 2_000_000 else None

def walk(value: Any):
    if isinstance(value, dict):
        yield value
        for v in value.values():
            yield from walk(v)
    elif isinstance(value, list):
        for v in value:
            yield from walk(v)

def jsonld_product(soup: BeautifulSoup) -> tuple[int | None, str | None, str | None]:
    """Toma solo el Product JSON-LD que realmente corresponde a la consola Zelda 40th.

    Varias tiendas incluyen carruseles completos como Product JSON-LD; recorrerlos sin filtrar
    hacía que termináramos leyendo el precio de un juego o accesorio relacionado.
    """
    candidates: list[tuple[int, dict[str, Any]]] = []
    for tag in soup.find_all("script", attrs={"type": re.compile(r"ld\\+json", re.I)}):
        raw = tag.string or tag.get_text(" ", strip=True)
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except Exception:
            continue
        for obj in walk(data):
            typ = obj.get("@type")
            types = typ if isinstance(typ, list) else [typ]
            if "Product" not in types:
                continue
            product_name = str(obj.get("name") or "")
            low = product_name.lower()
            score = sum(token in low for token in ("switch", "zelda", "40"))
            if score >= 3:
                candidates.append((score, obj))

    if not candidates:
        return None, None, None

    _, obj = max(candidates, key=lambda item: item[0])
    product_name = str(obj.get("name") or "") or None
    offers = obj.get("offers")
    offers = offers if isinstance(offers, list) else [offers]
    prices: list[int] = []
    availability = None
    for offer in offers:
        if not isinstance(offer, dict):
            continue
        currency = str(offer.get("priceCurrency", "")).upper()
        p = money(offer.get("price"))
        if p and (not currency or currency == "CLP"):
            prices.append(p)
        if offer.get("availability"):
            availability = str(offer["availability"])
    return (min(prices) if prices else None), availability, product_name

def fallback_price(text: str) -> int | None:
    values = []
    for m in re.finditer(r"\$\s*([0-9]{1,3}(?:[.\s][0-9]{3})+|[0-9]{6,7})", text):
        n = money(m.group(1))
        if n:
            values.append(n)
    return min(values) if values else None

def status_from(text: str, availability: str | None, http_status: int) -> str:
    if http_status == 404:
        return "page_missing"
    low = " ".join(text.lower().split())

    # La señal visible "Agotado/Fuera de stock" manda sobre JSON-LD desactualizado.
    if any(x in low for x in NEGATIVE):
        return "unavailable"

    av = (availability or "").lower()
    if any(x in av for x in ("outofstock", "soldout", "discontinued")):
        return "unavailable"
    if any(x in av for x in ("instock", "preorder", "presale", "limitedavailability")):
        return "available"
    if any(x in low for x in POSITIVE):
        return "available"
    return "unknown"

def inspect(s: requests.Session, name: str, url: str) -> Product:
    try:
        r = s.get(url, timeout=TIMEOUT, allow_redirects=True)
        if r.status_code == 404:
            return Product(name, url, 404, None, "page_missing", None)
        if r.status_code in (403, 429) or r.status_code >= 500:
            # 403 suele ser Cloudflare/anti-bot; no lo convertimos en cambio de stock.
            return Product(name, url, r.status_code, None, "error", None)
        soup = BeautifulSoup(r.text, "html.parser")
        text = soup.get_text(" ", strip=True)
        page_title = soup.title.get_text(" ", strip=True) if soup.title else ""
        challenge = " ".join((page_title + " " + text[:5000]).lower().split())
        challenge_markers = (
            "just a moment", "un momento", "checking your browser",
            "verify you are human", "verifique que es humano", "cloudflare",
            "enable javascript and cookies", "attention required",
        )
        if any(marker in challenge for marker in challenge_markers):
            return Product(name, url, r.status_code, page_title or None, "error", None)

        price_json, availability, product_name = jsonld_product(soup)
        title = product_name or (page_title or None)

        # TodoJuegos declara explícitamente "Precio x Confirmar"; no inferimos un precio
        # desde productos destacados o relacionados del resto de la página.
        low = " ".join(text.lower().split())
        host = urllib.parse.urlparse(url).netloc.lower()
        if "todojuegos.cl" in host and "precio x confirmar" in low:
            parsed_price = None
        else:
            parsed_price = price_json or fallback_price(text)

        parsed_status = status_from(text, availability, r.status_code)

        # Santo Games mantiene la palabra PREVENTA en la descripción incluso cuando
        # la ficha no tiene precio ni venta habilitada. Sin precio de la consola,
        # no la tratamos como una preventa comprable.
        if "santogames.cl" in host and parsed_price is None:
            parsed_status = "unavailable"

        return Product(
            name=name,
            url=url,
            http=r.status_code,
            title=title,
            status=parsed_status,
            price_clp=parsed_price,
        )
    except requests.RequestException:
        return Product(name, url, None, None, "error", None)

def bing_rss(s: requests.Session, query: str) -> list[tuple[str, str]]:
    url = "https://www.bing.com/search?" + urllib.parse.urlencode({
        "q": query, "format": "rss", "cc": "cl", "setlang": "es"
    })
    try:
        r = s.get(url, timeout=TIMEOUT)
        r.raise_for_status()
        root = ET.fromstring(r.text)
    except Exception:
        return []
    out = []
    for item in root.findall(".//item"):
        title = html.unescape(item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        if link:
            out.append((title, link))
    return out

def discover(s: requests.Session, known_urls: set[str]) -> list[Product]:
    queries = [
        '"Nintendo Switch 2" "Zelda" "40th" Chile',
        '"Switch 2" "Zelda" "40" "preventa" Chile',
        '"Consola Switch 2 Zelda 40" Chile',
    ]
    found: list[Product] = []
    seen = set(known_urls)
    for query in queries:
        for result_title, url in bing_rss(s, query):
            url = url.split("#", 1)[0]
            if url in seen:
                continue
            seen.add(url)
            host = urllib.parse.urlparse(url).netloc.lower().removeprefix("www.")
            if not host.endswith(".cl"):
                continue
            try:
                r = s.get(url, timeout=TIMEOUT, allow_redirects=True)
                if r.status_code != 200:
                    continue
                soup = BeautifulSoup(r.text, "html.parser")
                body = soup.get_text(" ", strip=True)[:120_000].lower()
                title = (soup.title.get_text(" ", strip=True) if soup.title else result_title).lower()
                corpus = title + " " + body
                if not all(x in corpus for x in ("switch", "zelda", "40")):
                    continue
                if not any(x in corpus for x in ("precio", "stock", "preventa", "comprar", "carrito", "producto")):
                    continue
                found.append(inspect(s, host, url))
            except requests.RequestException:
                pass
            time.sleep(0.25)
    return found

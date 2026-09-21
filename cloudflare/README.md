# Monitor Cloudflare — Switch 2 Zelda 40th

Este directorio contiene el Worker que reemplaza el cron de GitHub Actions.

## Qué hace

- Se ejecuta **cada 1 minuto** mediante Cloudflare Cron Triggers.
- Revisa Bestmart, Santo Games, Play Service, Mathogames, TodoJuegos y WePlay.
- Revisa la **Tienda Oficial Nintendo de Mercado Libre** en cada corrida.
- Cada 15 minutos hace además una búsqueda amplia de nuevas tiendas/publicaciones chilenas.
- Ignora páginas anti-bot y estados no concluyentes.
- Guarda el último estado fiable en `state/cloudflare-state.json`.
- Solo crea un Issue de GitHub ante novedades accionables:
  - stock/preventa disponible;
  - nueva publicación;
  - cambio de precio.
- La primera ejecución construye la línea base y **no genera alertas antiguas**.

## Despliegue recomendado desde Cloudflare

1. En Cloudflare entra a **Workers & Pages**.
2. Crea/importa un Worker desde GitHub y conecta:
   `jsantiscl/switch2-zelda-stock-cl`.
3. Usa como **Root directory**:
   `cloudflare`
4. Usa como comando de despliegue:
   `npx wrangler deploy`
5. Despliega.

El cron está definido en `wrangler.jsonc`:

```json
"triggers": {
  "crons": ["* * * * *"]
}
```

Eso significa una ejecución por minuto.

## Secreto necesario: GITHUB_TOKEN

El Worker usa GitHub para persistir su estado y abrir los Issues de alerta.

Crea un **Fine-grained Personal Access Token** de GitHub con acceso únicamente al repositorio
`jsantiscl/switch2-zelda-stock-cl` y estos permisos:

- **Contents: Read and write**
- **Issues: Read and write**

No guardes el token en el repositorio.

En Cloudflare, dentro del Worker, ve a **Settings → Variables and Secrets** y agrega:

- Nombre: `GITHUB_TOKEN`
- Tipo: **Secret**
- Valor: el token de GitHub

## Verificación

Una vez desplegado, abre:

`https://<tu-worker>.workers.dev/health`

Debe responder algo similar a:

```json
{
  "ok": true,
  "service": "switch2-zelda-stock-cl",
  "scheduler": "Cloudflare Cron",
  "cron": "* * * * *",
  "interval": "1 minute",
  "mercado_libre_official": true
}
```

Después revisa **Observability / Logs** en Cloudflare. Debe existir una invocación programada aproximadamente cada minuto.

La primera ejecución cambiará `state/cloudflare-state.json` desde:

```json
"initialized": false
```

a:

```json
"initialized": true
```

Ese cambio es otra comprobación de que el cron ejecutó realmente el monitor.

## Prueba manual opcional

El Worker incluye `POST /run`, protegido mediante un secreto `RUN_TOKEN`.
Si más adelante quieres usarlo, agrega `RUN_TOKEN` como Secret en Cloudflare y ejecuta:

```bash
curl -X POST \
  -H "Authorization: Bearer TU_RUN_TOKEN" \
  https://<tu-worker>.workers.dev/run
```

No es necesario para que el cron funcione.

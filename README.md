# Monitor Chile — Nintendo Switch 2 Zelda 40th Anniversary

Robot para detectar stock, preventas, cambios de precio y publicaciones nuevas en Chile de la **Nintendo Switch 2 – The Legend of Zelda 40th Anniversary Edition**.

## Qué hace

- Revisa cada **10 minutos** las tiendas chilenas conocidas.
- Busca cada **2 horas** publicaciones/tiendas nuevas mediante resultados web RSS.
- Detecta:
  - paso de agotado → disponible/preventa;
  - cambios de precio;
  - páginas retiradas o que vuelven a aparecer;
  - nuevas publicaciones chilenas relacionadas con la consola.
- La primera ejecución crea una **línea base** y no genera alertas antiguas.
- Cuando hay una novedad, abre un **GitHub Issue** y se lo asigna al dueño del repositorio.
- No requiere tokens, contraseñas ni servicios de terceros adicionales.

## Tiendas incluidas inicialmente

- Bestmart
- Santo Games
- Play Service
- Mathogames
- TodoJuegos
- WePlay
- Mercado Libre · Tienda Oficial Nintendo (búsqueda dedicada cada 5 minutos)

La lista está en `stores.json` y se puede ampliar fácilmente.

## Instalación recomendada

1. Crea un repositorio en GitHub llamado, por ejemplo, `switch2-zelda-stock-cl`.
2. Sube todo el contenido de este proyecto respetando la carpeta `.github/workflows/`.
3. En GitHub entra a **Actions** y habilita workflows si GitHub te lo solicita.
4. Ejecuta una vez **Actions → Revisar stock Switch 2 Zelda 40th → Run workflow** para construir la línea base.
5. En **Settings → Notifications** de GitHub, asegúrate de recibir avisos de Issues asignados/menciones por el canal que prefieras.

## Frecuencia

GitHub permite workflows programados con un intervalo mínimo de 5 minutos. Aquí se usa 10 minutos para ser suficientemente rápido sin golpear innecesariamente las tiendas.

Puedes cambiar esta línea de `.github/workflows/monitor.yml`:

```yaml
- cron: '3,13,23,33,43,53 * * * *'
```

Por cada 5 minutos, por ejemplo:

```yaml
- cron: '3,8,13,18,23,28,33,38,43,48,53,58 * * * *'
```

## Cómo agregar otra tienda

Agrega un objeto a `stores.json`:

```json
{
  "name": "Nueva tienda",
  "url": "https://www.ejemplo.cl/producto/..."
}
```

## Avisos

El scraper usa datos estructurados `Product/Offer` cuando la tienda los publica y, como respaldo, analiza expresiones como `agotado`, `sin stock`, `preventa`, `agregar al carrito`, etc. Ningún scraper puede garantizar 100% de precisión ante cambios de diseño, CAPTCHA o bloqueos anti-bot; por eso cada alerta incluye el enlace para confirmar directamente antes de comprar.


## Cómo comprobar que el robot está corriendo solo

En la pestaña **Actions** del repositorio, las ejecuciones ahora se identifican así:

- **🤖 AUTO · revisión cada 5 min**: ejecución disparada por el cron de GitHub. Esta es la que confirma que el robot está funcionando automáticamente.
- **🧪 MANUAL · revisión solicitada**: ejecución iniciada con el botón *Run workflow*.
- **🔧 CÓDIGO · validación del monitor**: ejecución iniciada porque se modificó el código/configuración.

La programación automática usa:

```yaml
- cron: '*/5 * * * *'
```

GitHub Actions usa UTC para el cron. El intervalo mínimo admitido por GitHub es 5 minutos. La ejecución puede comenzar algunos minutos tarde cuando GitHub tiene alta carga, por lo que hay que comprobar la secuencia de ejecuciones **🤖 AUTO** y no exigir que empiecen exactamente al segundo.

Dentro de cada ejecución, **Summary** muestra además:

- tipo de evento;
- número de ejecución;
- hora UTC;
- si revisó las tiendas conocidas;
- si hizo también descubrimiento amplio de tiendas nuevas.

El descubrimiento amplio se ejecuta aproximadamente una de cada tres corridas automáticas (cerca de cada 15 minutos), mientras que las tiendas conocidas se revisan en todas.


## Mercado Libre · Tienda Oficial Nintendo

El monitor trata Mercado Libre de forma especial: no vigila una URL de producto fija, porque la edición Zelda 40th puede aparecer por primera vez con una publicación nueva.

En **cada corrida automática** se revisa la Tienda Oficial Nintendo y se hace una búsqueda específica para detectar títulos que incluyan Switch 2 + Zelda + 40.º aniversario. Los resultados de Mercado Libre solo se aceptan cuando se puede verificar que corresponden a la **Tienda Oficial Nintendo**, evitando alertas por vendedores terceros, juegos o accesorios Zelda.

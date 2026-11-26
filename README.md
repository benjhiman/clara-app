# Clara · reservas, cobros y videos

Software propio de Clara Professional Cleaning Services (Miami). Hace cuatro cosas:

1. **Reservas online** (`/reservar`): el cliente elige servicio, tamaño, extras, dirección, fecha y horario. El precio sale solo.
2. **Cobros con Stripe**: Essential y Plus como suscripción mensual (25% off el primer mes), limpiezas sueltas, profundas y de mudanza pagadas al reservar, y Clara Host con tarjeta guardada que se cobra al terminar cada turnover (el primero al 50%).
3. **Portal del cliente** (`/cuenta`): entra con su email (sin contraseña) y ve sus próximas limpiezas, el historial y los videos. Puede cancelar con 24 h de aviso (si había pagado, se le devuelve).
4. **Videos** (`/limpiador`): el limpiador ve sus trabajos en el celular, sube el video al terminar y al cliente le llega un email. Los videos son privados y se borran solos a los 30 días.

Los socios usan el **panel de admin** (`/admin`): agenda de 2 semanas, asignar limpiadores, clientes, equipo, cancelar, devolver pagos y reintentar cobros.

Clientes: español e inglés. Admin y limpiadores: español.

## Modo demo

Si falta la clave de un servicio, la app usa un modo de prueba para esa parte y muestra una franja negra arriba:

| Sin… | Qué pasa |
|---|---|
| `DATABASE_URL` | Usa una base local en la carpeta `.data/` |
| `STRIPE_SECRET_KEY` | Los pagos se aprueban solos, no se cobra nada |
| `RESEND_API_KEY` | Los emails se muestran en la consola (y el link para entrar, en pantalla) |
| `CLOUDFLARE_*` | Los videos se guardan en `.data/videos/` |

## Probarlo en tu compu

Necesitás [Node.js 22](https://nodejs.org).

```bash
npm install
cp .env.example .env.local      # poné tu email en ADMIN_EMAILS
npm run dev
```

Abrí http://localhost:3000. Entrá en `/entrar` con el email que pusiste en `ADMIN_EMAILS` para ver el panel.

Pruebas automáticas: `npm test`.

## Publicarlo (una vez, ~1 hora)

Todas las cuentas son a nombre de Clara. En cada paso, copiá la clave en las variables de entorno de Vercel.

1. **Supabase** (base de datos, plan Pro $25/mes): crear proyecto en región `us-east-1`. En *Project settings → Database → Connection string* copiar la de modo **Transaction** → `DATABASE_URL`. Las tablas se crean solas al primer uso.
2. **Stripe** (cobros, sin costo fijo): *Developers → API keys* → `STRIPE_SECRET_KEY`.
   - *Developers → Webhooks → Add endpoint*: `https://app.claracleanmiami.com/api/stripe/webhook` con los eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `invoice.payment_failed` y `customer.subscription.deleted`. El "signing secret" → `STRIPE_WEBHOOK_SECRET`.
   - *Settings → Billing → Customer portal*: activarlo y permitir cancelar suscripciones y cambiar la tarjeta.
3. **Resend** (emails, gratis hasta 3.000/mes): verificar el dominio `claracleanmiami.com` y crear una API key → `RESEND_API_KEY`.
4. **Cloudflare Stream** (videos, ~$5 por cada 1.000 minutos guardados): activar Stream, crear un API token con permiso *Stream: Edit* → `CLOUDFLARE_STREAM_TOKEN`; el Account ID → `CLOUDFLARE_ACCOUNT_ID`; el "customer code" (aparece en las URLs de los videos, `customer-XXXX.cloudflarestream.com`) → `CLOUDFLARE_STREAM_CUSTOMER_CODE`. Configurar el webhook de Stream hacia `https://app.claracleanmiami.com/api/stream/webhook` y guardar su secreto en `CLOUDFLARE_STREAM_WEBHOOK_SECRET`.
5. **Vercel** (hosting, plan Pro $20/mes): importar este repositorio, cargar todas las variables de `.env.example` (incluidas `APP_URL=https://app.claracleanmiami.com`, `SESSION_SECRET` con 32+ caracteres al azar, `ADMIN_EMAILS` y `CRON_SECRET`), y conectar el subdominio `app.claracleanmiami.com`. La tarea diaria (`vercel.json`) arma las visitas de los planes, manda recordatorios y borra videos vencidos.
6. En la web (`index.html`), apuntar los botones de "Reservar" a `https://app.claracleanmiami.com/reservar` (se puede elegir el servicio con `?servicio=essential`, `plus`, `host`, `single`, `deep` o `move`, y el idioma con `&lang=en`).

## Dónde cambiar cosas

- **Precios, extras y ofertas**: `src/lib/pricing.ts`
- **Zonas (códigos postales), horarios y días de anticipación**: `src/lib/schedule.ts`
- **Textos para clientes (ES/EN)**: `src/lib/i18n.ts`

## Cómo está hecho

Next.js 15 (App Router) + Postgres con Drizzle ORM + Stripe Checkout/Billing + Cloudflare Stream (subida "tus" directa desde el celular, URLs firmadas y borrado programado) + Resend. Login con link mágico y sesión firmada en cookie.

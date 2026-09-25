# Instalacion y despliegue

## Requisitos

- Node.js 20 o superior.
- npm.
- PostgreSQL.
- Una base de datos accesible por `DATABASE_URL`.
- Opcional: API key de Jotform y API key de Gemini.

## Instalacion local

```bash
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
npm run db:generate
npm run db:migrate
npm run dev
```

La API queda en `http://localhost:3001` y la web en `http://localhost:5173`.

## Variables de entorno

API (`apps/api/.env`):

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Conexion PostgreSQL. |
| `PORT` | Puerto de API, por defecto `3001`. |
| `NODE_ENV` | `development`, `production` o `test`. |
| `JWT_SECRET` | Secreto JWT, minimo 32 caracteres. |
| `CORS_ORIGIN` | Origen permitido del frontend en desarrollo. |
| `JOTFORM_WEBHOOK_SECRET` | Secreto opcional en desarrollo; obligatorio en produccion. |
| `JOTFORM_API_KEY` | API key para sincronizar formularios y descargar preguntas. |
| `JOTFORM_API_BASE` | Base URL de Jotform, por defecto `https://api.jotform.com`. |
| `GEMINI_API_KEY` | Requerida para analizar preguntas abiertas. |
| `GEMINI_MODEL` | Modelo Gemini, por defecto `gemini-2.5-flash`. |
| `CATALOG_DATA` | Etiquetas Jotform tratadas como filtros/catalogo, separadas por coma. |

Web (`apps/web/.env`):

| Variable | Uso |
| --- | --- |
| `VITE_API_URL` | URL de API. Vacio si web y API se sirven desde el mismo dominio. |

## Base de datos

Comandos utiles:

```bash
npm run db:generate
npm run db:migrate
npm run db:studio
npm run db:seed -w apps/api
```

En produccion se debe usar:

```bash
npm run db:migrate:prod -w apps/api
```

## Despliegue en Railway

El proyecto incluye `railway.json`. En produccion la API sirve tambien `apps/web/dist`, por lo que puede desplegarse como un solo servicio.

Checklist minimo:

1. Crear PostgreSQL en Railway.
2. Configurar `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`, `JOTFORM_WEBHOOK_SECRET` y llaves externas necesarias.
3. Ejecutar build: `npm run build`.
4. Ejecutar migraciones: `npm run db:migrate:prod -w apps/api`.
5. Iniciar API: `npm run start -w apps/api`.
6. Validar `/health`.

## Webhook de Jotform

Configurar en Jotform la URL:

```text
https://TU_DOMINIO/api/webhooks/jotform?secret=TU_SECRETO
```

Tambien se acepta el secreto en el header `x-jotform-secret`.

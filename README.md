# EPI Web

Sistema web para administrar usuarios, organizaciones, sitios, evaluaciones Jotform, ponderaciones, resultados y reportes institucionales de EPI.

## Levantar rapido

Requisitos: Node.js 20+, npm y PostgreSQL.

```bash
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
npm run db:generate
npm run db:migrate
npm run dev
```

Servicios locales por defecto:

- Web: `http://localhost:5173`
- API: `http://localhost:3001`
- Healthcheck: `http://localhost:3001/health`

Para datos iniciales:

```bash
npm run db:seed -w apps/api
```

## Tecnologia

| Capa | Stack |
| --- | --- |
| Monorepo | npm workspaces, TypeScript |
| Frontend | React, Vite, React Router, Zustand, MUI, Tailwind CSS |
| Offline/PWA | Dexie/IndexedDB, `vite-plugin-pwa`, cola local parcial |
| Backend | Node.js, Express, Helmet, CORS, Morgan, Zod |
| Base de datos | PostgreSQL, Prisma ORM |
| Auth | JWT Bearer, bcrypt, roles, feature flags, revocacion de sesiones |
| Reportes | Recharts, `@react-pdf/renderer` |
| Integraciones | Jotform API/webhooks, Gemini para preguntas abiertas |

## Documentacion

- [Instalacion y despliegue](./docs/instalacion.md)
- [Arquitectura](./docs/arquitectura.md)
- [Manual de administracion](./docs/manual-admin.md)
- [Manual de usuario](./docs/manual-usuario.md)
- [API](./docs/api.md)
- [Mantenimiento](./docs/mantenimiento.md)
- [User stories para QA](./docs/user-stories/README.md)

Documentos tecnicos existentes reutilizados como anexos:

- [Analisis del proyecto](./docs/analisis-proyecto.md)
- [Arquitectura frontend/backend detallada](./docs/arquitectura-front-backend.md)
- [Flujo de administracion y accesos](./docs/administracion-accesos-flujo.md)
- [Flujo de evaluaciones](./docs/evaluaciones-flujo.md)
- [Modulo de gestion de evaluaciones](./docs/modulo-gestion-de-evalaciones.md)

## Scripts principales

| Comando | Uso |
| --- | --- |
| `npm run dev` | API y web en modo desarrollo |
| `npm run dev:api` | Solo API |
| `npm run dev:web` | Solo frontend |
| `npm run build` | Compila shared, API y web |
| `npm run test:unit` | Selfchecks de API y pruebas web |
| `npm run typecheck` | Typecheck/build de todo el monorepo |
| `npm run db:migrate` | Migraciones Prisma en desarrollo |
| `npm run db:studio` | Prisma Studio |

## Que podria faltar

- Swagger/OpenAPI generado automaticamente.
- Politica formal de backups, retencion y anonimizado de datos Jotform.
- Matriz de permisos por accion fina, si EPI necesita algo mas granular que rol + feature/template.
- Runbook de incidentes con responsables, RTO/RPO y checklist de restauracion.

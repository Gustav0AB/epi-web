# EPI Web

Sistema web para administrar usuarios, organizaciones, sitios, evaluaciones Jotform, ponderaciones, resultados y reportes institucionales de EPI.

## Super usuario inicial

Despues de ejecutar `npm run db:seed -w apps/api`:

```text
Usuario: admin
Password: Admin1234!
```

La cuenta se crea con `mustChangePassword=true`; al primer inicio se debe cambiar la contrasena.

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

Por defecto el seed crea catalogos base y el super usuario. Los datos demo solo se cargan con `SEED_DEMO=true`.

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
| Integraciones | Jotform API/webhooks |

## Documentacion

- [Instalacion y despliegue](./docs/instalacion.md)
- [Arquitectura](./docs/arquitectura.md)
- [Manual de administracion](./docs/manual-admin.md)
- [Manual de usuario](./docs/manual-usuario.md)
- [API](./docs/api.md)
- [Mantenimiento](./docs/mantenimiento.md)
- [User stories para QA](./docs/user-stories/README.md)

## Paquetes compartidos

- `@epi/ui` contiene controles visuales genéricos, tablas y modales. La app web conserva envolturas delgadas para inyectar sus traducciones; navegación y componentes conectados a funciones de EPI se quedan en la app.
- `@epi/auth` contiene el store, el adaptador JSON API, el formulario de login y las guardias de acceso. Cada app configura endpoints, usuario, textos y permisos en su propio código. Tiene una guía de integración en [`packages/auth/README.md`](./packages/auth/README.md).
- `@epi/api-client` envía solicitudes JSON, adjunta el token que le entrega la app y convierte errores de la API en `ApiError`. La app conserva la capa offline y decide cómo obtener el token y qué hacer ante un 401.
- `apps/shared` conserva los contratos, tipos y esquemas propios de EPI usados por el frontend y la API.
- La configuración de idiomas y sus diccionarios viven en `apps/web/src/lib/i18n.tsx` y `apps/web/src/lib/locales/` porque son propios de EPI.

Los paquetes se compilan antes de iniciar o compilar el frontend. `@epi/auth` aún no integra un proveedor SSO; si se adopta OIDC/SAML, se conectará el adaptador de la app con ese proveedor y cada app conservará sus permisos.

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

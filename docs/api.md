# API

No hay Swagger/OpenAPI generado en el proyecto actualmente. Esta referencia lista los endpoints reales por modulo; si se agrega Swagger, este documento debe enlazar a `/api/docs` o al archivo OpenAPI.

Todas las respuestas usan el wrapper compartido de `@epi/shared` (`apiSuccess` / `apiError`). Salvo login y webhook, las rutas bajo `/api` requieren `Authorization: Bearer <token>`.

## Salud

| Metodo | Ruta | Auth | Uso |
| --- | --- | --- | --- |
| GET | `/health` | No | Estado de API. |

## Auth

| Metodo | Ruta | Auth | Uso |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | No | Login por username/password. |

## Usuarios

| Metodo | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/users` | Listar usuarios segun alcance. |
| GET | `/api/users/:id` | Obtener usuario. |
| POST | `/api/users` | Crear usuario (`system_admin`, `org_admin`). |
| PATCH | `/api/users/:id` | Editar usuario. |
| DELETE | `/api/users/:id` | Eliminar usuario (`system_admin`, `org_admin`). |
| POST | `/api/users/:id/reset-password` | Resetear contrasena. |
| POST | `/api/users/:id/force-logout` | Revocar sesiones anteriores. |
| POST | `/api/users/me/change-password` | Cambiar contrasena propia. |

## Catalogos

| Metodo | Ruta | Uso |
| --- | --- | --- |
| GET/POST/PATCH/DELETE | `/api/organizations` | Organizaciones; escritura solo `system_admin`. |
| GET/POST/PATCH/DELETE | `/api/sites` | Sitios. |
| GET/POST/PATCH/DELETE | `/api/categories` | Categorias y subcategorias. |
| POST | `/api/categories/import` | Importar CSV de categorias. |
| GET | `/api/catalog-fields` | Campos catalogo derivados de Jotform. |
| GET/POST/PATCH/DELETE | `/api/report-templates` | Plantillas/permisos de reporte. |
| GET/POST | `/api/institutional-positions` | Cargos institucionales. |
| GET | `/api/features` | Features disponibles. |

## Encuestas y ponderaciones

| Metodo | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/surveys` | Listar respuestas. |
| GET | `/api/surveys/pending` | Pendientes. |
| GET | `/api/surveys/count` | Conteo desde fecha. |
| GET | `/api/surveys/summary` | Resumen por grupo. |
| GET | `/api/surveys/groups` | Grupos. |
| POST | `/api/surveys/groups/complete` | Marcar grupo completado. |
| POST | `/api/surveys/:id/reprocess` | Reprocesar respuesta. |
| GET | `/api/surveys/definitions` | Instrumentos registrados. |
| POST | `/api/surveys/definitions` | Registrar instrumento. |
| GET | `/api/surveys/definitions/:id/questions` | Preguntas de instrumento. |
| PATCH | `/api/surveys/definitions/:id/open-questions-summary` | Resumen general de abiertas. |
| POST | `/api/surveys/definitions/:id/weights/import` | Importar ponderaciones CSV. |
| POST | `/api/surveys/definitions/:id/reprocess-pending` | Reprocesar pendientes del instrumento. |
| PUT | `/api/surveys/questions/:id/weight` | Guardar ponderacion. |
| DELETE | `/api/surveys/questions/:id/weight` | Eliminar ponderacion. |
| PATCH | `/api/surveys/questions/:id` | Editar pregunta. |
| POST | `/api/surveys/questions/:id/analyze` | Analizar pregunta abierta con IA. |

## Jotform

| Metodo | Ruta | Uso |
| --- | --- | --- |
| POST | `/api/webhooks/jotform` | Webhook publico con secreto. |
| GET | `/api/surveys/unregistered` | Formularios no registrados detectados por respuestas. |
| GET | `/api/surveys/jotform/forms` | Catalogo sincronizado. |
| POST | `/api/surveys/jotform/forms/sync` | Sincronizar formularios. |
| GET | `/api/surveys/jotform/forms/:formId/questions` | Previsualizar preguntas. |
| GET | `/api/surveys/jotform/submissions` | Historicos disponibles. |
| POST | `/api/surveys/jotform/submissions/import` | Importar historicos. |
| GET/POST/DELETE | `/api/surveys/jotform/accounts` | Cuentas Jotform. |

## Reportes

| Metodo | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/reports/results` | Resultados agregados. |
| GET | `/api/reports/filters` | Filtros disponibles. |
| GET | `/api/reports/assigned` | Mis reportes asignados. |
| GET/POST/PATCH/DELETE | `/api/reports/assignments` | Administrar asignaciones. |
| GET | `/api/reports/assignments/:id/versions` | Versiones de una asignacion. |
| GET | `/api/reports/:id/data` | Datos para reporte interactivo. |

## Auditoria

| Metodo | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/audit-logs` | Bitacora paginada, solo `system_admin`. |

## Pendiente recomendado

Agregar OpenAPI desde las rutas/Zod para evitar mantener esta tabla a mano.

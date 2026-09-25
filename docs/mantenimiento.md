# Mantenimiento

## Checks antes de desplegar

```bash
npm run typecheck
npm run test:unit
npm run build
```

Si hay migraciones:

```bash
npm run db:migrate:prod -w apps/api
```

## Base de datos

Rutina recomendada:

- Revisar que las migraciones Prisma esten aplicadas.
- Mantener backups automaticos del PostgreSQL del proveedor.
- Probar restauracion periodicamente en una base temporal.
- Revisar crecimiento de `submissions.rawJsonData`, `audit_logs` y reportes versionados.

## Jotform

Tareas operativas:

- Validar que `JOTFORM_WEBHOOK_SECRET` este configurado en produccion.
- Revisar respuestas `PENDIENTE_CONFIGURACION` y `ERROR`.
- Sincronizar formularios cuando se agreguen instrumentos nuevos.
- Confirmar que `CATALOG_DATA` contenga las etiquetas correctas.
- Rotar API keys cuando cambien responsables o cuentas.

## Seguridad

- `JWT_SECRET` debe ser largo y distinto por ambiente.
- Usuarios inactivos no pueden usar tokens ya emitidos.
- `force-logout` invalida tokens anteriores usando `sessionValidAfter`.
- Cambios de contrasena tambien revocan sesiones previas.
- Revisar `/audit-log` ante cambios administrativos o incidentes.

## Reportes

Solo respuestas `COMPLETADO` alimentan reportes agregados. Si un reporte parece incompleto:

1. Revisar filtros.
2. Confirmar que el grupo este completado.
3. Revisar que las ponderaciones existan.
4. Reprocesar pendientes/errores del instrumento.
5. Validar alcance del usuario: organizacion, sitios excluidos e instrumentos excluidos.

## Incidentes comunes

| Sintoma | Revision rapida |
| --- | --- |
| API no inicia | Variables de entorno, especialmente `DATABASE_URL` y `JWT_SECRET`. |
| Login falla | Usuario activo, password, bloqueo temporal, `mustChangePassword`. |
| Webhook rechaza | Secreto incorrecto o ausente en produccion. |
| Formulario no aparece | Ejecutar sincronizacion Jotform o revisar API key. |
| Respuestas no puntuan | Faltan `SurveyDefinition`, preguntas o `Weight`. |
| Reporte vacio | No hay submissions `COMPLETADO` dentro del alcance/filtros. |

## Pendientes sanos

- Definir RTO/RPO y responsables de incidentes.
- Documentar politica de retencion/anonimizado.
- Agregar Swagger/OpenAPI.
- Automatizar backup restore test.

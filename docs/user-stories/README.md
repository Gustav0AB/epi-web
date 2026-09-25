# User stories para QA

## Autenticacion

### US-01 Login exitoso

Como usuario activo, quiero iniciar sesion con username y contrasena para entrar al sistema.

Criterios:

- Con credenciales validas se recibe token.
- El usuario aterriza en su ruta por defecto.
- El menu muestra solo permisos disponibles.

### US-02 Cambio obligatorio de contrasena

Como usuario marcado con `mustChangePassword`, quiero cambiar mi contrasena antes de usar el sistema.

Criterios:

- Las rutas protegidas responden `PASSWORD_CHANGE_REQUIRED`.
- El usuario puede abrir solo el flujo de cambio.
- Al cambiar contrasena se revocan sesiones anteriores.

### US-03 Bloqueo por intentos fallidos

Como sistema, quiero bloquear temporalmente cuentas con muchos intentos fallidos.

Criterios:

- Tras varios intentos invalidos la cuenta queda bloqueada.
- Durante el bloqueo el login responde como cuenta bloqueada.
- Pasado el tiempo configurado puede intentar otra vez.

## Administracion

### US-04 Crear usuario operativo

Como admin, quiero crear un `functionality_user` con features especificas.

Criterios:

- El usuario se crea con organizacion, cargo y features.
- Solo puede entrar a las features asignadas.
- No ve plantillas de reporte si no es `report_viewer`.

### US-05 Crear visualizador de reportes

Como admin, quiero crear un `report_viewer` con plantillas asignadas.

Criterios:

- El usuario solo ve rutas de reportes asignadas.
- No accede a encuestas ni ponderaciones.
- Los reportes se filtran por su alcance.

### US-06 Excluir sitio o instrumento

Como admin, quiero excluir sitios o instrumentos a un usuario.

Criterios:

- El usuario no ve datos de sitios excluidos.
- El usuario no ve instrumentos excluidos.
- `system_admin` conserva acceso global.

## Jotform y evaluaciones

### US-07 Registrar formulario Jotform

Como admin, quiero sincronizar formularios y registrar uno como instrumento.

Criterios:

- La sincronizacion trae formularios de Jotform.
- Se puede previsualizar preguntas.
- Al registrar se crean preguntas y campos catalogo.

### US-08 Recibir respuesta por webhook

Como sistema, quiero guardar respuestas entrantes aunque falte configuracion.

Criterios:

- El JSON crudo queda guardado.
- Si falta instrumento o ponderacion queda `PENDIENTE_CONFIGURACION`.
- Si todo esta configurado queda `PROCESADO`.

### US-09 Configurar ponderaciones y reprocesar

Como admin, quiero ponderar preguntas y reprocesar pendientes.

Criterios:

- Se guardan categoria, subcategoria, maxScore y respuesta correcta.
- El reproceso actualiza respuestas pendientes o con error.
- Los resultados agregados se recalculan.

### US-10 Completar grupo

Como usuario operativo, quiero completar un grupo con pre/post suficiente.

Criterios:

- El resumen muestra conteos pre/post.
- La accion de completar cambia submissions a `COMPLETADO`.
- El grupo aparece en reportes agregados.

## Reportes

### US-11 Consultar reporte agregado

Como usuario autorizado, quiero filtrar resultados y exportar PDF.

Criterios:

- Los filtros acotan datos correctamente.
- Graficas y tablas reflejan resultados completados.
- La exportacion PDF se genera sin romper la vista.

### US-12 Publicar reporte asignado

Como admin, quiero asignar y publicar un reporte interactivo.

Criterios:

- Se crea asignacion con plantilla, titulo, filtros y textos.
- El estado puede cambiar a `PUBLISHED`.
- El usuario asignado ve el reporte en `/interactive-reports`.

## Auditoria y mantenimiento

### US-13 Consultar bitacora

Como `system_admin`, quiero revisar acciones sensibles.

Criterios:

- `/audit-log` muestra registros paginados.
- Usuarios no `system_admin` no acceden.
- Cada registro muestra actor, accion, objetivo y fecha.

### US-14 Recuperacion de error de procesamiento

Como admin, quiero resolver respuestas en `ERROR`.

Criterios:

- El error muestra detalle operativo.
- Despues de corregir configuracion se puede reprocesar.
- Si el reproceso es exitoso cambia a `PROCESADO`.

# Manual de administracion

## Roles

| Rol | Alcance |
| --- | --- |
| `system_admin` | Acceso global. Administra organizaciones, sitios, usuarios, catalogos, auditoria, evaluaciones y reportes. |
| `org_admin` | Administra datos de su organizacion. |
| `functionality_user` | Usa solo las funcionalidades asignadas en `featureKeys`. |
| `report_viewer` | Consulta solo reportes/plantillas asignadas en `reportTemplateKeys`. |

## Usuarios

En `/users`:

1. Crear usuario con nombre, username, correo, rol y organizacion cuando aplique.
2. Asignar cargo institucional.
3. Para `functionality_user`, seleccionar funcionalidades: `home`, `surveys`, `scoring`, `open_questions`.
4. Para `report_viewer`, seleccionar plantillas: `reports`, `interactive_reports` u otras registradas.
5. Configurar sitios de referencia y exclusiones de sitio o instrumento.
6. Guardar.

Acciones disponibles:

- Editar datos y permisos.
- Activar/desactivar usuario.
- Resetear contrasena.
- Forzar cierre de sesion.
- Eliminar usuario si el flujo operativo lo permite.

## Permisos y alcance

- `system_admin` ve todo.
- `org_admin` ve solo su organizacion.
- Los sitios de referencia no restringen acceso; sirven como preferencia de vista.
- Las restricciones reales son `excludedSiteIds` y `excludedSurveyDefinitionIds`.
- El backend vuelve a validar rol, estado activo, cambio obligatorio de contrasena y revocacion de sesion en cada request protegida.

## Organizaciones y sitios

En `/organizations`, `system_admin` crea, edita, activa, desactiva o elimina organizaciones.

En `/sites`, `system_admin` y `org_admin` crean y administran sitios. El `org_admin` queda limitado a su organizacion.

## Catalogos

En `/categories`:

- Alta manual de categorias/subcategorias.
- Importacion CSV.
- Activacion, desactivacion, edicion y eliminacion.

La importacion CSV reemplaza el catalogo activo de una organizacion: desactiva lo anterior y activa/crea lo que viene en el archivo.

Catalogos adicionales:

- `report_templates`: permisos disponibles para visualizadores de reportes.
- `institutional_positions`: cargos sugeridos al crear usuarios.
- `catalog_fields`: campos derivados de Jotform segun `CATALOG_DATA`.

## Jotform

En `/survey-settings`:

1. `system_admin`: registrar cuentas Jotform, sincronizar formularios y asociar un formulario a sitio y tipo (`LOCAL` o `VISITING`).
2. `system_admin`: revisar formularios no registrados cuando lleguen respuestas por webhook.
3. `system_admin` y `org_admin`: consultar e importar historicos de instrumentos dentro del alcance permitido.
4. Toda asociacion valida que el sitio pertenezca al alcance del administrador.

## Ponderaciones

En `/scoring`:

1. Seleccionar instrumento.
2. Revisar preguntas ponderables.
3. Definir tipo de pregunta, categoria, subcategoria, puntaje maximo y respuesta correcta cuando aplique.
4. Guardar manualmente o importar CSV.
5. Reprocesar pendientes.

Solo respuestas `COMPLETADO` entran a reportes agregados.

## Grupos

En `/survey-groups` se consultan grupos por rango de fechas. La vista muestra escuela, fecha, alumnos que respondieron, conteos `PRE`, `POST`, `CQS` y mejora calculada cuando hay pre y post.

## Reportes

En `/report-assignments`:

- Crear reporte asignado a un usuario.
- Elegir una o varias plantillas, sitios (todos, uno o varios), filtros y textos. El titulo se toma de la plantilla.
- Cambiar estado: `PENDING`, `IN_REVIEW`, `PUBLISHED`.
- Consultar versiones.
- Eliminar asignacion.

En `/reports` se consultan resultados agregados y se exportan PDFs.
Despues de revisar los filtros, **Completar plantilla dinamica** abre la asignacion con sitio, tipo, escuela, categoria y fechas precargados. La asignacion se revisa y cambia a `PUBLISHED` cuando datos y textos esten listos.
En los campos `Hero photo` y `Course photo` puedes seleccionar una imagen JPG, PNG o WebP de hasta 2 MB; queda guardada dentro de la asignacion y aparece en la vista interactiva y en el documento.

Con `SEED_DEMO=true` se crea `report_viewer_demo` (contrasena `report_viewer_demo`) con las tres plantillas Course Impacts de `/templates` publicadas. Cada una incluye fotos, textos, satisfaccion, actividades, comparativos pre/post y datos de impacto suficientes para revisar el diseño completo.

## Auditoria

En `/audit-log`, solo `system_admin` consulta acciones sensibles: login, altas/bajas, cambios de rol, resets, importaciones y acciones registradas por los modulos.

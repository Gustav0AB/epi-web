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

En la seccion de evaluaciones/ponderaciones:

1. Registrar cuenta Jotform con API key.
2. Sincronizar formularios.
3. Previsualizar preguntas.
4. Registrar formulario como instrumento, asociando sitio y tipo (`LOCAL` o `VISITING`).
5. Importar historicos si aplica.
6. Revisar formularios no registrados cuando lleguen respuestas por webhook.

## Ponderaciones

En `/scoring`:

1. Seleccionar instrumento.
2. Revisar preguntas ponderables.
3. Definir tipo de pregunta, categoria, subcategoria, puntaje maximo y respuesta correcta cuando aplique.
4. Guardar manualmente o importar CSV.
5. Reprocesar pendientes.

Solo respuestas `COMPLETADO` entran a reportes agregados.

## Reportes

En `/report-assignments`:

- Crear reporte asignado a un usuario.
- Elegir plantilla, titulo, filtros y textos.
- Cambiar estado: `PENDING`, `IN_REVIEW`, `PUBLISHED`.
- Consultar versiones.
- Eliminar asignacion.

En `/reports` se consultan resultados agregados y se exportan PDFs.

## Auditoria

En `/audit-log`, solo `system_admin` consulta acciones sensibles: login, altas/bajas, cambios de rol, resets, importaciones y acciones registradas por los modulos.

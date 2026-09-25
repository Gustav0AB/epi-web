# Manual de usuario

## Entrar al sistema

1. Abrir `/login`.
2. Ingresar username y contrasena.
3. Si el sistema solicita cambio de contrasena, definir una nueva.
4. Al entrar, el menu muestra solo las pantallas permitidas.

Si la cuenta esta inactiva, bloqueada por intentos fallidos o sin permisos, el sistema impide el acceso.

## Evaluaciones recibidas

En `/surveys` se consultan respuestas recibidas desde Jotform.

Usos principales:

- Filtrar por instrumento, sitio, tipo, estado, grupo, pre/post y fecha.
- Ver respuestas pendientes de configuracion.
- Ver errores de procesamiento.
- Identificar posibles duplicados.
- Reprocesar respuestas.
- Completar grupos cuando ya existe informacion suficiente pre y post.

Estados:

| Estado | Significado |
| --- | --- |
| `PENDIENTE_CONFIGURACION` | Falta instrumento o ponderacion. |
| `PROCESADO` | La respuesta fue calculada. |
| `ERROR` | Hubo un fallo inesperado; se puede reprocesar. |
| `COMPLETADO` | El grupo fue cerrado y entra a reportes. |

## Ponderaciones

En `/scoring` se configura como puntua cada pregunta.

Flujo:

1. Elegir instrumento.
2. Revisar preguntas.
3. Asignar categoria, subcategoria y puntaje.
4. Definir respuesta correcta cuando la pregunta lo requiera.
5. Guardar o importar CSV.
6. Reprocesar pendientes.

## Preguntas abiertas

En `/open-questions`:

- Seleccionar instrumento.
- Revisar preguntas abiertas.
- Ejecutar analisis IA.
- Consultar resumen, mejores respuestas, justificacion, modelo y fecha.
- Volver a analizar si hay nuevas respuestas o se requiere actualizar el resumen.

## Reportes

En `/reports`:

- Aplicar filtros por sitio, tipo, escuela, categoria y fecha.
- Revisar graficas y tablas.
- Crear secciones con texto y visualizaciones.
- Exportar PDF.

En `/interactive-reports`:

- Ver reportes asignados.
- Filtrar por estado.
- Abrir documento interactivo.
- Cambiar filtros permitidos, como sitio/global.
- Descargar vista tipo documento.

## Trabajo offline parcial

El sistema mantiene cache local y cola de mutaciones para parte del modulo de usuarios. Si se pierde conexion, algunas acciones pueden quedar pendientes y sincronizarse al volver la red.

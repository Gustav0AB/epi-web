# Especificación de UI para Figma

Referencia para replicar el demo con la funcionalidad y el alcance actuales. Actualizar este archivo en el mismo cambio que modifique una pantalla, un flujo, permisos o componentes compartidos.

## Alcance del demo

- Idioma inicial: español; el encabezado alterna español/inglés (`ES` / `EN`).
- La navegación y las acciones visibles dependen del rol. Usar variantes de Figma en lugar de duplicar pantallas por permiso.
- El demo debe simular estados de carga, vacío, error y éxito donde la pantalla los contempla. No necesita integrar Jotform, IA, API, almacenamiento offline ni generación real de PDF.
- Incluye la vista desktop y la adaptación móvil básica: el contenido conserva tarjetas/tablas con desplazamiento horizontal cuando es necesario; el nombre de usuario se oculta en el encabezado móvil.

## Sistema visual

| Token | Valor | Uso |
| --- | --- | --- |
| Primario | `#2B6579` | botones primarios, avatar, foco, navegación activa |
| Primario hover | `#245668` | hover/activo |
| Primario suave | `#E8F2F5` | fondo de navegación activa |
| Secundario | `#EF8200` | acciones secundarias |
| Peligro | `#DC2626` | eliminar, errores, alertas |
| Éxito | `#16A34A` | estado correcto |
| Advertencia | `#D97706` | estado de advertencia |
| Fondo de app | gris 50 | área exterior de tarjetas |
| Bordes | gris 200 | tarjetas, tablas, campos, separadores |

- Tipografía: sans serif del sistema; títulos 24 px/semibold o bold, subtítulos 16 px/semibold, cuerpo y controles 14 px, navegación 16 px/medium.
- Tarjeta: blanco, borde gris claro, radio 12 px, sombra sutil; padding habitual 24 px (16/32 px en variantes pequeña/grande).
- Botón: radio 6 px; alto estándar 36 px. Variantes: primario, secundario, ghost y peligro; mostrar spinner + “Loading…” durante carga.
- Campo y selector: etiqueta encima, alto aproximado 36 px, radio 6 px, borde gris; foco primario; error rojo con texto de ayuda debajo.
- Etiqueta de estado: píldora, radio completo, texto 12 px/medium.
- Iconografía: Material Outlined, 20–24 px; usar las mismas metáforas de los íconos de navegación.

## Estructura global

### Inicio de sesión (`/login`)

Fondo gris muy claro; tarjeta centrada de ancho máximo 384 px, con logo EPI, título “EPI”, campos **Usuario** y **Contraseña**, error en bloque rojo y botón de ancho completo **Iniciar sesión**. Tras entrar, se muestra un modal obligatorio de cambio de contraseña si corresponde.

### Aplicación autenticada

| Zona | Comportamiento |
| --- | --- |
| Sidebar | Izquierda, blanca, alto completo. Colapsada 64 px y expandida 224 px. Botón menú en la cabecera; en colapsado solo íconos con tooltip, en expandido ícono + texto y marca “EPI”. Botón Cerrar sesión al final. |
| Header | Alto 56 px, blanco, borde inferior. Logo a la izquierda. A la derecha: idioma, campana (solo quienes ven encuestas), avatar con iniciales y nombre. |
| Menú de perfil | Al pulsar el avatar: Configuración (solo administrador de sistema), Cambiar contraseña y Cerrar sesión. |
| Contenido | Fondo gris claro, padding 16 px móvil / 32 px desktop, scroll vertical independiente. |
| Sin acceso | Pantalla centrada: “Tu cuenta no tiene ninguna función asignada todavía. Contacta a tu administrador.” |

La vista de **Reportes interactivos** no tiene sidebar: solo header, contenido y banner offline. El banner offline aparece fijo cuando no hay conexión: “Trabajando sin conexión — los cambios se sincronizarán al reconectar”.

## Navegación y permisos

| Ítem / ruta | Visible para |
| --- | --- |
| Inicio `/home` | administradores o usuario operativo con Inicio |
| Encuestas `/surveys`, Grupos `/survey-groups` | administradores o usuario operativo con Encuestas |
| Ponderaciones `/scoring` | administradores o usuario operativo con Ponderaciones |
| Preguntas abiertas `/open-questions` | administradores o usuario operativo con Preguntas abiertas |
| Reportes `/reports` | administradores o plantilla `reports` |
| Usuarios `/users` | administrador de sistema u organización |
| Organizaciones `/organizations`, Auditoría `/audit-log` | solo administrador de sistema |
| Sitios `/sites`, Categorías `/categories`, Asignar reportes `/report-assignments`, Configuración de encuestas `/survey-settings`, Cuentas Jotform `/jotform-accounts` | administrador de sistema u organización |
| Reportes interactivos `/interactive-reports` | plantilla `interactive_reports`; sin sidebar |

Roles: **Administrador de sistema** (global), **Administrador de organización** (su organización), **Usuario operativo** (funciones asignadas) y **Ve reportes** (plantillas asignadas).

## Pantallas y prototipos

| Pantalla | Estructura y acciones a prototipar |
| --- | --- |
| Inicio | Filtros: sitio, local/visitante, escuela, categoría, pre/post; enlace Limpiar filtros. Tabla de resultados y, con datos, barras horizontales pre/post, radar por categoría y barras de cambio. Columna lateral “Actividad reciente” con participante, grupo/fecha y estado. |
| Encuestas | Título/subtítulo; tarjeta de filtros por encuesta, sitio, tipo, estado, grupo, momento y fechas; limpiar. Tabla de respuestas con estado, posible duplicado y Reprocesar. Tarjeta “Resumen por grupo” con Completar habilitado solo si hay PRE y POST. |
| Grupos | Tarjeta con rango de fechas y Buscar. Tres métricas (grupos, alumnos que respondieron, con mejora calculada) y tabla con escuela, fecha, alumnos, encargado y mejora. |
| Ponderaciones | Selector de encuesta; tabla editable por pregunta (tipo, categoría, subcategoría, puntaje máximo, respuesta correcta). Acciones: descargar/importar CSV, reprocesar pendientes, guardar todas y guardar/quitar por fila. Modal para ponderar preguntas Likert al descargar. |
| Preguntas abiertas | Selector de encuesta. Tarjeta de resumen general editable y Guardar. Una tarjeta por pregunta con Analizar/Actualizar resumen, resumen IA, mejores respuestas, fecha y número de respuestas. |
| Configuración de encuestas | Contenedor de catálogo Jotform, instrumentos no configurados y migración histórica. El catálogo permite seleccionar cuenta, Sincronizar y asociar formularios; las asociaciones se confirman en modal con sitio y tipo Local/Visitante. Instrumentos no configurados muestra Form ID, respuestas, fecha y campos detectados. Migración busca respuestas históricas y permite seleccionar/importar. |
| Cuentas Jotform | Formulario para API key + guardar; tabla de cuentas conectadas y acción Desconectar. |
| Usuarios | Título, Agregar usuario y tabla: nombre, usuario, correo, rol, cargo, permisos, estado y acciones (editar, activar/desactivar, restablecer contraseña, forzar cierre). Modal de creación/edición con identidad, organización, cargo, sitios de referencia/excluidos, encuestas excluidas y selección de funciones o plantillas según rol. Modales para restablecer/cambiar contraseña. |
| Organizaciones | Tabla de organizaciones con Agregar, editar, activar/desactivar y eliminar. Modal de alta/edición; confirmación destructiva. |
| Sitios | Igual patrón de organizaciones: nombre, organización/alcance y estado; alta/edición/eliminación con confirmación. |
| Categorías | Tabla de categoría/subcategorías, estado y acciones. Alta/edición, activación/eliminación. Tarjeta de CSV con Descargar plantilla e Importar CSV. |
| Asignar reportes | Tabla de asignaciones con historial, editar y eliminar. Modal de alta/edición: usuario, plantilla, título, estado (`PENDING`, `IN_REVIEW`, `PUBLISHED`), filtros y textos. Modal de historial y confirmación de eliminación. |
| Configuración | Gestión de plantillas de reporte: clave, título, agregar y listado. |
| Auditoría | Tabla paginada de fecha, quién, acción, objetivo y detalles; estado vacío “Sin registros todavía.” |
| Reportes | Constructor: filtros de reporte, secciones reordenables (título, texto, gráfica/tabla), editar texto, configurar, mover arriba/abajo, eliminar, añadir sección y descargar PDF. |
| Reportes interactivos | Lista de reportes asignados en tarjetas, filtro de estado y acceso a cada reporte. El reporte permite cambiar filtros autorizados y abrir “vista documento” para descargar. |

## Componentes y estados reutilizables

| Componente | Estados mínimos |
| --- | --- |
| Tabla | carga, sin datos, filas, hover, paginación; selector 10/25/50/100, anterior/siguiente deshabilitados en extremos |
| Modal | backdrop negro 40 %, panel máx. 90 vh, encabezado/cierre, cuerpo desplazable y footer fijo; cerrar con X, Escape o backdrop |
| Confirmación | texto descriptivo, Cancelar ghost y Eliminar peligro; estado de carga/error |
| Date picker | botón con fecha/placeholder e ícono, calendario mensual con anterior/siguiente, hoy, seleccionado y Limpiar |
| Dropdown | etiqueta, placeholder, selección, foco, error, deshabilitado |
| Badge de encuesta | Pendiente, Procesado, Completado y Error; incluir variante de “Posible duplicado” |
| Toast/feedback en sitio | errores en rojo y resultados de importación/reproceso en el bloque que lanzó la acción |

## Cómo mantener Figma sincronizado

1. Antes de implementar una modificación, localizar su ruta y el componente compartido afectado en `apps/web/src`.
2. Actualizar el frame de la ruta y, si aplica, el componente/variante del sistema de diseño. Mantener los mismos textos, permisos y estados de esta guía.
3. Si cambia el aspecto global, actualizar primero los tokens de arriba; si cambia una acción, documentar el nuevo estado y conexión de prototipo en su fila de pantalla.
4. Comprobar con los cuatro roles y con estos casos: carga, sin datos, error, acción deshabilitada y modal de confirmación.
5. Actualizar este documento en el mismo PR/commit y anotar bajo este encabezado la fecha, ruta y cambio hecho.

### Registro de cambios de Figma

| Fecha | Ruta/componente | Cambio | Frame/variante Figma |
| --- | --- | --- | --- |
| 2026-09-28 | Base | Especificación inicial basada en la UI actual | Pendiente de enlazar |

## Fuentes de verdad

- Rutas y permisos: `apps/web/src/App.tsx`, `apps/web/src/layouts/Sidebar.tsx`.
- Layout y navegación superior: `apps/web/src/layouts/AppLayout.tsx`, `Header.tsx`, `ReportLayout.tsx`.
- Estilo y componentes: `apps/web/src/config/theme.ts`, `apps/web/src/shared/components/`.
- Textos visibles: `apps/web/src/lib/locales/es.json`.
- Pantallas: `apps/web/src/pages/` y `apps/web/src/features/`.

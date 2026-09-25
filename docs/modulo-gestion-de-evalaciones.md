# Módulo de Gestión de Evaluaciones

Automatiza la recepción, validación, ponderación, cálculo y almacenamiento de
las respuestas de los instrumentos de evaluación (Jotform) usados por EPI.

> Para el mapa completo de funcionalidad con diagramas (arquitectura, modelo
> de datos, secuencias backend/frontend) ver
> [`evaluaciones-flujo.md`](./evaluaciones-flujo.md).
> Este documento se enfoca en qué se agregó en la última iteración y qué
> queda pendiente de definir con EPI.

## Flujo end-to-end

```
Jotform ──POST /api/webhooks/jotform──▶ Submission (rawJsonData crudo, status PENDIENTE_CONFIGURACION)
                                              │
                                     ¿existe SurveyDefinition                 no ──▶ queda con surveyDefinitionId = null
                                     para ese formID?                                → aparece en GET /api/surveys/unregistered
                                              │ sí
                                              ▼
                                     ¿todas las preguntas tienen Weight?      no ──▶ PENDIENTE_CONFIGURACION (con surveyDefinitionId ya asociado)
                                              │ sí                                   → aparece en Ponderaciones / se reprocesa manual o en bloque
                                              ▼
                              motor de cálculo (scoring.ts) → AggregatedResult
                                              │
                                    try/catch: fallo inesperado ──▶ status ERROR (processingError guardado)
                                              │ ok
                                              ▼
                                     status PROCESADO (isDuplicate marcado si aplica)
                                              │
                          admin junta pre + post del grupo → POST /surveys/groups/complete
                                              ▼
                                     status COMPLETADO → entra a los reportes
```

El JSON crudo (`Submission.rawJsonData`) nunca se borra ni se sobrescribe,
sin importar en qué estado quede la respuesta.

## Piezas del módulo

| Archivo | Responsabilidad |
|---|---|
| `surveys.routes.ts` / `surveys.controller.ts` | Webhook, endpoints de encuestas, ponderaciones, reportes |
| `surveys.service.ts` | Reglas de negocio: ingesta, motor de bifurcación (`processSubmission`), alta de instrumentos, reprocesos |
| `surveys.repository.ts` | Acceso a datos (Prisma) |
| `scoring.ts` | Motor de puntuación puro (Likert, selección única, frecuencia) |
| `csv.ts` | Parser CSV mínimo (import de ponderaciones) |
| `ai.ts` | Resumen de preguntas abiertas vía Claude |

## Estados de una respuesta (`SubmissionStatus`)

- **PENDIENTE_CONFIGURACION** — falta el instrumento (formID no asociado a
  ningún sitio) o faltan ponderaciones de alguna pregunta. El dato no se pierde.
- **PROCESADO** — calculado correctamente, resultados guardados.
- **ERROR** — un fallo inesperado durante el cálculo (no un "falta
  configurar"); el detalle queda en `processingError` para revisión manual.
  Se reintenta igual que un pendiente (botón "Reprocesar").
- **COMPLETADO** — el grupo ya tiene su pre y su post procesados; solo estas
  entran a los reportes.

## Qué se agregó en esta iteración

El pipeline técnico (ingesta → normalización → verificación de pesos →
cálculo → histórico → reportes) ya existía. Esto cierra los huecos
operativos identificados contra el documento de especificación:

1. **Alta de instrumentos nuevos desde la UI** (`GET /surveys/unregistered`,
   `POST /surveys/definitions`, sección "Instrumentos sin configurar" en
   `ScoringPage`). Antes había que crear la `SurveyDefinition` a mano en la
   base de datos; ahora un `system_admin`/`org_admin` ve los formIDs
   desconocidos que ya mandaron respuestas, con una muestra de sus campos, y
   los asocia a un sitio + tipo de encuesta. Las preguntas se crean
   automáticamente a partir de lo ya recibido (tipo inferido: valor numérico
   → `LIKERT`, si no → `OPEN_TEXT`) y las respuestas pendientes se
   reprocesan de inmediato.
2. **Edición del tipo de pregunta** (`PATCH /surveys/questions/:id`, columna
   editable en `ScoringPage`). Necesario para corregir el tipo inferido
   automáticamente en el punto anterior — antes no existía ninguna forma de
   cambiarlo una vez creada la pregunta.
3. **Estado `ERROR` conectado de verdad.** El motor de cálculo ahora corre
   dentro de un `try/catch`; un fallo inesperado (no una simple falta de
   configuración) marca la submission como `ERROR` con el mensaje guardado
   en `processingError`, en vez de perderse en un log de servidor o tumbar
   el webhook.
4. **Reproceso en bloque** (`POST /surveys/definitions/:id/reprocess-pending`,
   botón "Reprocesar pendientes"). Antes había que reprocesar respuesta por
   respuesta después de configurar las ponderaciones de un instrumento;
   ahora se reintentan todas las `PENDIENTE_CONFIGURACION`/`ERROR` de esa
   encuesta de una sola vez.
5. **Detección de posibles duplicados.** Si el mismo participante ya tiene
   una respuesta `PROCESADO`/`COMPLETADO` para la misma encuesta y el mismo
   momento (pre/post), la nueva se marca con `isDuplicate = true` (no se
   bloquea ni se descarta — solo se señala para revisión, con un badge en
   el listado de encuestas).
6. **Corrección de un bug de alcance:** al marcar una respuesta como
   pendiente por falta de ponderaciones, el sistema nunca guardaba a qué
   `SurveyDefinition` pertenecía. Eso hacía que la validación de sitio/
   organización se saltara silenciosamente al reprocesar (`assertSiteAllowed`
   no tenía sitio que autorizar) y que fuera imposible distinguir "falta
   instrumento" de "falta ponderación" en el listado de pendientes. Ahora
   `markPending` persiste la definición cuando sí hubo match.

## Pendiente de definición con EPI

Estos puntos están señalados en la especificación como sujetos a validación
funcional, o son decisiones de negocio que no se pueden resolver desde el
código. Lo implementado es una base razonable, pero deliberadamente no se
"inventó" la respuesta de negocio:

- **Fórmulas y reglas estadísticas del motor de cálculo.** Hoy: suma simple
  de puntos por categoría/subcategoría, respuestas en blanco excluidas del
  máximo. Casos particulares (ponderación no lineal, preguntas con peso
  negativo, escalas invertidas, etc.) no están cubiertos.
- **Vigencia/versión propia de las ponderaciones.** Hoy la única versión que
  existe es la de `SurveyDefinition` (v1, v2…); un `Weight` no tiene su
  propia fecha de vigencia independiente del instrumento. Si EPI necesita
  cambiar una ponderación sin crear una versión nueva del instrumento
  completo, o mantener histórico de qué ponderación aplicó a qué fecha,
  falta modelarlo.
- **Reglas particulares "según el instrumento".** El motor soporta hoy
  Likert, selección única, frecuencia y texto abierto (sin ponderar). Reglas
  específicas de negocio (p. ej. puntaje distinto si dos preguntas se
  responden de cierta forma en conjunto) no están contempladas.
- **Política de duplicados.** Se detectan y se marcan (`isDuplicate`), pero
  no se define qué debe pasar después: ¿se descarta la más vieja, se
  promedian, se deja que el admin decida manualmente cuál vale? Hoy ambas
  quedan procesadas y visibles.
- **Taxonomía de categorías/subcategorías.** Se administra por CSV
  (`/api/catalog/categories/import`) como catálogo plano; no hay jerarquía
  ni validación de que las categorías usadas en `Weight` existan en ese
  catálogo.
- **Canal de notificación al admin.** Hoy la alerta de "instrumento sin
  configurar" o "respuesta con error" es una entrada en el listado
  correspondiente (pendientes / instrumentos sin configurar) dentro de la
  plataforma. No hay email, Slack u otro canal push — a definir si el
  volumen esperado de instrumentos nuevos lo justifica.
- **Retención y expurgo del JSON crudo.** El dato original se conserva para
  siempre (íntegro, por diseño). No hay política de retención/anonimización
  a largo plazo — a definir según los requisitos de privacidad/compliance
  de EPI.
- **Integración con Google Sheets.** Confirmado explícitamente fuera de
  alcance por ahora (la plantilla CSV se puede editar en Sheets, Excel, etc.,
  pero no hay sincronización directa).

# Módulo de Gestión de Evaluaciones — Funcionalidad y flujo

> Documento de arquitectura pensado para verse en Obsidian (los bloques
> ```mermaid``` se renderizan nativos). Complementa a
> [`apps/api/src/modules/surveys/README.md`](../apps/api/src/modules/surveys/README.md),
> que lleva el detalle de qué se agregó en la última iteración y qué queda
> pendiente de definir con EPI. Este documento es el mapa completo: toda la
> funcionalidad, cómo fluyen los datos y cómo interactúan backend y frontend.
> Para el módulo de Administración/Usuarios/Seguridad ver
> [`administracion-accesos-flujo.md`](./administracion-accesos-flujo.md); para
> el mapa general de todo el sistema ver
> [`arquitectura-front-backend.md`](./arquitectura-front-backend.md).

## 1. Panorama general

```mermaid
graph TD
    subgraph Frontend["apps/web — React + Vite"]
        SurveysPage["SurveysPage /surveys"]
        ScoringPage["ScoringPage /scoring"]
        UnregisteredForms["UnregisteredForms (dentro de ScoringPage)"]
        AuthStore["auth.store.ts (Zustand + JWT)"]
        SurveyApi["features/surveys/api.ts"]
    end

    subgraph Backend["apps/api — Express + Prisma"]
        Routes["surveys.routes.ts"]
        Controller["surveys.controller.ts"]
        Service["surveys.service.ts"]
        Repo["surveys.repository.ts"]
        Scoring["scoring.ts (motor puro)"]
        Csv["csv.ts (parser)"]
        AI["ai.ts (Claude — preguntas abiertas)"]
    end

    Jotform((Jotform)) -->|"POST /api/webhooks/jotform<br/>+ secreto"| Routes
    SurveyApi -->|"fetch + Bearer JWT"| Routes
    AuthStore -.token.-> SurveyApi

    Routes --> Controller --> Service
    Service --> Scoring
    Service --> Csv
    Service --> AI
    Service --> Repo --> DB[("PostgreSQL")]

    SurveysPage --> SurveyApi
    ScoringPage --> SurveyApi
    UnregisteredForms --> SurveyApi
```

## 2. Modelo de datos

```mermaid
erDiagram
    ORGANIZATION ||--o{ SITE : tiene
    SITE ||--o{ SURVEY_DEFINITION : define
    SURVEY_DEFINITION ||--o{ QUESTION : contiene
    QUESTION ||--o| WEIGHT : pondera
    QUESTION ||--o| QUESTION_INSIGHT : "resumen IA (open text)"
    SURVEY_DEFINITION ||--o{ SUBMISSION : recibe
    PARTICIPANT ||--o{ SUBMISSION : responde
    SUBMISSION ||--o{ ANSWER : contiene
    QUESTION ||--o{ ANSWER : "respondida en"
    SUBMISSION ||--o{ AGGREGATED_RESULT : produce

    ORGANIZATION {
        string id
        string name
    }
    SITE {
        string id
        string name
        string organizationId
    }
    SURVEY_DEFINITION {
        string id
        string jotformFormId
        int version
        enum type "LOCAL | VISITING"
    }
    QUESTION {
        string id
        string externalId "id del campo en Jotform"
        string text
        enum type "LIKERT | ONE_ANSWER | FREQUENCY | OPEN_TEXT"
    }
    WEIGHT {
        string category
        string subcategory
        float maxScore
        string correctAnswer "solo ONE_ANSWER"
    }
    SUBMISSION {
        string id
        string jotformSubmissionId "único — idempotencia del webhook"
        json rawJsonData "crudo, nunca se pierde"
        enum status "PENDIENTE_CONFIGURACION|PROCESADO|COMPLETADO|ERROR"
        bool isPre
        bool isDuplicate
        string processingError
    }
    PARTICIPANT {
        string externalId
        string name
        string groupName
        string school
    }
    ANSWER {
        string value
    }
    AGGREGATED_RESULT {
        string category
        string subcategory
        float calculatedScore
        float maxPossible
        bool isPrePost
    }
    QUESTION_INSIGHT {
        string summary
        json bestAnswers
    }
```

## 3. Backend — ingesta del webhook (`POST /api/webhooks/jotform`)

```mermaid
sequenceDiagram
    participant JF as Jotform
    participant API as Express
    participant SVC as surveys.service
    participant DB as Postgres

    JF->>API: POST /api/webhooks/jotform (header/query secreto)
    API->>API: valida JOTFORM_WEBHOOK_SECRET
    API->>SVC: ingest(body)
    SVC->>SVC: normalizeJotform (rawRequest→JSON) + liftIdentifiers<br/>(detecta pre/post, participante, escuela, grupo…)
    SVC->>DB: upsert Submission (rawJsonData crudo,<br/>status=PENDIENTE_CONFIGURACION)
    SVC->>DB: upsert Participant
    SVC->>SVC: processSubmission(submissionId)

    alt formID sin SurveyDefinition (o sin preguntas)
        SVC->>DB: markPending() — sin definitionId
        Note over DB: aparece en GET /surveys/unregistered
    else definición existe pero faltan Weights
        SVC->>DB: markPending(defId) — SÍ persiste el link
        Note over DB: aparece en Ponderaciones / listado de pendientes
    else reglas completas → calcular
        SVC->>SVC: scoreAnswer + aggregate (scoring.ts)
        SVC->>DB: findProcessedSibling (¿mismo participante+encuesta+pre/post ya procesado?)
        alt fallo inesperado
            SVC->>DB: markError(mensaje)
        else ok
            SVC->>DB: persistResults (Answer[] + AggregatedResult[],<br/>status=PROCESADO, isDuplicate)
        end
    end

    SVC-->>API: { submissionId, status, reason? }
    API-->>JF: 200 OK
```

## 4. Ciclo de vida de una respuesta (`SubmissionStatus`)

```mermaid
stateDiagram-v2
    [*] --> PENDIENTE_CONFIGURACION: webhook recibido
    PENDIENTE_CONFIGURACION --> PROCESADO: instrumento + pesos completos
    PENDIENTE_CONFIGURACION --> ERROR: fallo inesperado al calcular
    ERROR --> PROCESADO: reproceso exitoso
    ERROR --> PENDIENTE_CONFIGURACION: reproceso detecta pesos faltantes
    PROCESADO --> COMPLETADO: admin completa el grupo (pre y post ya PROCESADO)
    COMPLETADO --> [*]: entra a reportes

    note right of PENDIENTE_CONFIGURACION
        El JSON crudo nunca se pierde
        en ningún estado.
    end note
```

## 5. Alta de un instrumento nuevo

Dos caminos conviven, según si el admin quiere configurar el instrumento
**antes** de que lleguen respuestas o reaccionar a lo que **ya** llegó:

```mermaid
sequenceDiagram
    participant Admin
    participant FE as ScoringPage (JotformFormsCatalog / UnregisteredForms)
    participant API as Express
    participant SVC as surveys.service
    participant JF as Jotform API
    participant DB as Postgres

    rect rgb(240,245,248)
    Note over Admin,DB: Camino A — catálogo de formularios (proactivo)
    Admin->>FE: "Sincronizar" en el catálogo de formularios
    FE->>API: POST /api/surveys/jotform/forms/sync
    API->>SVC: syncJotformForms()
    SVC->>JF: GET /user/forms
    SVC->>DB: upsert JotformForm[] (diff: cuáles son nuevos)
    Admin->>FE: elige un formulario nuevo, sitio + tipo, "Asociar y procesar"
    end
    FE->>API: POST /api/surveys/definitions {jotformFormId, siteId, type}
    API->>SVC: registerDefinition(input)
    SVC->>JF: GET /form/:id/questions
    SVC->>SVC: mapJotformQuestions — separa preguntas ponderables<br/>de campos de catálogo (CATALOG_DATA)
    SVC->>DB: upsert CatalogField (Grupo/Grado/Tipo de Programa/Edad…)
    SVC->>DB: createDefinitionWithQuestions (solo las ponderables)
    loop cada submission que ya esperaba este formID (camino B)
        SVC->>SVC: processSubmission(id)
    end
    SVC-->>API: { definitionId, reprocessed, stillPending, errors }
    API-->>FE: resultado
    FE-->>Admin: refresca definiciones, catálogo y tabla de pendientes
```

**Camino A — catálogo de formularios** (`JotformFormsCatalog.tsx`,
`GET/POST /api/surveys/jotform/forms*`): trae el listado completo de la
cuenta de Jotform (`GET /user/forms`) a una tabla cacheada (`JotformForm`),
marca cuáles ya están dados de alta (`registered`), y permite registrar uno
nuevo sin depender de que ya haya enviado respuestas — sus preguntas se
descargan en vivo (`GET /form/:id/questions`).

**Camino B — instrumentos sin configurar** (`UnregisteredForms.tsx`,
`GET /api/surveys/unregistered`): el que ya existía — formularios que **ya**
mandaron respuestas por webhook pero nunca se asociaron a un sitio. Sigue
sirviendo para el caso de un formID que llega por sorpresa sin haber sido
sincronizado antes.

Ambos caminos terminan en el mismo `registerDefinition()`, que **ya no
infiere** el tipo de pregunta de las respuestas crudas (la heurística
anterior "valor numérico → LIKERT" se eliminó) — ahora usa el tipo de
control real que reporta Jotform (`jotform-questions.ts#mapJotformQuestions`):

| Control de Jotform | `QuestionType` |
|---|---|
| `control_scale` | `LIKERT` |
| `control_radio` / `control_dropdown` / `control_checkbox` | `ONE_ANSWER` (el admin corrige a `FREQUENCY` a mano si aplica — no hay forma automática de distinguirlos) |
| `control_textarea` / `control_textbox` | `OPEN_TEXT` |
| `control_head` / `control_collapse` / `control_button` / `control_page` | se descartan (no son preguntas) |

### 5.1 Campos de catálogo (`CATALOG_DATA`)

Antes de clasificar una pregunta como ponderable, se compara su `text`
(sin distinguir mayúsculas/acentos) contra la env `CATALOG_DATA` — lista de
etiquetas separadas por coma, ej. `GRUPO,GRADO,TIPO DE PROGRAMA,EDAD`. Si
matchea, la pregunta **no** se crea como `Question`: se guarda como
`CatalogField` (`label` + `options`, combinando/deduplicando opciones si
varios formularios comparten la misma pregunta de catálogo) vía
`GET /api/catalog-fields`. Sirve para poblar filtros de reporte (sitio,
grupo, grado…) sin mezclar esos campos con las preguntas que sí se ponderan.

### 5.2 El webhook real de Jotform (dos formatos distintos)

`normalizeJotform()` en `surveys.service.ts` tiene que reconciliar **dos**
formas en las que llega el crudo, ambas distintas del formato interno
(`answers: [{questionId, value}]`) que valida `JotformPayloadSchema`:

- **Webhook en vivo** (`POST /api/webhooks/jotform`): Jotform manda
  `multipart/form-data` (por eso la ruta monta `multer().none()` — ni
  `express.json()` ni `express.urlencoded()` parsean multipart) con un
  campo `rawRequest` que es un string JSON **plano**, keyed por el `name`
  del campo (ej. `{"q3_dropdown1":"Grupo 1", ...}`). Se aplana a
  `answers[]` tomando cada clave como `questionId`.
- **Importación vía API de submissions** (`GET /form/:id/submissions` —
  no implementada como importador todavía, solo el shape está contemplado):
  `answers` viene anidado por `qid`, cada uno con `{name, text, type,
  answer}`. Se aplana igual, tomando `name` como `questionId` y `answer`
  como el valor.

En ambos casos el identificador estable usado como `Question.externalId`
es el `name` de Jotform (ej. `q3_dropdown1`) — es el único campo presente
en las tres fuentes (preguntas, submissions API y webhook real), a
diferencia de `qid` que no viaja en el webhook.

⚠️ **Pendiente de confirmar con un webhook real**: `liftIdentifiers()` (la
función que detecta pre/post, escuela, grupo, edad, género a partir de
claves como `"escuela"`/`"grupo"`) sigue sin tocar — pero esas claves
literales no existen en formularios reales (los nombres de campo son
autogenerados, ej. `q3_dropdown1`). Con datos reales, esa detección no
encuentra nada. Ver conversación / issue abierto: falta decidir cómo mapear
grupo/edad/escuela/género/pre-post a `Participant` ahora que los nombres de
campo no son semánticos.

## 6. Configuración de ponderaciones (manual, CSV y reproceso en bloque)

```mermaid
flowchart TD
    A[Admin abre Ponderaciones] --> B{Elige encuesta}
    B --> C[Tabla de preguntas + estado]
    C --> D1["Edición manual (categoría, subcategoría,<br/>puntaje máx., respuesta correcta)"]
    C --> D2["Editar tipo de pregunta<br/>(corrige lo inferido automáticamente)"]
    C --> D3[Descargar plantilla CSV]
    D3 --> E["Editar en Excel / Google Sheets"]
    E --> F[Importar CSV]
    D1 --> G["PUT /questions/:id/weight"]
    D2 --> G2["PATCH /questions/:id"]
    F --> H["POST /definitions/:id/weights/import"]
    H --> I{Validación por fila}
    I -->|OK| J[upsert Weight]
    I -->|Error| K["Fila reportada en el resumen<br/>(no bloquea el resto del archivo)"]
    G --> L["Reprocesar pendientes"]
    G2 --> L
    J --> L
    L --> M["POST /definitions/:id/reprocess-pending"]
    M --> N["processSubmission() por cada<br/>PENDIENTE_CONFIGURACION / ERROR de esa encuesta"]
    N --> O["PROCESADO / sigue pendiente / ERROR"]
```

## 7. Frontend — mapa de rutas y permisos

```mermaid
flowchart LR
    Login["/login"] --> Home["/home"]
    Home --> Surveys["/surveys — SurveysPage"]
    Home --> Scoring["/scoring — ScoringPage"]
    Home --> Reports["/reports"]

    Surveys -->|"filtrar, reprocesar,<br/>completar grupo pre/post"| APIsurveys[("API /api/surveys/*")]
    Scoring -->|"ponderar, importar/exportar CSV,<br/>asociar instrumento, reprocesar en bloque"| APIsurveys
    Reports -->|"resultados agregados % pre/post"| APIreports[("API /api/reports/*")]

    subgraph Permisos
        direction TB
        SA["system_admin: acceso total, cualquier organización"]
        OA["org_admin: acceso a su organización"]
        FU["functionality_user: featureKey 'surveys' y/o 'scoring'"]
        RV["report_viewer: solo reportes con plantilla asignada"]
    end

    SA -.-> Surveys
    SA -.-> Scoring
    OA -.-> Surveys
    OA -.-> Scoring
    FU -.->|"si tiene featureKey 'surveys'"| Surveys
    FU -.->|"si tiene featureKey 'scoring'"| Scoring
```

Dentro de `/scoring`, la sección **"Instrumentos sin configurar"** (alta de
formularios nuevos) solo se muestra si el usuario es `system_admin` u
`org_admin` — es una decisión de a qué sitio pertenece un instrumento nuevo,
no una tarea de ponderación cualquiera.

## 8. Interacción completa: usuario configurando pesos hasta ver el reporte

```mermaid
sequenceDiagram
    participant U as Usuario (admin/functionality_user)
    participant FE as Frontend (ScoringPage/SurveysPage)
    participant API as API
    participant DB as Postgres

    Note over U,DB: Jotform ya mandó respuestas; algunas quedaron PENDIENTE_CONFIGURACION
    U->>FE: entra a /scoring, elige la encuesta
    FE->>API: GET /definitions/:id/questions
    API->>DB: preguntas + Weight (o null)
    API-->>FE: tabla con estado de configuración
    U->>FE: completa puntaje/categoría por pregunta y Guarda
    FE->>API: PUT /questions/:id/weight
    API->>DB: upsert Weight
    U->>FE: click "Reprocesar pendientes"
    FE->>API: POST /definitions/:id/reprocess-pending
    API->>DB: reprocesa cada PENDIENTE_CONFIGURACION/ERROR de esa encuesta
    API-->>FE: { reprocessed, stillPending, errors }

    U->>FE: entra a /surveys — ve status PROCESADO, revisa duplicados/errores
    U->>FE: cuando pre y post de un grupo están PROCESADO → "Completar"
    FE->>API: POST /surveys/groups/complete { groupName }
    API->>DB: valida pre y post existen, marca COMPLETADO

    U->>FE: entra a /reports
    FE->>API: GET /reports/results (solo status=COMPLETADO)
    API->>DB: agrega % pre/post por categoría/subcategoría
    API-->>FE: filas del dashboard
```

## 9. Endpoints (resumen)

| Método | Ruta | Quién | Qué hace |
|---|---|---|---|
| `POST` | `/api/webhooks/jotform` | Público (secreto) | Ingesta y dispara `processSubmission` |
| `GET` | `/api/surveys` | `surveys` | Listado filtrable de respuestas |
| `GET` | `/api/surveys/pending` | `surveys` | Solo `PENDIENTE_CONFIGURACION` |
| `GET` | `/api/surveys/summary` / `POST /groups/complete` | `surveys` | Resumen y cierre por grupo pre/post |
| `POST` | `/api/surveys/:id/reprocess` | `surveys` | Reintenta una respuesta puntual |
| `GET` | `/api/surveys/unregistered` | `system_admin`/`org_admin` | Formularios de Jotform sin asociar (camino B, §5) |
| `GET` | `/api/surveys/jotform/forms` | `system_admin`/`org_admin` | Catálogo local de formularios (camino A, §5) |
| `POST` | `/api/surveys/jotform/forms/sync` | `system_admin`/`org_admin` | `GET /user/forms` en Jotform + diff |
| `GET` | `/api/surveys/jotform/forms/:formId/questions` | `system_admin`/`org_admin` | Preview de preguntas/catálogo en vivo |
| `GET` | `/api/catalog-fields` | Autenticado | Campos de catálogo (Grupo/Grado/...) — `catalogRouter` |
| `POST` | `/api/surveys/definitions` | `system_admin`/`org_admin` | Da de alta un instrumento nuevo (§5) |
| `GET` | `/api/surveys/definitions` / `/:id/questions` | `surveys`/`scoring` | Catálogo de encuestas y preguntas |
| `PUT` | `/api/surveys/questions/:id/weight` | `scoring` | Ponderación manual |
| `PATCH` | `/api/surveys/questions/:id` | `scoring` | Corrige texto/tipo de una pregunta |
| `POST` | `/api/surveys/definitions/:id/weights/import` | `scoring` | Import CSV de ponderaciones |
| `POST` | `/api/surveys/definitions/:id/reprocess-pending` | `scoring` | Reproceso en bloque |
| `POST` | `/api/surveys/questions/:id/analyze` | `scoring` | Resumen IA de una pregunta abierta |
| `GET` | `/api/reports/results` / `/filters` | Cualquier usuario autenticado (acotado) | Dashboard % pre/post |

## 10. Fuera de alcance de este documento

El módulo de **reportes interactivos / plantillas de documentos**
(`apps/web/src/features/reports/`, rutas `/reports` e
`/interactive-reports`) es un feature más amplio que consume estos
resultados agregados pero tiene su propia arquitectura de plantillas — no se
diagrama aquí porque no es parte de la Gestión de Evaluaciones en sí.

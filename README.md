# EPI Web

Monorepo para administrar usuarios, organizaciones, sitios, evaluaciones Jotform, ponderaciones, resultados y reportes de EPI.

## Tecnologias

| Capa | Tecnologias |
| --- | --- |
| Monorepo | npm workspaces, TypeScript |
| Frontend | React 18, Vite, React Router, Zustand, MUI, Tailwind CSS |
| Offline/PWA | Dexie/IndexedDB, `vite-plugin-pwa`, cola local de mutaciones para usuarios |
| Backend | Node.js, Express, Helmet, CORS, Morgan, Zod |
| Base de datos | PostgreSQL, Prisma ORM, migraciones Prisma |
| Auth | JWT Bearer, bcrypt, roles, feature flags, revocacion de sesiones |
| Reportes | Recharts, `@react-pdf/renderer` |
| Integraciones | Jotform webhooks/API, Gemini para analisis de preguntas abiertas |

## Estructura

```text
apps/
  api/       Express + Prisma + modulos de negocio
  web/       React + Vite
packages/
  shared/    schemas Zod, tipos API y registro de features
docs/        documentacion detallada por flujo
```

```mermaid
graph TD
    Web["apps/web<br/>React + Vite"] --> Shared["packages/shared<br/>schemas + types"]
    Api["apps/api<br/>Express + Prisma"] --> Shared
    Web -->|"fetch /api/* + Bearer JWT"| Api
    Api --> DB[("PostgreSQL")]
    Jotform((Jotform)) -->|"webhook + API"| Api
    Api --> Gemini((Gemini))
```

## Features

| Feature | Ruta web | Backend | Permisos principales |
| --- | --- | --- | --- |
| Login | `/login` | `POST /api/auth/login` | publico |
| Home | `/home` | dashboard local/compartido | admin o feature `home` |
| Usuarios | `/users` | `/api/users` | `system_admin`, `org_admin` |
| Organizaciones | `/organizations` | `/api/organizations` | `system_admin` |
| Sitios | `/sites` | `/api/sites` | `system_admin`, `org_admin` |
| Categorias | `/categories` | `/api/categories` | `system_admin`, `org_admin` |
| Encuestas recibidas | `/surveys` | `/api/surveys` | admin o feature `surveys` |
| Ponderaciones | `/scoring` | `/api/surveys/definitions`, `/questions`, `/weights/import` | admin o feature `scoring` |
| Preguntas abiertas | `/open-questions` | `/api/surveys/questions/:id/analyze` | admin o feature `open_questions` |
| Reportes agregados | `/reports` | `/api/reports/results`, `/api/reports/filters` | admin o plantilla `reports` |
| Reportes interactivos | `/interactive-reports` | `/api/reports/assigned`, `/api/reports/:id/data` | admin o plantilla `interactive_reports` |
| Asignacion de reportes | `/report-assignments` | `/api/reports/assignments` | `system_admin`, `org_admin` |
| Auditoria | `/audit-log` | `/api/audit-logs` | `system_admin` |
| Settings | `/settings` | plantillas/catalogos | `system_admin` |

## Roles y permisos

```mermaid
flowchart TD
    User["Usuario autenticado"] --> Role{"role"}
    Role --> SA["SYSTEM_ADMIN<br/>todo el sistema"]
    Role --> OA["ORG_ADMIN<br/>su organizacion"]
    Role --> FU["FUNCTIONALITY_USER<br/>solo featureKeys"]
    Role --> RV["REPORT_VIEWER<br/>solo reportTemplateKeys"]

    FU --> F1["home"]
    FU --> F2["surveys"]
    FU --> F3["scoring"]
    FU --> F4["open_questions"]

    RV --> T1["reports"]
    RV --> T2["interactive_reports"]
```

## Flujo de autenticacion

```mermaid
sequenceDiagram
    participant UI as Frontend
    participant API as Auth API
    participant DB as PostgreSQL

    UI->>API: POST /api/auth/login {username,password}
    API->>DB: busca usuario por username
    API->>API: bcrypt.compare(password)
    alt credenciales invalidas
        API->>DB: incrementa failedLoginAttempts
        API-->>UI: 401 INVALID_CREDENTIALS
    else demasiados intentos
        API->>DB: lockedUntil = ahora + 15 min
        API-->>UI: 423 ACCOUNT_LOCKED
    else usuario inactivo
        API-->>UI: 403 ACCOUNT_INACTIVE
    else ok
        API->>DB: lee featureKeys si aplica
        API->>API: firma JWT
        API->>DB: AuditLog LOGIN
        API-->>UI: accessToken + mustChangePassword
    end
```

```mermaid
sequenceDiagram
    participant UI as Frontend
    participant API as Ruta protegida
    participant DB as PostgreSQL

    UI->>API: Authorization: Bearer JWT
    API->>API: verifica firma y expiracion
    API->>DB: confirma isActive, mustChangePassword, sessionValidAfter
    alt token revocado o cuenta inactiva
        API-->>UI: 401
    else debe cambiar password
        API-->>UI: 403 PASSWORD_CHANGE_REQUIRED
    else permiso insuficiente
        API-->>UI: 403 FORBIDDEN
    else permitido
        API-->>UI: respuesta
    end
```

## Flujo de encuestas Jotform

```mermaid
flowchart TD
    JF((Jotform)) -->|"POST /api/webhooks/jotform"| Webhook["Webhook"]
    Webhook --> Secret{"JOTFORM_WEBHOOK_SECRET valido?"}
    Secret -->|"no"| Reject["rechaza request"]
    Secret -->|"si"| Raw["guarda rawJsonData<br/>Submission PENDIENTE_CONFIGURACION"]
    Raw --> Def{"existe SurveyDefinition<br/>para formID/version?"}
    Def -->|"no"| PendingForm["queda pendiente<br/>formulario no registrado"]
    Def -->|"si"| Questions["normaliza preguntas/respuestas"]
    Questions --> Weights{"preguntas ponderables<br/>tienen Weight?"}
    Weights -->|"no"| PendingWeight["pendiente de ponderacion"]
    Weights -->|"si"| Score["calcula Answer + AggregatedResult"]
    Score --> Dup{"mismo participante<br/>encuesta y momento?"}
    Dup -->|"si"| Duplicate["marca isDuplicate"]
    Dup -->|"no"| Processed["status PROCESADO"]
    Duplicate --> Processed
    Processed --> Complete["admin completa grupo<br/>status COMPLETADO"]
    Complete --> Reports["reportes agregados/interactivos"]
```

## Flujo de ponderaciones

```mermaid
sequenceDiagram
    participant Admin
    participant UI as ScoringPage
    participant API as Surveys API
    participant DB as PostgreSQL

    Admin->>UI: selecciona instrumento
    UI->>API: GET /api/surveys/definitions/:id/questions
    API-->>UI: preguntas + pesos actuales
    alt carga manual
        Admin->>UI: edita Weight por pregunta
        UI->>API: PUT /api/surveys/questions/:id/weight
    else CSV
        Admin->>UI: sube CSV
        UI->>API: POST /api/surveys/definitions/:id/weights/import
    end
    API->>DB: guarda Weight
    Admin->>UI: reprocesar pendientes
    UI->>API: POST /api/surveys/definitions/:id/reprocess-pending
    API->>DB: recalcula submissions pendientes
```

## Flujo de reportes

```mermaid
flowchart TD
    Completed["Submissions COMPLETADO<br/>con AggregatedResult"] --> Results["/api/reports/results"]
    Completed --> Filters["/api/reports/filters"]
    Results --> ReportsPage["/reports<br/>dashboard + PDF"]

    Admin["Admin"] --> Assign["/report-assignments<br/>crea AssignedReport"]
    Assign --> AR["AssignedReport<br/>status PENDING/IN_REVIEW/PUBLISHED"]
    AR --> Mine["/api/reports/assigned"]
    Mine --> Interactive["/interactive-reports"]
    Interactive --> Data["/api/reports/:id/data"]
    Data --> Resolver["report-data-resolvers.ts<br/>resolver por templateKey"]
    Resolver --> Completed
```

## Base de datos

### Accesos y catalogos

```mermaid
erDiagram
    ORGANIZATION ||--o{ USER : tiene
    ORGANIZATION ||--o{ SITE : tiene
    ORGANIZATION ||--o{ CATEGORY : define
    USER ||--o{ USER_FEATURE : tiene
    FEATURE ||--o{ USER_FEATURE : asigna
    USER ||--o{ USER_REPORT_TEMPLATE : tiene
    REPORT_TEMPLATE ||--o{ USER_REPORT_TEMPLATE : asigna
    USER ||--o{ ASSIGNED_REPORT : recibe
    ASSIGNED_REPORT ||--o{ ASSIGNED_REPORT_VERSION : versiona

    USER {
        string id
        string name
        string username
        string email
        string password
        enum role
        string organizationId
        stringArray siteIds
        stringArray excludedSiteIds
        stringArray excludedSurveyDefinitionIds
        boolean isActive
        boolean mustChangePassword
        int failedLoginAttempts
        datetime lockedUntil
        datetime sessionValidAfter
    }
    ORGANIZATION {
        string id
        string name
        boolean isActive
    }
    SITE {
        string id
        string name
        string organizationId
        boolean isActive
    }
    CATEGORY {
        string id
        string name
        string subcategory
        string organizationId
        boolean isActive
    }
    FEATURE {
        string key
        string name
    }
    REPORT_TEMPLATE {
        string key
        string name
    }
    ASSIGNED_REPORT {
        string id
        string userId
        string templateKey
        string title
        enum status
        json filters
        json textContent
        int version
    }
    AUDIT_LOG {
        string actorUsername
        string actorRole
        string action
        string targetType
        string targetId
        json metadata
    }
```

### Encuestas y resultados

```mermaid
erDiagram
    SITE ||--o{ SURVEY_DEFINITION : contiene
    SURVEY_DEFINITION ||--o{ QUESTION : contiene
    SURVEY_DEFINITION ||--o{ SUBMISSION : recibe
    QUESTION ||--o| WEIGHT : pondera
    QUESTION ||--o| QUESTION_INSIGHT : analiza
    PARTICIPANT ||--o{ SUBMISSION : responde
    SUBMISSION ||--o{ ANSWER : contiene
    QUESTION ||--o{ ANSWER : respondida
    SUBMISSION ||--o{ AGGREGATED_RESULT : produce

    SURVEY_DEFINITION {
        string id
        string siteId
        string jotformFormId
        enum type
        int version
    }
    QUESTION {
        string id
        string surveyDefinitionId
        string externalId
        string text
        enum type
        stringArray options
    }
    WEIGHT {
        string questionId
        string category
        string subcategory
        float maxScore
        string correctAnswer
    }
    SUBMISSION {
        string id
        string jotformSubmissionId
        string surveyDefinitionId
        string participantId
        json rawJsonData
        boolean isPre
        enum status
        boolean isDuplicate
        string processingError
    }
    PARTICIPANT {
        string externalId
        string name
        int age
        string gender
        string school
        string groupName
    }
    ANSWER {
        string submissionId
        string questionId
        string value
    }
    AGGREGATED_RESULT {
        string submissionId
        string category
        string subcategory
        float calculatedScore
        float maxPossible
        boolean isPrePost
    }
    QUESTION_INSIGHT {
        string questionId
        string summary
        json bestAnswers
        string model
    }
```

## Variables de entorno

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | conexion PostgreSQL |
| `PORT` | puerto API, default `3001` |
| `JWT_SECRET` | firma JWT, minimo 16 caracteres |
| `JWT_EXPIRES_IN` | expiracion JWT, default `7d` |
| `CORS_ORIGIN` | origen permitido para el frontend |
| `JOTFORM_WEBHOOK_SECRET` | secreto opcional para webhooks |
| `JOTFORM_API_KEY` | sincronizar formularios/preguntas Jotform |
| `JOTFORM_API_BASE` | default `https://api.jotform.com` |
| `GEMINI_API_KEY` | analisis IA de preguntas abiertas |
| `GEMINI_MODEL` | default `gemini-2.5-flash` |
| `CATALOG_DATA` | labels Jotform tratados como catalogo/filtro |

## Desarrollo

```bash
npm install
npm run db:migrate
npm run db:generate
npm run dev
```

Comandos utiles:

```bash
npm run dev:api
npm run dev:web
npm run build
npm run typecheck
npm run db:studio
npm run db:seed -w apps/api
```

El seed crea un usuario inicial:

```text
Username: admin
Password: Admin1234!
```

## Documentacion relacionada

- [`docs/arquitectura-front-backend.md`](docs/arquitectura-front-backend.md): arquitectura front/back detallada.
- [`docs/evaluaciones-flujo.md`](docs/evaluaciones-flujo.md): flujo completo de evaluaciones/Jotform.
- [`docs/administracion-accesos-flujo.md`](docs/administracion-accesos-flujo.md): usuarios, roles, organizaciones, sitios y seguridad.
- [`docs/modulo-gestion-de-evalaciones.md`](docs/modulo-gestion-de-evalaciones.md): modulo de gestion de evaluaciones.

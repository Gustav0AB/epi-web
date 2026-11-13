# EPI Login

Formulario React reutilizable. No almacena sesiones, tokens ni permisos. `onSubmit` recibe `{ username, password }`; el consumidor maneja los errores esperados y entrega `error` como texto público. Idioma predeterminado español, `locale="en"` para inglés. `brand` permite proporcionar logo y título.

Instala los peers React 18 y `@epi/ui`, luego `npm run build`. Usa `import { LoginForm } from "@epi/login"`. El proyecto consumidor debe escanear `src` con Tailwind y configurar los tokens indicados en epi-ui. En este repositorio, epi-ui y epi-login son espacios de trabajo al mismo nivel que apps. No incluye backend de identidad ni permisos de EPI.

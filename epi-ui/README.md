# EPI UI

Componentes React reutilizables extraídos de EPI. No incluyen autenticación ni lógica de dominio.

## Instalación y compilación

Instala las dependencias y ejecuta `npm run build`. El paquete exporta JavaScript y tipos desde `dist`; compílalo antes de compilar la aplicación que lo consume. React, Material UI, sus iconos y Emotion son dependencias compartidas (`peerDependencies`) que debe aportar la aplicación.

## Uso

```tsx
import { Button, TextField, UiProvider } from "@epi/ui";

<UiProvider lang="es">
  <TextField label="Nombre" />
  <Button>Guardar</Button>
</UiProvider>
```

Los textos predeterminados están en español. `UiProvider` acepta `lang="en"` o una función `t` para usar el sistema de traducciones de la aplicación. Los componentes usan clases Tailwind: configura el escaneo de `@epi/ui/src/**/*.{ts,tsx}` y define los colores semánticos `primary`, `primary-hover`, `primary-muted`, `secondary`, `secondary-hover`, `secondary-muted`, `danger`, `danger-hover`, `danger-muted`, `success`, `success-muted`, `warning` y `warning-muted`. La aplicación EPI ya aporta estas variables y configuración.

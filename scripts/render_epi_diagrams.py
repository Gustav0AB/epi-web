from pathlib import Path
from xml.sax.saxutils import escape


OUT = Path(__file__).resolve().parents[1] / "docs" / "diagramas"
OUT.mkdir(parents=True, exist_ok=True)

NAVY = "#17324D"
BLUE = "#EAF3FB"
TEAL = "#E8F5F2"
GOLD = "#FFF4D6"
RED = "#FCEAEA"
INK = "#253746"
MUTED = "#5D6B78"
LINE = "#667D91"


def svg_start(width, height, title):
    return [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="white"/>',
        '<style>text{font-family:Arial,Helvetica,sans-serif}.title{font-size:27px;font-weight:700;fill:#17324D}.label{font-size:17px;font-weight:600;fill:#253746}.small{font-size:14px;fill:#5D6B78}</style>',
        f'<text class="title" x="32" y="42">{escape(title)}</text>',
    ]


def box(parts, x, y, w, h, label, fill=BLUE, radius=12, font=17):
    parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" stroke="{NAVY}" stroke-width="2"/>')
    lines = label.split("\n")
    line_h = font + 5
    first_y = y + h / 2 - (len(lines) - 1) * line_h / 2 + font * 0.35
    for i, line in enumerate(lines):
        parts.append(f'<text x="{x+w/2}" y="{first_y+i*line_h}" text-anchor="middle" style="font-size:{font}px;font-weight:600;fill:{INK}">{escape(line)}</text>')


def arrow(parts, x1, y1, x2, y2, label=None, dashed=False, bend=None):
    dash = ' stroke-dasharray="7 6"' if dashed else ""
    if bend is None:
        d = f"M{x1},{y1} L{x2},{y2}"
    else:
        d = f"M{x1},{y1} L{bend[0]},{bend[1]} L{x2},{y2}"
    parts.append(f'<path d="{d}" fill="none" stroke="{LINE}" stroke-width="2.5" marker-end="url(#arrow)"{dash}/>')
    if label:
        lx = bend[0] if bend else (x1 + x2) / 2
        ly = bend[1] - 8 if bend else (y1 + y2) / 2 - 7
        parts.append(f'<text class="small" x="{lx}" y="{ly}" text-anchor="middle">{escape(label)}</text>')


def render(name, parts, width, height):
    parts.insert(3, '<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#667D91"/></marker></defs>')
    parts.append("</svg>")
    svg = "\n".join(parts)
    (OUT / f"{name}.svg").write_text(svg, encoding="utf-8")


# 1. Intake, configuration, processing and reporting flow.
w, h = 1460, 700
p = svg_start(w, h, "Flujo general de información")
box(p, 35, 105, 190, 78, "Participantes\nresponden", TEAL)
box(p, 285, 105, 190, 78, "Jotform envía\nla respuesta", BLUE)
box(p, 535, 105, 190, 78, "EPI Web conserva\nel dato recibido", BLUE)
box(p, 790, 96, 230, 96, "¿Instrumento y reglas\nconfigurados?", GOLD, radius=22)
box(p, 1135, 60, 280, 78, "Pendiente de\nconfiguración", GOLD)
box(p, 810, 310, 190, 78, "Validación\ny cálculo", BLUE)
box(p, 1080, 260, 300, 78, "Error revisable\ny reprocesable", RED)
box(p, 1080, 390, 300, 78, "Resultado procesado", TEAL)
box(p, 775, 525, 260, 78, "Revisión y cierre\ndel grupo", BLUE)
box(p, 390, 525, 300, 78, "Dashboards y reportes\nautorizados", TEAL)
arrow(p, 225, 144, 285, 144); arrow(p, 475, 144, 535, 144); arrow(p, 725, 144, 790, 144)
arrow(p, 1020, 117, 1135, 99, "No")
arrow(p, 905, 192, 905, 310, "Sí")
arrow(p, 1000, 349, 1080, 299, "No")
arrow(p, 1000, 350, 1080, 429, "Sí")
arrow(p, 1080, 429, 1035, 564, bend=(1050, 480))
arrow(p, 775, 564, 690, 564)
render("01-flujo-general", p, w, h)

# 2. Pre/Post comparison, with CQS explicitly marked as unconfirmed.
w, h = 1160, 510
p = svg_start(w, h, "Comparación de instrumentos Pre y Post")
box(p, 55, 190, 220, 82, "Participante\no grupo", TEAL)
box(p, 390, 95, 250, 82, "Pre: evaluación\nantes", BLUE)
box(p, 390, 280, 250, 82, "Post: evaluación\ndespués", BLUE)
box(p, 760, 190, 300, 82, "Comparación de\nrespuestas / resultados", GOLD)
box(p, 760, 365, 300, 82, "Cambio agregado\nen reportes", TEAL)
box(p, 55, 385, 220, 70, "CQS: propósito y relación\npor confirmar", RED, font=15)
arrow(p, 275, 220, 390, 136, bend=(325, 136))
arrow(p, 275, 240, 390, 321, bend=(325, 321))
arrow(p, 640, 136, 760, 215, bend=(700, 136))
arrow(p, 640, 321, 760, 247, bend=(700, 321))
arrow(p, 910, 272, 910, 365)
arrow(p, 275, 420, 760, 410, dashed=True, bend=(520, 420))
render("02-comparacion-pre-post", p, w, h)

# 3. Proposed entities and relationships, grouped by domain.
w, h = 1540, 720
p = svg_start(w, h, "Estructura propuesta de información")
box(p, 55, 105, 220, 70, "ORGANIZACIÓN", BLUE)
box(p, 355, 105, 200, 70, "SITIO", BLUE)
box(p, 635, 105, 220, 70, "INSTRUMENTO", BLUE)
box(p, 935, 105, 200, 70, "PREGUNTA", BLUE)
box(p, 1220, 105, 250, 70, "PONDERACIÓN", GOLD)
arrow(p, 275, 140, 355, 140, "contiene")
arrow(p, 555, 140, 635, 140, "utiliza")
arrow(p, 855, 140, 935, 140, "contiene")
arrow(p, 1135, 140, 1220, 140, "configura")

box(p, 465, 315, 250, 75, "RESPUESTA ENVIADA", TEAL)
box(p, 70, 315, 230, 75, "PARTICIPANTE", TEAL)
box(p, 870, 315, 210, 75, "RESPUESTA", TEAL)
box(p, 1200, 315, 220, 75, "RESULTADO", TEAL)
arrow(p, 740, 175, 590, 315, "recibe", bend=(665, 235))
arrow(p, 300, 352, 465, 352, "contesta")
arrow(p, 715, 352, 870, 352, "contiene")
arrow(p, 715, 370, 1200, 370, "genera", bend=(960, 425))

box(p, 300, 555, 220, 70, "USUARIO", BLUE)
box(p, 665, 555, 280, 70, "ROL Y PERMISOS", GOLD)
box(p, 1090, 555, 300, 70, "ALCANCE DE DATOS", GOLD)
arrow(p, 520, 590, 665, 590, "tiene")
arrow(p, 520, 605, 1090, 605, "consulta", bend=(805, 665))
p.append(f'<text class="small" x="55" y="680">Relaciones resumidas de la propuesta; los catálogos y atributos se confirman durante la revisión funcional.</text>')
render("03-estructura-de-informacion", p, w, h)

print("\n".join(str(path) for path in sorted(OUT.glob("*"))))

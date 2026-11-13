import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, Label } from "@epi/ui";
import { surveyApi } from "../features/surveys/api";
import { useAuthStore } from "../store/auth.store";

type Summary = Awaited<ReturnType<typeof surveyApi.homeSummary>>;
export function HomePage() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState(false);
  const user = useAuthStore(state => state.currentUser);
  const canViewCourses = user?.role === "system_admin" || user?.role === "org_admin" || user?.featureKeys.includes("surveys");
  useEffect(() => { let active = true; void surveyApi.homeSummary().then(value => { if (active) setData(value); }).catch(() => { if (active) setError(true); }); return () => { active = false; }; }, []);
  const cards = [{ label: "Cursos revisados", value: data?.reviewed }, { label: "Pendientes de revisión", value: data?.pending }, { label: "Respuestas recibidas", value: data?.responses }, { label: "Reportes publicados", value: data?.reports }];
  return <div className="space-y-6"><Label variant="title">Inicio</Label>
    {error && <p role="alert">No se pudo cargar la información de inicio. Actualiza la página para reintentar.</p>}
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(card => <Card key={card.label}><p className="text-sm text-gray-600">{card.label}</p><p className="mt-2 text-3xl font-semibold">{card.value ?? "—"}</p></Card>)}</div>
    <Card><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Actividad reciente</h2>{canViewCourses && <Link className="text-primary underline" to="/courses">Ir a Cursos</Link>}</div>
      {!data && !error && <p role="status">Cargando actividad…</p>}
      {data && !data.recent.length && <p>No hay respuestas recientes.</p>}
      {!!data?.recent.length && <div className="overflow-x-auto"><table className="w-full min-w-[36rem] text-left text-sm"><thead><tr className="border-b"><th className="py-2">Respuesta recibida</th><th>Instrumento</th><th>Sitio</th><th>Programa</th></tr></thead><tbody>{data.recent.map(row => <tr key={row.id} className="border-b"><td className="py-2">{new Date(row.receivedAt).toLocaleString("es")}</td><td>{row.instrument}</td><td>{row.site}</td><td>{row.program}</td></tr>)}</tbody></table></div>}
    </Card>
  </div>;
}

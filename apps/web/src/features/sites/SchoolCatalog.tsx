import { useEffect, useState } from "react";
import type { SchoolCatalogDto } from "@epi/shared";
import { apiClient } from "../../lib/api-client";
import { Button, Card, Dropdown, Label, Table } from "../../shared/components";

export function SchoolCatalog() {
  const [data, setData] = useState<SchoolCatalogDto>({ schools: [], unresolvedCount: 0 });
  const [siteId, setSiteId] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(null);
    void apiClient.get<SchoolCatalogDto>("/api/surveys/schools").then(result => {
      if (active) { setData(result); setSiteId(current => result.schools.some(row => row.siteId === current) ? current : ""); }
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "No se pudieron consultar las escuelas."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);
  const sites = [...new Map(data.schools.map(row => [row.siteId, row.siteName])).entries()];
  return <Card>
    <Label variant="subtitle">Escuelas detectadas en respuestas</Label>
    <p className="mb-3 text-sm text-gray-500">Se alimentan del campo Escuela/Grupo y de las revisiones confirmadas. No requieren alta manual. Los conteos son respuestas recibidas, no personas únicas ni resultados publicados.</p>
    <div className="mb-3 flex flex-wrap items-end gap-3">
      <Dropdown label="Sitio" value={siteId} onChange={setSiteId} options={[{ value: "", label: "Todos los sitios autorizados" }, ...sites.map(([value, label]) => ({ value, label }))]} />
      <Button variant="secondary" disabled={loading} onClick={() => setRevision(value => value + 1)}>Actualizar escuelas</Button>
    </div>
    {error ? <p role="alert" className="text-danger">{error}</p> : <>
      <Table key={siteId} loading={loading} rows={data.schools.filter(row => !siteId || row.siteId === siteId)} keyExtractor={row => JSON.stringify([row.siteId, row.name])} pageSize={10} emptyText="Todavía no hay escuelas identificadas en las respuestas autorizadas." columns={[
        { key: "siteName", header: "Sitio" }, { key: "name", header: "Escuela" }, { key: "responseCount", header: "Respuestas" }, { key: "confirmedCount", header: "Con escuela confirmada" },
      ]} />
      {!loading && data.unresolvedCount > 0 && <p role="status" className="mt-3 text-sm">{data.unresolvedCount} respuestas sin escuela identificable en el conjunto de sitios autorizados. Revisa su contexto en Encuestas; no se asignaron por suposición.</p>}
    </>}
  </Card>;
}

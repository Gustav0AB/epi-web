import { TabNavigation } from "../../shared/components/TabNavigation";
export function ReportTabs() {
  return <TabNavigation label="Reportes" items={[{ to: "/reports", label: "Publicación" }, { to: "/reports/internal", label: "Reportes internos" }]} />;
}

import type { ReportDocumentTemplate } from "./types.js";

export const courseImpactsGeneralTemplate: ReportDocumentTemplate = {
    key: "course-impacts-general",
    title: "Reporte general de curso",
    subtitle: "EPI Course Impacts",
    category: "course-impacts",
    filters: [
      { key: "siteId", label: "Sitio", kind: "select", optionsSourceKey: "sites" },
      { key: "school", label: "Escuela", kind: "text", required: true },
      { key: "groupName", label: "Grupo", kind: "text" },
      { key: "from", label: "Desde", kind: "date" },
      { key: "to", label: "Hasta", kind: "date" },
    ],
    defaults: {
      textContent: {},
    },
    blocks: [
      { id: "hero-photo", type: "image", title: "Course Impacts", dataKey: "heroPhotoUrl", height: 280, required: false },
      {
        id: "intro",
        type: "text",
        content: "Course impacts overview",
      },
      {
        id: "summary-kpis",
        type: "kpi-group",
        items: [
          { key: "overallSatisfaction", label: "Overall Satisfaction", format: "percent" },
          { key: "overallImprovement", label: "Overall Improvement", format: "percent" },
        ],
      },
      { id: "student-quote", type: "text", title: "Student quote", dataKey: "studentQuote" },
      { id: "recommendation", type: "text", title: "Recommendation", dataKey: "recommendationText" },
      {
        id: "course-activity-satisfaction",
        type: "chart",
        title: "Course Activity Satisfaction",
        chartType: "bar",
        dataKey: "courseActivitySatisfaction",
        xKey: "name",
        series: [{ key: "post", label: "% Above average / Excellent", color: "#4298b5" }],
        height: 260,
      },
      { id: "conservation-impacts", type: "text", title: "Conservation impacts", dataKey: "conservationImpacts", required: false },
      {
        id: "environmental-literacy",
        type: "chart",
        title: "Environmental Literacy - Pre/Post",
        chartType: "bar",
        dataKey: "categoryComparison",
        xKey: "name",
        series: [
          { key: "pre", label: "Pre-Course", color: "#f58a00" },
          { key: "post", label: "Post-Course", color: "#4298b5" },
        ],
        height: 320,
      },
      {
        id: "course-impact-table",
        type: "table",
        title: "EPI Course Impacts",
        dataKey: "categoryBreakdown",
        columns: [
          { key: "name", label: "Area", align: "left", format: "text" },
          { key: "pre", label: "Pre", align: "right", format: "percent" },
          { key: "post", label: "Post", align: "right", format: "percent" },
          { key: "change", label: "Change", align: "right", format: "percent" },
        ],
      },
      { id: "field-photo", type: "image", title: "Course photo", dataKey: "coursePhotoUrl", captionKey: "coursePhotoCaption", height: 320, required: false },
      {
        id: "most-improved",
        type: "table",
        title: "Most Improved Area of Knowledge",
        dataKey: "mostImproved",
        columns: [
          { key: "name", label: "Area", align: "left", format: "text" },
          { key: "change", label: "Improvement", align: "right", format: "percent" },
        ],
      },
      {
        id: "spotlight-chart",
        type: "chart",
        title: "Impact Spotlight",
        chartType: "bar",
        dataKey: "spotlightRows",
        xKey: "name",
        series: [
          { key: "pre", label: "Pre-Course", color: "#f58a00" },
          { key: "post", label: "Post-Course", color: "#4298b5" },
        ],
        height: 300,
      },
      { id: "spotlight-text", type: "text", title: "Impact Spotlight text", dataKey: "spotlightText" },
    ],
  };

// Las claves antiguas siguen resolviendo reportes ya asignados.
export const courseImpactsNcssmTemplate = { ...courseImpactsGeneralTemplate, key: "course-impacts-2026mx-ncssm" };
export const courseImpactsBurtonTemplate = { ...courseImpactsGeneralTemplate, key: "course-impacts-2026cr-burton" };
export const courseImpactsTempletonTemplate = { ...courseImpactsGeneralTemplate, key: "course-impacts-2026mx-templeton" };

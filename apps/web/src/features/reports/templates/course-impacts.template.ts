import type { ReportTemplate } from "./types";

type CourseImpactConfig = {
  key: string;
  title: string;
  program: string;
  school: string;
  dateLabel: string;
  country: "Mexico" | "Costa Rica";
};

function courseImpactTemplate(config: CourseImpactConfig): ReportTemplate {
  return {
    key: config.key,
    title: config.title,
    subtitle: `${config.school} - ${config.dateLabel}`,
    category: "course-impacts",
    filters: [
      { key: "siteId", label: "Sitio", kind: "select", optionsSourceKey: "sites" },
      { key: "school", label: "Escuela", kind: "text", required: true },
      { key: "groupName", label: "Grupo", kind: "text" },
      { key: "from", label: "Desde", kind: "date" },
      { key: "to", label: "Hasta", kind: "date" },
    ],
    blocks: [
      { id: "hero-photo", type: "image", title: `${config.program} - Course Impacts`, dataKey: "heroPhotoUrl", height: 280 },
      {
        id: "intro",
        type: "text",
        content: `${config.school} - ${config.dateLabel}\n${config.country} ${config.program}`,
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
      { id: "conservation-impacts", type: "text", title: "Conservation impacts", dataKey: "conservationImpacts" },
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
      { id: "field-photo", type: "image", title: "Course photo", dataKey: "coursePhotoUrl", captionKey: "coursePhotoCaption", height: 220 },
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
}

export const courseImpactsNcssmTemplate = courseImpactTemplate({
  key: "course-impacts-2026mx-ncssm",
  title: "Baja Marine Science - Course Impacts",
  program: "Baja Marine Science",
  school: "NCSSM",
  dateLabel: "January 2026",
  country: "Mexico",
});

export const courseImpactsBurtonTemplate = courseImpactTemplate({
  key: "course-impacts-2026cr-burton",
  title: "Costa Rica Ecology - Course Impacts",
  program: "Costa Rica Ecology",
  school: "Burr and Burton Academy",
  dateLabel: "April 2026",
  country: "Costa Rica",
});

export const courseImpactsTempletonTemplate = courseImpactTemplate({
  key: "course-impacts-2026mx-templeton",
  title: "Baja Marine Science - Course Impacts",
  program: "Baja Marine Science",
  school: "Templeton Academy",
  dateLabel: "April 2026",
  country: "Mexico",
});

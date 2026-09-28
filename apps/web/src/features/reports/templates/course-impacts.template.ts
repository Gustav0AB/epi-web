import type { ReportTemplate } from "./types";

type CourseImpactConfig = {
  key: string;
  title: string;
  program: string;
  school: string;
  dateLabel: string;
  country: "Mexico" | "Costa Rica";
  defaults: Record<string, string>;
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
    defaults: {
      filters: { school: config.school },
      textContent: config.defaults,
    },
    blocks: [
      { id: "hero-photo", type: "image", title: `${config.program} - Course Impacts`, dataKey: "heroPhotoUrl", height: 280, required: false },
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
      { id: "field-photo", type: "image", title: "Course photo", dataKey: "coursePhotoUrl", captionKey: "coursePhotoCaption", height: 220, required: false },
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
  defaults: {
    studentQuote: `"This experience gave me a deep appretiation for La Paz, the Spanish language, the natural world around me, and the community I share these with."`,
    recommendationText: "94% of participants indicated that they would recommend our Baja course to other students.",
    spotlightText: "Impact Spotlight: Scientific Method\n\nStudents investigate a research question in small groups on course with guidance from EPI instructors. During this project they engage in each step of the scientific process and each student builds confidence in their ability to conduct research and communicate results.\n\nThe students on this trip improved most in their self-reported ability to Construct Explanations and Analyze and Interpret.",
  },
});

export const courseImpactsBurtonTemplate = courseImpactTemplate({
  key: "course-impacts-2026cr-burton",
  title: "Costa Rica Ecology - Course Impacts",
  program: "Costa Rica Ecology",
  school: "Burr and Burton Academy",
  dateLabel: "April 2026",
  country: "Costa Rica",
  defaults: {
    studentQuote: "I feel like this experience changed me in the best way possible. I have never been so sad to leave a place and leave people that I have so strongly connected with in just the span of nine days. I will try my hardest to come back next year. This was an experience that cannot be traded for anything.",
    recommendationText: "100% of participants indicated that they would recommend our Costa Rica course to other students.",
    conservationImpacts: "8 nests monitored\n9 turtles worked\n3 nights of work on the field",
    spotlightText: "Impact Spotlight: Scientific Process\n\nStudents investigate a research question in small groups on course with guidance from EPI instructors. During this project they engage in each step of the scientific process and each student builds confidence in their ability to conduct research and communicate results.\n\nThe students on this trip improved most in their self-reported ability to design a methodology and collect data and Analyze and interpret it.",
  },
});

export const courseImpactsTempletonTemplate = courseImpactTemplate({
  key: "course-impacts-2026mx-templeton",
  title: "Baja Marine Science - Course Impacts",
  program: "Baja Marine Science",
  school: "Templeton Academy",
  dateLabel: "April 2026",
  country: "Mexico",
  defaults: {
    studentQuote: `"Something I learned throughout this trip... I'm realizing how interested I am in marine biology, and while I can't see it being a career, I can see it becoming a passion in my future." -Liam`,
    recommendationText: "94% of participants indicated that they would recommend our Baja course to other students.",
    conservationImpacts: "2 groups of humpback whales observed.\n1 group (~18) of common dolphins observed.\n3.7 kg of waste collected (mainly plastics and cigarette butts).\n17 fish species identified.",
    spotlightText: "Impact Spotlight: Scientific Method\n\nStudents investigate a research question in small groups on course with guidance from EPI instructors. During this project they engage in each step of the scientific process and each student builds confidence in their ability to conduct research and communicate results.\n\nThe students on this trip improved most in their self-reported ability to Construct Explanations, collect data and Analyze and Interpret it.",
  },
});

import type { SiteDto, SurveyDefinitionDto } from "@epi/shared";

export function currentYearRange(now = new Date()) {
  const year = now.getFullYear();
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export function surveyFilterOptions(definitions: SurveyDefinitionDto[], sites: SiteDto[], siteId: string, definitionId: string) {
  const selected = definitions.find((definition) => definition.id === definitionId);
  return {
    definitions: definitions.filter((definition) => definition.isWeighted && (!siteId || definition.siteId === siteId)),
    sites: sites.filter((site) => !selected || selected.siteId === site.id),
  };
}

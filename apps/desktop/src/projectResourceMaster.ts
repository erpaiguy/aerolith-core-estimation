import { roundRate } from "@aerolith/shared";
import type { LoadedProject, ProjectResource } from "./model";
import {
  cloneResourceMaster,
  convertMasterRates,
  masterToProjectResource,
  type ResourceMasterRow,
} from "./resourceMaster";

export function projectWithMaster(project: LoadedProject, rows: ResourceMasterRow[]): LoadedProject {
  const master = rows.map((row) => ({ ...row }));
  const byCode = new Map(master.map((row) => [row.code.trim().toUpperCase(), row]));
  const resources: ProjectResource[] = project.resources.map((resource) => {
    const hit = byCode.get(resource.project_code.trim().toUpperCase());
    if (!hit || resource.rate_source === "quote") return resource;
    return {
      ...resource,
      description: hit.name || resource.description,
      category: hit.category || resource.category,
      sub_type: hit.subCategory || resource.sub_type,
      unit: hit.unit || resource.unit,
      project_rate: hit.rate,
      global_code: resource.global_code ?? hit.code,
      rate_source: resource.rate_source ?? "global",
    };
  });
  const have = new Set(resources.map((resource) => resource.project_code.trim().toUpperCase()));
  for (const row of master) {
    if (!have.has(row.code.trim().toUpperCase())) resources.push(masterToProjectResource(row));
  }
  return { ...project, resourceMaster: master, resources };
}

export function copyGlobalMaster(project: LoadedProject, globalRows: ResourceMasterRow[]): LoadedProject {
  return projectWithMaster(project, cloneResourceMaster(globalRows));
}

export function convertProjectCurrency(project: LoadedProject, currency: string, factor: number): LoadedProject {
  const master = convertMasterRates(project.resourceMaster ?? [], factor);
  const scale = Number.isFinite(factor) && factor !== 1;
  const resources = project.resources.map((resource) => {
    if (!scale || resource.rate_source === "quote" || resource.project_rate == null) return resource;
    return { ...resource, project_rate: roundRate(resource.project_rate * factor) };
  });
  const rateByCode = new Map(resources.map((resource) => [resource.project_code, resource.project_rate]));
  const items = project.items.map((item) => ({
    ...item,
    directCost: scale && item.directCost != null ? roundRate(item.directCost * factor) : item.directCost,
    lines: item.lines.map((line) => {
      if (!scale) return line;
      const fromResource = line.projectResourceCode ? rateByCode.get(line.projectResourceCode) : undefined;
      const resourceRate = fromResource != null ? fromResource : roundRate(line.resourceRate * factor);
      return { ...line, resourceRate };
    }),
  }));
  return { ...project, currency, resourceMaster: master, resources, items };
}

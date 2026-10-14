import { createContext, useContext, type ReactNode } from "react";
import type { LoadedProject } from "../model";
import { mergeReportFormat, type ReportFormat } from "../reportFormat";

const PrintContext = createContext<{ project: LoadedProject; format: ReportFormat } | null>(null);

export function PrintProvider({
  project,
  format,
  children,
}: {
  project: LoadedProject;
  format?: Partial<ReportFormat> | null;
  children: ReactNode;
}) {
  return <PrintContext.Provider value={{ project, format: mergeReportFormat(format) }}>{children}</PrintContext.Provider>;
}

export function usePrintHeader(): { project: LoadedProject; format: ReportFormat } {
  const ctx = useContext(PrintContext);
  if (!ctx) throw new Error("Print is only available inside a job.");
  return ctx;
}

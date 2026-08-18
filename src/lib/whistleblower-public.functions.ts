import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

export type SubmitReportInput = {
  reportType: "ANONYMOUS" | "IDENTIFIED";
  categorySlug: string;
  title: string;
  description: string;
  unit?: string;
  city?: string;
  department?: string;
  locationDescription?: string;
  incidentDate?: string;
  incidentTime?: string;
  peopleInvolved?: string;
  witnesses?: string;
  frequency?: string;
  identifiedName?: string;
  identifiedEmail?: string;
  identifiedPhone?: string;
  identifiedDepartment?: string;
  files?: { name: string; mime: string; dataBase64: string }[];
};

export const submitWhistleblowerReport = createServerFn({ method: "POST" })
  .inputValidator((input: SubmitReportInput) => input)
  .handler(async ({ data }) => {
    const mod = await import("@/lib/whistleblower-service.server");
    return mod.submitReport(data, {
      host: getRequestHeader("host"),
      ip: getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for") ?? "",
    });
  });

export const trackWhistleblowerReport = createServerFn({ method: "POST" })
  .inputValidator((input: { protocol: string; accessKey: string }) => input)
  .handler(async ({ data }) => {
    const mod = await import("@/lib/whistleblower-service.server");
    return mod.trackReport(data, {
      ip: getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for") ?? "",
    });
  });

export const postReporterMessage = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      protocol: string;
      accessKey: string;
      message?: string;
      files?: { name: string; mime: string; dataBase64: string }[];
    }) => input,
  )
  .handler(async ({ data }) => {
    const mod = await import("@/lib/whistleblower-service.server");
    return mod.reporterUpdate(data);
  });

export const getReporterAttachmentUrl = createServerFn({ method: "POST" })
  .inputValidator((input: { protocol: string; accessKey: string; attachmentId: string }) => input)
  .handler(async ({ data }) => {
    const mod = await import("@/lib/whistleblower-service.server");
    return mod.reporterAttachmentUrl(data);
  });

export const validateWhistleblowerDocument = createServerFn({ method: "GET" })
  .inputValidator((input: { code: string }) => input)
  .handler(async ({ data }) => {
    const mod = await import("@/lib/whistleblower-service.server");
    return mod.validateDocument(data.code);
  });

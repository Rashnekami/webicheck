import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getWhistleblowerAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const mod = await import("@/lib/whistleblower-admin.server");
    return mod.accessInfo(context);
  });

export const listWhistleblowerReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Record<string, string | undefined>) => input)
  .handler(async ({ context, data }) => {
    const mod = await import("@/lib/whistleblower-admin.server");
    return mod.listReports(context, data ?? {});
  });

export const getWhistleblowerReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    const mod = await import("@/lib/whistleblower-admin.server");
    return mod.getReport(context, data.id);
  });

export const updateWhistleblowerReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id: string;
      status?: string;
      priority?: string;
      assignedTo?: string | null;
      conclusion?: string | null;
      publicNote?: string;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const mod = await import("@/lib/whistleblower-admin.server");
    return mod.updateReport(context, data);
  });

export const addWhistleblowerInternalNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; note: string }) => input)
  .handler(async ({ context, data }) => {
    const mod = await import("@/lib/whistleblower-admin.server");
    return mod.addInternalNote(context, data);
  });

export const postWhistleblowerRhMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; message: string }) => input)
  .handler(async ({ context, data }) => {
    const mod = await import("@/lib/whistleblower-admin.server");
    return mod.postRhMessage(context, data);
  });

export const getWhistleblowerAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { attachmentId: string }) => input)
  .handler(async ({ context, data }) => {
    const mod = await import("@/lib/whistleblower-admin.server");
    return mod.attachmentUrl(context, data);
  });

export const listWhistleblowerMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const mod = await import("@/lib/whistleblower-admin.server");
    return mod.listChannelMembers(context);
  });

export const setWhistleblowerMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; grant: boolean }) => input)
  .handler(async ({ context, data }) => {
    const mod = await import("@/lib/whistleblower-admin.server");
    return mod.setChannelMember(context, data);
  });

export const logWhistleblowerExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; kind: string }) => input)
  .handler(async ({ context, data }) => {
    const mod = await import("@/lib/whistleblower-admin.server");
    return mod.logExport(context, data);
  });

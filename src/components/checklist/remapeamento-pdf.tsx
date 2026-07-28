import type { ChecklistRow } from "@/lib/checklist-schema";

/**
 * Stub inicial da geração de PDF para Remapeamento de CTO/NAP.
 * Será substituído pelo layout dark completo em iteração posterior.
 */
export async function generateRemapeamentoPdf(_args: {
  row: ChecklistRow;
  tecnicoNome: string;
  assinatura?: string | null;
  publicUrl?: string | null;
}): Promise<void> {
  throw new Error("PDF de Remapeamento ainda não implementado — próxima etapa.");
}

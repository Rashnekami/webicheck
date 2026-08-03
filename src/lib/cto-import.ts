// Import/export de planilhas de CTOs (exportadas de ferramenta de projeto
// de rede) para cruzar com o status de remapeamento no CheckTecnico.
// Formato esperado (colunas): Nome, Latitude, Longitude, ..., Projeto (cidade).

export interface CtoRow {
  nome: string;
  lat: number | null;
  lng: number | null;
  cidade: string;
}

export async function parseCtoWorkbook(file: File, cidadeFallback: string): Promise<CtoRow[]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const buf = await file.arrayBuffer();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const header = (ws.getRow(1).values as unknown[]).map((v) =>
    String(v ?? "")
      .trim()
      .toLowerCase(),
  );
  const idxNome = header.findIndex((h) => h === "nome");
  const idxLat = header.findIndex((h) => h === "latitude");
  const idxLng = header.findIndex((h) => h === "longitude");
  const idxProjeto = header.findIndex((h) => h === "projeto");
  const idxTipo = header.findIndex((h) => h === "tipo");

  const rows: CtoRow[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values as unknown[];
    const nome = idxNome >= 0 ? String(values[idxNome] ?? "").trim() : "";
    if (!nome) return;
    // A planilha traz outros tipos de caixa (emenda/CEO) junto com as CTOs
    // de fato — só contamos como CTO as linhas cujo "Tipo" contém "CTO".
    if (idxTipo >= 0) {
      const tipo = String(values[idxTipo] ?? "").toUpperCase();
      if (!tipo.includes("CTO")) return;
    }
    const latRaw = idxLat >= 0 ? values[idxLat] : null;
    const lngRaw = idxLng >= 0 ? values[idxLng] : null;
    const projeto = idxProjeto >= 0 ? String(values[idxProjeto] ?? "").trim() : "";
    rows.push({
      nome,
      lat: latRaw != null && latRaw !== "" ? Number(latRaw) : null,
      lng: lngRaw != null && lngRaw !== "" ? Number(lngRaw) : null,
      cidade: projeto || cidadeFallback,
    });
  });
  return rows;
}

export interface CtoExportRow extends CtoRow {
  remapeado: boolean;
  checklistCode: string | null;
  finalizadoEm: string | null;
  novaLat: number | null;
  novaLng: number | null;
}

// Exporta .xlsx (não .csv puro — CSV não guarda cor de célula, formato
// texto plano). Verde = CTO remapeada; célula da nova localização em
// vermelho, pra destacar visualmente onde ela foi registrada agora.
export async function exportCtoReportXlsx(rows: CtoExportRow[], filename: string) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("CTOs");

  ws.columns = [
    { header: "Cidade", key: "cidade", width: 20 },
    { header: "Nome CTO", key: "nome", width: 28 },
    { header: "Latitude original", key: "lat", width: 18 },
    { header: "Longitude original", key: "lng", width: 18 },
    { header: "Remapeada?", key: "remapeado", width: 14 },
    { header: "Checklist", key: "checklistCode", width: 20 },
    { header: "Finalizado em", key: "finalizadoEm", width: 20 },
    { header: "Nova latitude", key: "novaLat", width: 18 },
    { header: "Nova longitude", key: "novaLng", width: 18 },
  ];
  ws.getRow(1).font = { bold: true };

  const GREEN = "FFC6EFCE";
  const RED = "FFFFC7CE";

  for (const r of rows) {
    const row = ws.addRow({
      cidade: r.cidade,
      nome: r.nome,
      lat: r.lat,
      lng: r.lng,
      remapeado: r.remapeado ? "Sim" : "Não",
      checklistCode: r.checklistCode ?? "",
      finalizadoEm: r.finalizadoEm ? new Date(r.finalizadoEm).toLocaleString("pt-BR") : "",
      novaLat: r.novaLat ?? "",
      novaLng: r.novaLng ?? "",
    });

    if (r.remapeado) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
      });
      const novaLatCell = row.getCell("novaLat");
      const novaLngCell = row.getCell("novaLng");
      novaLatCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED } };
      novaLngCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED } };
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

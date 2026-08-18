// Preparo de anexos no cliente: reencoda imagens (removendo EXIF/GPS) e
// converte para base64 antes de enviar ao servidor.
import { WB_ALLOWED_MIME, WB_MAX_FILE_BYTES, WB_MAX_FILES } from "@/lib/whistleblower";

export type PreparedFile = { name: string; mime: string; dataBase64: string; size: number };

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    reader.readAsDataURL(blob);
  });
}

async function stripImageMetadata(file: File): Promise<{ blob: Blob; mime: string }> {
  const bitmap = await createImageBitmap(file);
  const max = 1800;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
  if (!blob) throw new Error("Não foi possível processar a imagem.");
  return { blob, mime: "image/jpeg" };
}

export async function prepareFiles(list: FileList | File[]): Promise<PreparedFile[]> {
  const files = Array.from(list).slice(0, WB_MAX_FILES);
  const out: PreparedFile[] = [];
  for (const file of files) {
    const isImage = file.type.startsWith("image/");
    if (!isImage && !WB_ALLOWED_MIME.includes(file.type)) {
      throw new Error(`Formato não permitido: ${file.name}`);
    }
    let blob: Blob = file;
    let mime = file.type;
    let name = file.name;
    if (isImage) {
      const processed = await stripImageMetadata(file);
      blob = processed.blob;
      mime = processed.mime;
      name = name.replace(/\.[^.]+$/, "") + ".jpg";
    }
    if (blob.size > WB_MAX_FILE_BYTES) {
      throw new Error(`Arquivo muito grande (máx. 6 MB): ${file.name}`);
    }
    out.push({ name, mime, dataBase64: await toBase64(blob), size: blob.size });
  }
  return out;
}

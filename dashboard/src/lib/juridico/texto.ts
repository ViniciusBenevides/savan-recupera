// Texto de documento anexado à ficha, para o Jurídico achar sinais (cheque, protesto, entrega…),
// valores e datas. Só lê camada de texto: não faz OCR, e PDF escaneado volta vazio. O texto fica no
// servidor; para a IA vai só o tipo do documento.
import { inflateRawSync } from "node:zlib";
import { normalizarTexto } from "@/lib/juridico/fontes";

// Lê um arquivo de dentro de um .zip (o .docx é um zip) pelo diretório central.
function lerDoZip(buf: Buffer, alvo: string): Buffer | null {
  // Fim do diretório central: assinatura 0x06054b50, nos últimos 64 KiB + 22 bytes.
  const limite = Math.max(0, buf.length - 65557);
  let fim = -1;
  for (let i = buf.length - 22; i >= limite; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { fim = i; break; }
  }
  if (fim < 0) return null;
  const total = buf.readUInt16LE(fim + 10);
  let p = buf.readUInt32LE(fim + 16);
  for (let n = 0; n < total && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) return null;
    const metodo = buf.readUInt16LE(p + 10);
    const tamanho = buf.readUInt32LE(p + 20);
    const lenNome = buf.readUInt16LE(p + 28);
    const lenExtra = buf.readUInt16LE(p + 30);
    const lenComent = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nome = buf.toString("utf8", p + 46, p + 46 + lenNome);
    if (nome === alvo) {
      if (buf.readUInt32LE(local) !== 0x04034b50) return null;
      const inicio = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const dados = buf.subarray(inicio, inicio + tamanho);
      if (metodo === 0) return Buffer.from(dados);
      if (metodo === 8) return inflateRawSync(dados);
      return null;
    }
    p += 46 + lenNome + lenExtra + lenComent;
  }
  return null;
}

function textoDoDocx(buf: Buffer): string {
  const xml = lerDoZip(buf, "word/document.xml");
  if (!xml) return "";
  const comQuebras = xml.toString("utf8")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:(tab|br)\b[^>]*\/>/g, " ")
    .replace(/<[^>]+>/g, "");
  // normalizarTexto também desfaz &amp; e afins; cada parágrafo vira uma linha.
  return comQuebras.split("\n").map((l) => normalizarTexto(l)).filter(Boolean).join("\n");
}

async function textoDoPdf(buf: Buffer): Promise<string> {
  const { getDocumentProxy, extractText } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  try {
    const { text } = await extractText(pdf, { mergePages: true });
    return text ?? "";
  } finally {
    // O tipo exportado pelo unpdf não declara destroy(), mas o objeto do pdf.js tem: libera a memória.
    await (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.();
  }
}

export async function extrairTextoDocumento(buf: Buffer, nomeArquivo: string, mime?: string | null, maxChars = 28000): Promise<string> {
  try {
    const ext = (/\.([a-z0-9]+)$/i.exec(nomeArquivo || "")?.[1] ?? "").toLowerCase();
    const tipo = (mime || "").toLowerCase();
    let texto = "";
    if (ext === "pdf" || tipo === "application/pdf") texto = await textoDoPdf(buf);
    else if (ext === "docx" || tipo.includes("wordprocessingml")) texto = textoDoDocx(buf);
    else if (ext === "html" || ext === "htm" || tipo === "text/html") texto = normalizarTexto(buf.toString("utf8"));
    else if (ext === "txt" || ext === "csv" || ext === "md" || tipo.startsWith("text/")) texto = buf.toString("utf8");
    return texto.replace(/\u0000/g, "").slice(0, maxChars);
  } catch {
    // Documento ilegível não derruba a análise: ela segue com tipo, nome e observação.
    return "";
  }
}

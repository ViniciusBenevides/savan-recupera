"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Paperclip } from "lucide-react";
import { Button, Input, Label, Select, Textarea, estiloBotao } from "@/components/ui/primitives";
import { TIPOS_DOCUMENTO, type Documento } from "@/lib/juridico/tipos";
import { cn } from "@/lib/utils";
import { dataCurta } from "@/lib/datas";

const tamanho = (b: number | null) => (b == null ? "" : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`);

/**
 * Documentos da dívida (contrato, nota, comprovante de entrega, protesto…). São a prova que o
 * Jurídico lê: o tipo, o nome, a observação e o texto do arquivo quando ele tem texto.
 */
export function DocumentosFicha({ devedorId, documentos, podeOperar, podeExcluir }: {
  devedorId: number; documentos: Documento[]; podeOperar: boolean; podeExcluir: boolean;
}) {
  const router = useRouter();
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [tipo, setTipo] = useState(TIPOS_DOCUMENTO[0]);
  const [nome, setNome] = useState("");
  const [obs, setObs] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [gravando, setGravando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; msg: string } | null>(null);
  const [tirando, setTirando] = useState<number | null>(null);

  async function anexar() {
    setGravando(true); setAviso(null);
    const fd = new FormData();
    fd.append("tipo", tipo); fd.append("nome", nome); fd.append("observacao", obs);
    if (arquivo) fd.append("arquivo", arquivo);
    const r = await fetch(`/api/devedores/${devedorId}/documentos`, { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    setGravando(false);
    if (!r.ok) { setAviso({ tipo: "erro", msg: j?.erro ?? "Não foi possível anexar." }); return; }
    setAviso({ tipo: "ok", msg: arquivo && !j?.texto_extraido ? "Documento anexado. O arquivo não tem texto legível (foto ou PDF escaneado): o Jurídico usa só o tipo, o nome e a observação." : "Documento anexado." });
    setNome(""); setObs(""); setArquivo(null);
    if (arquivoRef.current) arquivoRef.current.value = "";
    router.refresh();
  }

  async function tirar(id: number) {
    const r = await fetch(`/api/documentos/${id}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setAviso({ tipo: "erro", msg: j?.erro ?? "Não foi possível tirar o documento." }); return; }
    setTirando(null);
    setAviso({ tipo: "ok", msg: "Documento tirado da ficha." });
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section aria-labelledby="t-docs">
        <h2 id="t-docs" className="font-display text-titulo font-600 text-ouro">Documentos da dívida</h2>
        {aviso && <p role="status" className={cn("mt-3 rounded-controle px-3 py-2 text-sm2", aviso.tipo === "ok" ? "bg-pago-fundo text-pago" : "bg-margem-fundo text-margem")}>{aviso.msg}</p>}
        {documentos.length === 0 ? (
          <p className="mt-2 max-w-[60ch] text-[0.9375rem] text-lapis">Nenhum documento ainda. Contrato, nota promissória, comprovante de entrega e protesto aumentam a confiança da análise jurídica.</p>
        ) : (
          <ul className="mt-2 divide-y divide-pauta border-y border-pauta bg-folha">
            {documentos.map((x) => (
              <li key={x.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                  <span className="flex min-w-0 items-start gap-2.5">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-lapis" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block font-600 [overflow-wrap:anywhere]">{x.nome}</span>
                      <span className="block text-sm2 text-lapis">
                        {x.tipo} · {x.arquivo_path ? `${tamanho(x.arquivo_tamanho)} · ${x.texto_lido ? "texto lido" : "sem texto legível"}` : "registro sem arquivo"} · {dataCurta(x.criado_em)}{x.criado_por_nome ? ` · ${x.criado_por_nome}` : ""}
                      </span>
                      {x.observacao && <span className="mt-0.5 block text-[0.9375rem]">{x.observacao}</span>}
                    </span>
                  </span>
                  <span className="flex gap-2">
                    {x.arquivo_path && <a href={`/api/documentos/${x.id}`} target="_blank" rel="noopener" className={estiloBotao("outline", "sm")}>Abrir</a>}
                    {podeExcluir && (tirando === x.id ? (
                      <>
                        <Button size="sm" variant="danger" onClick={() => tirar(x.id)}>Tirar da ficha</Button>
                        <Button size="sm" variant="ghost" onClick={() => setTirando(null)}>Manter</Button>
                      </>
                    ) : (
                      <Button size="sm" variant="ghost" className="hover:text-margem" onClick={() => setTirando(x.id)}>Tirar</Button>
                    ))}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {podeOperar && (
        <aside aria-labelledby="t-anexar" className="h-fit rounded-painel border border-pauta bg-folha p-4">
          <h2 id="t-anexar" className="font-display text-titulo font-600 text-ouro">Anexar documento</h2>
          <div className="mt-3 space-y-3">
            <div>
              <Label htmlFor="doc-tipo">Tipo</Label>
              <Select id="doc-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {TIPOS_DOCUMENTO.map((t) => <option key={t}>{t}</option>)}
              </Select>
            </div>
            <div>
              <span className="mb-1.5 block text-sm2 font-600 text-texto">Arquivo <span className="font-500 text-lapis">(opcional)</span></span>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-controle border border-dashed border-pauta-forte bg-papel px-3 py-2 text-[0.9375rem] transition-colors duration-150 hover:border-tinta/60 focus-within:border-tinta">
                <Paperclip className="h-4 w-4 shrink-0 text-tinta" aria-hidden="true" />
                <span className={cn("min-w-0 flex-1 truncate", arquivo ? "text-texto" : "text-lapis")}>{arquivo ? arquivo.name : "PDF, Word, foto ou texto, até 15 MB"}</span>
                <input ref={arquivoRef} type="file" className="sr-only" accept=".pdf,.doc,.docx,.txt,.csv,.md,.html,.htm,.jpg,.jpeg,.png,.webp" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
              </label>
            </div>
            <div>
              <Label htmlFor="doc-nome">Nome {arquivo && <span className="font-500 text-lapis">(vazio = nome do arquivo)</span>}</Label>
              <Input id="doc-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} placeholder="Ex.: Contrato de crediário 2011" />
            </div>
            <div>
              <Label htmlFor="doc-obs">Observação <span className="font-500 text-lapis">(opcional)</span></Label>
              <Textarea id="doc-obs" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: assinado pelo titular e duas testemunhas" />
            </div>
            <Button className="w-full" onClick={anexar} disabled={gravando || (!arquivo && !nome.trim())}>{gravando ? "Anexando…" : "Anexar"}</Button>
            <p className="text-meta text-lapis">O Jurídico lê o texto de PDF com texto, Word, TXT e HTML. Foto e PDF escaneado entram só com tipo, nome e observação.</p>
          </div>
        </aside>
      )}
    </div>
  );
}

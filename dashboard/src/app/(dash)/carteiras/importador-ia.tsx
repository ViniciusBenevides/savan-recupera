"use client";
import * as React from "react";
import Link from "next/link";
import { Button, Label, HelpHint } from "@/components/ui/primitives";
import { brl } from "@/lib/utils";
import {
  FileSpreadsheet, Sparkles, Loader2, Upload, AlertTriangle, KeyRound, ArrowLeft,
} from "lucide-react";

type Coluna = { idx: number; titulo: string };
type Receita = {
  linha_cabecalho: number;
  linha_dados_inicio: number;
  campos: Record<string, { colunas: number[]; transform: string }>;
  observacoes?: string;
};

const ROTULO_CAMPO: Record<string, string> = {
  cpf: "CPF/CNPJ", nome: "Nome", saldo: "Saldo (R$)", telefone: "Telefone", telefone2: "Telefone 2", telefone3: "Telefone 3", telefone4: "Telefone 4", telefone5: "Telefone 5", telefone6: "Telefone 6",
  vencimento: "Vencimento", cidade: "Cidade", uf: "UF", referencia: "Referência", email: "E-mail",
};
const CAMPOS = ["cpf", "nome", "saldo", "telefone", "telefone2", "telefone3", "telefone4", "telefone5", "telefone6", "vencimento", "cidade", "uf", "referencia", "email"] as const;
const OBRIGATORIOS = new Set(["cpf", "nome", "saldo", "telefone"]);
const TRANSFORMS: { v: string; t: string }[] = [
  { v: "nenhum", t: "direto" },
  { v: "centavos", t: "valor em centavos" },
  { v: "extrair_documento", t: "extrair CPF/CNPJ do texto" },
  { v: "extrair_telefones", t: "extrair telefones do texto" },
  { v: "juntar", t: "juntar colunas" },
  { v: "so_digitos", t: "só números" },
];

// Segmento "Modelo padrão" | "Outra formatação (IA)" — compartilhado entre as telas de upload.
export function ModoSeletor({ modo, setModo }: { modo: "modelo" | "ia"; setModo: (m: "modelo" | "ia") => void }) {
  const opcoes: { k: "modelo" | "ia"; t: string; icon: React.ReactNode }[] = [
    { k: "modelo", t: "Minha planilha segue o modelo", icon: <FileSpreadsheet className="h-3.5 w-3.5" /> },
    { k: "ia", t: "Outra formatação — a IA organiza", icon: <Sparkles className="h-3.5 w-3.5" /> },
  ];
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-ink-900 p-1">
      {opcoes.map((o) => (
        <button key={o.k} onClick={() => setModo(o.k)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors ${modo === o.k ? "bg-ink-850 text-chalk" : "text-mist hover:text-chalk"}`}>
          {o.icon} {o.t}
        </button>
      ))}
    </div>
  );
}

type Fase = "escolher" | "analisando" | "revisar" | "importando";

export function ImportadorIA({ carteiraId, onImportado }: { carteiraId: number; onImportado: (rel: any) => void }) {
  const [arquivo, setArquivo] = React.useState<File | null>(null);
  const [fase, setFase] = React.useState<Fase>("escolher");
  const [receita, setReceita] = React.useState<Receita | null>(null);
  const [colunas, setColunas] = React.useState<Coluna[]>([]);
  const [faltando, setFaltando] = React.useState<string[]>([]);
  const [preview, setPreview] = React.useState<any[]>([]);
  const [observacoes, setObservacoes] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [semChave, setSemChave] = React.useState(false);

  function aplicarResposta(d: any) {
    setReceita(d.receita); setColunas(d.colunas ?? []); setFaltando(d.faltando ?? []);
    setPreview(d.preview ?? []); setObservacoes(d.observacoes ?? null);
  }

  async function analisar() {
    if (!arquivo) return;
    setFase("analisando"); setErro(null); setSemChave(false);
    const fd = new FormData(); fd.append("arquivo", arquivo);
    const r = await fetch(`/api/carteiras/${carteiraId}/mapear`, { method: "POST", body: fd });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (d.erro === "openai_key_ausente") setSemChave(true);
      else setErro(d.erro ?? "Não foi possível analisar a planilha.");
      setFase("escolher"); return;
    }
    aplicarResposta(d); setFase("revisar");
  }

  async function reprevisualizar(nova: Receita) {
    if (!arquivo) return;
    setReceita(nova); // otimista
    const fd = new FormData(); fd.append("arquivo", arquivo); fd.append("receita", JSON.stringify(nova));
    const r = await fetch(`/api/carteiras/${carteiraId}/mapear`, { method: "POST", body: fd });
    const d = await r.json().catch(() => ({}));
    if (r.ok) aplicarResposta(d);
  }

  function setColuna(campo: string, idxStr: string) {
    if (!receita) return;
    const campos = { ...receita.campos };
    if (idxStr === "") delete campos[campo];
    else campos[campo] = { colunas: [Number(idxStr)], transform: campos[campo]?.transform ?? "nenhum" };
    reprevisualizar({ ...receita, campos });
  }
  function setTransform(campo: string, transform: string) {
    if (!receita || !receita.campos[campo]) return;
    const campos = { ...receita.campos, [campo]: { ...receita.campos[campo], transform } };
    reprevisualizar({ ...receita, campos });
  }

  async function importar() {
    if (!arquivo || !receita) return;
    setFase("importando"); setErro(null);
    const fd = new FormData(); fd.append("arquivo", arquivo); fd.append("receita", JSON.stringify(receita));
    const r = await fetch(`/api/carteiras/${carteiraId}/importar`, { method: "POST", body: fd });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErro(d.erro ?? "Falha ao importar."); setFase("revisar"); return; }
    onImportado(d.relatorio);
  }

  function recomecar() {
    setFase("escolher"); setReceita(null); setColunas([]); setFaltando([]); setPreview([]); setObservacoes(null); setErro(null);
  }

  return (
    <div className="space-y-3">
      {semChave && (
        <div className="flex items-start gap-2 rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Para a organização automática, preencha a <b>OPENAI_API_KEY</b> em{" "}
            <Link href="/configuracoes" className="underline">Configurações → Chaves</Link>. Sem ela, use o modelo padrão.</span>
        </div>
      )}
      {erro && <p className="flex items-center gap-1.5 text-xs text-rose"><AlertTriangle className="h-3.5 w-3.5" /> {erro}</p>}

      {(fase === "escolher" || fase === "analisando") && (
        <div className="space-y-3">
          <p className="text-xs text-mist">
            Suba a planilha do jeito que vier (colunas com outros nomes, fora de ordem, valor em centavos…).
            A IA descobre qual coluna é cada campo e mostra uma prévia para você conferir antes de importar.
          </p>
          <div className="flex items-center gap-2">
            <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line bg-ink-900 px-3 py-2 hover:border-emerald/50">
              <FileSpreadsheet className="h-4 w-4 text-emerald" />
              <span className="flex-1 truncate text-sm text-chalk">{arquivo ? arquivo.name : "Escolher planilha (.xlsx)"}</span>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
            </label>
            <Button onClick={analisar} disabled={fase === "analisando" || !arquivo}>
              {fase === "analisando" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {fase === "analisando" ? "Analisando…" : "Analisar com IA"}
            </Button>
          </div>
        </div>
      )}

      {(fase === "revisar" || fase === "importando") && receita && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="mb-0 flex items-center gap-1.5">
              Confira o de-para <HelpHint text="A IA propôs de qual coluna vem cada campo. Ajuste se algo ficou errado; a prévia atualiza." />
            </Label>
            <button onClick={recomecar} className="inline-flex items-center gap-1 text-xs text-mist hover:text-chalk">
              <ArrowLeft className="h-3.5 w-3.5" /> Trocar arquivo
            </button>
          </div>
          {observacoes && <p className="rounded-lg border border-line bg-ink-850 px-3 py-2 text-xs text-mist">{observacoes}</p>}

          <div className="space-y-1.5">
            {CAMPOS.map((campo) => {
              const regra = receita.campos[campo];
              const obrig = OBRIGATORIOS.has(campo);
              const faltou = obrig && !regra;
              return (
                <div key={campo} className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${faltou ? "border-rose/40 bg-rose/5" : "border-line bg-ink-850"}`}>
                  <span className="w-28 shrink-0 text-chalk">{ROTULO_CAMPO[campo]}{obrig && <span className="text-rose"> *</span>}</span>
                  <select value={regra?.colunas?.[0] ?? ""} onChange={(e) => setColuna(campo, e.target.value)}
                    className="h-9 flex-1 min-w-[140px] rounded-lg border border-line bg-ink-900 px-2 text-sm text-chalk outline-none">
                    <option value="">— não usar —</option>
                    {colunas.map((c) => <option key={c.idx} value={c.idx}>{c.titulo}</option>)}
                  </select>
                  {regra && (
                    <select value={regra.transform} onChange={(e) => setTransform(campo, e.target.value)}
                      className="h-9 rounded-lg border border-line bg-ink-900 px-2 text-xs text-mist outline-none">
                      {TRANSFORMS.map((t) => <option key={t.v} value={t.v}>{t.t}</option>)}
                    </select>
                  )}
                  {faltou && <span className="text-xs text-rose">obrigatório</span>}
                </div>
              );
            })}
          </div>

          <div>
            <Label className="flex items-center gap-1.5">Prévia (3 primeiras linhas, já normalizadas) <HelpHint text="Como os dados ficarão após a limpeza (CPF, telefone +55, valor)." /></Label>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-line text-left text-mist">
                  <th className="px-3 py-2 font-medium">CPF/CNPJ</th><th className="px-3 py-2 font-medium">Nome</th>
                  <th className="px-3 py-2 font-medium">Saldo</th><th className="px-3 py-2 font-medium">Telefones</th>
                  <th className="px-3 py-2 font-medium">Vencimento</th>
                </tr></thead>
                <tbody>
                  {preview.map((p, i) => (
                    <tr key={i} className="border-b border-line/50">
                      <td className="px-3 py-2 font-mono text-chalk">{p.cpf_cnpj}</td>
                      <td className="px-3 py-2 text-chalk">{p.nome}</td>
                      <td className="px-3 py-2 font-mono text-chalk">{brl(p.saldo)}</td>
                      <td className="px-3 py-2 font-mono text-mist">{(p.telefones ?? []).join(", ") || "—"}</td>
                      <td className="px-3 py-2 text-mist">{p.vencimento ?? "—"}</td>
                    </tr>
                  ))}
                  {preview.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-mist">Sem linhas para prévia.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {faltando.length > 0 && (
            <p className="flex items-center gap-1.5 rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Falta mapear: {faltando.map((c) => ROTULO_CAMPO[c]).join(", ")}. Escolha a coluna para importar.
            </p>
          )}

          <Button onClick={importar} disabled={fase === "importando" || faltando.length > 0}>
            {fase === "importando" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {fase === "importando" ? "Importando…" : "Importar assim"}
          </Button>
        </div>
      )}
    </div>
  );
}

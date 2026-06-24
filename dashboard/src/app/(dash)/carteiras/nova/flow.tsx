"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card, Button, Input, Label, Textarea, HelpHint, Tooltip, Badge,
} from "@/components/ui/primitives";
import { brl, num } from "@/lib/utils";
import { Download, Upload, CheckCircle2, AlertTriangle, Loader2, FileSpreadsheet, ArrowRight } from "lucide-react";
import { ImportadorIA, ModoSeletor } from "../importador-ia";

type Etapa = "dados" | "upload" | "resultado";

export function NovaCarteiraFlow() {
  const router = useRouter();
  const [etapa, setEtapa] = React.useState<Etapa>("dados");
  const [modo, setModo] = React.useState<"modelo" | "ia">("modelo");
  const [carteira, setCarteira] = React.useState<{ id: number; nome: string } | null>(null);
  const [nome, setNome] = React.useState("");
  const [credor, setCredor] = React.useState("");
  const [descricao, setDescricao] = React.useState("");
  const [arquivo, setArquivo] = React.useState<File | null>(null);
  const [carregando, setCarregando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [relatorio, setRelatorio] = React.useState<any>(null);

  function importadoPelaIA(rel: any) {
    setRelatorio(rel); setEtapa("resultado"); router.refresh();
  }

  async function criarCarteira() {
    setErro(null);
    if (!nome.trim()) { setErro("Dê um nome à carteira."); return; }
    setCarregando(true);
    const r = await fetch("/api/carteiras", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, credor, descricao }),
    });
    const d = await r.json();
    setCarregando(false);
    if (!r.ok) { setErro(d.erro ?? "Não foi possível criar a carteira."); return; }
    setCarteira(d.carteira);
    setEtapa("upload");
  }

  async function enviarPlanilha() {
    if (!arquivo || !carteira) { setErro("Escolha um arquivo .xlsx."); return; }
    setErro(null);
    setCarregando(true);
    const fd = new FormData();
    fd.append("arquivo", arquivo);
    const r = await fetch(`/api/carteiras/${carteira.id}/importar`, { method: "POST", body: fd });
    const d = await r.json();
    setCarregando(false);
    if (!r.ok) { setErro(d.erro ?? "Falha ao importar a planilha."); return; }
    setRelatorio(d.relatorio);
    setEtapa("resultado");
    router.refresh();
  }

  return (
    <div className="max-w-2xl">
      <Passos etapa={etapa} />

      {erro && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose/30 bg-rose/10 px-4 py-3 text-sm text-rose">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{erro}</span>
        </div>
      )}

      {etapa === "dados" && (
        <Card className="space-y-4">
          <div>
            <Label className="flex items-center gap-1.5">
              Nome da carteira <HelpHint text="Como você quer chamar esta lista. Ex.: 'Inadimplentes Maio 2026'. Não pode repetir o nome de outra carteira." />
            </Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Inadimplentes Maio 2026" />
          </div>
          <div>
            <Label className="flex items-center gap-1.5">
              Credor (opcional) <HelpHint text="Nome da empresa/credor que o robô menciona ao devedor. Se vazio, usa o texto padrão das configurações." />
            </Label>
            <Input value={credor} onChange={(e) => setCredor(e.target.value)} placeholder="Ex.: Loja do João" />
          </div>
          <div>
            <Label className="flex items-center gap-1.5">
              Observações (opcional) <HelpHint text="Anotação interna sua sobre esta carteira. O devedor nunca vê isto." />
            </Label>
            <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Anotações internas…" />
          </div>
          <div className="flex justify-end">
            <Tooltip text="Cria a carteira e leva você para o envio da planilha.">
              <Button onClick={criarCarteira} disabled={carregando}>
                {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Criar e continuar
              </Button>
            </Tooltip>
          </div>
        </Card>
      )}

      {etapa === "upload" && carteira && (
        <Card className="space-y-5">
          <ModoSeletor modo={modo} setModo={setModo} />

          {modo === "modelo" ? (
            <>
              <div className="rounded-xl border border-line bg-ink-850 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-chalk">1. Baixe o modelo e preencha</p>
                    <p className="mt-1 text-xs text-mist">Use exatamente as colunas do modelo. Obrigatórias: CPF/CNPJ, Nome, Saldo e Telefone.</p>
                  </div>
                  <Tooltip text="Baixa uma planilha .xlsx em branco, com as colunas certas e uma aba de instruções.">
                    <a href="/api/carteiras/modelo">
                      <Button variant="outline"><Download className="h-4 w-4" /> Baixar modelo</Button>
                    </a>
                  </Tooltip>
                </div>
              </div>

              <div className="rounded-xl border border-line bg-ink-850 p-4">
                <p className="text-sm font-medium text-chalk">2. Envie a planilha preenchida</p>
                <p className="mt-1 text-xs text-mist">Aceita .xlsx. O sistema valida os telefones e ignora linhas inválidas, mostrando um relatório.</p>
                <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line bg-ink-900 px-4 py-3 hover:border-emerald/50">
                  <FileSpreadsheet className="h-5 w-5 text-emerald" />
                  <span className="flex-1 truncate text-sm text-chalk">{arquivo ? arquivo.name : "Clique para escolher o arquivo .xlsx"}</span>
                  <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
                </label>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-mist">Carteira: <b className="text-chalk">{carteira.nome}</b></span>
                <Tooltip text="Lê a planilha, importa os devedores e mostra o relatório. Pode levar alguns segundos.">
                  <Button onClick={enviarPlanilha} disabled={carregando || !arquivo}>
                    {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    Enviar planilha
                  </Button>
                </Tooltip>
              </div>
            </>
          ) : (
            <ImportadorIA carteiraId={carteira.id} onImportado={importadoPelaIA} />
          )}
        </Card>
      )}

      {etapa === "resultado" && relatorio && carteira && (
        <Card className="space-y-4">
          <div className="flex items-center gap-2 text-emerald">
            <CheckCircle2 className="h-5 w-5" />
            <p className="font-display text-lg text-chalk">Planilha importada!</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Devedores importados" valor={num(relatorio.importados)} />
            <Stat label="Com celular válido" valor={num(relatorio.com_celular)} />
            <Stat label="Sem celular" valor={num(relatorio.sem_celular)} />
            <Stat label="Telefones válidos" valor={num(relatorio.telefones)} />
            <Stat label="Telefones inválidos" valor={num(relatorio.telefones_invalidos)} />
            <Stat label="Total da carteira" valor={brl(relatorio.soma_saldo)} />
          </div>
          {(relatorio.cpf_duplicado > 0 || relatorio.sem_cpf > 0) && (
            <p className="text-xs text-mist">
              {relatorio.cpf_duplicado > 0 && <>CPFs repetidos juntados: <b className="text-chalk">{num(relatorio.cpf_duplicado)}</b>. </>}
              {relatorio.sem_cpf > 0 && <>Linhas sem CPF: <b className="text-chalk">{num(relatorio.sem_cpf)}</b>.</>}
            </p>
          )}
          {Array.isArray(relatorio.erros) && relatorio.erros.length > 0 && (
            <div className="rounded-xl border border-amber/30 bg-amber/10 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-amber"><AlertTriangle className="h-3.5 w-3.5" /> Linhas ignoradas ({relatorio.erros.length})</p>
              <ul className="max-h-32 space-y-0.5 overflow-y-auto text-[11px] text-mist">
                {relatorio.erros.map((e: any, i: number) => <li key={i}>Linha {e.linha}: {e.motivo}</li>)}
              </ul>
            </div>
          )}
          <div className="flex items-center gap-2 border-t border-line pt-4">
            <Badge tone="neutral">A carteira ficou <b className="mx-1">Pausada</b>. Ative na tela da carteira para começar os envios.</Badge>
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" onClick={() => { setArquivo(null); setRelatorio(null); setEtapa("upload"); }}>Subir outra</Button>
              <Link href={`/carteiras/${carteira.id}`}>
                <Button>Ir para a carteira <ArrowRight className="h-4 w-4" /></Button>
              </Link>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function Passos({ etapa }: { etapa: Etapa }) {
  const itens: { k: Etapa; t: string }[] = [
    { k: "dados", t: "1. Dados da carteira" },
    { k: "upload", t: "2. Enviar planilha" },
    { k: "resultado", t: "3. Pronto" },
  ];
  const ordem = { dados: 0, upload: 1, resultado: 2 };
  return (
    <div className="mb-5 flex items-center gap-2 text-xs">
      {itens.map((it, i) => (
        <React.Fragment key={it.k}>
          <span className={ordem[etapa] >= i ? "font-medium text-emerald" : "text-mist"}>{it.t}</span>
          {i < itens.length - 1 && <span className="text-mist">→</span>}
        </React.Fragment>
      ))}
    </div>
  );
}

function Stat({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-xl border border-line bg-ink-850 px-3 py-2.5">
      <div className="text-[11px] text-mist">{label}</div>
      <div className="font-mono text-lg text-chalk tabnums">{valor}</div>
    </div>
  );
}

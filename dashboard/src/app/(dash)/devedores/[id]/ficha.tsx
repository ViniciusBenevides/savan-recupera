"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, MessageSquareText, QrCode, Phone, Mail, MapPin, Handshake, NotebookPen } from "lucide-react";
import { Button, Input, Label, Select, Textarea, estiloBotao } from "@/components/ui/primitives";
import { Carne } from "@/components/ficha/carne";
import { FazerAcordo } from "@/components/ficha/fazer-acordo";
import { formatarCPF, mascararCPF } from "@/components/ficha/ficha-resumida";
import { RESULTADOS, RESULTADOS_RAPIDOS, CANAIS, ROTULO_SITUACAO, corSituacao, proximoPasso, type Resultado } from "@/lib/resultados";
import { descontoReal } from "@/lib/acordo";
import { brl, cn, porcento } from "@/lib/utils";
import { dataCurta, dataLonga, diaISO, ha, hora, margem, prazo, diasEntre, deDiaISO } from "@/lib/datas";

type Parcela = { id: number; numero: number; vencimento: string; valor: number; status: string; pago_em: string | null; valor_pago: number | null; forma_pagamento: string | null };
export type DadosFicha = {
  devedor: { id: number; nome: string; cpf: string; processo: string | null; saldo: number; vencimento: string | null; cidade: string | null; uf: string | null; emails: string[]; tags: string | null; fase: string | null; motivo: string | null; situacao: string; responsavel_id: string | null; ultimo_contato_em: string | null };
  carteira: { id: number; nome: string; credor: string | null; cobrador_id: string | null; desconto_max_pct: number; parcelas_max: number; entrada_min_pct: number; parcela_min_valor: number; tipo_carteira: string } | null;
  proposta: { valor: number; desconto_pct: number; ano: number | null } | null;
  telefones: { id: number; telefone_e164: string; tipo: string | null; whatsapp_valido: boolean | null; ordem: number }[];
  conversa: { id: number; estado: string; ultima_msg_em: string | null; ultima_msg_de: string | null; atendente_nome: string | null } | null;
  mensagens: { id: number; direcao: string; origem: string; conteudo: string | null; criado_em: string; autor_nome: string | null; privado: boolean | null; status_entrega: number | null }[];
  ocorrencias: { id: number; canal: string; resultado: string; descricao: string | null; autor_nome: string | null; criado_em: string }[];
  agenda: { id: number; tipo: string; quando: string; dia_inteiro: boolean; valor: number | null; status: string; observacao: string | null; criado_em: string; concluido_em: string | null }[];
  acordos: { id: number; valor_divida: number; desconto_pct: number; valor_total: number; entrada: number; parcelas: number; forma_pagamento: string; status: string; criado_por_nome: string | null; criado_em: string; quitado_em: string | null; encerrado_em: string | null; observacao: string | null; acordo_parcelas: Parcela[] }[];
  pagamentos: { id: number; valor: number; status: string; criado_em: string; pago_em: string | null; pix_payload: string | null }[];
  bloqueado: boolean;
  outras: { id: number; saldo: number; situacao: string; carteira: string }[];
  equipe: { id: string; nome: string }[];
  responsavelNome: string | null;
};

const ABAS = [
  { k: "resumo", t: "Resumo" },
  { k: "conversa", t: "Conversa" },
  { k: "acordo", t: "Acordo" },
  { k: "historico", t: "Histórico" },
  { k: "contatos", t: "Contatos" },
] as const;
type AbaFicha = (typeof ABAS)[number]["k"];

const FORMA: Record<string, string> = { pix: "Pix", loja: "Na loja", transferencia: "Transferência", boleto: "Boleto", dinheiro: "Dinheiro" };
const formatarFone = (e164: string) => {
  const d = e164.replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return e164;
};

// A próxima ação recomendada (o "PRÓXIMA AÇÃO RECOMENDADA" da Ficha 360° do MC COB), numa frase.
function proximaAcao(f: DadosFicha): { texto: string; tom: "margem" | "atencao" | "tinta" | "pago" | "lapis" } {
  const hojeISO = diaISO();
  const ativo = f.acordos.find((a) => a.status === "ativo");
  if (f.bloqueado) return { texto: "Pediu para não ser contatado. Não chame mais.", tom: "lapis" };
  if (f.devedor.situacao === "pago") return { texto: "Quitado. Nada a cobrar.", tom: "pago" };
  const atrasada = ativo?.acordo_parcelas.find((p) => p.status === "aberta" && p.vencimento < hojeISO);
  if (atrasada) return { texto: `Cobrar a ${atrasada.numero === 0 ? "entrada" : `parcela ${atrasada.numero}`} do acordo, atrasada desde ${dataCurta(atrasada.vencimento)}.`, tom: "margem" };
  if (f.conversa?.ultima_msg_de === "devedor" && f.conversa.estado !== "optout") return { texto: "Respondeu no WhatsApp. Responder agora.", tom: "margem" };
  const promessa = f.agenda.find((a) => a.status === "pendente" && a.tipo === "promessa");
  if (promessa && new Date(promessa.quando) < new Date()) return { texto: `Prometeu pagar em ${dataCurta(promessa.quando)} e não pagou. Chamar de novo.`, tom: "margem" };
  const vencendo = ativo?.acordo_parcelas.find((p) => p.status === "aberta" && p.vencimento === hojeISO);
  if (vencendo) return { texto: `A ${vencendo.numero === 0 ? "entrada" : `parcela ${vencendo.numero}`} vence hoje. Lembrar.`, tom: "tinta" };
  const pendente = f.agenda.filter((a) => a.status === "pendente").sort((a, b) => a.quando.localeCompare(b.quando))[0];
  if (pendente) return { texto: `${pendente.tipo === "promessa" ? "Promessa" : "Retorno"} marcado para ${dataCurta(pendente.quando)} (${prazo(pendente.quando)}).`, tom: "tinta" };
  if (!f.devedor.ultimo_contato_em) return { texto: "Nunca foi acionado. Fazer o primeiro contato.", tom: "tinta" };
  const dias = diasEntre(new Date(f.devedor.ultimo_contato_em), new Date());
  if (dias >= 7) return { texto: `Sem contato há ${dias} dias. Chamar de novo.`, tom: "atencao" };
  return { texto: "Dar continuidade à negociação.", tom: "tinta" };
}

export function Ficha({ dados, abaInicial, podeOperar, papel, meuId }: { dados: DadosFicha; abaInicial: string; podeOperar: boolean; papel: string; meuId: string }) {
  const router = useRouter();
  const [aba, setAba] = useState<AbaFicha>(ABAS.some((a) => a.k === abaInicial) ? (abaInicial as AbaFicha) : "resumo");
  const [verCPF, setVerCPF] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; msg: string } | null>(null);
  const d = dados.devedor;
  const acao = useMemo(() => proximaAcao(dados), [dados]);
  const ativo = dados.acordos.find((a) => a.status === "ativo") ?? null;
  const pendentes = dados.agenda.filter((a) => a.status === "pendente").sort((a, b) => a.quando.localeCompare(b.quando));
  const descontoVista = dados.proposta ? descontoReal(d.saldo, dados.proposta.valor) : 0;
  // O próximo compromisso com data, seja promessa, retorno ou parcela do acordo: o que vier primeiro.
  const proximoCompromisso = useMemo(() => {
    const ag = pendentes[0];
    const pa = ativo?.acordo_parcelas.filter((p) => p.status === "aberta").sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0];
    if (pa && (!ag || pa.vencimento <= diaISO(new Date(ag.quando)))) {
      return `${pa.numero === 0 ? "Entrada" : `Parcela ${pa.numero}/${ativo!.parcelas}`} · ${dataCurta(pa.vencimento)}`;
    }
    return ag ? `${ag.tipo === "promessa" ? "Promessa" : "Retorno"} · ${dataCurta(ag.quando)}` : "nenhum";
  }, [pendentes, ativo]);

  function irPara(k: AbaFicha) {
    setAba(k);
    const u = new URL(window.location.href);
    if (k === "resumo") u.searchParams.delete("aba"); else u.searchParams.set("aba", k);
    window.history.replaceState(null, "", u.toString());
  }

  async function assumir(alvo: string | null) {
    const r = await fetch(`/api/devedores/${d.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ responsavel_id: alvo }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setAviso({ tipo: "erro", msg: j?.erro ?? "Não foi possível trocar o responsável." });
    router.refresh();
  }

  async function gerarPix() {
    const valor = dados.proposta?.valor ?? d.saldo;
    const r = await fetch(`/api/devedores/${d.id}/pix`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valor, conversa_id: dados.conversa?.id ?? null }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setAviso({ tipo: "erro", msg: j?.erro ?? "Não foi possível gerar o Pix." }); return; }
    if (j?.copia_e_cola) navigator.clipboard?.writeText(j.copia_e_cola).catch(() => {});
    setAviso({ tipo: "ok", msg: `Pix de ${brl(j?.valor_final ?? valor)} gerado. O código copia-e-cola foi copiado; cole na conversa.` });
    router.refresh();
  }

  const tomAcao = { margem: "text-margem", atencao: "text-atencao", tinta: "text-tinta", pago: "text-pago", lapis: "text-lapis" }[acao.tom];

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-12 pt-5 sm:px-6 lg:px-8">
      <Link href="/devedores" className="inline-flex h-9 items-center gap-1.5 rounded-controle pr-2 text-sm2 font-600 text-tinta hover:underline [@media(pointer:coarse)]:h-11">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Devedores
      </Link>

      <header className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-pagina font-600 text-ouro">{d.nome}</h1>
          {/* Documento e processo numa linha, carteira e cidade na outra: o "·" nunca sobra no fim da linha */}
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.9375rem] text-lapis">
            <span className="inline-flex flex-wrap items-center gap-x-2">
              <button type="button" onClick={() => setVerCPF((v) => !v)} className="alvo-toque inline-flex items-center gap-1 whitespace-nowrap font-mono hover:text-tinta" aria-label={verCPF ? "Esconder CPF" : "Mostrar CPF"}>
                {verCPF ? formatarCPF(d.cpf) : mascararCPF(d.cpf)} {verCPF ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              {d.processo && <><span aria-hidden="true">·</span><span className="font-mono">{d.processo}</span></>}
            </span>
            <span className="basis-full">
              {dados.carteira?.nome}{(d.cidade || d.uf) ? ` · ${[d.cidade, d.uf].filter(Boolean).join("/")}` : ""}
            </span>
          </p>
          <p className="mt-2 text-[0.9375rem]">
            <span className={cn("font-600", corSituacao(d.situacao))}>{ROTULO_SITUACAO[d.situacao] ?? d.situacao}</span>
            {dados.bloqueado && d.situacao !== "nao_perturbe" && <> · <span className="font-600 text-margem">Não perturbe</span></>}
            {ativo && <span className="text-lapis"> · acordo ativo</span>}
          </p>
        </div>
        {podeOperar && !dados.bloqueado && d.situacao !== "pago" && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => { irPara("resumo"); document.getElementById("registrar")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
              <NotebookPen className="h-4 w-4" aria-hidden="true" /> Registrar contato
            </Button>
            {!ativo && <Button variant="outline" onClick={() => irPara("acordo")}><Handshake className="h-4 w-4" aria-hidden="true" /> Fazer acordo</Button>}
            <Button variant="outline" onClick={gerarPix}><QrCode className="h-4 w-4" aria-hidden="true" /> Gerar Pix</Button>
            {dados.conversa && <Link href={`/conversas?c=${dados.conversa.id}`} className={estiloBotao("quiet")}><MessageSquareText className="h-4 w-4" aria-hidden="true" /> Conversa</Link>}
          </div>
        )}
      </header>

      {aviso && <p role="status" className={cn("mt-4 rounded-controle px-3 py-2 text-sm2", aviso.tipo === "ok" ? "bg-pago-fundo text-pago" : "bg-margem-fundo text-margem")}>{aviso.msg}</p>}

      {/* Faixa da ficha: os números que importam, numa linha pautada. As colunas vêm da largura em rem,
          não da tela: com a letra do navegador aumentada a faixa quebra em mais linhas em vez de cortar. */}
      <dl className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] overflow-hidden border-y border-pauta bg-folha">
        <Fato rotulo={`Dívida${dados.proposta?.ano ? ` (${dados.proposta.ano})` : ""}`} valor={brl(d.saldo)} mono />
        <Fato rotulo={!dados.proposta ? "À vista" : descontoVista > 0 ? `À vista (${porcento(descontoVista)} de desconto)` : "À vista (sem desconto)"} valor={dados.proposta ? brl(dados.proposta.valor) : "—"} mono destaque={descontoVista > 0} />
        <Fato rotulo="Último contato" valor={d.ultimo_contato_em ? ha(d.ultimo_contato_em) : "nunca"} />
        <div className={CELULA_FATO}>
          <dt className="text-meta font-600 text-lapis">Responsável</dt>
          <dd className="mt-0.5 flex flex-wrap items-center gap-x-2">
            <span className="min-w-0 font-600 [overflow-wrap:anywhere]">{dados.responsavelNome ?? "Ninguém"}</span>
            {podeOperar && d.responsavel_id !== meuId && (
              <button type="button" onClick={() => assumir("eu")} className="alvo-toque rounded-controle px-1.5 text-sm2 font-600 text-tinta hover:bg-tinta-clara">Assumir</button>
            )}
          </dd>
        </div>
        <Fato rotulo="Próximo compromisso" valor={proximoCompromisso} />
      </dl>
      <p className={cn("mt-3 text-[0.9375rem] font-600", tomAcao)}>Próxima ação: {acao.texto}</p>

      <div role="tablist" aria-label="Seções da ficha" className="mt-6 flex gap-1 sem-barra overflow-x-auto overflow-y-hidden border-b border-pauta">
        {ABAS.map((a) => (
          <button
            key={a.k}
            role="tab"
            type="button"
            aria-selected={aba === a.k}
            onClick={() => irPara(a.k)}
            className={cn(
              "relative h-11 shrink-0 px-3 text-[0.9375rem] font-600 transition-colors",
              aba === a.k ? "text-tinta" : "text-lapis hover:text-texto",
            )}
          >
            {a.t}
            {a.k === "acordo" && ativo && <span className="ml-1.5 font-mono text-meta">{ativo.acordo_parcelas.filter((p) => p.status === "paga").length}/{ativo.acordo_parcelas.length}</span>}
            {aba === a.k && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-tinta" />}
          </button>
        ))}
      </div>

      <div className="pt-6" role="tabpanel">
        {aba === "resumo" && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div className="space-y-6">
              <section aria-labelledby="t-combinado">
                <h2 id="t-combinado" className="font-display text-titulo font-600 text-ouro">O que está combinado</h2>
                {!ativo && pendentes.length === 0 && dados.pagamentos.every((p) => p.status !== "pendente") && (
                  <p className="mt-2 text-[0.9375rem] text-lapis">Nada combinado ainda. Registre o contato ao lado: promessa e retorno viram data na Agenda.</p>
                )}
                {ativo && (
                  <div className="mt-3 rounded-painel border border-pauta bg-folha p-4">
                    <p className="text-[0.9375rem]">
                      Acordo de <span className="font-mono font-600 tabnums">{brl(ativo.valor_total)}</span>
                      {ativo.parcelas > 1 || ativo.entrada > 0 ? ` em ${ativo.entrada > 0 ? "entrada + " : ""}${ativo.parcelas}x` : " à vista"} · {FORMA[ativo.forma_pagamento] ?? ativo.forma_pagamento}
                    </p>
                    <div className="mt-3"><Carne parcelas={ativo.acordo_parcelas} total={ativo.parcelas} /></div>
                    <button type="button" onClick={() => irPara("acordo")} className="mt-3 text-sm2 font-600 text-tinta hover:underline">Registrar pagamento →</button>
                  </div>
                )}
                {pendentes.length > 0 && (
                  <ul className="mt-3 divide-y divide-pauta border-y border-pauta bg-folha">
                    {pendentes.map((a) => {
                      const venceu = new Date(a.quando) < new Date() && diaISO(new Date(a.quando)) !== diaISO();
                      return (
                        <li key={a.id} className="grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5">
                          <span className={cn("font-mono text-sm2 tabnums", venceu ? "text-margem" : "text-tinta")}>{a.dia_inteiro ? dataCurta(a.quando) : `${dataCurta(a.quando)} ${hora(a.quando)}`}</span>
                          <span className="min-w-0">
                            <span className="font-600">{a.tipo === "promessa" ? "Promessa de pagamento" : "Retorno"}</span>
                            <span className="block truncate text-sm2 text-lapis">{venceu ? "Venceu " : ""}{prazo(a.quando)}{a.observacao ? ` · ${a.observacao}` : ""}</span>
                          </span>
                          <span className="font-mono text-[0.9375rem] tabnums">{a.valor ? brl(a.valor) : ""}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {dados.pagamentos.filter((p) => p.status === "pendente").map((p) => (
                  <p key={p.id} className="mt-3 rounded-controle bg-atencao-fundo px-3 py-2 text-sm2 text-atencao">
                    Pix de {brl(p.valor)} gerado {ha(p.criado_em)} e ainda não pago.
                  </p>
                ))}
              </section>

              {dados.outras.length > 0 && (
                <section aria-labelledby="t-outras">
                  <h2 id="t-outras" className="font-display text-titulo font-600 text-ouro">Outras carteiras deste CPF</h2>
                  <p className="mt-1 text-sm2 text-lapis">Negociação, acordo e pagamento continuam separados por carteira.</p>
                  <ul className="mt-2 divide-y divide-pauta border-y border-pauta bg-folha">
                    {dados.outras.map((o) => (
                      <li key={o.id}>
                        <Link href={`/devedores/${o.id}`} className="linha-hover flex items-center justify-between gap-3 px-4 py-2.5">
                          <span className="font-600">{o.carteira}</span>
                          <span className="flex items-center gap-3">
                            <span className={cn("text-sm2 font-600", corSituacao(o.situacao))}>{ROTULO_SITUACAO[o.situacao] ?? o.situacao}</span>
                            <span className="font-mono tabnums">{brl(o.saldo)}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section aria-labelledby="t-ultimos">
                <div className="flex items-baseline justify-between">
                  <h2 id="t-ultimos" className="font-display text-titulo font-600 text-ouro">Últimos registros</h2>
                  <button type="button" onClick={() => irPara("historico")} className="alvo-toque text-sm2 font-600 text-tinta hover:underline">Histórico inteiro →</button>
                </div>
                <Historico itens={dados.ocorrencias.slice(0, 5)} />
              </section>
            </div>

            <aside id="registrar" className="scroll-mt-24">
              {podeOperar && !dados.bloqueado ? (
                <RegistrarContato devedorId={d.id} conversaId={dados.conversa?.id ?? null} proposta={dados.proposta?.valor ?? null} onFeito={() => { setAviso({ tipo: "ok", msg: "Contato registrado." }); router.refresh(); }} />
              ) : (
                <div className="rounded-painel border border-pauta bg-folha p-4 text-[0.9375rem] text-lapis">
                  {dados.bloqueado ? "Esta pessoa pediu para não ser contatada. Não é possível registrar novos contatos." : "Você está vendo esta ficha só para leitura."}
                </div>
              )}
            </aside>
          </div>
        )}

        {aba === "conversa" && <ConversaFicha dados={dados} podeOperar={podeOperar} onEnviado={() => router.refresh()} />}

        {aba === "acordo" && (
          <div className="space-y-8">
            {ativo ? (
              <AcordoAtivo acordo={ativo} podeOperar={podeOperar} onMudou={(m) => { setAviso({ tipo: "ok", msg: m }); router.refresh(); }} onErro={(m) => setAviso({ tipo: "erro", msg: m })} />
            ) : podeOperar && !dados.bloqueado && d.situacao !== "pago" && dados.carteira ? (
              <section aria-labelledby="t-fazer">
                <h2 id="t-fazer" className="font-display text-titulo font-600 text-ouro">Fazer acordo</h2>
                <p className="mb-4 mt-1 text-[0.9375rem] text-lapis">Parte da proposta à vista. Os limites são os da carteira {dados.carteira.nome}.</p>
                <FazerAcordo
                  devedorId={d.id}
                  divida={d.saldo}
                  descontoSugerido={descontoVista}
                  limites={{ desconto_max_pct: Number(dados.carteira.desconto_max_pct), parcelas_max: dados.carteira.parcelas_max, entrada_min_pct: Number(dados.carteira.entrada_min_pct), parcela_min_valor: Number(dados.carteira.parcela_min_valor) }}
                  papel={papel}
                  onFeito={() => setAviso({ tipo: "ok", msg: "Acordo gravado. As parcelas já estão na Agenda." })}
                />
              </section>
            ) : (
              <p className="text-[0.9375rem] text-lapis">{d.situacao === "pago" ? "Devedor quitado." : "Nenhum acordo ativo."}</p>
            )}
            {dados.acordos.filter((a) => a.status !== "ativo").length > 0 && (
              <section aria-labelledby="t-acordos-antigos">
                <h2 id="t-acordos-antigos" className="font-display text-titulo font-600 text-ouro">Acordos anteriores</h2>
                <ul className="mt-2 divide-y divide-pauta border-y border-pauta bg-folha">
                  {dados.acordos.filter((a) => a.status !== "ativo").map((a) => (
                    <li key={a.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[120px_minmax(0,1fr)_minmax(0,280px)] sm:items-center">
                      <span className="font-mono text-sm2 text-lapis">{dataLonga(a.criado_em)}</span>
                      <span>
                        <span className="font-600">{brl(a.valor_total)}</span> <span className="text-sm2 text-lapis">· {a.parcelas}x · {a.criado_por_nome ?? "—"}</span>
                        <span className={cn("ml-2 text-sm2 font-600", a.status === "quitado" ? "text-pago" : a.status === "quebrado" ? "text-margem" : "text-lapis")}>{a.status === "quitado" ? "Quitado" : a.status === "quebrado" ? "Quebrado" : "Cancelado"}</span>
                      </span>
                      <Carne parcelas={a.acordo_parcelas} total={a.parcelas} compacto />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {aba === "historico" && (
          <section aria-label="Histórico completo">
            <Historico itens={dados.ocorrencias} vazio="Nenhum contato registrado ainda." />
          </section>
        )}

        {aba === "contatos" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="t-fones">
              <h2 id="t-fones" className="font-display text-titulo font-600 text-ouro">Telefones</h2>
              {dados.telefones.length === 0 ? <p className="mt-2 text-[0.9375rem] text-lapis">Nenhum telefone. Sem telefone, este devedor precisa de higienização.</p> : (
                <ul className="mt-2 divide-y divide-pauta border-y border-pauta bg-folha">
                  {dados.telefones.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <span className="flex items-center gap-2.5">
                        <Phone className="h-4 w-4 text-lapis" aria-hidden="true" />
                        <a href={`tel:${t.telefone_e164}`} className="alvo-toque font-mono tabnums text-texto hover:text-tinta hover:underline">{formatarFone(t.telefone_e164)}</a>
                        <span className="text-sm2 text-lapis">{t.tipo === "fixo" ? "fixo" : "celular"}{t.ordem === 1 ? " · principal" : ""}</span>
                      </span>
                      <span className={cn("text-sm2 font-600", t.whatsapp_valido === true ? "text-pago" : t.whatsapp_valido === false ? "text-margem" : "text-lapis")}>
                        {t.whatsapp_valido === true ? "Tem WhatsApp" : t.whatsapp_valido === false ? "Sem WhatsApp" : "Não verificado"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-labelledby="t-outros">
              <h2 id="t-outros" className="font-display text-titulo font-600 text-ouro">E-mail e endereço</h2>
              <ul className="mt-2 divide-y divide-pauta border-y border-pauta bg-folha">
                {d.emails.length > 0 ? d.emails.map((e) => (
                  <li key={e} className="flex items-center gap-2.5 px-4 py-3"><Mail className="h-4 w-4 shrink-0 text-lapis" aria-hidden="true" /> <a href={`mailto:${e}`} className="alvo-toque min-w-0 [overflow-wrap:anywhere] hover:text-tinta hover:underline">{e}</a></li>
                )) : <li className="px-4 py-3 text-lapis">Nenhum e-mail.</li>}
                <li className="flex items-center gap-2.5 px-4 py-3"><MapPin className="h-4 w-4 text-lapis" aria-hidden="true" /> {[d.cidade, d.uf].filter(Boolean).join("/") || "Endereço não informado na planilha"}</li>
              </ul>
              {(d.motivo || d.fase || d.tags) && (
                <dl className="mt-4 grid grid-cols-[140px_minmax(0,1fr)] gap-y-2 text-[0.9375rem]">
                  {d.motivo && <><dt className="text-lapis">Motivo</dt><dd>{d.motivo}</dd></>}
                  {d.fase && <><dt className="text-lapis">Fase</dt><dd>{d.fase}</dd></>}
                  {d.tags && <><dt className="text-lapis">Marcadores</dt><dd>{d.tags}</dd></>}
                </dl>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

// Linha da pauta à direita de cada célula; a da última coluna some no overflow-hidden da faixa.
const CELULA_FATO = "min-w-0 px-3 py-3 shadow-[1px_0_0_0_rgb(var(--c-line))] sm:px-4";

function Fato({ rotulo, valor, mono, destaque }: { rotulo: string; valor: string; mono?: boolean; destaque?: boolean }) {
  return (
    <div className={CELULA_FATO}>
      <dt className="text-meta font-600 text-lapis">{rotulo}</dt>
      {/* Valor nunca corta: na tela estreita o "R$" desce de linha e o número fica inteiro */}
      <dd className={cn("mt-0.5", mono && "font-mono text-[0.9375rem] tabnums", destaque ? "font-600 text-pago" : "font-600")}>{mono ? valor.replace(/ /g, " ") : valor}</dd>
    </div>
  );
}

function Historico({ itens, vazio }: { itens: DadosFicha["ocorrencias"]; vazio?: string }) {
  if (!itens.length) return <p className="mt-2 text-[0.9375rem] text-lapis">{vazio ?? "Nada registrado ainda."}</p>;
  return (
    <ul className="pagina-pautada mt-2 border-y border-pauta bg-folha [--margem:96px]">
      {itens.map((o) => {
        const r = RESULTADOS[o.resultado as Resultado];
        return (
          <li key={o.id} className="grid grid-cols-[var(--margem)_minmax(0,1fr)] border-b border-pauta last:border-b-0">
            <span className="px-4 py-2.5 font-mono text-sm2 text-tinta tabnums">{margem(o.criado_em)}</span>
            <span className="min-w-0 px-4 py-2.5">
              <span className={cn("font-600", r?.tom === "bom" ? "text-pago" : r?.tom === "ruim" ? "text-margem" : r?.tom === "atencao" ? "text-atencao" : "text-texto")}>
                {r?.rotulo ?? o.resultado}
              </span>
              <span className="text-sm2 text-lapis"> · {o.autor_nome ?? "Robô"} · {o.canal === "whatsapp" ? "WhatsApp" : o.canal === "ligacao" ? "ligação" : o.canal}</span>
              {o.descricao && <span className="block text-[0.9375rem] text-texto">{o.descricao}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function RegistrarContato({ devedorId, conversaId, proposta, onFeito }: { devedorId: number; conversaId: number | null; proposta: number | null; onFeito: () => void }) {
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [canal, setCanal] = useState("whatsapp");
  const [quando, setQuando] = useState("");
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function escolher(r: Resultado) {
    setResultado(r);
    const p = proximoPasso(r);
    setQuando(p ? `${diaISO(p.quando)}T${hora(p.quando)}` : "");
    if (r === "promessa" && proposta) setValor(String(proposta));
  }
  const pedeData = !!resultado && (resultado === "promessa" || resultado === "pediu_retorno" || !!RESULTADOS[resultado].proximo);

  async function gravar() {
    if (!resultado) return;
    setGravando(true); setErro(null);
    const agendar = pedeData && quando ? { tipo: resultado === "promessa" ? "promessa" : "retorno", quando: new Date(`${quando}:00-03:00`).toISOString(), valor: resultado === "promessa" && valor ? Number(valor.replace(",", ".")) : null, dia_inteiro: resultado === "promessa" } : null;
    const r = await fetch("/api/ocorrencias", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ devedor_id: devedorId, resultado, canal, descricao: obs || null, conversa_id: conversaId, agendar }) });
    const j = await r.json().catch(() => ({}));
    setGravando(false);
    if (!r.ok) { setErro(j?.erro ?? "Não foi possível registrar."); return; }
    setResultado(null); setObs(""); setValor(""); setQuando("");
    onFeito();
  }

  return (
    <section aria-labelledby="t-registrar" className="rounded-painel border border-pauta bg-folha p-4">
      <h2 id="t-registrar" className="font-display text-titulo font-600 text-ouro">Registrar contato</h2>
      <div className="mt-3">
        <Label htmlFor="canal">Por onde</Label>
        <Select id="canal" value={canal} onChange={(e) => setCanal(e.target.value)}>
          {CANAIS.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
        </Select>
      </div>
      <p className="mb-1.5 mt-3 text-sm2 font-600">O que aconteceu</p>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Resultado do contato">
        {RESULTADOS_RAPIDOS.map((r) => (
          <button key={r} type="button" role="radio" aria-checked={resultado === r} onClick={() => escolher(r)}
            className={cn("rounded-full border px-3 py-1.5 text-sm2 font-600 transition-colors duration-150 [@media(pointer:coarse)]:py-2",
              resultado === r ? "border-tinta bg-tinta text-sobre-tinta" : "border-pauta-forte bg-folha text-texto hover:border-tinta/50")}>
            {RESULTADOS[r].rotulo}
          </button>
        ))}
      </div>
      {resultado && (
        <div className="mt-3 space-y-3 animate-fade-up">
          {pedeData && (
            <div className="grid grid-cols-2 gap-2">
              <div className={resultado === "promessa" ? "" : "col-span-2"}>
                <Label htmlFor="q2">{resultado === "promessa" ? "Vai pagar em" : "Próximo contato"}</Label>
                <Input id="q2" type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} />
              </div>
              {resultado === "promessa" && (
                <div>
                  <Label htmlFor="v2">Valor (R$)</Label>
                  <Input id="v2" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
                </div>
              )}
            </div>
          )}
          {resultado === "nao_perturbe" && <p className="rounded-controle bg-margem-fundo px-3 py-2 text-sm2 text-margem">A pessoa não recebe mais nenhuma mensagem, de nenhum número.</p>}
          <div>
            <Label htmlFor="o2">Observação <span className="font-500 text-lapis">(opcional)</span></Label>
            <Textarea id="o2" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>
          {erro && <p role="alert" className="rounded-controle bg-margem-fundo px-3 py-2 text-sm2 text-margem">{erro}</p>}
          <Button size="lg" className="w-full" onClick={gravar} disabled={gravando}>{gravando ? "Registrando…" : "Registrar"}</Button>
        </div>
      )}
    </section>
  );
}

function AcordoAtivo({ acordo, podeOperar, onMudou, onErro }: { acordo: DadosFicha["acordos"][number]; podeOperar: boolean; onMudou: (m: string) => void; onErro: (m: string) => void }) {
  const [pagando, setPagando] = useState<number | null>(null);
  const [valor, setValor] = useState("");
  const [data, setData] = useState(diaISO());
  const [forma, setForma] = useState(acordo.forma_pagamento);
  const [confirmar, setConfirmar] = useState<"quebrar" | "cancelar" | null>(null);
  const parcelas = [...acordo.acordo_parcelas].sort((a, b) => a.numero - b.numero);
  const pagas = parcelas.filter((p) => p.status === "paga");
  const recebido = pagas.reduce((s, p) => s + Number(p.valor_pago ?? p.valor), 0);

  async function pagar(p: Parcela) {
    const r = await fetch(`/api/parcelas/${p.id}/pagar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valor: Number((valor || String(p.valor)).replace(",", ".")), data, forma }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { onErro(j?.erro ?? "Não foi possível registrar o pagamento."); return; }
    setPagando(null);
    onMudou(j?.acordo_quitado ? "Pagamento registrado. Acordo quitado — o devedor saiu da cobrança." : "Pagamento registrado.");
  }
  async function encerrar(acao: "quebrar" | "cancelar") {
    const r = await fetch(`/api/acordos/${acordo.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { onErro(j?.erro ?? "Não foi possível encerrar o acordo."); return; }
    setConfirmar(null);
    onMudou(acao === "quebrar" ? "Acordo marcado como quebrado. O devedor voltou para a cobrança." : "Acordo cancelado.");
  }

  return (
    <section aria-labelledby="t-ativo">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="t-ativo" className="font-display text-titulo font-600 text-ouro">Acordo ativo</h2>
          <p className="mt-1 text-[0.9375rem] text-lapis">
            Feito por {acordo.criado_por_nome ?? "—"} em {dataLonga(acordo.criado_em)} · {FORMA[acordo.forma_pagamento] ?? acordo.forma_pagamento} · desconto de {porcento(Number(acordo.desconto_pct))}
          </p>
        </div>
        <p className="text-right text-[0.9375rem]">
          <span className="font-mono font-600 tabnums text-pago">{brl(recebido)}</span> recebidos de <span className="font-mono tabnums">{brl(acordo.valor_total)}</span>
        </p>
      </div>
      <div className="mt-4"><Carne parcelas={parcelas} total={acordo.parcelas} /></div>

      {/* Mesma folha pautada das outras listas: vencimento na margem, valor à direita. No celular o
          botão desce para a linha de baixo em vez de espremer o nome da parcela. */}
      <ul className="pagina-pautada mt-5 border-y border-pauta bg-folha [--margem:72px] sm:[--margem:96px]">
        {parcelas.map((p) => {
          const atrasada = p.status === "aberta" && p.vencimento < diaISO();
          return (
            <li key={p.id} className="border-b border-pauta last:border-b-0">
              {/* Coluna do botão com largura fixa: o valor da parcela paga fica alinhado com o da aberta */}
              <div className={cn("grid grid-cols-[var(--margem)_minmax(0,1fr)_auto] items-start sm:items-center", podeOperar && "sm:grid-cols-[var(--margem)_minmax(0,1fr)_auto_11.5rem]")}>
                <span className={cn("px-3 py-3 font-mono text-sm2 tabnums sm:px-4", atrasada ? "text-margem" : "text-tinta")}>{dataCurta(p.vencimento)}</span>
                <span className="min-w-0 py-2.5 pl-3 sm:pl-4">
                  <span className="font-600">{p.numero === 0 ? "Entrada" : <>Parcela {p.numero}<span className="sm:hidden">/{acordo.parcelas}</span><span className="hidden sm:inline"> de {acordo.parcelas}</span></>}</span>
                  <span className={cn("block text-sm2", atrasada ? "font-600 text-margem" : "text-lapis")}>
                    {p.status === "paga" ? `Paga em ${p.pago_em ? dataCurta(p.pago_em) : "—"}${p.forma_pagamento ? ` · ${FORMA[p.forma_pagamento] ?? p.forma_pagamento}` : ""}` : p.status === "cancelada" ? "Cancelada" : atrasada ? `Atrasada ${prazo(deDiaISO(p.vencimento))}` : prazo(deDiaISO(p.vencimento))}
                  </span>
                </span>
                <span className={cn("py-2.5 pl-2 pr-3 text-right font-mono text-[0.9375rem] tabnums sm:pl-3 sm:pr-4 sm:text-base", p.status === "paga" && "text-pago", p.status === "cancelada" && "text-lapis line-through")}>{brl(p.status === "paga" ? Number(p.valor_pago ?? p.valor) : p.valor)}</span>
                {podeOperar && p.status === "aberta" && (
                  <div className="col-span-2 col-start-2 pb-3 pl-3 pr-3 sm:col-span-1 sm:col-start-auto sm:justify-self-end sm:py-2 sm:pl-0 sm:pr-4">
                    <Button size="sm" variant={pagando === p.id ? "ghost" : "outline"} onClick={() => { setPagando(pagando === p.id ? null : p.id); setValor(String(p.valor)); setData(diaISO()); }}>
                      {pagando === p.id ? "Fechar" : "Registrar pagamento"}
                    </Button>
                  </div>
                )}
              </div>
              {pagando === p.id && (
                <div className="mb-3 ml-[calc(var(--margem)+12px)] mr-3 grid gap-2 rounded-controle bg-papel p-3 sm:ml-[calc(var(--margem)+16px)] sm:mr-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                  <div><Label htmlFor={`pv-${p.id}`}>Valor recebido</Label><Input id={`pv-${p.id}`} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></div>
                  <div><Label htmlFor={`pd-${p.id}`}>Data</Label><Input id={`pd-${p.id}`} type="date" max={diaISO()} value={data} onChange={(e) => setData(e.target.value)} /></div>
                  <div>
                    <Label htmlFor={`pf-${p.id}`}>Forma</Label>
                    <Select id={`pf-${p.id}`} value={forma} onChange={(e) => setForma(e.target.value)}>
                      <option value="pix">Pix</option><option value="loja">Na loja</option><option value="transferencia">Transferência</option><option value="dinheiro">Dinheiro</option>
                    </Select>
                  </div>
                  <Button onClick={() => pagar(p)}>Confirmar</Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {podeOperar && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {confirmar ? (
            <>
              <span className="text-[0.9375rem]">{confirmar === "quebrar" ? "Marcar como quebrado? As parcelas abertas são canceladas." : "Cancelar este acordo?"}</span>
              <Button variant="danger" size="sm" onClick={() => encerrar(confirmar)}>Sim, {confirmar === "quebrar" ? "quebrou" : "cancelar"}</Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmar(null)}>Não</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setConfirmar("quebrar")}>Parou de pagar (quebrar acordo)</Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmar("cancelar")}>Cancelar acordo</Button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function ConversaFicha({ dados, podeOperar, onEnviado }: { dados: DadosFicha; podeOperar: boolean; onEnviado: () => void }) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const msgs = dados.mensagens.filter((m) => !m.privado);
  if (!dados.conversa) return <p className="text-[0.9375rem] text-lapis">Ainda não há conversa de WhatsApp com esta pessoa.</p>;

  async function enviar() {
    setEnviando(true); setErro(null);
    const r = await fetch(`/api/conversas/${dados.conversa!.id}/mensagens`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conteudo: texto.trim() }) });
    const j = await r.json().catch(() => ({}));
    setEnviando(false);
    if (!r.ok) { setErro(j?.erro ?? "A mensagem não saiu."); return; }
    setTexto("");
    onEnviado();
  }

  let ultimoDia = "";
  return (
    <section aria-label="Conversa de WhatsApp" className="mx-auto max-w-[760px]">
      <div className="space-y-2">
        {msgs.map((m) => {
          const dia = dataLonga(m.criado_em);
          const separador = dia !== ultimoDia;
          ultimoDia = dia;
          return (
            <div key={m.id}>
              {separador && <p className="my-3 text-center font-mono text-meta text-lapis">{dia}</p>}
              <div className={cn("flex", m.direcao === "entrada" ? "justify-start" : m.origem === "sistema" ? "justify-center" : "justify-end")}>
                <div className={cn("max-w-[80%] rounded-painel px-3 py-2 text-[0.9375rem] leading-6",
                  m.origem === "sistema" ? "bg-ink-800 text-sm2 text-lapis" : m.direcao === "entrada" ? "rounded-bl-[4px] border border-pauta bg-folha" : "rounded-br-[4px] bg-tinta-clara")}>
                  <p className="whitespace-pre-wrap break-words">{m.conteudo}</p>
                  <p className="mt-1 font-mono text-meta text-lapis">{hora(m.criado_em)}{m.direcao === "saida" && m.origem !== "sistema" ? ` · ${m.origem === "bot" ? "robô" : m.autor_nome ?? "equipe"}` : ""}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {podeOperar && !dados.bloqueado && (
        <div className="sticky bottom-20 mt-4 rounded-painel border border-pauta bg-folha p-3 lg:bottom-4">
          <Label htmlFor="msg" className="sr-only">Mensagem</Label>
          <Textarea id="msg" rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={`Escreva para ${dados.devedor.nome.split(" ")[0]}…`} />
          {erro && <p role="alert" className="mt-2 text-sm2 text-margem">{erro}</p>}
          <div className="mt-2 flex items-center justify-between gap-2">
            <Link href={`/conversas?c=${dados.conversa.id}`} className="text-sm2 font-600 text-tinta hover:underline">Abrir em Conversas</Link>
            <Button onClick={enviar} disabled={enviando || !texto.trim()}>{enviando ? "Enviando…" : "Enviar"}</Button>
          </div>
        </div>
      )}
    </section>
  );
}

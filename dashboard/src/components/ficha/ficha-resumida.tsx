"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ExternalLink, MessageSquareText, QrCode, Eye, EyeOff } from "lucide-react";
import { Button, Input, Label, Textarea } from "@/components/ui/primitives";
import { brl, cn, porcento } from "@/lib/utils";
import { descontoReal } from "@/lib/acordo";
import { dataCurta, ha, hora, margem, prazo, diaISO } from "@/lib/datas";
import { RESULTADOS, RESULTADOS_RAPIDOS, ROTULO_SITUACAO, proximoPasso, type Resultado } from "@/lib/resultados";

export type Resumo = {
  devedor: { id: number; nome: string; cpf: string; processo: string | null; saldo: number; vencimento: string | null; cidade: string | null; uf: string | null; situacao: string; responsavel: string | null; ultimo_contato_em: string | null; motivo: string | null; ano: number | null };
  carteira: { nome: string; credor: string | null; parcelas_max: number; desconto_max_pct: number } | null;
  proposta: { valor: number; desconto_pct: number } | null;
  conversa: { id: number; estado: string; ultima_msg_em: string | null; ultima_msg_de: string | null } | null;
  mensagens: { id: number; direcao: string; origem: string; conteudo: string | null; criado_em: string; autor_nome: string | null }[];
  leitura: { intencao: string; rotulo: string; data: string | null; dataTexto: string | null; sensivel: boolean; bloquear: boolean } | null;
  sugestao: string | null;
  acordo: { id: number; valor_total: number; parcelas: number; status: string; acordo_parcelas: { id: number; numero: number; vencimento: string; valor: number; status: string }[] } | null;
  agenda: { id: number; tipo: string; quando: string; valor: number | null; observacao: string | null }[];
  telefones: { id: number; telefone_e164: string; whatsapp_valido: boolean | null }[];
  bloqueado: boolean;
};

export type ContextoFila = { conversa_id?: number | null; agenda_id?: number | null; parcela_id?: number | null; grupo?: string };

export const mascararCPF = (cpf: string) => {
  const d = (cpf || "").replace(/\D/g, "");
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (d.length === 14) return `**.${d.slice(2, 5)}.${d.slice(5, 8)}/****-**`;
  return "não informado";
};
export const formatarCPF = (cpf: string) => {
  const d = (cpf || "").replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return cpf;
};

// O resultado que a leitura da mensagem sugere. Vem marcado para a pessoa só conferir: o caso comum
// (mandar a resposta e registrar) fica a um clique, e trocar continua a um clique também.
const PRE_RESULTADO: Partial<Record<string, Resultado>> = {
  promessa: "promessa", quer_pagar: "promessa", pediu_retorno: "pediu_retorno", pediu_parcelar: "falou_com_titular",
  pergunta_valor: "falou_com_titular", desconfiado: "falou_com_titular", sem_condicao: "falou_com_titular",
  ja_pagou: "ja_pagou", nao_reconhece: "contestou", recusa: "recusou", nao_perturbe: "nao_perturbe",
  pessoa_errada: "numero_errado", falecido: "falecido",
};
// Os quatro mais prováveis ficam à mostra; o resto abre em "Outro resultado". Conferir uma promessa ou
// parcela tem outros desfechos prováveis que uma conversa nova.
const VISIVEIS: Resultado[] = ["promessa", "pediu_retorno", "falou_com_titular", "sem_resposta"];
const VISIVEIS_COMPROMISSO: Resultado[] = ["ja_pagou", "promessa", "sem_resposta", "pediu_retorno"];

// Converte ISO para o valor de <input type="datetime-local"> no fuso de SP
function paraCampo(iso: string) {
  const d = new Date(iso);
  return `${diaISO(d)}T${hora(d)}`;
}
function deCampo(v: string) {
  // "2026-11-10T10:00" em SP (-03:00; o Brasil não tem horário de verão desde 2019)
  return new Date(`${v}:00-03:00`).toISOString();
}

export function FichaResumida({
  devedorId, contexto, podeOperar, onRegistrado, onFechar,
}: {
  devedorId: number;
  contexto?: ContextoFila;
  podeOperar: boolean;
  onRegistrado?: (r: { resultado: Resultado }) => void;
  onFechar?: () => void;
}) {
  const [dados, setDados] = useState<Resumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [verCPF, setVerCPF] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; msg: string } | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [quando, setQuando] = useState("");
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");
  const [gravando, setGravando] = useState(false);
  const [todos, setTodos] = useState(false);

  useEffect(() => {
    let vivo = true;
    setDados(null); setErro(null); setAviso(null); setResultado(null); setObs(""); setVerCPF(false); setTodos(false);
    fetch(`/api/devedores/${devedorId}/resumo`)
      .then(async (r) => (r.ok ? r.json() : Promise.reject((await r.json().catch(() => ({})))?.erro ?? "erro")))
      .then((d: Resumo) => {
        if (!vivo) return;
        setDados(d);
        setTexto(d.sugestao ?? "");
        // pré-escolhe o resultado pelo que a IA leu; "quero pagar" é promessa para hoje
        const l = d.leitura;
        const pre = l ? PRE_RESULTADO[l.intencao] : undefined;
        if (pre && !d.bloqueado) {
          setResultado(pre);
          if (pre === "promessa") setValor(d.proposta ? String(d.proposta.valor) : "");
          if (l?.data && (pre === "promessa" || pre === "pediu_retorno")) setQuando(paraCampo(l.data));
          else if (l?.intencao === "quer_pagar") setQuando(`${diaISO()}T12:00`);
        }
      })
      .catch((e) => vivo && setErro(typeof e === "string" ? e : "Não foi possível abrir a ficha."));
    return () => { vivo = false; };
  }, [devedorId]);

  const passo = useMemo(() => (resultado ? proximoPasso(resultado) : null), [resultado]);
  useEffect(() => {
    if (!resultado) return;
    if (dados?.leitura?.data && ["promessa", "pediu_retorno"].includes(resultado)) return; // mantém a data lida
    if (dados?.leitura?.intencao === "quer_pagar" && resultado === "promessa") return;     // e o "hoje" do quero pagar
    setQuando(passo ? paraCampo(passo.quando.toISOString()) : "");
  }, [resultado, passo, dados?.leitura?.data]);

  if (erro) return <div className="p-6 text-[0.9375rem] text-margem">Não foi possível abrir a ficha deste devedor.</div>;
  if (!dados) return <EsqueletoFicha />;

  const { devedor: d, carteira, proposta, mensagens, leitura, conversa } = dados;
  const ultimaEntrada = [...mensagens].reverse().find((m) => m.direcao === "entrada");

  async function enviar(): Promise<boolean> {
    if (!conversa || !texto.trim()) return false;
    setEnviando(true); setAviso(null);
    const r = await fetch(`/api/conversas/${conversa.id}/mensagens`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conteudo: texto.trim() }),
    });
    const j = await r.json().catch(() => ({}));
    setEnviando(false);
    if (!r.ok) { setAviso({ tipo: "erro", msg: j?.erro ?? "A mensagem não saiu." }); return false; }
    setDados((x) => x && ({ ...x, mensagens: [...x.mensagens, { id: j.mensagem_id ?? Date.now(), direcao: "saida", origem: "humano", conteudo: texto.trim(), criado_em: new Date().toISOString(), autor_nome: "Você" }], sugestao: null, leitura: x.leitura }));
    setTexto("");
    return true;
  }
  // O botão principal da conversa: manda a resposta, registra o resultado marcado e vai para o próximo.
  async function enviarEIr() {
    if (!(await enviar())) return;
    if (resultado) await registrar(resultado);
    else setAviso({ tipo: "ok", msg: "Mensagem enviada. Agora marque o resultado e registre." });
  }

  async function registrar(r: Resultado, forcar?: { quando: string; valor: number | null }) {
    setGravando(true); setAviso(null);
    const tipo = r === "promessa" ? "promessa" : "retorno";
    const agendarQuando = forcar?.quando ?? (quando ? deCampo(quando) : null);
    const agendar = agendarQuando && (RESULTADOS[r].proximo || r === "promessa" || r === "pediu_retorno")
      ? { tipo, quando: agendarQuando, valor: forcar?.valor ?? (r === "promessa" && valor ? Number(valor.replace(",", ".")) : null), dia_inteiro: r === "promessa" }
      : null;
    const concluir = contexto?.agenda_id
      ? { agenda_id: contexto.agenda_id, status: r === "pagou" ? "cumprida" : r === "promessa" ? "remarcada" : contexto.grupo === "promessa" && r === "sem_resposta" ? "quebrada" : "cumprida" }
      : undefined;
    const res = await fetch("/api/ocorrencias", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ devedor_id: d.id, resultado: r, descricao: obs || null, conversa_id: conversa?.id ?? null, agendar, concluir }),
    });
    const j = await res.json().catch(() => ({}));
    setGravando(false);
    if (!res.ok) { setAviso({ tipo: "erro", msg: j?.erro ?? "Não foi possível registrar." }); return; }
    if (onRegistrado) { onRegistrado({ resultado: r }); return; }
    setAviso({ tipo: "ok", msg: `Registrado: ${RESULTADOS[r].rotulo}.` });
    setResultado(null); setObs(""); setTodos(false);
  }

  const pedeData = resultado && (resultado === "promessa" || resultado === "pediu_retorno" || !!RESULTADOS[resultado].proximo);
  const visiveis = contexto?.grupo === "promessa" || contexto?.grupo === "parcela" ? VISIVEIS_COMPROMISSO : VISIVEIS;
  const chips: Resultado[] = todos
    ? RESULTADOS_RAPIDOS
    : [...new Set<Resultado>([...(resultado && !visiveis.includes(resultado) ? [resultado] : []), ...visiveis])];
  const rotuloRegistro = resultado
    ? `${RESULTADOS[resultado].rotulo}${pedeData && quando ? ` · ${resultado === "promessa" ? "" : "retorno "}${dataCurta(deCampo(quando))}` : ""}`
    : "";
  // Só o Trabalho de Hoje tem "próximo"; ao lado de uma conversa o botão registra e fica.
  const avanca = !!onRegistrado;
  // Com resposta escrita e ainda não enviada, a ação do rodapé passa a ser "Enviar e ir para o próximo".
  const rascunhoPendente = podeOperar && !!conversa && !!texto.trim() && !dados.bloqueado;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-pauta px-5 pb-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-titulo font-600 text-ouro">{d.nome}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm2 text-lapis">
              <button type="button" onClick={() => setVerCPF((v) => !v)} className="inline-flex items-center gap-1 font-mono hover:text-tinta" title={verCPF ? "Esconder CPF" : "Mostrar CPF"}>
                {verCPF ? formatarCPF(d.cpf) : mascararCPF(d.cpf)}
                {verCPF ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <span aria-hidden="true">·</span>
              <span>{carteira?.nome}</span>
            </p>
          </div>
          {onFechar && (
            <button type="button" onClick={onFechar} className="shrink-0 rounded-controle px-2 py-1 text-sm2 font-600 text-lapis hover:bg-ink-800 lg:hidden">Fechar</button>
          )}
        </div>
        <p className="mt-1.5 text-sm2 text-lapis">
          {dados.bloqueado ? <span className="font-600 text-margem">Não perturbe</span> : (ROTULO_SITUACAO[d.situacao] ?? d.situacao)}
          {d.responsavel && <> · com {d.responsavel.split(" ")[0]}</>}
        </p>
        <dl className="mt-4 grid grid-cols-[1fr_auto] gap-y-2 border-y border-pauta py-3 text-[0.9375rem]">
          <dt className="text-lapis">Dívida{d.ano ? ` (${d.ano})` : ""}</dt>
          <dd className="text-right font-mono tabnums">{brl(d.saldo)}</dd>
          {proposta && (
            <>
              <dt className="text-lapis">À vista ({descontoReal(d.saldo, proposta.valor) > 0 ? `${porcento(descontoReal(d.saldo, proposta.valor))} de desconto` : "sem desconto"})</dt>
              <dd className={cn("text-right font-mono font-600 tabnums", descontoReal(d.saldo, proposta.valor) > 0 && "text-pago")}>{brl(proposta.valor)}</dd>
            </>
          )}
          <dt className="text-lapis">Último contato</dt>
          <dd className="text-right font-mono text-sm2 tabnums">{d.ultimo_contato_em ? ha(d.ultimo_contato_em) : "nunca"}</dd>
          {dados.acordo && (
            <>
              <dt className="text-lapis">Acordo</dt>
              <dd className="text-right text-sm2">
                {dados.acordo.acordo_parcelas.filter((p) => p.status === "paga").length} de {dados.acordo.acordo_parcelas.length} pagas
              </dd>
            </>
          )}
        </dl>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {mensagens.length > 0 && (
          <section aria-label="Últimas mensagens" className="space-y-2">
            {/* Só o fim da conversa: o que importa é o que a pessoa disse por último. O resto está em "Conversa inteira". */}
            {mensagens.slice(leitura ? -1 : -2).map((m) => (
              <div key={m.id} className={cn("flex", m.direcao === "entrada" ? "justify-start" : "justify-end")}>
                <div className={cn(
                  "max-w-[88%] rounded-painel px-3 py-2 text-[0.9375rem] leading-6",
                  m.direcao === "entrada" ? "rounded-bl-[4px] border border-pauta bg-folha" : "rounded-br-[4px] bg-tinta-clara",
                )}>
                  <p className="whitespace-pre-wrap break-words">{m.conteudo}</p>
                  <p className="mt-1 font-mono text-meta text-lapis">
                    {margem(m.criado_em)}{m.direcao === "saida" ? ` · ${m.origem === "bot" ? "robô" : m.autor_nome ?? "equipe"}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </section>
        )}

        {leitura && ultimaEntrada && (
          <section className={cn("rounded-painel border p-3.5", leitura.sensivel ? "border-atencao/30 bg-atencao-fundo" : "border-pauta-forte bg-tinta-clara")}>
            <h3 className="text-sm2 font-700 text-tinta">O que a IA leu</h3>
            <p className="mt-1.5 text-[0.9375rem]">{leitura.rotulo}</p>
            {leitura.dataTexto && <p className="mt-1 font-mono text-sm2 font-600 text-tinta">{leitura.dataTexto}</p>}
            {podeOperar && conversa && !dados.bloqueado && (
              <div className="mt-3">
                <Label htmlFor="resposta" className="sr-only">Resposta</Label>
                <Textarea id="resposta" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva a resposta…" />
                {(leitura.intencao === "quer_pagar" || resultado) && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {leitura.intencao === "quer_pagar" && <PixBotao devedorId={d.id} valor={proposta?.valor ?? d.saldo} onFeito={(m) => setAviso({ tipo: "ok", msg: m })} />}
                    {resultado && (
                      <Button variant="ghost" onClick={async () => { if (await enviar()) setAviso({ tipo: "ok", msg: "Mensagem enviada. O resultado ainda não foi registrado." }); }} disabled={enviando || !texto.trim()}>
                        Só enviar
                      </Button>
                    )}
                  </div>
                )}
                <p className="mt-2 text-meta text-lapis">A IA só sugere: nada sai sem o seu clique.</p>
              </div>
            )}
          </section>
        )}

        {!leitura && podeOperar && conversa && !dados.bloqueado && (
          <section>
            <Label htmlFor="resposta">Mensagem</Label>
            <Textarea id="resposta" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={`Escreva para ${d.nome.split(" ")[0]}…`} />
            <div className="mt-2 flex gap-2">
              <Button variant="outline" onClick={() => enviar()} disabled={enviando || !texto.trim()}>{enviando ? "Enviando…" : "Enviar"}</Button>
            </div>
          </section>
        )}

        {aviso && (
          <p role="status" className={cn("rounded-controle px-3 py-2 text-sm2", aviso.tipo === "ok" ? "bg-pago-fundo text-pago" : "bg-margem-fundo text-margem")}>{aviso.msg}</p>
        )}

        {podeOperar && (
          <section id="resultado" aria-labelledby="titulo-resultado" className="rounded-painel border border-pauta bg-folha p-3.5">
            <h3 id="titulo-resultado" className="text-sm2 font-700 text-texto">Resultado do contato</h3>
            <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Resultado do contato">
              {chips.map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={resultado === r}
                  onClick={() => setResultado(r)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm2 font-600 transition-colors duration-150 [@media(pointer:coarse)]:py-2",
                    resultado === r ? "border-tinta bg-tinta text-sobre-tinta" : "border-pauta-forte bg-folha text-texto hover:border-tinta/50",
                  )}
                >
                  {RESULTADOS[r].rotulo}
                </button>
              ))}
              {!todos && (
                <button type="button" onClick={() => setTodos(true)} className="rounded-full px-3 py-1.5 text-sm2 font-600 text-tinta hover:bg-tinta-clara [@media(pointer:coarse)]:py-2">
                  Outro resultado…
                </button>
              )}
            </div>
            {resultado && (
              <div className="mt-3 space-y-3 animate-fade-up">
                {pedeData && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className={resultado === "promessa" ? "" : "col-span-2"}>
                      <Label htmlFor="quando">{resultado === "promessa" ? "Vai pagar em" : "Próximo contato"}</Label>
                      <Input id="quando" type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} />
                    </div>
                    {resultado === "promessa" && (
                      <div>
                        <Label htmlFor="valor">Valor (R$)</Label>
                        <Input id="valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
                      </div>
                    )}
                  </div>
                )}
                {quando && pedeData && <p className="text-meta text-lapis">Volta para a fila {prazo(deCampo(quando))}, no dia {dataCurta(deCampo(quando))}.</p>}
                {resultado === "nao_perturbe" && (
                  <p className="rounded-controle bg-margem-fundo px-3 py-2 text-sm2 text-margem">Esta pessoa não recebe mais nenhuma mensagem, de nenhum número.</p>
                )}
                <div>
                  <Label htmlFor="obs">Observação <span className="font-500 text-lapis">(opcional)</span></Label>
                  <Input id="obs" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: recebe dia 5, prefere de tarde" />
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      {/* Rodapé fixo: UMA ação leva adiante e fica sempre no mesmo lugar, sem rolar o painel. Com
          resposta escrita, ela envia, registra e avança; sem, só registra e avança. */}
      <div className="border-t border-pauta px-5 pb-3 pt-3">
        {podeOperar && (
          <>
            {/* Só o rótulo encolhe; o "trocar" fica sempre à vista */}
            <p className="mb-2 flex min-h-[1.25rem] items-baseline gap-1 text-meta text-lapis">
              {resultado ? (
                <>
                  <span className="min-w-0 truncate xl:whitespace-normal" title={`Registra ${rotuloRegistro}`}>Registra <span className="font-600 text-texto">{rotuloRegistro}</span></span>
                  <a href="#resultado" onClick={() => setTodos(true)} className="shrink-0 whitespace-nowrap font-600 text-tinta hover:underline">· trocar</a>
                </>
              ) : "Marque o resultado do contato para seguir."}
            </p>
            {rascunhoPendente ? (
              <Button size="lg" className="w-full" onClick={resultado ? enviarEIr : () => enviar()} disabled={enviando || gravando}>
                {enviando || gravando ? "Enviando…" : resultado ? (avanca ? <>Enviar e ir para o próximo <ArrowRight className="h-4 w-4" aria-hidden="true" /></> : "Enviar e registrar") : "Enviar resposta"}
              </Button>
            ) : (
              <Button size="lg" className="w-full" onClick={() => resultado && registrar(resultado)} disabled={!resultado || gravando}>
                {gravando ? "Registrando…" : avanca ? <>Registrar e ir para o próximo <ArrowRight className="h-4 w-4" aria-hidden="true" /></> : "Registrar"}
              </Button>
            )}
          </>
        )}
        <div className="mt-2 flex flex-wrap gap-x-2">
          <Link href={`/devedores/${d.id}`} className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-controle px-2 text-sm2 font-600 text-tinta hover:bg-tinta-clara">
            <ExternalLink className="h-4 w-4" aria-hidden="true" /> Ficha<span className="hidden xl:inline"> completa</span>
          </Link>
          {conversa && (
            <Link href={`/conversas?c=${conversa.id}`} className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-controle px-2 text-sm2 font-600 text-tinta hover:bg-tinta-clara">
              <MessageSquareText className="h-4 w-4" aria-hidden="true" /> Conversa<span className="hidden xl:inline"> inteira</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function PixBotao({ devedorId, valor, onFeito }: { devedorId: number; valor: number; onFeito: (m: string) => void }) {
  const [carregando, setCarregando] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={carregando}
      onClick={async () => {
        setCarregando(true);
        const r = await fetch(`/api/devedores/${devedorId}/pix`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valor }) });
        const j = await r.json().catch(() => ({}));
        setCarregando(false);
        onFeito(r.ok ? `Pix de ${brl(valor)} gerado${j?.copia_e_cola ? ". Código copia-e-cola pronto para colar na conversa." : "."}` : j?.erro ?? "Não foi possível gerar o Pix.");
        if (r.ok && j?.copia_e_cola) navigator.clipboard?.writeText(j.copia_e_cola).catch(() => {});
      }}
    >
      <QrCode className="h-4 w-4" aria-hidden="true" /> {carregando ? "Gerando…" : `Gerar Pix ${brl(valor)}`}
    </Button>
  );
}

export function EsqueletoFicha() {
  return (
    <div className="space-y-4 p-5" aria-busy="true" aria-label="Carregando ficha">
      <div className="h-6 w-2/3 animate-pulse rounded bg-ink-700" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-ink-800" />
      <div className="h-24 animate-pulse rounded-painel bg-ink-800" />
      <div className="h-16 w-4/5 animate-pulse rounded-painel bg-ink-800" />
      <div className="h-32 animate-pulse rounded-painel bg-ink-800" />
    </div>
  );
}

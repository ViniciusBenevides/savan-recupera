"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen, Rocket, Compass, ListChecks, LayoutGrid, Headphones, Scale,
  LifeBuoy, ShieldCheck, Search, ChevronDown, ArrowUp, Sparkles, X,
  Radio, Smartphone, MessageSquareText, Percent, Users, HandCoins, BarChart3,
  Settings, FolderUp, LayoutDashboard, KeyRound, Clock, Send, QrCode,
  AlertTriangle, CheckCircle2, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Conteúdo                                                           */
/* ------------------------------------------------------------------ */

type Sec = { id: string; title: string; icon: any; tag?: string; keywords: string };

const SECTIONS: Sec[] = [
  { id: "intro", title: "O que é a plataforma", icon: BookOpen, tag: "Comece aqui", keywords: "o que é whatsapp recuperação crédito robô pix quitação desconto fluxo" },
  { id: "acesso", title: "Primeiro acesso", icon: KeyRound, keywords: "login senha tema claro escuro perfis admin operador visualizador usuário" },
  { id: "conceitos", title: "Conceitos rápidos", icon: Compass, keywords: "carteira chip campanha simulação fila follow-up aquecimento glossário" },
  { id: "golive", title: "Como colocar no ar", icon: Rocket, tag: "Passo a passo", keywords: "go-live chaves openai asaas chips qr carteira modelo planilha simulação ativar ordem" },
  { id: "telas", title: "Tela por tela", icon: LayoutGrid, keywords: "visão geral carteiras campanha chips mensagens descontos devedores pagamentos relatórios configurações conta" },
  { id: "humano", title: "Atendimento humano", icon: Headphones, keywords: "escalar humano chatwoot atendente contestação advogado label nota" },
  { id: "regras", title: "Regras jurídicas", icon: Scale, tag: "Importante", keywords: "jurídico prescrição serasa lgpd identidade janela horário contrato dpa nunca ameaça" },
  { id: "problemas", title: "Problemas comuns", icon: LifeBuoy, keywords: "robô não responde nada enviado qr não aparece chatwoot webhook asaas pagamento" },
  { id: "seguranca", title: "Segurança & limites", icon: ShieldCheck, keywords: "segurança login chaves planilha simulação aquecimento usuários" },
];

const CONCEITOS = [
  { icon: FolderUp, t: "Carteira", d: "Um conjunto de devedores (uma planilha importada). Você pode ter várias, cada uma com regras próprias." },
  { icon: Smartphone, t: "Chip", d: "Um número de WhatsApp (Salvy + Z‑API) por onde o robô conversa." },
  { icon: Radio, t: "Campanha", d: "A “chave geral” que liga e desliga os disparos de toda a operação." },
  { icon: Sparkles, t: "Modo simulação", d: "Roda todo o fluxo sem enviar mensagem de verdade — para testar com segurança." },
  { icon: ListChecks, t: "Fila", d: "Os devedores que ainda aguardam o primeiro contato." },
  { icon: Clock, t: "Follow‑up", d: "Reenvio automático para quem não respondeu (até 3 vezes)." },
  { icon: Rocket, t: "Aquecimento", d: "Subida gradual do volume por chip: 30 → 100 → 250 → 400 → 500/dia em 30 dias." },
];

const GOLIVE = [
  { icon: KeyRound, t: "Chaves", d: "Configurações → Chaves: preencha a OPENAI_API_KEY (sem ela o robô não responde) e, no go‑live real, a chave de produção do Asaas." },
  { icon: QrCode, t: "Chips", d: "Chips → Novo chip: leia o QR Code com o WhatsApp do número. Ao conectar, ele entra como “aquecendo” e vira “ativo” sozinho." },
  { icon: FolderUp, t: "Carteira", d: "Carteiras → Nova: baixe o modelo de planilha, preencha, suba e veja o relatório. A carteira nasce Pausada." },
  { icon: MessageSquareText, t: "Mensagens e Descontos", d: "Ajuste os textos das mensagens e as faixas de desconto (pode ser por carteira)." },
  { icon: Sparkles, t: "Simulação", d: "Campanha → ligue com o Modo simulação LIGADO e confira o fluxo rodando sem enviar nada." },
  { icon: Send, t: "Ativar de verdade", d: "Ative a carteira e, quando estiver tudo certo, desligue o Modo simulação. A partir daí é envio real (8h–20h)." },
];

const TELAS = [
  { icon: LayoutDashboard, n: "Visão geral", d: "Página inicial: cartões com os números do dia, o funil (enviados → respostas → acordos → pagos) e um feed ao vivo dos pagamentos. É o seu raio‑x diário." },
  { icon: FolderUp, n: "Carteiras", d: "Suas carteiras com status (Importando / Ativa / Pausada / Arquivada), nº de devedores e saldo. Ao abrir, há abas: Status & envios, Prompt do robô, Descontos e Importações. Só carteiras Ativas disparam." },
  { icon: Radio, n: "Campanha", d: "A chave gigante liga/desliga toda a operação. Aqui ficam também o Modo simulação, a janela de envio (8h–20h), o intervalo mínimo entre mensagens (12s) e o aquecimento." },
  { icon: Smartphone, n: "Chips", d: "Cartões dos números. Novo chip → leia o QR. Se o QR não aparecer, a tela explica o motivo (ex.: assinatura Z‑API vencida). O menu ⋮ permite editar (tokens) e excluir o chip." },
  { icon: MessageSquareText, n: "Mensagens", d: "Modelos de mensagem (abertura, follow‑ups) com pré‑visualização. Use as variáveis do modelo — nunca escreva o valor da dívida fixo no texto; o robô calcula." },
  { icon: Percent, n: "Descontos", d: "Editor das faixas por idade da dívida (15+ anos→60%, 10+→50%, 5+→40%, abaixo→30%) + a margem extra única (+10pp) e um simulador. Pode ser sobrescrito por carteira." },
  { icon: Users, n: "Devedores", d: "Busca e lista de devedores, com filtro por carteira e coluna de resposta. Ao abrir um devedor, você vê a linha do tempo (mensagens, proposta, Pix, pagamento)." },
  { icon: HandCoins, n: "Pagamentos", d: "Lista dos Pix gerados e seu status (gerado / pago). Atualiza ao vivo quando alguém paga." },
  { icon: BarChart3, n: "Relatórios", d: "Gráficos de recuperação e desempenho ao longo do tempo." },
  { icon: Settings, n: "Configurações", d: "Asaas (sandbox/produção), Chaves/segredos (OpenAI, Asaas) e Usuários (criar usuário, trocar papel). Só Admin vê tudo aqui." },
];

const PROBLEMAS = [
  { s: "O robô não responde as mensagens", c: "Falta a OPENAI_API_KEY em Configurações → Chaves." },
  { s: "Nada é enviado", c: "Campanha desligada, carteira não‑Ativa, Modo simulação ligado, fora da janela 8h–20h, ou chip sem limite (aquecimento)." },
  { s: "O QR Code não aparece", c: "A tela do chip mostra o motivo (ex.: assinatura Z‑API vencida). Resolva e clique em “tentar de novo”." },
  { s: "“Chatwoot não vinculado” no chip", c: "Use a opção de revincular o número no cartão do chip." },
  { s: "Mensagens recebidas não chegam ao robô", c: "O webhook do Chatwoot precisa apontar para o n8n (/webhook/savan-bot)." },
  { s: "Pagamento não confirma", c: "O webhook do Asaas precisa apontar para a função webhook‑asaas." },
];

const PERFIS = [
  { nome: "Admin", tone: "green" as const, d: "Faz tudo, inclusive criar usuários e mexer em chaves/segredos." },
  { nome: "Operador", tone: "blue" as const, d: "Opera campanha, chips, mensagens e descontos." },
  { nome: "Visualizador", tone: "neutral" as const, d: "Só lê (relatórios, devedores); não altera nada." },
];

/* ------------------------------------------------------------------ */
/*  Subcomponentes                                                     */
/* ------------------------------------------------------------------ */

function Section({ id, title, icon: Icon, tag, children, index }: {
  id: string; title: string; icon: any; tag?: string; children: React.ReactNode; index: number;
}) {
  return (
    <section
      id={id}
      data-doc-section
      className="scroll-mt-24 animate-fade-up"
      style={{ animationDelay: `${Math.min(index, 6) * 50}ms` }}
    >
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-emerald/25 bg-emerald/10 text-emerald">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <h2 className="font-display text-xl font-700 tracking-tight text-chalk">{title}</h2>
        {tag && (
          <span className="rounded-full border border-line bg-ink-800 px-2.5 py-0.5 text-[11px] font-medium text-mist">
            {tag}
          </span>
        )}
      </div>
      <div className="card-surface grain relative overflow-hidden p-5 sm:p-6">{children}</div>
    </section>
  );
}

function Callout({ tone = "amber", title, children }: {
  tone?: "amber" | "rose" | "emerald"; title: string; children: React.ReactNode;
}) {
  const tones = {
    amber: "border-amber/30 bg-amber/8 text-amber",
    rose: "border-rose/30 bg-rose/8 text-rose",
    emerald: "border-emerald/30 bg-emerald/8 text-emerald",
  };
  return (
    <div className={cn("rounded-2xl border p-4", tones[tone])}>
      <div className="mb-1 flex items-center gap-2 font-display text-sm font-700">
        <AlertTriangle className="h-4 w-4" /> {title}
      </div>
      <div className="text-sm leading-relaxed text-chalk/90">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Página                                                             */
/* ------------------------------------------------------------------ */

export default function AjudaPage() {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string>(SECTIONS[0].id);
  const [progress, setProgress] = useState(0);
  const [showTop, setShowTop] = useState(false);
  const [openTela, setOpenTela] = useState<number | null>(0);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!q) return SECTIONS;
    return SECTIONS.filter(
      (s) => s.title.toLowerCase().includes(q) || s.keywords.toLowerCase().includes(q),
    );
  }, [q]);
  const visibleIds = visible.map((s) => s.id).join(",");

  // barra de progresso de leitura + botão voltar ao topo
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setProgress(max > 0 ? (h.scrollTop / max) * 100 : 0);
      setShowTop(h.scrollTop > 600);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // scroll-spy: destaca a seção ativa no índice
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-doc-section]"));
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-12% 0px -70% 0px", threshold: 0.01 },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [visibleIds]);

  function goto(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div>
      {/* barra de progresso */}
      <div className="fixed left-0 top-0 z-50 h-0.5 w-full bg-transparent">
        <div
          className="h-full bg-emerald transition-[width] duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* HERO */}
      <header className="relative mb-8 overflow-hidden rounded-3xl border border-line bg-ink-900/70 p-7 sm:p-9">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-60 blur-3xl"
          style={{ background: "radial-gradient(circle, rgb(var(--c-emerald) / 0.18), transparent 70%)" }}
        />
        <div className="relative">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald/25 bg-emerald/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald">
            <BookOpen className="h-3.5 w-3.5" /> Central de Ajuda
          </div>
          <h1 className="max-w-2xl font-display text-3xl font-800 leading-tight tracking-tight text-chalk sm:text-4xl">
            Como usar a plataforma, do zero ao primeiro Pix.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-mist">
            Um guia direto e sem tecniquês. Use a busca ou o índice ao lado para pular
            para o que você precisa.
          </p>

          {/* busca */}
          <div className="relative mt-6 max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-mist" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar no manual… (ex.: QR, simulação, desconto)"
              className="h-11 w-full rounded-xl border border-line bg-ink-850 pl-10 pr-10 text-sm text-chalk placeholder:text-mist/60 outline-none transition-colors focus:border-emerald/60 focus:ring-2 focus:ring-emerald/15"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-mist hover:text-chalk"
                aria-label="Limpar busca"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* chips de atalho */}
          <div className="mt-4 flex flex-wrap gap-2">
            {SECTIONS.slice(0, 6).map((s) => (
              <button
                key={s.id}
                onClick={() => { setQuery(""); goto(s.id); }}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-ink-850 px-3 py-1.5 text-xs text-mist transition-colors hover:border-emerald/40 hover:text-chalk"
              >
                <s.icon className="h-3.5 w-3.5" /> {s.title}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex gap-8">
        {/* ÍNDICE (sticky) */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-7">
            <div className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-mist">
              Neste guia
            </div>
            <nav className="flex flex-col gap-0.5">
              {SECTIONS.map((s) => {
                const dimmed = q && !visible.includes(s);
                const isActive = active === s.id && !dimmed;
                return (
                  <button
                    key={s.id}
                    onClick={() => goto(s.id)}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-all",
                      isActive ? "bg-ink-800 text-chalk" : "text-mist hover:bg-ink-850 hover:text-chalk",
                      dimmed && "opacity-35",
                    )}
                  >
                    <s.icon className={cn("h-4 w-4", isActive ? "text-emerald" : "text-mist group-hover:text-chalk")} />
                    <span className="truncate">{s.title}</span>
                    {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald animate-pulseglow" />}
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* CONTEÚDO */}
        <div className="min-w-0 flex-1 space-y-10">
          {q && visible.length === 0 && (
            <div className="card-surface p-8 text-center text-sm text-mist">
              Nada encontrado para <span className="text-chalk">“{query}”</span>. Tente outra palavra.
            </div>
          )}

          {/* intro */}
          {visible.some((s) => s.id === "intro") && (
            <Section id="intro" title="O que é a plataforma" icon={BookOpen} tag="Comece aqui" index={0}>
              <p className="text-sm leading-relaxed text-chalk/90">
                A plataforma faz <strong className="text-chalk">recuperação de crédito por WhatsApp</strong> de
                forma automática. Você controla tudo pelo painel; <strong className="text-chalk">o robô roda
                sozinho</strong> depois de configurado.
              </p>
              <ol className="mt-5 grid gap-3 sm:grid-cols-5">
                {[
                  { n: "1", t: "Sobe a planilha", d: "Vira uma carteira de devedores." },
                  { n: "2", t: "Robô aborda", d: "Confirma identidade e oferece quitação com desconto." },
                  { n: "3", t: "Gera o Pix", d: "Com repasse automático 90% credor / 10% comissão." },
                  { n: "4", t: "Confirma", d: "Quem paga recebe termo de quitação." },
                  { n: "5", t: "Follow‑up", d: "Sem resposta? Reengaja; casos delicados vão a humano." },
                ].map((p, i) => (
                  <li key={p.n} className="relative rounded-2xl border border-line bg-ink-850 p-4">
                    <span className="font-mono text-xs text-emerald">{p.n}</span>
                    <div className="mt-1 font-display text-sm font-700 text-chalk">{p.t}</div>
                    <div className="mt-1 text-xs leading-snug text-mist">{p.d}</div>
                    {i < 4 && <ArrowRight className="absolute -right-2.5 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-line sm:block" />}
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {/* acesso */}
          {visible.some((s) => s.id === "acesso") && (
            <Section id="acesso" title="Primeiro acesso" icon={KeyRound} index={1}>
              <ol className="space-y-2.5 text-sm text-chalk/90">
                <li className="flex gap-3"><Dot /> Abra a URL do painel e faça login com o e‑mail e a senha que você recebeu.</li>
                <li className="flex gap-3"><Dot /> Clique no seu <strong className="text-chalk">nome</strong> (canto inferior esquerdo) → <strong className="text-chalk">Minha conta</strong> → troque a senha.</li>
                <li className="flex gap-3"><Dot /> No rodapé da barra lateral há o <strong className="text-chalk">botão de tema</strong> ☀️/🌙 — escolha o que preferir; fica salvo.</li>
              </ol>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {PERFIS.map((p) => (
                  <div key={p.nome} className="rounded-2xl border border-line bg-ink-850 p-4">
                    <span className={cn(
                      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                      p.tone === "green" && "border-emerald/25 bg-emerald/12 text-emerald-soft",
                      p.tone === "blue" && "border-blue/25 bg-blue/12 text-blue",
                      p.tone === "neutral" && "border-line bg-ink-700 text-mist",
                    )}>{p.nome}</span>
                    <p className="mt-2 text-xs leading-snug text-mist">{p.d}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* conceitos */}
          {visible.some((s) => s.id === "conceitos") && (
            <Section id="conceitos" title="Conceitos rápidos" icon={Compass} index={2}>
              <div className="grid gap-3 sm:grid-cols-2">
                {CONCEITOS.map((c) => (
                  <div key={c.t} className="flex gap-3 rounded-2xl border border-line bg-ink-850 p-4">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-800 text-emerald">
                      <c.icon className="h-[18px] w-[18px]" />
                    </span>
                    <div>
                      <div className="font-display text-sm font-700 text-chalk">{c.t}</div>
                      <div className="mt-0.5 text-xs leading-snug text-mist">{c.d}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* golive */}
          {visible.some((s) => s.id === "golive") && (
            <Section id="golive" title="Como colocar no ar" icon={Rocket} tag="Passo a passo" index={3}>
              <p className="mb-5 text-sm text-mist">Faça <strong className="text-chalk">nesta ordem</strong>. Cada item é uma tela da barra lateral.</p>
              <ol className="relative space-y-4 border-l border-line pl-6">
                {GOLIVE.map((g, i) => (
                  <li key={g.t} className="relative">
                    <span className="absolute -left-[31px] grid h-6 w-6 place-items-center rounded-full border border-emerald/30 bg-ink-900 font-mono text-[11px] text-emerald">
                      {i + 1}
                    </span>
                    <div className="flex items-center gap-2 font-display text-sm font-700 text-chalk">
                      <g.icon className="h-4 w-4 text-emerald" /> {g.t}
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-mist">{g.d}</p>
                  </li>
                ))}
              </ol>
              <div className="mt-5">
                <Callout tone="emerald" title="A regra de ouro do envio">
                  Só sai mensagem real com a campanha <strong>ligada</strong>, a carteira <strong>Ativa</strong> e
                  o Modo simulação <strong>desligado</strong> — tudo dentro da janela 8h–20h. Qualquer um desligado = nada é enviado.
                </Callout>
              </div>
            </Section>
          )}

          {/* telas */}
          {visible.some((s) => s.id === "telas") && (
            <Section id="telas" title="Tela por tela" icon={LayoutGrid} index={4}>
              <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
                {TELAS.map((t, i) => {
                  const open = openTela === i;
                  return (
                    <div key={t.n} className="bg-ink-850">
                      <button
                        onClick={() => setOpenTela(open ? null : i)}
                        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-ink-800"
                      >
                        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors", open ? "bg-emerald/15 text-emerald" : "bg-ink-800 text-mist")}>
                          <t.icon className="h-4 w-4" />
                        </span>
                        <span className="font-display text-sm font-700 text-chalk">{t.n}</span>
                        <ChevronDown className={cn("ml-auto h-4 w-4 text-mist transition-transform", open && "rotate-180 text-emerald")} />
                      </button>
                      <div className={cn("grid transition-all duration-300", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                        <div className="overflow-hidden">
                          <p className="px-4 pb-4 pl-[3.75rem] text-sm leading-relaxed text-mist">{t.d}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-mist">Dica: clique no seu nome na barra lateral para abrir <strong className="text-chalk">Minha conta</strong> (nome, e‑mail e senha).</p>
            </Section>
          )}

          {/* humano */}
          {visible.some((s) => s.id === "humano") && (
            <Section id="humano" title="Atendimento humano" icon={Headphones} index={5}>
              <p className="text-sm leading-relaxed text-chalk/90">
                O robô <strong className="text-chalk">escala para humano</strong> sozinho em casos delicados
                (a pessoa contesta a dívida, fala em advogado, fica hostil, ou faz uma pergunta complexa).
                Quando isso acontece, a conversa recebe a etiqueta <span className="font-mono text-emerald">escalado‑humano</span> e
                uma <strong className="text-chalk">nota interna</strong> com o motivo — e o atendimento continua direto no Chatwoot.
              </p>
              <Callout tone="emerald" title="Boa prática">
                Deixe o Chatwoot aberto e filtre pelas conversas com a etiqueta <span className="font-mono">escalado‑humano</span> para
                assumir rápido quando o robô passar o bastão.
              </Callout>
            </Section>
          )}

          {/* regras */}
          {visible.some((s) => s.id === "regras") && (
            <Section id="regras" title="Regras que o robô nunca quebra" icon={Scale} tag="Importante" index={6}>
              <ul className="space-y-2.5 text-sm text-chalk/90">
                <li className="flex gap-3"><X className="mt-0.5 h-4 w-4 shrink-0 text-rose" /> Nunca ameaça ação judicial; nunca cita Serasa/SPC/negativação/score.</li>
                <li className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald" /> Enquadra sempre como quitação voluntária / encerramento com termo.</li>
                <li className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald" /> Se perguntarem sobre prescrição, responde com honestidade (dívida antiga, pode estar prescrita, pagamento é voluntário).</li>
                <li className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald" /> Confirma a identidade antes de revelar CPF/valor.</li>
                <li className="flex gap-3"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-emerald" /> Envia só das 8h às 20h (horário de São Paulo), com intervalo mínimo entre mensagens.</li>
              </ul>
              <div className="mt-5">
                <Callout tone="rose" title="Bloqueante legal">
                  Só dispare de verdade depois do <strong>contrato de cobrança</strong> + <strong>DPA (LGPD)</strong> assinados com o credor.
                </Callout>
              </div>
            </Section>
          )}

          {/* problemas */}
          {visible.some((s) => s.id === "problemas") && (
            <Section id="problemas" title="Problemas comuns" icon={LifeBuoy} index={7}>
              <div className="space-y-2.5">
                {PROBLEMAS.map((p) => (
                  <div key={p.s} className="grid gap-1 rounded-2xl border border-line bg-ink-850 p-4 sm:grid-cols-[minmax(0,38%)_1fr] sm:gap-4">
                    <div className="flex items-start gap-2 font-display text-sm font-700 text-chalk">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" /> {p.s}
                    </div>
                    <div className="text-sm leading-relaxed text-mist">{p.c}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* seguranca */}
          {visible.some((s) => s.id === "seguranca") && (
            <Section id="seguranca" title="Segurança & limites" icon={ShieldCheck} index={8}>
              <ul className="space-y-2.5 text-sm text-chalk/90">
                <li className="flex gap-3"><Dot /> Não compartilhe seu login. Crie um usuário por pessoa (Configurações → Usuários) com o papel certo.</li>
                <li className="flex gap-3"><Dot /> As chaves (OpenAI, Asaas) e a planilha real nunca saem do ambiente seguro — não as cole em chat, e‑mail ou prints.</li>
                <li className="flex gap-3"><Dot /> Comece sempre com Modo simulação e poucos chips; deixe o aquecimento subir o volume.</li>
              </ul>
            </Section>
          )}

          <footer className="border-t border-line pt-6 text-xs text-mist">
            Precisa de mais detalhes técnicos? Fale com quem implantou — há documentação de
            arquitetura e dos fluxos n8n no repositório do projeto.
          </footer>
        </div>
      </div>

      {/* voltar ao topo */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className={cn(
          "fixed bottom-6 right-6 z-40 grid h-11 w-11 place-items-center rounded-full border border-line bg-ink-800 text-chalk shadow-xl transition-all hover:border-emerald/40 hover:text-emerald",
          showTop ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
        )}
        aria-label="Voltar ao topo"
      >
        <ArrowUp className="h-5 w-5" />
      </button>
    </div>
  );
}

function Dot() {
  return <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald" />;
}

import { supabaseServer } from "@/lib/supabase-server";
import { Card, Badge } from "@/components/ui/primitives";
import { FileBadge, CheckCircle2, Clock, XCircle, ArrowRight } from "lucide-react";
import type { Sessao } from "@/lib/auth";
import { MetaTemplates } from "./meta-templates";

/**
 * Aba "Modelos" — os templates que a Meta precisa aprovar.
 *
 * Saiu de dentro de Integrações porque não é uma chave de API que se cola uma vez: é uma fila de
 * aprovação que se acompanha. Enquanto o modelo da abordagem não sai de "em análise", a campanha
 * não dispara — então isto merece uma aba onde dê para bater o olho e saber se está liberado.
 *
 * O bloco de cima é o que faltava em lugar nenhum: qual modelo cada etapa do funil usa de verdade,
 * com o status ao lado. Sem ele, saber se a campanha ia sair exigia ler o banco.
 */

const STATUS: Record<string, { tone: any; label: string; Icon: any }> = {
  APPROVED: { tone: "green", label: "Aprovado", Icon: CheckCircle2 },
  PENDING: { tone: "amber", label: "Em análise", Icon: Clock },
  IN_APPEAL: { tone: "amber", label: "Em recurso", Icon: Clock },
  REJECTED: { tone: "rose", label: "Recusado", Icon: XCircle },
  PAUSED: { tone: "rose", label: "Pausado", Icon: XCircle },
  DISABLED: { tone: "rose", label: "Desativado", Icon: XCircle },
};

// A Meta reclassifica sozinha: marketing custa ~5x mais que utility por mensagem iniciada.
const CATEGORIA: Record<string, { tone: any; nota: string }> = {
  UTILITY: { tone: "blue", nota: "tarifa de utilidade" },
  MARKETING: { tone: "amber", nota: "tarifa de marketing (~5x mais cara)" },
  AUTHENTICATION: { tone: "neutral", nota: "tarifa de autenticação" },
};

type Etapa = { rotulo: string; descricao: string; ref: any };

function Linha({ etapa, achado }: { etapa: Etapa; achado: any }) {
  const nome = String(etapa.ref?.name ?? "").trim();
  const st = achado ? (STATUS[achado.status] ?? { tone: "neutral", label: achado.status, Icon: Clock }) : null;
  const cat = achado ? CATEGORIA[achado.category] ?? null : null;
  const Icon = st?.Icon ?? XCircle;

  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5 border-b border-line/60 py-2.5 last:border-0">
      <div className="min-w-[9rem]">
        <div className="text-sm font-medium text-chalk">{etapa.rotulo}</div>
        <div className="text-[11px] text-mist">{etapa.descricao}</div>
      </div>
      <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-mist/50" />
      <div className="min-w-0 flex-1">
        {nome
          ? <span className="font-mono text-xs text-chalk">{nome}</span>
          : <span className="text-xs italic text-rose">nenhum modelo configurado</span>}
        {nome && !achado && (
          <div className="mt-0.5 text-[11px] text-rose">
            Não encontrado nesta conta da Meta — confira o nome ou crie o modelo abaixo.
          </div>
        )}
        {cat && cat.tone === "amber" && (
          <div className="mt-0.5 text-[11px] text-amber">{cat.nota}</div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {achado && <Badge tone={cat?.tone ?? "neutral"}>{achado.category}</Badge>}
        {st && <Badge tone={st.tone}><Icon className="h-3 w-3" /> {st.label}</Badge>}
      </div>
    </div>
  );
}

export async function Modelos({ sessao }: { sessao: Sessao }) {
  const sb = await supabaseServer();
  const [{ data: cfgs }, { data: cache }] = await Promise.all([
    sb.from("configuracoes").select("chave, valor")
      .in("chave", ["meta_abordagem_template", "meta_followup_templates"]).is("cobrador_id", null),
    sb.from("meta_templates").select("name, language, status, category"),
  ]);

  const porChave = new Map((cfgs ?? []).map((c: any) => [c.chave, c.valor]));
  const abordagem = porChave.get("meta_abordagem_template") ?? null;
  const followups: any[] = Array.isArray((porChave.get("meta_followup_templates") as any)?.lista)
    ? (porChave.get("meta_followup_templates") as any).lista
    : [];

  const achar = (ref: any) => {
    const nome = String(ref?.name ?? "").trim();
    if (!nome) return null;
    const lang = String(ref?.language ?? "pt_BR");
    return (cache ?? []).find((t: any) => t.name === nome && t.language === lang) ?? null;
  };

  const etapas: Etapa[] = [
    { rotulo: "Abordagem", descricao: "1ª mensagem, abre a conversa", ref: abordagem },
    ...followups.map((ref, i) => ({
      rotulo: `Reenvio ${i + 1}`,
      descricao: "para quem não respondeu",
      ref,
    })),
  ];

  const bloqueada = etapas.some((e) => {
    const a = achar(e.ref);
    return !a || a.status !== "APPROVED";
  });

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-blue/25 bg-blue/5">
        <h3 className="flex items-center gap-2 font-display text-base font-600 text-chalk">
          <FileBadge className="h-4 w-4 text-blue" /> Por que estes modelos existem
        </h3>
        <p className="mt-1.5 text-sm text-mist">
          O texto do disparo de cada carteira vive no fluxo dela. Mas para{" "}
          <b className="text-chalk">iniciar</b> uma conversa pela{" "}
          <b className="text-chalk">API oficial do WhatsApp</b>, a Meta só aceita um modelo{" "}
          <b className="text-chalk">aprovado por ela</b>, palavra por palavra — e a aprovação é por
          conta/número, não por carteira. Depois que a pessoa responde, a conversa segue livre por
          24h e volta a seguir o fluxo da carteira.
        </p>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-base font-600 text-chalk">O que a campanha usa</h3>
          {bloqueada
            ? <Badge tone="amber"><Clock className="h-3 w-3" /> Campanha travada até a Meta aprovar</Badge>
            : <Badge tone="green"><CheckCircle2 className="h-3 w-3" /> Tudo aprovado</Badge>}
        </div>
        <p className="mt-1 text-xs text-mist">
          Cada etapa do funil aponta para um modelo. Enquanto algum não estiver{" "}
          <b className="text-chalk">aprovado</b>, a campanha pula aquele envio em vez de mandar texto
          livre (que a Meta recusaria). A conferência com a Meta é automática, a cada 15 minutos.
        </p>
        <div className="mt-3">
          {etapas.map((e, i) => <Linha key={i} etapa={e} achado={achar(e.ref)} />)}
        </div>
      </Card>

      <MetaTemplates conta={null} />
    </div>
  );
}

import { NextResponse } from "next/server";
import { exigirEscopoConta } from "@/lib/auth";
import { getSegredo } from "@/lib/segredos";
import {
  CATALOGO_MODELOS, ModeloCatalogo, recomendar, ehModeloChat,
} from "@/lib/ia/modelos-catalogo";

// GET /api/ia/modelos[?conta=<uuid>]
// Lista os modelos de chat que a conta da OpenAI (do escopo) acessa, cruzados com o
// catálogo curado (preço + notas), e devolve as recomendações de "custo-benefício" e
// "melhor para cobrança". Escopo: cobrador → a chave dele (cai na global); admin → global,
// ou a conta de um cobrador via ?conta=.
export async function GET(req: Request) {
  const conta = new URL(req.url).searchParams.get("conta");
  const g = await exigirEscopoConta(conta);
  if (g.erro) return g.erro;

  const apiKey = await getSegredo("OPENAI_API_KEY", g.escopo.cobradorId);

  // Sem chave: não dá para confirmar acesso — devolve o catálogo de referência.
  if (!apiKey) {
    return NextResponse.json(respostaCatalogo(
      "Sem chave da OpenAI nesta conta — mostrando o catálogo de referência. Salve a OPENAI_API_KEY (acima) para confirmar exatamente os modelos que sua conta acessa.",
    ));
  }

  // Lista os modelos que a conta acessa.
  let idsConta: string[] | null = null;
  try {
    const r = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (r.ok) {
      const data = await r.json();
      idsConta = (data?.data ?? [])
        .map((m: any) => m?.id)
        .filter((id: any): id is string => typeof id === "string");
    }
  } catch {
    /* rede/serviço fora — cai no fallback abaixo */
  }

  if (!idsConta) {
    return NextResponse.json(respostaCatalogo(
      "Não consegui listar os modelos na OpenAI agora (chave inválida ou serviço fora). Mostrando o catálogo de referência.",
    ));
  }

  const setConta = new Set(idsConta);
  const idsCatalogo = new Set(CATALOGO_MODELOS.map((m) => m.id));

  // 1) modelos do catálogo, marcando se a conta acessa
  const catalogados = CATALOGO_MODELOS.map((m) => ({
    ...info(m), disponivel: setConta.has(m.id), catalogado: true,
  }));
  // 2) outros modelos de chat da conta que não estão no catálogo (sem preço/notas)
  const extras = idsConta
    .filter((id) => ehModeloChat(id) && !idsCatalogo.has(id))
    .sort()
    .map((id) => ({
      id, label: id,
      descricao: "Disponível na sua conta (sem dados de preço no catálogo de referência).",
      entrada: null, saida: null, inteligencia: null, cobranca: null,
      disponivel: true, catalogado: false,
    }));

  const idsDisp = CATALOGO_MODELOS.filter((m) => setConta.has(m.id)).map((m) => m.id);
  return NextResponse.json({
    modelos: [...catalogados, ...extras],
    recomendacoes: recomendar(idsDisp),
    fonte: "openai",
  });
}

function info(m: ModeloCatalogo) {
  return {
    id: m.id, label: m.label, descricao: m.descricao,
    entrada: m.entrada, saida: m.saida,
    inteligencia: m.inteligencia, cobranca: m.cobranca,
  };
}

function respostaCatalogo(aviso: string) {
  return {
    modelos: CATALOGO_MODELOS.map((m) => ({ ...info(m), disponivel: true, catalogado: true })),
    recomendacoes: recomendar(CATALOGO_MODELOS.map((m) => m.id)),
    fonte: "catalogo" as const,
    aviso,
  };
}

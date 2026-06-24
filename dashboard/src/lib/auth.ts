import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";

// Papéis da hierarquia (ver migration 019/020):
//  admin        — plataforma (único). Vê tudo de todos, com atribuição.
//  cobrador      — operador. Vê/edita só o que é dele (suas carteiras/chips/chaves).
//  credor        — dono da(s) carteira(s). Só leitura do andamento das suas carteiras.
//  visualizador  — só leitura, escopo de um cobrador (tenant).
export type Papel = "admin" | "cobrador" | "credor" | "visualizador";

export const PAPEIS: Papel[] = ["admin", "cobrador", "credor", "visualizador"];
export const podeEscrever = (role: Papel) => role === "admin" || role === "cobrador";

export type Sessao = {
  user: User;
  role: Papel;
  cobrador_id: string | null;
  // "tenant" do usuário: cobrador => próprio id; credor/visualizador => cobrador_id; admin => null
  tenant: string | null;
};

const negar = (msg: string, status: number) => NextResponse.json({ erro: msg }, { status });

// Lê a sessão + papel + vínculo de tenant. Retorna null se não autenticado.
export async function getSessao(): Promise<Sessao | null> {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from("usuarios_app").select("role, cobrador_id").eq("id", user.id).maybeSingle();
  const role = (data?.role ?? "visualizador") as Papel;
  const cobrador_id = (data?.cobrador_id ?? null) as string | null;
  const tenant = role === "cobrador" ? user.id : cobrador_id;
  return { user, role, cobrador_id, tenant };
}

type Guard = { erro: NextResponse; sessao?: undefined } | { erro?: undefined; sessao: Sessao };

// Exige apenas autenticação.
export async function exigirSessao(): Promise<Guard> {
  const sessao = await getSessao();
  if (!sessao) return { erro: negar("nao_autenticado", 401) };
  return { sessao };
}

// Exige o admin da plataforma (chaves globais, config global, gestão geral).
export async function exigirAdmin(): Promise<Guard> {
  const sessao = await getSessao();
  if (!sessao) return { erro: negar("nao_autenticado", 401) };
  if (sessao.role !== "admin") return { erro: negar("sem_permissao", 403) };
  return { sessao };
}

// Exige quem pode operar/escrever: admin ou cobrador.
export async function exigirCobrador(): Promise<Guard> {
  const sessao = await getSessao();
  if (!sessao) return { erro: negar("nao_autenticado", 401) };
  if (!podeEscrever(sessao.role)) return { erro: negar("sem_permissao", 403) };
  return { sessao };
}

// admin sempre pode; cobrador só na carteira dele. (credor/visualizador nunca escrevem.)
export async function podeEditarCarteira(sessao: Sessao, carteiraId: number): Promise<boolean> {
  if (sessao.role === "admin") return true;
  if (sessao.role !== "cobrador") return false;
  const { data } = await supabaseAdmin().from("carteiras").select("cobrador_id").eq("id", carteiraId).maybeSingle();
  return !!data && data.cobrador_id === sessao.user.id;
}

// admin sempre pode; cobrador só no chip dele.
export async function podeEditarChip(sessao: Sessao, chipId: number): Promise<boolean> {
  if (sessao.role === "admin") return true;
  if (sessao.role !== "cobrador") return false;
  const { data } = await supabaseAdmin().from("chips").select("cobrador_id").eq("id", chipId).maybeSingle();
  return !!data && data.cobrador_id === sessao.user.id;
}

export const erroDono = () => negar("sem_permissao_neste_recurso", 403);

// ---------------------------------------------------------------------------
// Escopo "por conta" das telas/ajustes do cobrador (Campanha, Mensagens, Descontos, Chaves).
// O cobrador edita SEMPRE a si mesmo. O admin escolhe a conta a ver/editar (ou o padrão global).
// `conta` vem da URL/body: undefined ou "global" = global; um uuid = aquele cobrador.
// ---------------------------------------------------------------------------
export type Escopo = { cobradorId: string | null; ehGlobal: boolean };

// Resolve o escopo para uma SESSÃO já carregada (uso em páginas/server components).
export async function resolverEscopoConta(sessao: Sessao, conta?: string | null): Promise<Escopo> {
  if (sessao.role === "cobrador") return { cobradorId: sessao.user.id, ehGlobal: false };
  // admin
  if (!conta || conta === "global") return { cobradorId: null, ehGlobal: true };
  // valida que `conta` é mesmo um cobrador
  const { data } = await supabaseAdmin().from("usuarios_app").select("id, role").eq("id", conta).maybeSingle();
  if (data?.role === "cobrador") return { cobradorId: data.id, ehGlobal: false };
  return { cobradorId: null, ehGlobal: true };
}

// Versão para rotas de API: garante admin|cobrador e devolve o escopo (ou erro).
export async function exigirEscopoConta(conta?: string | null):
  Promise<{ erro: NextResponse; escopo?: undefined; sessao?: undefined } | { erro?: undefined; escopo: Escopo; sessao: Sessao }> {
  const g = await exigirCobrador();
  if (g.erro) return { erro: g.erro };
  const escopo = await resolverEscopoConta(g.sessao, conta);
  return { escopo, sessao: g.sessao };
}

// Lista os cobradores (para o seletor de conta do admin).
export async function listarCobradores(): Promise<{ id: string; nome: string | null; email: string | null }[]> {
  const { data } = await supabaseAdmin()
    .from("usuarios_app").select("id, nome, email").eq("role", "cobrador").order("nome");
  return data ?? [];
}

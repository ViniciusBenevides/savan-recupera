import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { FailoverBanner } from "@/components/FailoverBanner";
import { BloqueioWhatsappBanner } from "@/components/BloqueioWhatsappBanner";
import { NOME_PAPEL, type Papel } from "@/lib/auth";
import { fimDoDiaSP } from "@/lib/datas";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: perfil }, conversas, agenda] = await Promise.all([
    sb.from("usuarios_app").select("nome, role").eq("id", user.id).maybeSingle(),
    sb.from("v_conversas_esperando").select("id", { count: "exact", head: true }),
    sb.from("agenda").select("id", { count: "exact", head: true }).eq("status", "pendente").lte("quando", fimDoDiaSP().toISOString()),
  ]);

  const nome = perfil?.nome ?? user.email?.split("@")[0] ?? "Usuário";
  const role = (perfil?.role ?? "visualizador") as Papel;
  const demo = process.env.NEXT_PUBLIC_MODO_DEMO === "1";

  return (
    <div className="flex min-h-screen bg-papel">
      <Sidebar role={role} contadores={{ conversas: conversas.count ?? 0, agenda: agenda.count ?? 0 }} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar nome={nome} papel={NOME_PAPEL[role] ?? role} demo={demo} />
        <main className="relative flex-1 pb-24 lg:pb-0">
          {["admin", "cobrador"].includes(role) && (
            <div className="px-4 pt-4 sm:px-6 lg:px-8 empty:hidden">
              <BloqueioWhatsappBanner />
              <FailoverBanner />
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

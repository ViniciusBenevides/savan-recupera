import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { Sidebar } from "@/components/Sidebar";
import { FailoverBanner } from "@/components/FailoverBanner";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await sb
    .from("usuarios_app")
    .select("nome, role")
    .eq("id", user.id)
    .maybeSingle();

  const nome = perfil?.nome ?? user.email?.split("@")[0] ?? "Usuário";
  const role = perfil?.role ?? "visualizador";

  return (
    <div className="flex min-h-screen">
      <Sidebar nome={nome} role={role} />
      <main className="relative z-10 flex-1 px-5 py-7 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-[1200px] animate-fade-up">
          {["admin", "cobrador"].includes(role) && <FailoverBanner />}
          {children}
        </div>
      </main>
    </div>
  );
}

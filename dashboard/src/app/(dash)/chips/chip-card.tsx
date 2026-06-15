"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge, Button } from "@/components/ui/primitives";
import { num } from "@/lib/utils";
import { Play, Pause, QrCode, Smartphone } from "lucide-react";
import Link from "next/link";

const STATUS: Record<string, { tone: any; label: string }> = {
  cadastrado: { tone: "neutral", label: "Cadastrado" },
  conectado: { tone: "blue", label: "Conectado" },
  aquecendo: { tone: "amber", label: "Aquecendo" },
  ativo: { tone: "green", label: "Ativo" },
  pausado: { tone: "neutral", label: "Pausado" },
  desconectado: { tone: "rose", label: "Desconectado" },
  banido: { tone: "rose", label: "Banido" },
};

function diaAquecimento(dataAtivacao: string | null): number | null {
  if (!dataAtivacao) return null;
  return Math.floor((Date.now() - new Date(dataAtivacao).getTime()) / 86400000) + 1;
}

export function ChipCard({ chip, metrica }: { chip: any; metrica?: any }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const st = STATUS[chip.status] ?? STATUS.cadastrado;
  const dia = diaAquecimento(chip.data_ativacao);
  const enviados = metrica?.novos_contatos ?? 0;

  function acao(a: string) {
    start(async () => {
      await fetch(`/api/chips/${chip.id}/acao`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: a }),
      });
      router.refresh();
    });
  }

  const podeAtivar = ["cadastrado", "conectado", "desconectado"].includes(chip.status);
  const podePausar = ["ativo", "aquecendo"].includes(chip.status);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink-800 text-emerald">
            <Smartphone className="h-5 w-5" />
          </span>
          <div>
            <div className="font-medium text-chalk">{chip.nome}</div>
            <div className="font-mono text-xs text-mist tabnums">{chip.numero_e164 ?? "sem número"}</div>
          </div>
        </div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>

      {dia !== null && (
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-mist">
            <span>Aquecimento</span>
            <span className="font-mono text-chalk tabnums">Dia {Math.min(dia, 31)}/31</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink-800">
            <div className="h-full rounded-full bg-amber" style={{ width: `${Math.min(100, (dia / 31) * 100)}%` }} />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between rounded-xl border border-line bg-ink-850 px-3 py-2.5">
        <span className="text-xs text-mist">Enviados hoje</span>
        <span className="font-mono text-sm font-600 text-chalk tabnums">{num(enviados)}</span>
      </div>

      <div className="flex gap-2">
        <Link href={`/chips/novo?id=${chip.id}`} className="flex-1">
          <Button variant="outline" size="sm" className="w-full"><QrCode className="h-4 w-4" /> QR Code</Button>
        </Link>
        {podeAtivar && (
          <Button size="sm" className="flex-1" onClick={() => acao("ativar")} disabled={pending}>
            <Play className="h-4 w-4" /> Ativar
          </Button>
        )}
        {podePausar && (
          <Button variant="outline" size="sm" className="flex-1" onClick={() => acao("pausar")} disabled={pending}>
            <Pause className="h-4 w-4" /> Pausar
          </Button>
        )}
        {chip.status === "pausado" && (
          <Button size="sm" className="flex-1" onClick={() => acao("retomar")} disabled={pending}>
            <Play className="h-4 w-4" /> Retomar
          </Button>
        )}
      </div>
    </Card>
  );
}

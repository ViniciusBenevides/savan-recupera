"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, Input, Label, Button, Badge } from "@/components/ui/primitives";
import { Smartphone, CheckCircle2, RefreshCw, ArrowRight } from "lucide-react";

export function NovoChipFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const idExistente = params.get("id");

  const [etapa, setEtapa] = useState<"form" | "qr">(idExistente ? "qr" : "form");
  const [chipId, setChipId] = useState<string | null>(idExistente);
  const [nome, setNome] = useState("");
  const [instance, setInstance] = useState("");
  const [token, setToken] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [qr, setQr] = useState<string | null>(null);
  const [conectado, setConectado] = useState(false);
  const [carregandoQr, setCarregandoQr] = useState(false);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(""); setSalvando(true);
    const r = await fetch("/api/chips", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, instance_id: instance, token }),
    });
    setSalvando(false);
    const d = await r.json();
    if (!r.ok) { setErro(d.erro ?? "Falha ao cadastrar."); return; }
    setChipId(String(d.chip_id));
    setEtapa("qr");
  }

  async function buscarQr() {
    if (!chipId) return;
    setCarregandoQr(true);
    try {
      const r = await fetch(`/api/chips/${chipId}/qrcode`);
      const d = await r.json();
      if (d.conectado) { setConectado(true); setQr(null); }
      else setQr(d.qr ?? null);
    } catch { /* ignora */ }
    setCarregandoQr(false);
  }

  // polling do QR/status enquanto não conectar
  useEffect(() => {
    if (etapa !== "qr" || conectado) return;
    buscarQr();
    const t = setInterval(buscarQr, 6000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapa, conectado, chipId]);

  if (etapa === "form") {
    return (
      <form onSubmit={criar} className="max-w-lg">
        <Card className="flex flex-col gap-5">
          <div>
            <Label>Nome do chip</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Chip 01" required />
          </div>
          <div>
            <Label>Instance ID (Z-API)</Label>
            <Input value={instance} onChange={(e) => setInstance(e.target.value)}
                   placeholder="3F258A682CEAA17C040FFAB71E115C52" required className="font-mono text-xs" />
          </div>
          <div>
            <Label>Token da instância (Z-API)</Label>
            <Input value={token} onChange={(e) => setToken(e.target.value)}
                   placeholder="B777F7686FC2C33DB62C18FE" required className="font-mono text-xs" />
            <p className="mt-1.5 text-xs text-mist">
              Encontre em app.z-api.io → sua instância. O token de segurança da conta já está configurado no sistema.
            </p>
          </div>
          {erro && <p className="rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose">{erro}</p>}
          <Button type="submit" disabled={salvando}>
            {salvando ? "Cadastrando…" : <>Cadastrar e gerar QR <ArrowRight className="h-4 w-4" /></>}
          </Button>
        </Card>
      </form>
    );
  }

  return (
    <div className="max-w-lg">
      <Card className="flex flex-col items-center gap-5 py-8 text-center">
        {conectado ? (
          <>
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-emerald/15 text-emerald glow-ring">
              <CheckCircle2 className="h-8 w-8" />
            </span>
            <div>
              <h3 className="font-display text-lg font-700 text-chalk">WhatsApp conectado!</h3>
              <p className="mt-1 text-sm text-mist">O chip está pronto. Agora é só ativar para iniciar o aquecimento.</p>
            </div>
            <Button onClick={() => router.push("/chips")}>Voltar para chips</Button>
          </>
        ) : (
          <>
            <Badge tone="amber"><Smartphone className="h-3.5 w-3.5" /> Aguardando conexão</Badge>
            <div className="grid h-64 w-64 place-items-center rounded-2xl border border-line bg-white p-3">
              {qr ? (
                <img src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`}
                     alt="QR Code" className="h-full w-full object-contain" />
              ) : (
                <RefreshCw className={`h-8 w-8 text-ink-600 ${carregandoQr ? "animate-spin" : ""}`} />
              )}
            </div>
            <div className="max-w-xs text-sm text-mist">
              Abra o WhatsApp no celular do chip → <b className="text-chalk">Aparelhos conectados</b> →
              <b className="text-chalk"> Conectar aparelho</b> e escaneie o código.
            </div>
            <Button variant="outline" size="sm" onClick={buscarQr} disabled={carregandoQr}>
              <RefreshCw className="h-4 w-4" /> Atualizar QR
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}

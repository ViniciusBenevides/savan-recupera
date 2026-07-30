"use client";
import * as React from "react";
import { Card, Button, Input, Label, Badge, Switch } from "@/components/ui/primitives";
import { Bot, Sparkles, Save, Check } from "lucide-react";

export type EtapaRoteiro = {
  id: string;
  objetivo?: string;
  instrucao?: string;
  casos?: { quando: string; vai_para: string }[];
};

/**
 * Editor do fluxo do robô (§33) — roteiro declarativo por carteira.
 *
 * Sem fluxo, o robô conversa solto seguindo o prompt (comportamento antigo, preservado). Com fluxo,
 * ele sabe em que etapa está, o que precisa acontecer ali e para onde ir conforme a resposta. O ganho
 * concreto: a confirmação de identidade vira ETAPA que trava o resto da conversa, em vez de um pedido
 * no meio do prompt que o modelo pode atropelar — o requisito de LGPD mais sensível do produto.
 */
export function AbaRoteiro({ carteira, padrao, salvar }: {
  carteira: any;
  padrao: Record<string, any>;
  salvar: (body: any) => Promise<boolean>;
}) {
  const modelo = padrao.roteiro_modelo ?? null;
  const salvo = carteira.roteiro ?? null;

  const [ativo, setAtivo] = React.useState<boolean>(!!salvo?.ativo);
  const [etapas, setEtapas] = React.useState<EtapaRoteiro[]>(salvo?.etapas ?? []);
  const [salvando, setSalvando] = React.useState(false);
  const [ok, setOk] = React.useState(false);
  const [erro, setErro] = React.useState("");

  const ids = etapas.map((e) => e.id);
  const idsRepetidos = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
  const destinosQuebrados = etapas.flatMap((e) =>
    (e.casos ?? [])
      .filter((c) => c.vai_para && !ids.includes(c.vai_para))
      .map((c) => `${e.id} → ${c.vai_para}`));
  const invalido = idsRepetidos.length > 0 || destinosQuebrados.length > 0 || etapas.some((e) => !e.id.trim());

  const mudar = (i: number, campo: keyof EtapaRoteiro, valor: any) =>
    setEtapas((es) => es.map((e, k) => (k === i ? { ...e, [campo]: valor } : e)));
  const mudarCaso = (i: number, j: number, campo: "quando" | "vai_para", valor: string) =>
    setEtapas((es) => es.map((e, k) => (k !== i ? e
      : { ...e, casos: (e.casos ?? []).map((c, m) => (m === j ? { ...c, [campo]: valor } : c)) })));

  async function gravar() {
    setSalvando(true); setErro(""); setOk(false);
    const sucesso = await salvar({ roteiro: etapas.length ? { ativo, etapas } : null });
    if (sucesso) { setOk(true); setTimeout(() => setOk(false), 2500); }
    else setErro("Falha ao salvar o fluxo.");
    setSalvando(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald/12 text-emerald">
            <Bot className="h-4 w-4" />
          </span>
          <div className="max-w-2xl">
            <h4 className="font-display text-base font-600 text-chalk">Fluxo do robô</h4>
            <p className="mt-0.5 text-xs text-mist">
              Sem fluxo, o robô conversa livremente seguindo o prompt. Com fluxo, ele passa por
              <b className="text-chalk"> etapas</b>: em cada uma sabe o que fazer e para onde ir conforme a
              resposta da pessoa. É assim que a <b className="text-chalk">confirmação de identidade</b> deixa de
              ser um pedido no texto e vira uma etapa que segura o resto da conversa.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-mist">{ativo ? "Fluxo ligado" : "Fluxo desligado"}</span>
          <Switch checked={ativo} onChange={setAtivo} />
        </div>
      </Card>

      {etapas.length === 0 && (
        <Card className="flex flex-col items-start gap-3">
          <p className="text-sm text-mist">
            Esta carteira ainda não tem fluxo. Comece pelo modelo pronto — identificação → proposta → objeção →
            pagamento, já com as regras jurídicas embutidas — e ajuste o que quiser.
          </p>
          <Button disabled={!modelo} onClick={() => { setEtapas(modelo?.etapas ?? []); setAtivo(true); }}>
            <Sparkles className="h-4 w-4" /> Usar o modelo pronto
          </Button>
        </Card>
      )}

      {etapas.map((e, i) => (
        <Card key={i} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-ink-800 font-mono text-[11px] text-mist tabnums">{i + 1}</span>
              <input
                value={e.id}
                onChange={(ev) => mudar(i, "id", ev.target.value.trim().toLowerCase().replace(/\s+/g, "_"))}
                className="h-8 rounded-lg border border-line bg-ink-850 px-2.5 font-mono text-xs text-chalk outline-none focus:border-emerald"
              />
              {i === 0 && <Badge tone="green">Começa aqui</Badge>}
            </div>
            <button type="button" onClick={() => setEtapas((es) => es.filter((_, k) => k !== i))}
                    className="text-xs text-mist transition-colors hover:text-rose">remover etapa</button>
          </div>

          <div>
            <Label className="text-xs">Objetivo desta etapa</Label>
            <Input value={e.objetivo ?? ""} onChange={(ev) => mudar(i, "objetivo", ev.target.value)}
                   placeholder="Ex.: Confirmar que está falando com a pessoa certa" />
          </div>

          <div>
            <Label className="text-xs">O que o robô faz aqui</Label>
            <textarea
              value={e.instrucao ?? ""} rows={3}
              onChange={(ev) => mudar(i, "instrucao", ev.target.value)}
              placeholder="Instrução direta. Pode usar as marcações de nome da pessoa e do robô."
              className="w-full rounded-xl border border-line bg-ink-850 px-3 py-2 text-sm text-chalk outline-none placeholder:text-mist focus:border-emerald"
            />
          </div>

          <div>
            <Label className="text-xs">Para onde ir</Label>
            <div className="mt-1 flex flex-col gap-2">
              {(e.casos ?? []).map((c, j) => (
                <div key={j} className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-mist">se</span>
                  <input
                    value={c.quando}
                    onChange={(ev) => mudarCaso(i, j, "quando", ev.target.value)}
                    placeholder="a pessoa confirmar que é ela"
                    className="h-9 min-w-[200px] flex-1 rounded-lg border border-line bg-ink-850 px-3 text-sm text-chalk outline-none placeholder:text-mist focus:border-emerald"
                  />
                  <span className="text-xs text-mist">vai para</span>
                  <select
                    value={c.vai_para}
                    onChange={(ev) => mudarCaso(i, j, "vai_para", ev.target.value)}
                    className="h-9 rounded-lg border border-line bg-ink-850 px-2 font-mono text-xs text-chalk outline-none focus:border-emerald"
                  >
                    <option value="">—</option>
                    {ids.map((id) => <option key={id} value={id}>{id}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => setEtapas((es) => es.map((x, k) => (k !== i ? x : { ...x, casos: (x.casos ?? []).filter((_, m) => m !== j) })))}
                    className="text-xs text-mist hover:text-rose"
                    aria-label="remover caminho"
                  >✕</button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setEtapas((es) => es.map((x, k) => (k !== i ? x : { ...x, casos: [...(x.casos ?? []), { quando: "", vai_para: "" }] })))}
                className="self-start text-[11px] text-emerald underline-offset-2 hover:underline"
              >+ caminho</button>
              {(e.casos ?? []).length === 0 && (
                <p className="text-[11px] text-mist">Sem caminhos, esta etapa encerra o atendimento.</p>
              )}
            </div>
          </div>
        </Card>
      ))}

      {etapas.length > 0 && (
        <button
          type="button"
          onClick={() => setEtapas((es) => [...es, { id: `etapa_${es.length + 1}`, objetivo: "", instrucao: "", casos: [] }])}
          className="self-start text-sm text-emerald underline-offset-2 hover:underline"
        >+ nova etapa</button>
      )}

      {idsRepetidos.length > 0 && (
        <div className="rounded-xl border border-rose/30 bg-rose/10 px-4 py-3 text-sm text-rose">
          Há etapas com o mesmo nome: {idsRepetidos.join(", ")}. Cada etapa precisa de um nome único.
        </div>
      )}
      {destinosQuebrados.length > 0 && (
        <div className="rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">
          Caminhos apontando para etapas que não existem: {destinosQuebrados.join(", ")}.
        </div>
      )}
      {erro && <div className="rounded-xl border border-rose/30 bg-rose/10 px-4 py-3 text-sm text-rose">{erro}</div>}

      <div className="flex items-center gap-3">
        <Button disabled={salvando || invalido} onClick={gravar}>
          {ok ? <><Check className="h-4 w-4" /> Salvo</> : <><Save className="h-4 w-4" /> Salvar fluxo</>}
        </Button>
        {etapas.length > 0 && (
          <button type="button" onClick={() => { setEtapas([]); setAtivo(false); }}
                  className="text-xs text-mist hover:text-rose">limpar e voltar ao robô livre</button>
        )}
      </div>
    </div>
  );
}

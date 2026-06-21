// SAVAN Recupera — lógica de distribuição de carteira entre chips.
// Calcula o plano (qual chip pega quais regiões / quanto volume) e o ETA em dias
// respeitando a curva de aquecimento de cada chip. Usado pela sugestão do sistema.

export type Faixa = { de: number; ate: number; limite: number };
export type Curva = Faixa[];

export type ChipInfo = {
  id: number;
  nome: string;
  maturidade: "novo" | "aquecido";
  aquecimento_perfil: string | null;
  limite_dia_override: number | null;
};

export type ChipPlano = {
  chip_id: number;
  nome: string;
  ufs: string[];
  cidades: string[];
  volume: number;
  eta_dias: number;       // dias para esvaziar a pilha (a partir da ativação do chip)
  limite_pico: number;    // teto diário (capacidade)
};

export type ContagemUf = { uf: string; n: number };
export type ContagemCidade = { cidade: string; uf: string; n: number };

// limite de novos contatos no dia `dia` (1 = primeiro dia) para uma curva.
export function limiteNoDia(curva: Curva, override: number | null, dia: number): number {
  if (override != null) return override;
  let lim = 0;
  for (const f of curva) if (dia >= f.de && dia <= f.ate) lim = f.limite;
  return lim;
}

// pico = maior limite que a curva atinge (capacidade do chip já maduro).
export function limitePico(curva: Curva, override: number | null): number {
  if (override != null) return override;
  return curva.reduce((m, f) => Math.max(m, f.limite), 0);
}

// dias para um chip esvaziar uma pilha de `volume`, somando a cota de cada dia.
export function etaDias(volume: number, curva: Curva, override: number | null, maxDias = 400): number {
  if (volume <= 0) return 0;
  let acc = 0;
  for (let dia = 1; dia <= maxDias; dia++) {
    acc += limiteNoDia(curva, override, dia);
    if (acc >= volume) return dia;
  }
  return maxDias;
}

function curvaDoChip(chip: ChipInfo, curvas: Record<string, Curva>): Curva {
  const chave = chip.maturidade === "aquecido"
    ? (chip.aquecimento_perfil || "aquecimento_rapido")
    : (chip.aquecimento_perfil || "aquecimento");
  return curvas[chave] ?? curvas["aquecimento"] ?? [];
}

// Plano igualitário: divide o volume total proporcional à capacidade (pico) de cada chip.
export function planoIgualitario(total: number, chips: ChipInfo[], curvas: Record<string, Curva>): ChipPlano[] {
  const pesos = chips.map((c) => limitePico(curvaDoChip(c, curvas), c.limite_dia_override) || 1);
  const soma = pesos.reduce((a, b) => a + b, 0) || 1;
  let resto = total;
  return chips.map((c, i) => {
    const volume = i === chips.length - 1 ? resto : Math.round(total * (pesos[i] / soma));
    resto -= volume;
    const curva = curvaDoChip(c, curvas);
    return {
      chip_id: c.id, nome: c.nome, ufs: [], cidades: [],
      volume: Math.max(0, volume),
      eta_dias: etaDias(Math.max(0, volume), curva, c.limite_dia_override),
      limite_pico: limitePico(curva, c.limite_dia_override),
    };
  });
}

// Plano por UF: atribui estados inteiros ao chip menos carregado (balanceando por capacidade).
export function planoPorUf(porUf: ContagemUf[], chips: ChipInfo[], curvas: Record<string, Curva>): ChipPlano[] {
  const planos: ChipPlano[] = chips.map((c) => ({
    chip_id: c.id, nome: c.nome, ufs: [], cidades: [], volume: 0, eta_dias: 0,
    limite_pico: limitePico(curvaDoChip(c, curvas), c.limite_dia_override),
  }));
  const pesos = chips.map((c) => limitePico(curvaDoChip(c, curvas), c.limite_dia_override) || 1);

  // maiores estados primeiro; cada um vai pro chip com menor carga relativa (volume/peso)
  for (const item of [...porUf].sort((a, b) => b.n - a.n)) {
    if (item.uf === "??" || !item.uf) continue; // sem UF → fica no pool livre
    let melhor = 0;
    for (let i = 1; i < planos.length; i++) {
      if (planos[i].volume / pesos[i] < planos[melhor].volume / pesos[melhor]) melhor = i;
    }
    planos[melhor].ufs.push(item.uf);
    planos[melhor].volume += item.n;
  }

  return planos.map((p, i) => ({
    ...p,
    eta_dias: etaDias(p.volume, curvaDoChip(chips[i], curvas), chips[i].limite_dia_override),
  }));
}

// Plano por cidade: atribui cidades inteiras ao chip menos carregado (balanceando por capacidade).
export function planoPorCidade(porCidade: ContagemCidade[], chips: ChipInfo[], curvas: Record<string, Curva>): ChipPlano[] {
  const planos: ChipPlano[] = chips.map((c) => ({
    chip_id: c.id, nome: c.nome, ufs: [], cidades: [], volume: 0, eta_dias: 0,
    limite_pico: limitePico(curvaDoChip(c, curvas), c.limite_dia_override),
  }));
  const pesos = chips.map((c) => limitePico(curvaDoChip(c, curvas), c.limite_dia_override) || 1);

  for (const item of [...porCidade].sort((a, b) => b.n - a.n)) {
    if (item.cidade === "??" || !item.cidade) continue; // sem cidade → pool livre
    let melhor = 0;
    for (let i = 1; i < planos.length; i++) {
      if (planos[i].volume / pesos[i] < planos[melhor].volume / pesos[melhor]) melhor = i;
    }
    planos[melhor].cidades.push(item.cidade);
    planos[melhor].volume += item.n;
  }

  return planos.map((p, i) => ({
    ...p,
    eta_dias: etaDias(p.volume, curvaDoChip(chips[i], curvas), chips[i].limite_dia_override),
  }));
}

// recomendação simples e transparente de estratégia.
export function recomendarEstrategia(nChips: number, porUf: ContagemUf[]): "igualitario" | "uf" {
  const ufsReais = porUf.filter((u) => u.uf && u.uf !== "??").length;
  // só recomenda dividir por UF se houver estados suficientes p/ dar ≥1 a cada chip
  return nChips >= 2 && ufsReais >= nChips ? "uf" : "igualitario";
}

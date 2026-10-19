// Dados de DEMONSTRAÇÃO do MC COB — só para o Supabase LOCAL.
//
//   node scripts/seed-demo.mjs
//
// Lê NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY do .env.local e RECUSA rodar se a URL não
// for 127.0.0.1/localhost: o script apaga as tabelas de negócio antes de semear. Todos os nomes,
// CPFs e telefones são inventados (o repositório é público); a carteira "Loja Modelo Eletro" é
// fictícia. As datas são relativas a hoje, para a fila do dia sempre ter o que mostrar.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(URL_)) {
  console.error("recusado: este script só roda contra o Supabase local (127.0.0.1/localhost).");
  process.exit(1);
}
const sb = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ---------- utilidades ----------
let semente = 20261016;
const rnd = () => {
  semente |= 0; semente = (semente + 0x6d2b79f5) | 0;
  let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const escolher = (arr) => arr[Math.floor(rnd() * arr.length)];
const entre = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const agora = new Date();
const minutos = (m) => new Date(agora.getTime() - m * 60_000);
const horas = (h) => minutos(h * 60);
const dias = (d) => minutos(d * 1440);
const hojeAs = (hh, mm = 0) => { const d = new Date(agora); d.setHours(hh, mm, 0, 0); return d; };
const diaRel = (n, hh = 12) => { const d = new Date(agora); d.setDate(d.getDate() + n); d.setHours(hh, 0, 0, 0); return d; };
const iso = (d) => d.toISOString();
const dataISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const somarMeses = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
const arred = (v) => Math.round(v * 100) / 100;

function cpf() {
  const n = Array.from({ length: 9 }, () => entre(0, 9));
  const dv = (base) => { let s = 0; for (let i = 0; i < base.length; i++) s += base[i] * (base.length + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  n.push(dv(n)); n.push(dv(n));
  return n.join("");
}

async function q(promessa, rotulo) {
  const { data, error } = await promessa;
  if (error) { console.error(`erro em ${rotulo}:`, error.message); process.exit(1); }
  return data;
}

// ---------- 1) limpar ----------
const tabelas = ["acordo_parcelas", "acordos", "agenda", "ocorrencias", "pagamentos", "negociacoes",
  "escalacoes", "mensagens", "conversas", "fila_envios", "telefones_devedor", "bloqueios_contato",
  "devedores", "importacoes", "carteiras"];
// carteira_chips não tem id: sai antes das carteiras
await sb.from("carteira_chips").delete().gte("carteira_id", 0);
for (const t of tabelas) await q(sb.from(t).delete().gte("id", 0), `limpar ${t}`);
const { data: lista } = await sb.auth.admin.listUsers({ perPage: 200 });
for (const u of lista?.users ?? []) if (u.email?.endsWith("@demo.local")) await sb.auth.admin.deleteUser(u.id);

// ---------- 2) usuários ----------
const SENHA = "demo-mccob-2026";
async function criarUsuario(email, nome, role, cobradorId = null) {
  const { data, error } = await sb.auth.admin.createUser({ email, password: SENHA, email_confirm: true });
  if (error) { console.error("usuário", email, error.message); process.exit(1); }
  const id = data.user.id;
  await q(sb.from("usuarios_app").upsert({ id, email, nome, role, cobrador_id: cobradorId }), `perfil ${email}`);
  return id;
}
const idAdmin = await criarUsuario("admin@demo.local", "Vinicius", "admin");
const idMaurelio = await criarUsuario("maurelio@demo.local", "Maurelio Camelo", "cobrador");
const idMauro = await criarUsuario("negociador@demo.local", "Mauro Jr.", "negociador", idMaurelio);
const nomeUsuario = { [idMaurelio]: "Maurelio Camelo", [idMauro]: "Mauro Jr.", [idAdmin]: "Vinicius" };

// ---------- 3) carteiras ----------
const [savan, modelo] = await q(sb.from("carteiras").insert([
  { nome: "SAVAN Calçados", credor: "SAVAN Calçados", descricao: "Crediário de loja de calçados, comprado por cessão.",
    status: "ativa", cobrador_id: idMaurelio, tipo_carteira: "propria", desconto_max_pct: 60, parcelas_max: 6,
    entrada_min_pct: 0, parcela_min_valor: 30, dias_sem_contato_max: 15 },
  { nome: "Loja Modelo Eletro", credor: "Loja Modelo Eletro (fictícia)", descricao: "Carteira fictícia de demonstração.",
    status: "ativa", cobrador_id: idMaurelio, tipo_carteira: "terceiros", honorarios_pct: 30, desconto_max_pct: 50,
    parcelas_max: 10, entrada_min_pct: 10, parcela_min_valor: 40, dias_sem_contato_max: 10 },
]).select("id, nome"), "carteiras");

// ---------- 4) devedores ----------
const nomes = ["Maria Aparecida", "José Carlos", "Luciana", "Raimundo", "Antônio", "Rosângela", "Edvaldo", "Cleide",
  "Francisca", "Sebastião", "Teresa Cristina", "Wellington", "Gilberto", "Ana Paula", "Marcos Vinícius", "Joana",
  "Benedito", "Sônia", "Adriana", "Valdir", "Cícera", "Josefa", "Paulo Henrique", "Edileusa", "Reginaldo", "Lucimar",
  "Fátima", "Jucélia", "Wanderley", "Elisângela", "Márcio", "Rita de Cássia", "Osmar", "Neide", "Valéria", "Divino",
  "Aparecida", "Geraldo", "Simone", "Ivone", "Leandro", "Kátia", "Ronaldo", "Zilda", "Eurípedes", "Lindalva"];
const sobrenomes = ["Souza", "Ribeiro", "Martins", "Nonato da Silva", "Pereira Lima", "Dias", "Santos", "Moreira",
  "Alves", "Rocha", "Oliveira", "Ferreira", "Gomes", "Barbosa", "Cardoso", "Teixeira", "Araújo", "Mendes", "Nunes",
  "Carvalho", "Batista", "Lopes", "Machado", "Freitas", "Rezende", "Borges", "Queiroz", "Fonseca", "Vieira", "Moura"];
const cidades = [["Goiânia", "GO"], ["Goiânia", "GO"], ["Goiânia", "GO"], ["Aparecida de Goiânia", "GO"],
  ["Anápolis", "GO"], ["Trindade", "GO"], ["Senador Canedo", "GO"], ["Rio Verde", "GO"], ["Inhumas", "GO"]];

// Os 14 primeiros têm história escrita à mão (conversas abaixo); o resto é a base.
const roteiro = [
  { nome: "Maria Aparecida Souza", saldo: 412.8, ano: 2009, cart: "s", resp: idMauro, status: "em_negociacao" },
  { nome: "José Carlos Ribeiro", saldo: 246.0, ano: 2011, cart: "s", resp: idMauro, status: "em_negociacao" },
  { nome: "Luciana Ferreira Martins", saldo: 480.0, ano: 2013, cart: "m", resp: idMauro, status: "contatado" },
  { nome: "Raimundo Nonato da Silva", saldo: 690.5, ano: 2008, cart: "s", resp: idMaurelio, status: "em_negociacao" },
  { nome: "Antônio Pereira Lima", saldo: 330.0, ano: 2011, cart: "s", resp: idMauro, status: "pix_gerado" },
  { nome: "Rosângela Dias", saldo: 189.0, ano: 2010, cart: "s", resp: idMauro, status: "em_negociacao" },
  { nome: "Edvaldo Santos", saldo: 300.0, ano: 2010, cart: "s", resp: idMaurelio, status: "em_negociacao" },
  { nome: "Cleide Moreira", saldo: 520.0, ano: 2014, cart: "m", resp: idMauro, status: "em_negociacao" },
  { nome: "Francisca Alves", saldo: 220.0, ano: 2009, cart: "s", resp: idMauro, status: "pago" },
  { nome: "Sebastião Rocha", saldo: 405.0, ano: 2012, cart: "s", resp: idMaurelio, status: "em_negociacao" },
  { nome: "Teresa Cristina Gomes", saldo: 260.0, ano: 2007, cart: "s", resp: idMauro, status: "pago" },
  { nome: "Wellington Barbosa", saldo: 610.0, ano: 2013, cart: "m", resp: idMauro, status: "em_negociacao" },
  { nome: "Gilberto Cardoso", saldo: 158.4, ano: 2006, cart: "s", resp: idMauro, status: "em_negociacao" },
  { nome: "Joana Teixeira", saldo: 132.0, ano: 2008, cart: "s", resp: null, status: "nao_perturbe" },
];
const statusBase = ["pendente", "pendente", "pendente", "pendente", "contatado", "contatado", "contatado",
  "em_negociacao", "em_negociacao", "sem_whatsapp", "recusado", "pago", "contestado"];
const usados = new Set(roteiro.map((r) => r.nome));
while (roteiro.length < 80) {
  const n = `${escolher(nomes)} ${escolher(sobrenomes)}`;
  if (usados.has(n)) continue; usados.add(n);
  const cart = roteiro.length % 3 === 0 ? "m" : "s";
  roteiro.push({ nome: n, saldo: arred(80 + rnd() * 1300), ano: entre(2006, 2014), cart,
    resp: rnd() < 0.45 ? idMauro : rnd() < 0.5 ? idMaurelio : null, status: escolher(statusBase) });
}

const linhasDev = roteiro.map((r, i) => {
  const [cidade, uf] = escolher(cidades);
  const carteira = r.cart === "s" ? savan : modelo;
  return {
    carteira_id: carteira.id, nome: r.nome, cpf_cnpj: cpf(), saldo: r.saldo,
    processo: `${r.cart === "s" ? "SAV" : "LME"}-${r.ano}-${String(1000 + i * 7).padStart(5, "0")}`,
    vencimento: `${r.ano}-${String(entre(1, 12)).padStart(2, "0")}-${String(entre(1, 28)).padStart(2, "0")}`,
    cidade, uf, carteira_credor: carteira.nome, status_cobranca: r.status, responsavel_id: r.resp,
    prioridade: entre(0, 5), motivo_inadimplencia: escolher([null, null, "desemprego", "esqueceu", "mudou de cidade", "contesta a compra"]),
    ultimo_contato_em: ["pendente", "sem_whatsapp"].includes(r.status) ? null : iso(dias(entre(1, 40))),
  };
});
const devs = await q(sb.from("devedores").insert(linhasDev).select("id, nome, saldo, carteira_id"), "devedores");
const D = Object.fromEntries(devs.map((d) => [d.nome, d]));

// totais da carteira (a importação de verdade mantém isso; aqui o roteiro faz à mão)
for (const c of [savan, modelo]) {
  const meus = devs.filter((d) => d.carteira_id === c.id);
  await q(sb.from("carteiras").update({ num_devedores: meus.length, soma_saldo: arred(meus.reduce((s, d) => s + Number(d.saldo), 0)) }).eq("id", c.id), "totais carteira");
}

// ---------- 5) telefones (inventados: faixa +55 62 90000-xxxx) ----------
let seqFone = 1000;
const fones = [];
for (const d of devs) {
  const qtd = entre(1, 3);
  for (let k = 0; k < qtd; k++) {
    seqFone++;
    fones.push({ devedor_id: d.id, telefone_e164: `+55629000${String(seqFone).padStart(5, "0")}`, ordem: k + 1,
      tipo: k === 2 ? "fixo" : "movel", whatsapp_valido: k === 0 ? true : rnd() < 0.5 ? null : false });
  }
}
const fonesIns = await q(sb.from("telefones_devedor").insert(fones).select("id, devedor_id, ordem"), "telefones");
const foneDe = (devId) => fonesIns.find((f) => f.devedor_id === devId && f.ordem === 1)?.id ?? null;

// ---------- 6) conversas e mensagens ----------
let cw = -1;
const abertura = (n) => `Olá, ${n.split(" ")[0]}! Aqui é da MC CRED, responsável pelas negociações da SAVAN Calçados. ` +
  `Temos uma condição especial para quitar um saldo antigo da loja. Posso te passar? Se não quiser receber, é só responder "não".`;
async function conversa(nome, estado, msgs, extra = {}) {
  const d = D[nome];
  const ult = msgs[msgs.length - 1];
  const [conv] = await q(sb.from("conversas").insert({
    devedor_id: d.id, carteira_id: d.carteira_id, telefone_id: foneDe(d.id), chatwoot_conversation_id: cw--,
    estado, ultima_msg_em: iso(ult.t), ultima_msg_de: ult.de, opt_in: "concedido", ...extra,
  }).select("id"), `conversa ${nome}`);
  await q(sb.from("mensagens").insert(msgs.map((m) => ({
    conversa_id: conv.id, direcao: m.de === "devedor" ? "entrada" : "saida", origem: m.de, conteudo: m.txt,
    criado_em: iso(m.t), autor_nome: m.autor ?? null, status_entrega: m.de === "devedor" ? null : 3,
  }))), `mensagens ${nome}`);
  return conv.id;
}
const conv = {};
conv.maria = await conversa("Maria Aparecida Souza", "humano", [
  { de: "bot", t: dias(2), txt: abertura("Maria") },
  { de: "devedor", t: dias(2), txt: "Pode sim. Qual é o valor?" },
  { de: "humano", autor: "Mauro Jr.", t: dias(2), txt: "O saldo de 2009 é R$ 412,80. Para quitar à vista fica R$ 165,12, com termo de quitação." },
  { de: "devedor", t: minutos(22), txt: "Moço, consigo pagar dia 10, pode ser?" },
]);
conv.jose = await conversa("José Carlos Ribeiro", "humano", [
  { de: "bot", t: dias(1), txt: abertura("José") },
  { de: "devedor", t: minutos(49), txt: "Quero pagar. Me manda o pix" },
]);
conv.luciana = await conversa("Luciana Ferreira Martins", "bot_ativo", [
  { de: "bot", t: horas(3), txt: "Olá, Luciana! Aqui é da MC CRED, sobre um saldo antigo da Loja Modelo Eletro. Posso te passar uma condição para quitar?" },
  { de: "devedor", t: minutos(66), txt: "Isso é golpe? Nunca comprei nessa loja" },
]);
conv.raimundo = await conversa("Raimundo Nonato da Silva", "humano", [
  { de: "bot", t: dias(3), txt: abertura("Raimundo") },
  { de: "devedor", t: dias(3), txt: "Quem fala?" },
  { de: "humano", autor: "Maurelio Camelo", t: dias(3), txt: "Seu Raimundo, aqui é o Maurelio da MC CRED. A MC CRED comprou os créditos antigos da SAVAN Calçados e estamos oferecendo quitação com desconto." },
  { de: "devedor", t: minutos(95), txt: "Tô desempregado agora, mas queria resolver. Dá pra parcelar?" },
]);
conv.antonio = await conversa("Antônio Pereira Lima", "pix_enviado", [
  { de: "bot", t: dias(2), txt: abertura("Antônio") },
  { de: "devedor", t: horas(19), txt: "Pode mandar o pix que eu pago hoje" },
  { de: "humano", autor: "Mauro Jr.", t: horas(18), txt: "Pronto, Seu Antônio! O Pix de R$ 132,00 está logo abaixo. Assim que cair eu te mando o termo de quitação." },
]);
conv.rosangela = await conversa("Rosângela Dias", "humano", [
  { de: "bot", t: dias(3), txt: abertura("Rosângela") },
  { de: "devedor", t: dias(2), txt: "Vou ver com meu marido e te falo" },
  { de: "humano", autor: "Mauro Jr.", t: dias(2), txt: "Claro, Dona Rosângela. Fico no aguardo, sem pressa." },
]);
conv.edvaldo = await conversa("Edvaldo Santos", "humano", [
  { de: "bot", t: dias(4), txt: abertura("Edvaldo") },
  { de: "devedor", t: dias(1), txt: "Recebo amanhã. Pago depois do almoço" },
  { de: "humano", autor: "Maurelio Camelo", t: dias(1), txt: "Combinado, Seu Edvaldo. Anotei para amanhã: R$ 120,00." },
], { lida_em: iso(dias(1)) });
conv.gilberto = await conversa("Gilberto Cardoso", "humano", [
  { de: "bot", t: dias(5), txt: abertura("Gilberto") },
  { de: "devedor", t: dias(4), txt: "Me chama sexta de tarde que eu vejo isso" },
  { de: "humano", autor: "Mauro Jr.", t: dias(4), txt: "Combinado! Te chamo sexta à tarde." },
], { lida_em: iso(dias(4)) });
conv.francisca = await conversa("Francisca Alves", "pago", [
  { de: "bot", t: dias(1), txt: abertura("Francisca") },
  { de: "devedor", t: hojeAs(8, 2), txt: "Quero quitar" },
  { de: "humano", autor: "Mauro Jr.", t: hojeAs(8, 10), txt: "Que bom, Dona Francisca! O Pix de R$ 88,00 está aqui embaixo." },
  { de: "devedor", t: hojeAs(8, 29), txt: "Paguei, olha o comprovante" },
  { de: "humano", autor: "Mauro Jr.", t: hojeAs(8, 31), txt: "Recebido! Obrigado. Seu termo de quitação vai em seguida." },
], { lida_em: iso(hojeAs(8, 31)), motivo_encerramento: "pagamento_confirmado" });
conv.joana = await conversa("Joana Teixeira", "optout", [
  { de: "bot", t: dias(6), txt: abertura("Joana") },
  { de: "devedor", t: dias(6), txt: "Não. Não me mande mais mensagem" },
  { de: "sistema", t: dias(6), txt: "Contato bloqueado a pedido da pessoa." },
], { lida_em: iso(dias(6)), motivo_encerramento: "nao_perturbe" });

// ---------- 7) ocorrências ----------
const oc = [];
const OCOR = (nome, resultado, quando, autor, descricao, canal = "whatsapp") =>
  oc.push({ devedor_id: D[nome].id, carteira_id: D[nome].carteira_id, autor_id: autor, autor_nome: nomeUsuario[autor] ?? "Robô",
    resultado, descricao, canal, criado_em: iso(quando) });
OCOR("Maria Aparecida Souza", "falou_com_titular", dias(2), idMauro, "Confirmou ser a titular. Passei o valor à vista.");
OCOR("Raimundo Nonato da Silva", "falou_com_titular", dias(3), idMaurelio, "Explicou que está desempregado.");
OCOR("Antônio Pereira Lima", "promessa", horas(18), idMauro, "Pediu o Pix e disse que paga hoje.");
OCOR("Rosângela Dias", "falou_com_titular", dias(2), idMauro, "Vai conversar com o marido.");
OCOR("Edvaldo Santos", "promessa", dias(1), idMaurelio, "Recebe amanhã, paga depois do almoço.");
OCOR("Gilberto Cardoso", "pediu_retorno", dias(4), idMauro, "Pediu para chamar sexta à tarde.");
OCOR("Joana Teixeira", "nao_perturbe", dias(6), null, "Pediu para não receber mais mensagens.", "robo");
OCOR("Sebastião Rocha", "acordo", dias(40), idMaurelio, "Acordo em 3 parcelas de R$ 81,00.");
OCOR("Wellington Barbosa", "acordo", dias(75), idMauro, "Acordo em 3 parcelas.");
OCOR("Cleide Moreira", "acordo", dias(30), idMauro, "Acordo em 4 parcelas de R$ 60,00.");
// "Feito hoje": 9 contatos de hoje, para a barra de progresso do dia
const feitosHoje = [["Francisca Alves", "pagou", "Pagou R$ 88,00 no Pix."]];
const extras = devs.slice(14, 22);
for (const d of extras) feitosHoje.push([d.nome, escolher(["sem_resposta", "falou_com_titular", "numero_errado", "sem_resposta"]), null]);
feitosHoje.forEach(([n, r, txt], i) => OCOR(n, r, hojeAs(8, 31 + i * 6), i % 2 ? idMaurelio : idMauro, txt));
// histórico espalhado no último mês
for (const d of devs.slice(22, 60)) {
  if (rnd() < 0.55) OCOR(d.nome, escolher(["sem_resposta", "sem_resposta", "falou_com_titular", "falou_com_terceiro", "numero_errado", "recusou"]), dias(entre(2, 35)), rnd() < 0.5 ? idMauro : idMaurelio, null);
}
await q(sb.from("ocorrencias").insert(oc), "ocorrências");

// ---------- 8) agenda ----------
const AG = (nome, tipo, quando, extra = {}) => ({ devedor_id: D[nome].id, carteira_id: D[nome].carteira_id,
  responsavel_id: extra.resp ?? idMauro, tipo, quando: iso(quando), criado_por: extra.resp ?? idMauro,
  dia_inteiro: true, valor: null, observacao: null, ...extra, resp: undefined });
const agenda = [
  AG("Edvaldo Santos", "promessa", hojeAs(14), { valor: 120, dia_inteiro: false, observacao: "Depois do almoço.", resp: idMaurelio }),
  AG("Antônio Pereira Lima", "promessa", diaRel(-1, 18), { valor: 132, observacao: "Pix enviado ontem." }),
  AG("Gilberto Cardoso", "retorno", hojeAs(15), { dia_inteiro: false, observacao: "Pediu para chamar sexta à tarde." }),
  AG("Rosângela Dias", "retorno", hojeAs(18), { dia_inteiro: false, observacao: "Ver se conversou com o marido." }),
];
// Promessa e retorno só para quem está em conversa: nunca para quem pagou, recusou ou pediu para parar.
const statusDe = (nome) => linhasDev.find((l) => l.nome === nome)?.status_cobranca;
const conversaveis = devs.slice(30).filter((d) => ["pendente", "contatado", "em_negociacao"].includes(statusDe(d.nome)));
for (const d of conversaveis.slice(0, 6)) agenda.push(AG(d.nome, "promessa", hojeAs(12), { valor: arred(d.saldo * 0.4) }));
for (const d of conversaveis.slice(6, 11)) agenda.push(AG(d.nome, "promessa", diaRel(entre(2, 20)), { valor: arred(d.saldo * 0.45) }));
for (const d of conversaveis.slice(11, 13)) agenda.push(AG(d.nome, "retorno", diaRel(1, 10)));
agenda.push(AG(conversaveis[13].nome, "promessa", diaRel(-3), { valor: arred(conversaveis[13].saldo * 0.4) }));
await q(sb.from("agenda").insert(agenda.map(({ resp, ...a }) => a)), "agenda");
// Quem tem compromisso marcado já conversou com alguém: está em negociação e tem último contato.
const comCompromisso = conversaveis.slice(0, 14).map((d) => d.id);
await q(sb.from("devedores").update({ status_cobranca: "em_negociacao" }).in("id", comCompromisso), "situação de quem prometeu");
await q(sb.from("devedores").update({ ultimo_contato_em: iso(dias(3)) }).in("id", comCompromisso).is("ultimo_contato_em", null), "último contato de quem prometeu");

// ---------- 9) acordos, parcelas e Pix ----------
let seqPix = 1;
async function pix(nome, valor, status, pagoEm, criadoEm) {
  const d = D[nome];
  const [neg] = await q(sb.from("negociacoes").insert({ devedor_id: d.id, valor_original: d.saldo,
    desconto_pct: arred(100 - (valor / d.saldo) * 100), valor_proposto: valor, status: status === "pendente" ? "aceita" : "paga",
    criado_em: iso(criadoEm) }).select("id"), "negociação");
  const [p] = await q(sb.from("pagamentos").insert({ negociacao_id: neg.id, devedor_id: d.id, asaas_payment_id: `demo_pay_${seqPix++}`,
    valor, valor_liquido: arred(valor * 0.99), comissao_operador: arred(valor * 0.1), status, due_date: dataISO(criadoEm),
    pago_em: pagoEm ? iso(pagoEm) : null, criado_em: iso(criadoEm), pix_payload: "00020126DEMO-PIX-COPIA-E-COLA" }).select("id"), "pagamento");
  return p.id;
}
async function acordo(nome, { desconto, parcelas, entrada = 0, inicio, pagas = 0, status = "ativo", forma = "pix", autor = idMauro }) {
  const d = D[nome];
  const total = arred(d.saldo * (1 - desconto / 100));
  const restante = arred(total - entrada);
  const valorParc = arred(restante / parcelas);
  const [a] = await q(sb.from("acordos").insert({ devedor_id: d.id, carteira_id: d.carteira_id, criado_por: autor,
    criado_por_nome: nomeUsuario[autor], valor_divida: d.saldo, desconto_pct: desconto, valor_total: total, entrada,
    parcelas, forma_pagamento: forma, status, criado_em: iso(inicio),
    quitado_em: status === "quitado" ? iso(somarMeses(inicio, parcelas - 1)) : null }).select("id"), "acordo");
  const linhas = [];
  for (let n = 1; n <= parcelas; n++) {
    const venc = somarMeses(inicio, n - 1);
    const paga = n <= pagas;
    const ultimo = n === parcelas ? arred(restante - valorParc * (parcelas - 1)) : valorParc;
    linhas.push({ acordo_id: a.id, numero: n, vencimento: dataISO(venc), valor: ultimo,
      status: paga ? "paga" : status === "quebrado" || status === "cancelado" ? "cancelada" : "aberta",
      pago_em: paga ? iso(new Date(venc.getTime() + 3 * 3600_000)) : null, valor_pago: paga ? ultimo : null,
      forma_pagamento: paga ? forma : null, registrado_por: paga ? autor : null });
  }
  const parc = await q(sb.from("acordo_parcelas").insert(linhas).select("id, numero, valor, pago_em, status"), "parcelas");
  for (const p of parc.filter((x) => x.status === "paga" && forma === "pix")) {
    const pid = await pix(nome, p.valor, "recebido", new Date(p.pago_em), new Date(new Date(p.pago_em).getTime() - 3600_000));
    await q(sb.from("acordo_parcelas").update({ pagamento_id: pid }).eq("id", p.id), "ligar pix");
  }
  return a.id;
}
// Cleide: 4x de R$ 60 — parcela 1 paga há um mês, a 2 vence HOJE
await acordo("Cleide Moreira", { desconto: 53.85, parcelas: 4, inicio: somarMeses(diaRel(0), -1), pagas: 1 });
// Sebastião: 3x — a 2ª está atrasada 6 dias
await acordo("Sebastião Rocha", { desconto: 40, parcelas: 3, inicio: somarMeses(diaRel(-6), -1), pagas: 1, autor: idMaurelio });
// Teresa: quitado em 2x
await acordo("Teresa Cristina Gomes", { desconto: 50, parcelas: 2, inicio: somarMeses(diaRel(-12), -1), pagas: 2, status: "quitado" });
// Wellington: quebrado (parou na 1ª)
await acordo("Wellington Barbosa", { desconto: 45, parcelas: 3, inicio: somarMeses(diaRel(-40), -1), pagas: 1, status: "quebrado" });
// Francisca: à vista hoje no Pix
await acordo("Francisca Alves", { desconto: 60, parcelas: 1, inicio: hojeAs(8, 28), pagas: 1, status: "quitado" });
// alguns pagamentos à vista no mês, para o Financeiro ter histórico
for (const d of devs.filter((x) => x.nome && linhasDev.find((l) => l.nome === x.nome)?.status_cobranca === "pago").slice(2, 7)) {
  await acordo(d.nome, { desconto: 60, parcelas: 1, inicio: dias(entre(2, 28)), pagas: 1, status: "quitado", autor: rnd() < 0.5 ? idMauro : idMaurelio });
}
// Antônio: Pix gerado ontem e não pago (fica "esfriando")
await pix("Antônio Pereira Lima", 132, "pendente", null, horas(18));

// ---------- 10) pior caso (só com --pior-caso): dados reais que quebram tela ----------
// node scripts/seed-demo.mjs --pior-caso   (sem a opção, volta aos dados de demonstração comuns)
if (process.argv.includes("--pior-caso")) {
  const piores = await q(sb.from("devedores").insert([
    { carteira_id: savan.id, nome: "Maria das Graças Aparecida de Oliveira Nascimento Albuquerque", cpf_cnpj: cpf(), saldo: 1873.4,
      processo: "SAV-2008-0001234567/03", vencimento: "2008-03-15", cidade: "Aparecida de Goiânia", uf: "GO", status_cobranca: "em_negociacao",
      responsavel_id: idMauro, prioridade: 5, ultimo_contato_em: iso(dias(3)) },
    { carteira_id: savan.id, nome: "Zé", cpf_cnpj: cpf(), saldo: 9.9, processo: null, vencimento: null, cidade: null, uf: null,
      status_cobranca: "pendente", responsavel_id: null, prioridade: 0, ultimo_contato_em: null },
    { carteira_id: modelo.id, nome: "Distribuidora de Calçados e Confecções Centro-Oeste Ltda", cpf_cnpj: "12345678000195", saldo: 1284567.89,
      processo: "LME-2014-77777", vencimento: "2014-11-30", cidade: "Goiânia", uf: "GO", status_cobranca: "em_negociacao",
      responsavel_id: idMaurelio, prioridade: 5, ultimo_contato_em: iso(dias(20)) },
    { carteira_id: modelo.id, nome: "Joana D'Ávila Conceição dos Santos Ribeiro", cpf_cnpj: cpf(), saldo: 312.5,
      processo: "LME-2012-00042", vencimento: "2012-06-01", cidade: "Senador Canedo", uf: "GO", status_cobranca: "em_negociacao",
      responsavel_id: idMauro, prioridade: 4, ultimo_contato_em: iso(dias(5)) },
  ]).select("id, nome, saldo, carteira_id"), "pior caso");
  const [longa, , empresa, joana] = piores;
  for (const d of piores) D[d.nome] = d;
  await conversa(longa.nome, "humano", [
    { de: "bot", t: dias(3), txt: abertura("Maria") },
    { de: "devedor", t: minutos(4), txt: "Boa tarde moço 🙏🏽 aqui é a filha dela, ela tá no hospital mas pediu pra eu ver isso. A gente quer resolver sim, só que agora tá muito difícil, meu pai também tá desempregado desde março e a única renda é o benefício dela. Se tiver como parcelar em umas 10 vezes pequenas a gente consegue, ou então pagar dia 10 quando cair o benefício 😅 me fala qual é o valor certinho porque eu não lembro dessa compra, faz muito tempo, acho que foi um sapato pro meu irmão" },
  ]);
  await conversa(joana.nome, "humano", [
    { de: "bot", t: dias(5), txt: abertura("Joana") },
    { de: "devedor", t: minutos(12), txt: "já paguei!!! olha o comprovante 👇" },
  ]);
  await acordo(empresa.nome, { desconto: 10, parcelas: 24, inicio: somarMeses(diaRel(-3), -6), pagas: 6, autor: idMaurelio });
  await acordo(joana.nome, { desconto: 50, parcelas: 1, inicio: diaRel(0), pagas: 0 });
  await q(sb.from("agenda").insert({ devedor_id: empresa.id, carteira_id: empresa.carteira_id, responsavel_id: idMaurelio, tipo: "retorno",
    quando: iso(hojeAs(9, 30)), dia_inteiro: false, valor: null, criado_por: idMaurelio,
    observacao: "Falar com o financeiro (Sr. Bartolomeu) antes das 10h; ele pediu para mandar a planilha de parcelas por e-mail e só depois ligar" }), "agenda pior caso");
  console.log("pior caso: +4 devedores (nome longo, nome de 2 letras, CNPJ com dívida milionária e 24 parcelas, apóstrofo)");
}

console.log(`ok — ${devs.length} devedores, ${oc.length} ocorrências, ${agenda.length} compromissos.`);
console.log("logins (senha demo-mccob-2026): maurelio@demo.local · negociador@demo.local · admin@demo.local");

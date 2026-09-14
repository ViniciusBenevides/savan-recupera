// Teste do caminho de áudio: ElevenLabs -> base64 -> baileys-api (nota de voz).
//
// Uso:  node scripts/testar-audio.mjs "+5562981540373" [--so-texto]
//
// ⚠️ MANDA MENSAGEM DE VERDADE. Use só número seu, de teste.
//
// O 9º dígito decide tudo: `variantesE164Br` devolve a variante SEM o 9 extra em primeiro lugar,
// e é ela que o `enviar-mensagem` usa. Medição de 09/09/2026: sem o 9 entregou 33/50; com o 9,
// 0/14. Mandar na variante errada dá HTTP 200, dá ack na conexão, e não chega em ninguém.

import { readFileSync } from 'node:fs';

const destino = process.argv[2];
const soTexto = process.argv.includes('--so-texto');
if (!destino) { console.error('faltou o número em E.164, ex.: +5562981540373'); process.exit(1); }

// split em /\r?\n/: o .env tem fim de linha Windows e "." não casa \r num regex
const env = {};
for (const linha of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
for (const k of ['ELEVEN_LABS_API_KEY', 'BAILEYS_API_URL', 'BAILEYS_API_KEY']) {
  if (!env[k]) { console.error(`❌ faltou ${k} no .env`); process.exit(1); }
}

/** Cópia fiel de `_shared/baileys-api-client.ts`. */
const variantesE164Br = (e164) => {
  const d = String(e164 ?? '').replace(/\D/g, '');
  if (!d.startsWith('55') || (d.length !== 12 && d.length !== 13)) return [e164];
  const ddd = d.slice(2, 4), local = d.slice(4), original = `+${d}`;
  if (local.length === 9 && local[0] === '9') return [`+55${ddd}${local.slice(1)}`, original];
  if (local.length === 8) return [original, `+55${ddd}9${local}`];
  return [original];
};

const CHIP = '+5562982624555';                 // chip 14, baileys_chatwoot
const VOZ = '33B4UnXyTNbgLmdEDh5P';
const conn = encodeURIComponent(CHIP);
const H = { 'x-api-key': env.BAILEYS_API_KEY, 'Content-Type': 'application/json' };
const jidDe = (n) => n.replace(/\D/g, '') + '@s.whatsapp.net';

const variantes = variantesE164Br(destino);
console.log('variantes do destino:', variantes.join('  |  '), '\n');

const enviar = async (corpo) => {
  const r = await fetch(`${env.BAILEYS_API_URL}/connections/${conn}/send-message`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ ...corpo, messageId: crypto.randomUUID() }),
  });
  return { status: r.status, corpo: (await r.text()).slice(0, 200) };
};

// ── 1. texto em cada variante: descobre QUAL número entrega ───────────────────────────
for (let i = 0; i < variantes.length; i++) {
  const v = variantes[i];
  const marca = i === 0 ? 'A (sem o 9 — a que o código usa)' : 'B (com o 9)';
  console.log(`texto -> ${v}   [variante ${marca}]`);
  const r = await enviar({ jid: jidDe(v), messageContent: { text: `Teste ${i === 0 ? 'A' : 'B'} — responda qual chegou.` } });
  console.log('   status', r.status, r.status === 200 ? '' : r.corpo);
  await new Promise(r => setTimeout(r, 1500));
}

if (soTexto) {
  console.log('\n👉 Veja no celular QUAL chegou (A, B, as duas ou nenhuma) e rode de novo sem --so-texto.');
  process.exit(0);
}

// ── 2. áudio na variante que o código real usaria ─────────────────────────────────────
const alvo = variantes[0];
console.log(`\naudio -> ${alvo}`);
console.log('  gerando TTS...');
const tts = await fetch(
  `https://api.elevenlabs.io/v1/text-to-speech/${VOZ}?output_format=opus_48000_32&enable_logging=false`,
  {
    method: 'POST',
    headers: { 'xi-api-key': env.ELEVEN_LABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: '<speak><break time="1.0s"/>Oi! Aqui é a Ana, do atendimento da MC CRED. Esse é um teste de nota de voz.</speak>',
      model_id: 'eleven_flash_v2_5',
      language_code: 'pt',                     // "pt-BR" dá 400 no Flash v2.5
      voice_settings: { stability: 0.35, similarity_boost: 0.44, speed: 1.1 },
    }),
  },
);
if (!tts.ok) { console.error('   ❌ TTS', tts.status, (await tts.text()).slice(0, 200)); process.exit(1); }
const audio = Buffer.from(await tts.arrayBuffer());
console.log(`   ✅ ${audio.length} bytes, custo ${tts.headers.get('character-cost')} caracteres`);

await fetch(`${env.BAILEYS_API_URL}/connections/${conn}/presence`, {
  method: 'PATCH', headers: H,
  body: JSON.stringify({ type: 'recording', toJid: jidDe(alvo) }),
}).catch(() => {});
await new Promise(r => setTimeout(r, 3000));

const env2 = await enviar({
  jid: jidDe(alvo),
  messageContent: { audio: audio.toString('base64'), ptt: true, mimetype: 'audio/ogg; codecs=opus' },
});
console.log('   status', env2.status);
console.log('   resposta', env2.corpo);

console.log('\n👉 200 aqui NÃO prova entrega. O ack do /health é agregado da conexão, não da');
console.log('   mensagem — olhe o celular, é a única prova que vale.');

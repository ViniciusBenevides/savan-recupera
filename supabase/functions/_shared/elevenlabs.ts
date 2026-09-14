// SAVAN Recupera — cliente ElevenLabs (text-to-speech)
//
// Ver `Guias Operacionais/ElevenLabs — Guia Operacional.md` para setup, custos e limites.
//
// Duas decisões que estão no código de propósito, não em config:
//  - `enable_logging=false`: o texto contém nome, valor e situação de dívida de uma pessoa
//    real. Sem isso ele fica retido nos servidores da ElevenLabs — dado pessoal sob LGPD.
//  - `eleven_flash_v2_5`: metade do preço dos modelos v2/v3 e ~75ms de latência.

import { envelopeSsml, seguroParaVoz } from "./ssml.ts";

const BASE = "https://api.elevenlabs.io/v1";

/** Voz pt-BR usada na Secretária v3. Trocável por `configuracoes.voz_id`. */
export const VOZ_PADRAO = "33B4UnXyTNbgLmdEDh5P";

export const MODELO_PADRAO = "eleven_flash_v2_5";

export interface OpcoesVoz {
  vozId?: string;
  modelo?: string;
  /**
   * `opus_48000_32` é o padrão porque nota de voz no WhatsApp é OGG/Opus — a saída Opus da
   * ElevenLabs já vem em container OGG (bytes mágicos `OggS`, verificado em 10/09/2026) e pesa
   * metade do MP3 equivalente (10 KB contra 22 KB na mesma frase). Use `mp3_44100_32` só quando
   * o destino for um player comum, não uma nota de voz.
   */
  formato?: string;
  stability?: number;
  similarity_boost?: number;
  speed?: number;
}

export type ResultadoTts =
  | { ok: true; audio: Uint8Array; custoCaracteres: number | null }
  | { ok: false; motivo: string; detalhe: string };

/**
 * Gera o áudio de uma resposta do bot.
 *
 * O texto passa por `normalizarParaVoz` (valores, datas, telefones por extenso) e pela barreira
 * `seguroParaVoz` — copia-e-cola de Pix e CPF completo NUNCA viram áudio, vão como texto.
 */
export async function gerarAudio(
  texto: string,
  segredos: Record<string, string>,
  opts: OpcoesVoz = {},
): Promise<ResultadoTts> {
  // A chave vem da tabela `segredos`, como todo o resto do projeto — não de `Deno.env`. Uma Edge
  // Function só enxerga o env que foi publicado como secret do Supabase, e nenhuma credencial de
  // terceiro deste projeto mora lá: quem configura tudo é o painel, gravando em `segredos`.
  const chave = String(segredos.ELEVEN_LABS_API_KEY ?? "").trim();
  if (!chave) return { ok: false, motivo: "sem_credencial", detalhe: "ELEVEN_LABS_API_KEY ausente em `segredos`" };

  const barreira = seguroParaVoz(texto);
  if (!barreira.ok) return { ok: false, motivo: "conteudo_nao_pode_virar_audio", detalhe: barreira.motivo };

  const vozId = opts.vozId ?? VOZ_PADRAO;
  const formato = opts.formato ?? "opus_48000_32";
  const url = `${BASE}/text-to-speech/${vozId}?output_format=${formato}&enable_logging=false`;

  let r: Response;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: { "xi-api-key": chave, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: envelopeSsml(texto),
        model_id: opts.modelo ?? MODELO_PADRAO,
        // "pt", não "pt-BR": o Flash v2.5 recusa com 400 `unsupported_language` se receber a
        // variante regional. Testado em 10/09/2026 — a doc não diz, o erro sim.
        language_code: "pt",
        voice_settings: {
          stability: opts.stability ?? 0.35,
          similarity_boost: opts.similarity_boost ?? 0.44,
          speed: opts.speed ?? 1.1,
        },
      }),
    });
  } catch (e) {
    return { ok: false, motivo: "rede", detalhe: String(e) };
  }

  if (!r.ok) {
    // o corpo do erro nunca contém a chave, mas pode conter o texto enviado — trunca
    const corpo = (await r.text().catch(() => "")).slice(0, 300);
    return { ok: false, motivo: `http_${r.status}`, detalhe: corpo };
  }

  const custo = Number(r.headers.get("character-cost"));
  return {
    ok: true,
    audio: new Uint8Array(await r.arrayBuffer()),
    custoCaracteres: Number.isFinite(custo) ? custo : null,
  };
}

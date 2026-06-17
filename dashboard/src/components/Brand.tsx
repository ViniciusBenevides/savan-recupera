// Nome do produto (white-label): defina NEXT_PUBLIC_APP_NAME para personalizar por cliente.
// Default neutro, sem referência a nenhum credor. Use uma ou duas palavras
// (a 2ª palavra ganha destaque em verde). Ex.: "Recupera", "Acme Cobranças".
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Recupera";

export function Logo({ size = 28 }: { size?: number }) {
  const initial = APP_NAME.charAt(0).toUpperCase();
  const partes = APP_NAME.split(" ");
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className="grid place-items-center rounded-[10px] bg-emerald font-display font-800 text-[#04140c]"
        style={{ width: size, height: size, fontSize: size * 0.55 }}
      >
        {initial}
      </span>
      <span className="font-display text-[17px] font-700 tracking-tight text-chalk">
        {partes.length > 1 ? (
          <>
            {partes[0]}
            <span className="text-emerald"> {partes.slice(1).join(" ")}</span>
          </>
        ) : (
          APP_NAME
        )}
      </span>
    </span>
  );
}

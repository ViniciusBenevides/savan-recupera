import Image from "next/image";

// Nome do produto. A MC CRED usa "MC COB"; NEXT_PUBLIC_APP_NAME continua permitindo outro nome.
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME?.trim() || "MC COB";

// A marca é a do MC COB do Maurelio: o monograma MC em bronze com "Seu parceiro de negócios".
// A arte tem um fundo quase preto desigual e um filete claro na borda direita: o contraste leva o
// fundo a preto puro, que o lighten deixa sumir; a máscara esmaece as bordas e o recorte tira o filete.
export function Logo({ largura = 176 }: { largura?: number }) {
  return (
    <Image
      src="/marca/mc-cob.png"
      alt={`${APP_NAME} · Seu parceiro de negócios`}
      width={245}
      height={155}
      priority
      className="h-auto mix-blend-lighten [clip-path:inset(0_4px_0_0)] [filter:contrast(1.25)] [mask-image:radial-gradient(ellipse_74%_70%_at_50%_46%,#000_62%,transparent_100%)]"
      style={{ width: largura }}
    />
  );
}

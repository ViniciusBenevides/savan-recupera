// Telas em "folha": margem e largura de leitura padrão. O grupo (folha) não muda nenhuma URL.
export default function FolhaLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-[1200px] px-4 pb-10 pt-6 sm:px-6 lg:px-8">{children}</div>;
}

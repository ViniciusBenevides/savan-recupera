// CPF e CNPJ na tela: mascarado por padrão, inteiro só quando a pessoa pede para ver.
// Módulo neutro (sem "use client"): serve às telas de servidor e às de navegador.
export const mascararCPF = (cpf: string) => {
  const d = (cpf || "").replace(/\D/g, "");
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (d.length === 14) return `**.${d.slice(2, 5)}.${d.slice(5, 8)}/****-**`;
  return "não informado";
};
export const formatarCPF = (cpf: string) => {
  const d = (cpf || "").replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return cpf;
};

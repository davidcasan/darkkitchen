// Datas: o banco guarda UTC ("AAAA-MM-DD HH:MM:SS"); a tela mostra no fuso de Brasília.

const FUSO = "America/Sao_Paulo";

export const agoraSql = () => new Date().toISOString().slice(0, 19).replace("T", " ");

export const paraSql = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");

export const deSql = (s: string) => new Date(s.replace(" ", "T") + (s.endsWith("Z") ? "" : "Z"));

export function adicionarDiasUteis(inicio: Date, dias: number): Date {
  const d = new Date(inicio);
  let restantes = dias;
  while (restantes > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dia = d.getUTCDay();
    if (dia !== 0 && dia !== 6) restantes--;
  }
  return d;
}

export const adicionarMeses = (inicio: Date, meses: number) => {
  const d = new Date(inicio);
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d;
};

export const formatarData = (s: string) =>
  deSql(s).toLocaleDateString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "short", year: "numeric" });

export const formatarDataHora = (s: string) =>
  deSql(s).toLocaleString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

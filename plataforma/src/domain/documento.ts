// CPF ou CNPJ de quem contrata: máscara e conferência dos dígitos verificadores
// (regras da Receita Federal). Usado no formulário (navegador) e no servidor.
// CNPJ alfanumérico (julho/2026 em diante): as 12 primeiras posições podem ter
// letras; cada caractere vale o código ASCII menos 48 (0–9 = 0–9, A = 17 ... Z = 42).

export type TipoDocumento = "cpf" | "cnpj";

/** Só letras e números, em maiúsculas (é assim que fica guardado). */
export const normalizarDocumento = (v: string) => v.toUpperCase().replace(/[^0-9A-Z]/g, "");

const valor = (c: string) => c.charCodeAt(0) - 48;

export function cpfValido(v: string) {
  const n = normalizarDocumento(v);
  if (!/^\d{11}$/.test(n) || /^(\d)\1{10}$/.test(n)) return false;
  const digito = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(n[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(n[9]) && digito(10) === Number(n[10]);
}

export function cnpjValido(v: string) {
  const n = normalizarDocumento(v);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(n) || /^(.)\1{13}$/.test(n)) return false;
  const digito = (ate: number) => {
    // Pesos de 2 a 9, da direita para a esquerda, recomeçando depois do 9.
    let soma = 0;
    for (let i = ate - 1, peso = 2; i >= 0; i--, peso = peso === 9 ? 2 : peso + 1) soma += valor(n[i]) * peso;
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return digito(12) === Number(n[12]) && digito(13) === Number(n[13]);
}

/** Qual documento é (pelo tamanho) e se é válido. */
export function conferirDocumento(v: string): { tipo: TipoDocumento | null; valido: boolean; numero: string } {
  const numero = normalizarDocumento(v);
  if (numero.length === 11) return { tipo: "cpf", valido: cpfValido(numero), numero };
  if (numero.length === 14) return { tipo: "cnpj", valido: cnpjValido(numero), numero };
  return { tipo: null, valido: false, numero };
}

/** Máscara enquanto a pessoa digita: CPF até 11 caracteres, CNPJ a partir do 12º. */
export function mascaraDocumento(v: string) {
  const n = normalizarDocumento(v).slice(0, 14);
  if (n.length <= 11 && /^\d*$/.test(n))
    return n
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1-$2");
  return n
    .replace(/^(\w{2})(\w)/, "$1.$2")
    .replace(/^(\w{2})\.(\w{3})(\w)/, "$1.$2.$3")
    .replace(/\.(\w{3})(\w)/, ".$1/$2")
    .replace(/(\w{4})(\w)/, "$1-$2");
}

export const formatarDocumento = mascaraDocumento;

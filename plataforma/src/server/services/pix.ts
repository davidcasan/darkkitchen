import "server-only";
import QRCode from "qrcode";
import { type ConfigPix, codigoPix, erroNaChave, normalizarChave } from "@/domain/pix";
import { ErroNegocio, executar, um } from "../db";
import type { Usuario } from "../auth";

// Recebimento por Pix (out/2026): chave, nome e cidade do recebedor ficam no banco
// (configuracoes, chave "pix") e o admin edita em Pagamentos. Cada cobrança vira uma
// fatura "pendente" com o código copia e cola; o admin confirma quando o dinheiro cai.

export const DIAS_PARA_PAGAR = 3;

export function configPix(): ConfigPix | null {
  const r = um<{ valor: string }>("SELECT valor FROM configuracoes WHERE chave = 'pix'");
  if (!r) return null;
  try {
    const c = JSON.parse(r.valor) as ConfigPix;
    return c.chave ? c : null;
  } catch {
    return null;
  }
}

export const pixDisponivel = () => configPix() !== null;

export function salvarConfigPix(admin: Usuario, dados: ConfigPix) {
  if (admin.papel !== "admin") throw new ErroNegocio("Somente o admin configura o Pix.", 403);
  const erro = erroNaChave(dados.chave);
  if (erro) throw new ErroNegocio(erro);
  const nome = dados.nome.trim();
  const cidade = dados.cidade.trim();
  if (nome.length < 2) throw new ErroNegocio("Informe o nome do recebedor, como está no banco.");
  if (cidade.length < 2) throw new ErroNegocio("Informe a cidade do recebedor.");
  const valor = JSON.stringify({ chave: normalizarChave(dados.chave), nome: nome.slice(0, 25), cidade: cidade.slice(0, 15) });
  executar(
    `INSERT INTO configuracoes (chave, valor, atualizado_em, atualizado_por) VALUES ('pix', ?, datetime('now'), ?)
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por`,
    valor,
    admin.id,
  );
}

/** Código copia e cola de uma fatura (o identificador da fatura vai no Pix, para achar no extrato). */
export function codigoDaFatura(faturaId: number, valorReais: number) {
  const cfg = configPix();
  if (!cfg) throw new ErroNegocio("O pagamento por Pix ainda não foi configurado. Fale com o atendimento.");
  return codigoPix(cfg, valorReais, `DK${String(faturaId).padStart(6, "0")}`);
}

/** Desenho do QR Code em SVG (texto), para mostrar direto na página. */
export const qrCodeSvg = (codigo: string) =>
  QRCode.toString(codigo, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });

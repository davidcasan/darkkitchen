import "server-only";
import { PLANO_PERSONALIZADO, planoPorId } from "@/domain/precos";
import { precos } from "./precos";
import { ErroNegocio, executar, transacao, um, varios } from "../db";
import type { Usuario } from "../auth";
import { hashSenha, verificarSenha } from "../senha";
import { assinar, iniciarNegociacaoPersonalizado } from "./assinaturas";
import { pixDisponivel } from "./pix";
import { CARTAO_ATIVO, adicionarMetodo } from "./pagamentos";
import { criarMarca } from "./marcas";
import { enfileirarEmail } from "./email";

const CAMPOS = "id, papel, nome, email, empresa, senior";

export function autenticar(email: string, senha: string): Usuario {
  const u = um<Usuario & { senha_hash: string }>(
    `SELECT ${CAMPOS}, senha_hash FROM usuarios WHERE email = ? AND ativo = 1`,
    email.trim(),
  );
  if (!u || !verificarSenha(senha, u.senha_hash)) throw new ErroNegocio("E-mail ou senha incorretos.", 401);
  return usuarioPorId(u.id)!;
}

export interface DadosCadastro {
  nome: string;
  empresa: string;
  email: string;
  senha: string;
  planoId: string;
  metodo: "cartao" | "pix";
  cartaoFinal?: string;
}

export function cadastrarCliente(d: DadosCadastro): Usuario {
  const nome = d.nome.trim();
  const email = d.email.trim().toLowerCase();
  if (nome.length < 2) throw new ErroNegocio("Informe seu nome.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new ErroNegocio("Digite um e-mail válido.");
  if (d.senha.length < 8) throw new ErroNegocio("A senha precisa ter pelo menos 8 caracteres.");
  const personalizado = d.planoId === PLANO_PERSONALIZADO;
  if (!personalizado && !planoPorId(precos(), d.planoId)?.ativo) throw new ErroNegocio("Escolha um plano.");
  if (!CARTAO_ATIVO) d = { ...d, metodo: "pix" }; // por enquanto, só Pix
  if (!personalizado && d.metodo === "pix" && !pixDisponivel())
    throw new ErroNegocio("O pagamento por Pix ainda não está disponível. Escolha o cartão ou fale com a gente.");
  if (um("SELECT id FROM usuarios WHERE email = ?", email)) throw new ErroNegocio("Já existe uma conta com esse e-mail.");

  return transacao(() => {
    const id = executar(
      "INSERT INTO usuarios (papel, nome, email, senha_hash, empresa) VALUES ('cliente', ?, ?, ?, ?)",
      nome,
      email,
      hashSenha(d.senha),
      d.empresa.trim() || null,
    ).id;
    criarMarca(id, d.empresa.trim() || nome);
    enfileirarEmail({
      para: email,
      assunto: "Bem-vindo à Dark Kitchen Studio",
      texto: personalizado
        ? `Olá, ${nome.split(" ")[0]}! Sua conta foi criada.

Para montar o seu plano Personalizado, conte pelo chat da sua área o que você precisa: tipos de peça, quantidade por mês e prazos. Combinamos os créditos e o valor com você e, quando o plano for liberado, aparece o QR Code do Pix.`
        : `Olá, ${nome.split(" ")[0]}! Sua conta foi criada.

Para ativar o plano, pague o Pix que está na sua área. Assim que confirmarmos o pagamento, os créditos entram e você já pode fazer o primeiro pedido.`,
      link: "/cliente",
      rotuloLink: "Entrar na minha área",
    });
    if (personalizado) {
      // Sem cobrança agora: o plano é combinado pelo chat e pago por Pix depois que o admin liberar.
      adicionarMetodo(id, "pix");
      iniciarNegociacaoPersonalizado(id, nome);
    } else {
      adicionarMetodo(id, d.metodo, d.cartaoFinal);
      assinar(id, d.planoId);
    }
    return um<Usuario>(`SELECT ${CAMPOS} FROM usuarios WHERE id = ?`, id)!;
  });
}

export const usuarioPorId = (id: number) => um<Usuario>(`SELECT ${CAMPOS} FROM usuarios WHERE id = ?`, id);

export const listarDesigners = () =>
  varios<Usuario & { ativos: number }>(
    `SELECT u.id, u.papel, u.nome, u.email, u.empresa, u.senior,
      (SELECT COUNT(*) FROM pedidos p WHERE p.designer_id = u.id AND p.status NOT IN ('aprovado','cancelado')) ativos
     FROM usuarios u WHERE u.papel = 'designer' AND u.ativo = 1 ORDER BY u.senior DESC, u.nome`,
  );

export function alterarSenha(usuarioId: number, atual: string, nova: string) {
  const u = um<{ senha_hash: string }>("SELECT senha_hash FROM usuarios WHERE id = ?", usuarioId);
  if (!u || !verificarSenha(atual, u.senha_hash)) throw new ErroNegocio("A senha atual está incorreta.");
  if (nova.length < 8) throw new ErroNegocio("A nova senha precisa ter pelo menos 8 caracteres.");
  executar("UPDATE usuarios SET senha_hash = ? WHERE id = ?", hashSenha(nova), usuarioId);
}

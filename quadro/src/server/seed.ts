import "server-only";
import fs from "node:fs";
import path from "node:path";
import { type Briefing, briefingVazio } from "@/domain/briefing";
import { executar, um } from "./db";
import { hashSenha } from "./senha";
import type { Usuario } from "./auth";
import { salvarArquivo } from "./services/arquivos";
import { comprarCreditos } from "./services/assinaturas";
import {
  aprovarQualidade,
  atribuirDesigner,
  clienteAprovar,
  comentar,
  criarPedido,
  enviarVersao,
} from "./services/pedidos";
import { cadastrarCliente } from "./services/usuarios";

// Dados de teste, criados na primeira vez que o servidor sobe com o banco vazio.
// Usa os serviços reais, então também funciona como um teste do fluxo completo.
// Para recomeçar do zero: pare o servidor e rode "npm run db:reset".

export const SENHA_TESTE = "quadro123";

export const CONTAS_TESTE = [
  { email: "cliente@teste.com", papel: "Cliente", nome: "Marina Alves" },
  { email: "designer@teste.com", papel: "Designer", nome: "Rafa Lima" },
  { email: "senior@teste.com", papel: "Designer sênior", nome: "Bruno Costa" },
  { email: "gerente@teste.com", papel: "Gerente de projetos", nome: "Paula Nunes" },
  { email: "diretor@teste.com", papel: "Diretor de arte", nome: "Caio Mendes" },
];

const PASTA_SEED = path.join(process.cwd(), "seed");

function arquivoLocal(nome: string, tipo: string) {
  return new File([fs.readFileSync(path.join(PASTA_SEED, nome))], nome, { type: tipo });
}

function equipe(papel: string, nome: string, email: string, senior = 0): Usuario {
  const id = executar(
    "INSERT INTO usuarios (papel, nome, email, senha_hash, senior) VALUES (?, ?, ?, ?, ?)",
    papel,
    nome,
    email,
    hashSenha(SENHA_TESTE),
    senior,
  ).id;
  return um<Usuario>("SELECT id, papel, nome, email, empresa, senior FROM usuarios WHERE id = ?", id)!;
}

function briefing(parcial: Partial<Briefing>): Briefing {
  return { ...briefingVazio(), aprovador: "Marina Alves", email: "cliente@teste.com", ...parcial };
}

export async function popularSeVazio() {
  if (um("SELECT id FROM usuarios LIMIT 1")) return;
  console.log("[quadro] Banco vazio: criando dados de teste...");

  const rafa = equipe("designer", "Rafa Lima", "designer@teste.com");
  equipe("designer", "Bruno Costa", "senior@teste.com", 1);
  const paula = equipe("gerente", "Paula Nunes", "gerente@teste.com");
  const caio = equipe("diretor", "Caio Mendes", "diretor@teste.com");
  equipe("admin", "Admin Quadro", "admin@teste.com");

  const marina = cadastrarCliente({
    nome: "Marina Alves",
    empresa: "Verão Moda",
    email: "cliente@teste.com",
    senha: SENHA_TESTE,
    planoId: "crescimento",
    metodo: "cartao",
    cartaoFinal: "4242",
  });
  comprarCreditos(marina.id, 25);

  const logo = await salvarArquivo(marina, arquivoLocal("logo-verao-moda.svg", "image/svg+xml"), "logo");
  const marca = {
    arquivos: { logo: [logo.id], manual: [], fotos: [] },
    cores: ["#4B3BFF", "#FFD23F", "#191C2E"],
    visual: "padrao" as const,
  };

  // 1) Vídeo curto aguardando revisão do cliente
  const promo = criarPedido(
    marina,
    briefing({
      ...marca,
      tipo: "curto",
      nome: "Promo Coleção Verão",
      objetivo: "Vender produto",
      publico: "Mulheres de 25 a 40 anos que já seguem a marca",
      plataformas: ["Instagram Reels", "TikTok"],
      cta: "Comprar pelo link na bio",
      formatos: ["9:16"],
      duracao: 15,
      audio: "Trilha e efeitos",
      legendas: "Sim",
      cenas: ["Texto: Coleção Verão", "Três looks com transição rápida", "Texto: até 30% off", "Logo e link na bio"],
      estilo: ["Tipografia animada"],
      tom: "Energético",
      refs: [{ url: "https://www.instagram.com/reel/exemplo", gosta: "O ritmo rápido das transições" }],
    }),
  );
  atribuirDesigner(paula, promo.id, rafa.id);
  const v1 = await salvarArquivo(rafa, arquivoLocal("video-curto.mp4", "video/mp4"), "versao");
  enviarVersao(rafa, promo.id, { arquivoId: v1.id, extras: [], nota: "Primeira versão com a trilha provisória." });
  aprovarQualidade(caio, promo.id, "Ritmo ok, cores da marca ok.");

  // 2) Animação de logo concluída
  const vinheta = criarPedido(
    marina,
    briefing({
      ...marca,
      tipo: "logo",
      nome: "Vinheta Verão Moda",
      uso: ["Abertura de vídeos", "Redes sociais"],
      formatos: ["16:9"],
      duracao: 5,
      audio: "Efeito sonoro de assinatura",
      revelacao: "Transformação de forma",
      estilo: ["Minimalista"],
      tom: "Sofisticado",
    }),
  );
  atribuirDesigner(paula, vinheta.id, rafa.id);
  const v2 = await salvarArquivo(rafa, arquivoLocal("logo.mp4", "video/mp4"), "versao");
  enviarVersao(rafa, vinheta.id, { arquivoId: v2.id, extras: [], nota: "" });
  aprovarQualidade(caio, vinheta.id, "");
  comentar(marina, vinheta.id, { texto: "Ficou ótimo, exatamente o que eu queria!", tempo: 2.5, versaoId: null, interno: false });
  clienteAprovar(marina, vinheta.id);

  // 3) Post animado em controle de qualidade
  const post = criarPedido(
    marina,
    briefing({
      ...marca,
      tipo: "post",
      nome: "Lançamento da coleção",
      objetivo: "Divulgar evento",
      publico: "Clientes da loja física e do site",
      plataformas: ["Feed"],
      formatos: ["1:1", "4:5"],
      duracao: 8,
      audio: "Só trilha",
      legendas: "Não",
      cenas: ["Texto: Lançamento", "Data e endereço da loja"],
      estilo: ["Flat 2D"],
      tom: "Divertido",
    }),
  );
  atribuirDesigner(paula, post.id, rafa.id);
  const v3 = await salvarArquivo(rafa, arquivoLocal("post.mp4", "video/mp4"), "versao");
  enviarVersao(rafa, post.id, { arquivoId: v3.id, extras: [], nota: "Versão quadrada; a 4:5 sai depois da aprovação." });

  // 4) Explicativo em produção (para o designer enviar a primeira versão)
  const explicativo = criarPedido(
    marina,
    briefing({
      ...marca,
      tipo: "explicativo",
      nome: "Como comprar no site",
      objetivo: "Explicar serviço",
      publico: "Clientes que ainda compram só na loja física",
      plataformas: ["YouTube", "Feed"],
      formatos: ["16:9"],
      duracao: 30,
      audio: "Com locução",
      voz: "Feminina jovem",
      locucao: "Comprar na Verão Moda ficou ainda mais fácil. Escolha seu look, finalize em dois cliques e receba em casa.",
      legendas: "Sim",
      cenas: ["Tela do site", "Escolhendo um look", "Pagamento rápido", "Entrega em casa"],
      estilo: ["Flat 2D", "Tipografia animada"],
      tom: "Divertido",
    }),
  );
  atribuirDesigner(paula, explicativo.id, rafa.id);

  // 5) Novo pedido aguardando triagem
  criarPedido(
    marina,
    briefing({
      ...marca,
      tipo: "post",
      nome: "Black Friday",
      objetivo: "Vender produto",
      publico: "Seguidores da marca",
      plataformas: ["Stories", "Feed"],
      formatos: ["9:16"],
      duracao: 10,
      audio: "Trilha e efeitos",
      legendas: "Não",
      semRoteiro: true,
      ideia: "Contagem regressiva para a Black Friday com 50% de desconto em toda a loja.",
      estilo: ["Tipografia animada"],
      tom: "Energético",
      prazo: "urgente",
    }),
  );

  console.log("[quadro] Dados de teste prontos. Senha de todas as contas:", SENHA_TESTE);
}

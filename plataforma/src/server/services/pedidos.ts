import "server-only";
import {
  type Briefing,
  type LinhaCredito,
  briefingVazio,
  calcularCreditos,
  custoRevisaoExtra,
  diasUteisDo,
  nomeDoPedido,
  pecaDo,
  primeiraEtapaInvalida,
  ETAPAS,
  MAX_ESCOLHAS,
  atualizarBriefing,
} from "@/domain/briefing";
import {
  type Acao,
  type StatusPedido,
  ACOES,
  DIAS_APROVACAO_AUTOMATICA,
  LIMITE_TENTATIVAS,
  STATUS,
  ehEquipe,
  formatarTempo,
  podeExecutar,
} from "@/domain/pedido";
import { ErroNegocio, executar, transacao, um, varios } from "../db";
import type { Usuario } from "../auth";
import { adicionarDiasUteis, agoraSql, deSql, paraSql } from "../datas";
import { lancar, saldo } from "./creditos";
import { IMPORTANTE, SEM_EMAIL, notificar, notificarPapel } from "./notificacoes";
import type { Arquivo } from "./arquivos";
import type { TipoPeca } from "@/domain/catalogo";
import { precos } from "./precos";

// ---------- Tipos ----------

export interface PedidoResumo {
  id: number;
  codigo: string;
  titulo: string;
  tipo: string;
  status: StatusPedido;
  creditos: number;
  urgente: number;
  entrega_prevista: string;
  criado_em: string;
  atualizado_em: string;
  revisoes_incluidas: number;
  revisoes_usadas: number;
  tentativas_internas: number;
  cliente_id: number;
  marca_id: number | null;
  marca_nome: string | null;
  cliente_nome: string;
  empresa: string | null;
  designer_id: number | null;
  designer_nome: string | null;
}

export interface Versao {
  id: number;
  numero: number;
  arquivo_id: number;
  arquivo_nome: string;
  arquivo_mime: string;
  arquivo_token: string; // identidade do conteúdo, para o endereço do vídeo nunca reaproveitar cópia antiga
  autor_nome: string;
  nota: string;
  status: "qualidade" | "reprovada" | "com_cliente" | "ajuste" | "aprovada" | "rejeitada";
  criado_em: string;
  extras: Pick<Arquivo, "id" | "nome" | "tamanho">[];
}

export interface Comentario {
  id: number;
  versao_id: number | null;
  autor_id: number;
  autor_nome: string;
  autor_papel: string;
  texto: string;
  tempo: number | null;
  interno: number;
  criado_em: string;
}

export interface Evento {
  id: number;
  tipo: string;
  de: string | null;
  para: string | null;
  detalhe: Record<string, unknown>;
  autor_nome: string | null;
  criado_em: string;
}

export interface PedidoDetalhe extends PedidoResumo {
  /** Créditos cobrados na criação, item por item (null em pedidos antigos). */
  linhasCreditos: LinhaCredito[] | null;
  briefing: Briefing;
  versoes: Versao[];
  comentarios: Comentario[];
  eventos: Evento[];
}

const SELECT_RESUMO = `
  SELECT p.id, p.codigo, p.titulo, p.tipo, p.status, p.creditos, p.urgente, p.entrega_prevista,
         p.criado_em, p.atualizado_em, p.revisoes_incluidas, p.revisoes_usadas, p.tentativas_internas,
         p.cliente_id, c.nome cliente_nome, c.empresa, p.designer_id, d.nome designer_nome, p.marca_id, m.nome marca_nome
  FROM pedidos p
  JOIN usuarios c ON c.id = p.cliente_id
  LEFT JOIN usuarios d ON d.id = p.designer_id
  LEFT JOIN marcas m ON m.id = p.marca_id`;

// ---------- Briefing recebido ----------

const texto = (v: unknown, max = 2000) => (typeof v === "string" ? v.slice(0, max) : "");
const lista = (v: unknown, max = 20) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 300)).slice(0, max) : [];
const ids = (v: unknown) =>
  Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 30) : [];
const opcional = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 200) : null);

/** Aceita somente os campos conhecidos, com o tipo certo. Nunca confia no que veio do navegador. */
export function normalizarBriefing(raw: unknown): Briefing {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const base = briefingVazio();
  const arq = (r.arquivos && typeof r.arquivos === "object" ? r.arquivos : {}) as Record<string, unknown>;
  return {
    ...base,
    tipo: pecaDo({ tipo: r.tipo as Briefing["tipo"] }) ? (r.tipo as Briefing["tipo"]) : null,
    nome: texto(r.nome, 80),
    objetivo: opcional(r.objetivo),
    objetivoOutro: texto(r.objetivoOutro, 1000),
    publico: texto(r.publico, 300),
    plataformas: lista(r.plataformas),
    cta: texto(r.cta, 300),
    uso: lista(r.uso),
    formatos: lista(r.formatos, 4),
    duracao: Number.isFinite(Number(r.duracao)) && r.duracao !== null ? Number(r.duracao) : null,
    audio: opcional(r.audio),
    legendas: r.legendas === "Sim" || r.legendas === "Não" ? r.legendas : null,
    aberto: r.aberto === true,
    cenas: lista(r.cenas, 8),
    semRoteiro: r.semRoteiro === true,
    ideia: texto(r.ideia),
    locucao: texto(r.locucao),
    voz: opcional(r.voz),
    obrig: texto(r.obrig, 500),
    revelacao: opcional(r.revelacao),
    slogan: texto(r.slogan, 200),
    marcaId: Number.isInteger(Number(r.marcaId)) && Number(r.marcaId) > 0 ? Number(r.marcaId) : null,
    arquivos: { logo: ids(arq.logo), manual: ids(arq.manual), fotos: ids(arq.fotos) },
    cores: lista(r.cores, 5).filter((c) => /^#[0-9a-f]{6}$/i.test(c)),
    visual: r.visual === "padrao" || r.visual === "especial" ? r.visual : null,
    estilo: lista(r.estilo, MAX_ESCOLHAS),
    refs: Array.isArray(r.refs)
      ? r.refs.slice(0, 4).map((x) => ({ url: texto((x as Referencia)?.url, 500), gosta: texto((x as Referencia)?.gosta, 500) }))
      : [],
    tons: lista(r.tons, MAX_ESCOLHAS),
    tomOutro: texto(r.tomOutro, 300),
    evitar: texto(r.evitar, 500),
    prazo: r.prazo === "urgente" ? "urgente" : "padrao",
    aprovador: texto(r.aprovador, 120),
    email: texto(r.email, 200),
  };
}
type Referencia = { url: string; gosta: string };

// ---------- Criação ----------

function registrarEvento(
  pedidoId: number,
  autorId: number | null,
  tipo: string,
  de: string | null,
  para: string | null,
  detalhe: Record<string, unknown> = {},
) {
  executar(
    "INSERT INTO eventos (pedido_id, autor_id, tipo, de, para, detalhe) VALUES (?, ?, ?, ?, ?, ?)",
    pedidoId,
    autorId,
    tipo,
    de,
    para,
    JSON.stringify(detalhe),
  );
}

export function criarPedido(cliente: Usuario, raw: unknown): PedidoResumo {
  if (cliente.papel !== "cliente") throw new ErroNegocio("Somente clientes fazem pedidos.", 403);
  const b = normalizarBriefing(raw);
  const invalida = primeiraEtapaInvalida(b);
  if (invalida >= 0) throw new ErroNegocio(`O briefing está incompleto na etapa "${ETAPAS[invalida]}".`);

  // A marca precisa ser do cliente; logo e manual precisam ser dessa marca; fotos, do cliente.
  if (!um("SELECT 1 FROM marcas WHERE id = ? AND usuario_id = ?", b.marcaId!, cliente.id))
    throw new ErroNegocio("Escolha uma das suas marcas.");
  const daMarca = [...b.arquivos.logo, ...b.arquivos.manual];
  if (daMarca.length) {
    const ok = varios<{ id: number }>(
      `SELECT id FROM arquivos WHERE marca_id = ? AND id IN (${daMarca.map(() => "?").join(",")})`,
      b.marcaId!,
      ...daMarca,
    );
    if (ok.length !== new Set(daMarca).size) throw new ErroNegocio("O logo ou o manual escolhido não é desta marca.");
  }
  const todos = [...b.arquivos.logo, ...b.arquivos.manual, ...b.arquivos.fotos];
  if (todos.length) {
    const meus = varios<{ id: number }>(
      `SELECT id FROM arquivos WHERE dono_id = ? AND id IN (${todos.map(() => "?").join(",")})`,
      cliente.id,
      ...todos,
    );
    if (meus.length !== new Set(todos).size) throw new ErroNegocio("Algum arquivo enviado não foi encontrado. Envie de novo.");
  }

  const peca = pecaDo(b)!;
  const tabela = precos();
  const { linhas, total } = calcularCreditos(b, tabela);
  const dias = diasUteisDo(b, tabela);

  return transacao(() => {
    const disponivel = saldo(cliente.id);
    if (disponivel < total)
      throw new ErroNegocio(`Saldo insuficiente: este pedido custa ${total} créditos e você tem ${disponivel}.`, 402);

    const id = executar(
      `INSERT INTO pedidos (cliente_id, marca_id, tipo, titulo, briefing, creditos, creditos_detalhe, urgente, dias_uteis, revisoes_incluidas, status, entrega_prevista)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'triagem', ?)`,
      cliente.id,
      b.marcaId!,
      peca.id,
      nomeDoPedido(b),
      JSON.stringify(b),
      total,
      JSON.stringify(linhas),
      b.prazo === "urgente" ? 1 : 0,
      dias,
      tabela.pecas[peca.id].revisoes,
      paraSql(adicionarDiasUteis(new Date(), dias)),
    ).id;
    const codigo = `DK-${1000 + id}`;
    executar("UPDATE pedidos SET codigo = ? WHERE id = ?", codigo, id);
    if (b.arquivos.fotos.length)
      executar(
        `UPDATE arquivos SET pedido_id = ? WHERE id IN (${b.arquivos.fotos.map(() => "?").join(",")})`,
        id,
        ...b.arquivos.fotos,
      );
    executar(
      "UPDATE marcas SET cores = ?, atualizado_em = datetime('now') WHERE id = ?",
      JSON.stringify(b.cores),
      b.marcaId!,
    );
    lancar(cliente.id, -total, "pedido", `Pedido ${codigo} · ${peca.nome}`, { pedidoId: id });
    registrarEvento(id, cliente.id, "criado", null, "triagem", { creditos: total });
    notificarPapel(["diretor", "admin"], `Novo pedido ${codigo} aguardando triagem.`, `/equipe/pedidos/${id}`, IMPORTANTE);
    return resumo(id)!;
  });
}

// ---------- Consulta ----------

const resumo = (id: number) => um<PedidoResumo>(`${SELECT_RESUMO} WHERE p.id = ?`, id);

export const listarPedidosCliente = (clienteId: number) =>
  varios<PedidoResumo>(`${SELECT_RESUMO} WHERE p.cliente_id = ? ORDER BY p.id DESC`, clienteId);

export function listarPedidosEquipe(filtro: { status?: StatusPedido[]; designerId?: number } = {}) {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filtro.status?.length) {
    where.push(`p.status IN (${filtro.status.map(() => "?").join(",")})`);
    params.push(...filtro.status);
  }
  if (filtro.designerId) {
    where.push("p.designer_id = ?");
    params.push(filtro.designerId);
  }
  return varios<PedidoResumo>(
    `${SELECT_RESUMO} ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY p.urgente DESC, p.entrega_prevista ASC`,
    ...params,
  );
}

export function contarPorStatus(): Record<StatusPedido, number> {
  const base = Object.fromEntries(Object.keys(STATUS).map((s) => [s, 0])) as Record<StatusPedido, number>;
  for (const r of varios<{ status: StatusPedido; n: number }>("SELECT status, COUNT(*) n FROM pedidos GROUP BY status"))
    base[r.status] = r.n;
  return base;
}

/** Busca o pedido respeitando quem pede: cliente só vê os próprios e não vê o que é interno. */
export function pedidoParaUsuario(id: number, usuario: Usuario): PedidoDetalhe {
  const p = um<PedidoResumo & { briefing: string; creditos_detalhe: string | null }>(
    `${SELECT_RESUMO.replace("SELECT", "SELECT p.briefing, p.creditos_detalhe,")} WHERE p.id = ?`,
    id,
  );
  const equipe = ehEquipe(usuario.papel);
  if (!p || (!equipe && p.cliente_id !== usuario.id)) throw new ErroNegocio("Pedido não encontrado.", 404);

  const versoes = varios<Omit<Versao, "extras" | "arquivo_token"> & { arquivo_caminho: string }>(
    `SELECT v.id, v.numero, v.arquivo_id, a.nome arquivo_nome, a.mime arquivo_mime, a.caminho arquivo_caminho, u.nome autor_nome, v.nota, v.status, v.criado_em
     FROM versoes v JOIN arquivos a ON a.id = v.arquivo_id JOIN usuarios u ON u.id = v.autor_id
     WHERE v.pedido_id = ? ${equipe ? "" : "AND v.status IN ('com_cliente','ajuste','aprovada','rejeitada')"}
     ORDER BY v.numero DESC`,
    id,
  ).map(({ arquivo_caminho, ...v }) => ({
    ...v,
    // Trecho do nome único em disco (UUID): muda sempre que o arquivo é outro.
    arquivo_token: arquivo_caminho.replace(/^.*[\\/]/, "").replace(/\..*$/, "").slice(0, 12),
    extras: varios<Pick<Arquivo, "id" | "nome" | "tamanho">>(
      "SELECT id, nome, tamanho FROM arquivos WHERE versao_id = ? AND categoria = 'entrega' ORDER BY id",
      v.id,
    ),
  }));

  const comentarios = varios<Comentario>(
    `SELECT c.id, c.versao_id, c.autor_id, u.nome autor_nome, u.papel autor_papel, c.texto, c.tempo, c.interno, c.criado_em
     FROM comentarios c JOIN usuarios u ON u.id = c.autor_id
     WHERE c.pedido_id = ? ${equipe ? "" : "AND c.interno = 0"} ORDER BY c.id`,
    id,
  );

  const eventos = varios<Omit<Evento, "detalhe"> & { detalhe: string }>(
    `SELECT e.id, e.tipo, e.de, e.para, e.detalhe, u.nome autor_nome, e.criado_em
     FROM eventos e LEFT JOIN usuarios u ON u.id = e.autor_id WHERE e.pedido_id = ? ORDER BY e.id`,
    id,
  ).map((e) => ({ ...e, detalhe: JSON.parse(e.detalhe) as Record<string, unknown> }));

  const { briefing, creditos_detalhe, ...resto } = p;
  return {
    ...resto,
    briefing: atualizarBriefing(JSON.parse(briefing)),
    linhasCreditos: creditos_detalhe ? (JSON.parse(creditos_detalhe) as LinhaCredito[]) : null,
    versoes,
    comentarios,
    eventos,
  };
}

// ---------- Transições ----------

function carregarParaAcao(pedidoId: number, usuario: Usuario, acao: Acao) {
  const p = resumo(pedidoId);
  if (!p) throw new ErroNegocio("Pedido não encontrado.", 404);
  if (usuario.papel === "cliente" && p.cliente_id !== usuario.id) throw new ErroNegocio("Pedido não encontrado.", 404);
  if (!podeExecutar(acao, p.status, usuario.papel))
    throw new ErroNegocio(`Essa ação não está disponível com o pedido em "${STATUS[p.status].rotulo}".`, 409);
  return p;
}

function mudarStatus(p: PedidoResumo, para: StatusPedido, extra: Record<string, string | number | null> = {}) {
  const sets = ["status = ?", "atualizado_em = ?", ...Object.keys(extra).map((k) => `${k} = ?`)];
  executar(`UPDATE pedidos SET ${sets.join(", ")} WHERE id = ?`, para, agoraSql(), ...Object.values(extra), p.id);
}

const ultimaVersao = (pedidoId: number) =>
  um<{ id: number; numero: number; status: string }>(
    "SELECT id, numero, status FROM versoes WHERE pedido_id = ? ORDER BY numero DESC LIMIT 1",
    pedidoId,
  );

const linkEquipe = (id: number) => `/equipe/pedidos/${id}`;
const linkCliente = (id: number) => `/cliente/pedidos/${id}`;

export function atribuirDesigner(usuario: Usuario, pedidoId: number, designerId: number) {
  const p = carregarParaAcao(pedidoId, usuario, "atribuir");
  // Admins também produzem (contam como designer sênior).
  const d = um<{ id: number; nome: string }>(
    "SELECT id, nome FROM usuarios WHERE id = ? AND papel IN ('designer', 'admin') AND ativo = 1",
    designerId,
  );
  if (!d) throw new ErroNegocio("Escolha um designer.");
  if (d.id === p.designer_id) throw new ErroNegocio(`${d.nome} já é o designer deste pedido.`);
  transacao(() => {
    const para = p.status === "triagem" ? "producao" : p.status;
    mudarStatus(p, para, { designer_id: d.id });
    registrarEvento(p.id, usuario.id, "atribuido", p.status, para, { designer: d.nome, anterior: p.designer_nome });
    notificar(d.id, `Você recebeu o pedido ${p.codigo}: ${p.titulo}.`, linkEquipe(p.id), IMPORTANTE);
    if (p.status === "triagem") notificar(p.cliente_id, `Seu pedido ${p.codigo} entrou em produção.`, linkCliente(p.id));
  });
}

export function enviarVersao(
  usuario: Usuario,
  pedidoId: number,
  dados: { arquivoId: number; extras: number[]; nota: string },
) {
  const p = carregarParaAcao(pedidoId, usuario, "enviar_versao");
  if (usuario.papel === "designer" && p.designer_id !== usuario.id)
    throw new ErroNegocio("Somente o designer responsável envia versões deste pedido.", 403);
  const principal = um<Arquivo>(
    "SELECT * FROM arquivos WHERE id = ? AND dono_id = ? AND categoria = 'versao' AND versao_id IS NULL",
    dados.arquivoId,
    usuario.id,
  );
  if (!principal) throw new ErroNegocio("Envie o arquivo de vídeo da versão.");
  const extras = dados.extras.filter((n) => Number.isInteger(n));

  transacao(() => {
    const numero = (ultimaVersao(p.id)?.numero ?? 0) + 1;
    const versaoId = executar(
      "INSERT INTO versoes (pedido_id, numero, arquivo_id, autor_id, nota, status) VALUES (?, ?, ?, ?, ?, 'qualidade')",
      p.id,
      numero,
      principal.id,
      usuario.id,
      dados.nota.trim().slice(0, 2000),
    ).id;
    executar("UPDATE arquivos SET pedido_id = ?, versao_id = ? WHERE id = ?", p.id, versaoId, principal.id);
    for (const ex of extras)
      executar(
        "UPDATE arquivos SET pedido_id = ?, versao_id = ? WHERE id = ? AND dono_id = ? AND categoria = 'entrega' AND versao_id IS NULL",
        p.id,
        versaoId,
        ex,
        usuario.id,
      );
    mudarStatus(p, "qualidade");
    registrarEvento(p.id, usuario.id, "versao_enviada", p.status, "qualidade", { versao: numero });
    notificarPapel(["diretor"], `Versão ${numero} do pedido ${p.codigo} aguarda controle de qualidade.`, linkEquipe(p.id));
  });
}

export function aprovarQualidade(usuario: Usuario, pedidoId: number, nota: string) {
  const p = carregarParaAcao(pedidoId, usuario, "aprovar_qualidade");
  const v = ultimaVersao(p.id)!;
  transacao(() => {
    executar("UPDATE versoes SET status = 'com_cliente' WHERE id = ?", v.id);
    mudarStatus(p, "revisao_cliente");
    registrarEvento(p.id, usuario.id, "qualidade_aprovada", p.status, "revisao_cliente", { versao: v.numero, nota: nota.trim() });
    notificar(p.cliente_id, `Uma nova versão do pedido ${p.codigo} está pronta para sua revisão.`, linkCliente(p.id), IMPORTANTE);
    if (p.designer_id) notificar(p.designer_id, `Versão ${v.numero} do ${p.codigo} aprovada no controle de qualidade.`, linkEquipe(p.id));
  });
}

export interface Diagnostico {
  tipoErro: string;
  cena: string;
  minutagem: string;
  texto: string;
}

export function reprovarQualidade(usuario: Usuario, pedidoId: number, d: Diagnostico) {
  const p = carregarParaAcao(pedidoId, usuario, "reprovar_qualidade");
  if (!d.tipoErro) throw new ErroNegocio("Escolha o tipo de erro.");
  if (d.texto.trim().length < 5) throw new ErroNegocio("Descreva o que precisa ser corrigido.");
  const v = ultimaVersao(p.id)!;
  const tentativas = p.tentativas_internas + 1;
  transacao(() => {
    executar("UPDATE versoes SET status = 'reprovada' WHERE id = ?", v.id);
    mudarStatus(p, "producao", { tentativas_internas: tentativas });
    const diag = { versao: v.numero, tipoErro: d.tipoErro, cena: d.cena.trim(), minutagem: d.minutagem.trim(), texto: d.texto.trim() };
    registrarEvento(p.id, usuario.id, "qualidade_reprovada", p.status, "producao", diag);
    const onde = [d.cena.trim() && `Cena ${d.cena.trim()}`, d.minutagem.trim()].filter(Boolean).join(" · ");
    executar(
      "INSERT INTO comentarios (pedido_id, versao_id, autor_id, texto, interno) VALUES (?, ?, ?, ?, 1)",
      p.id,
      v.id,
      usuario.id,
      `Reprovado no controle de qualidade (${d.tipoErro}${onde ? ` · ${onde}` : ""}): ${d.texto.trim()}`,
    );
    if (p.designer_id) notificar(p.designer_id, `Versão ${v.numero} do ${p.codigo} voltou com ajustes internos.`, linkEquipe(p.id), IMPORTANTE);
    if (tentativas >= LIMITE_TENTATIVAS) {
      registrarEvento(p.id, null, "escalar", null, null, { tentativas });
      notificarPapel(
        ["diretor", "admin"],
        `O pedido ${p.codigo} foi reprovado ${tentativas} vezes no controle de qualidade. Considere um designer mais sênior.`,
        linkEquipe(p.id),
        IMPORTANTE,
      );
    }
  });
}

/** Fecha o pedido com a última versão como final. Usado pelas três formas de conclusão. */
function aprovarVersaoFinal(p: PedidoResumo, autorId: number | null, tipoEvento: string, detalhe: Record<string, unknown>) {
  const v = ultimaVersao(p.id)!;
  executar("UPDATE versoes SET status = 'aprovada' WHERE id = ?", v.id);
  mudarStatus(p, "aprovado");
  registrarEvento(p.id, autorId, tipoEvento, p.status, "aprovado", { versao: v.numero, ...detalhe });
}

export function clienteAprovar(usuario: Usuario, pedidoId: number) {
  const p = carregarParaAcao(pedidoId, usuario, "cliente_aprovar");
  transacao(() => {
    aprovarVersaoFinal(p, usuario.id, "cliente_aprovou", {
      primeira: p.revisoes_usadas === 0 && p.tentativas_internas === 0,
    });
    if (p.designer_id) notificar(p.designer_id, `O cliente aprovou o pedido ${p.codigo}.`, linkEquipe(p.id));
    notificarPapel(["diretor"], `Pedido ${p.codigo} aprovado pelo cliente.`, linkEquipe(p.id));
  });
}

/** Conclusão manual pelo diretor de arte (ex.: cliente aprovou por outro canal ou não responde). */
export function concluirPorDiretor(usuario: Usuario, pedidoId: number, motivo: string) {
  const p = carregarParaAcao(pedidoId, usuario, "concluir");
  if (motivo.trim().length < 5) throw new ErroNegocio("Explique por que o pedido está sendo concluído.");
  transacao(() => {
    aprovarVersaoFinal(p, usuario.id, "concluido_equipe", { motivo: motivo.trim().slice(0, 1000) });
    notificar(
      p.cliente_id,
      `O pedido ${p.codigo} foi concluído pela equipe. Os arquivos finais estão liberados.`,
      linkCliente(p.id),
      IMPORTANTE,
    );
    if (p.designer_id) notificar(p.designer_id, `O pedido ${p.codigo} foi concluído por ${usuario.nome}.`, linkEquipe(p.id));
  });
}

/** Quando a versão atual com o cliente será aprovada automaticamente (null se não está com o cliente). */
export function prazoAprovacaoAutomatica(pedidoId: number): Date | null {
  const e = um<{ criado_em: string }>(
    `SELECT e.criado_em FROM eventos e JOIN pedidos p ON p.id = e.pedido_id
     WHERE e.pedido_id = ? AND e.tipo = 'qualidade_aprovada' AND p.status = 'revisao_cliente'
     ORDER BY e.id DESC LIMIT 1`,
    pedidoId,
  );
  return e ? adicionarDiasUteis(deSql(e.criado_em), DIAS_APROVACAO_AUTOMATICA) : null;
}

/**
 * Aprovação automática: versões com o cliente há mais de DIAS_APROVACAO_AUTOMATICA dias
 * úteis são aprovadas; um dia útil antes, o cliente recebe um lembrete. Roda a cada hora
 * (instrumentation.ts) e também quando alguém abre as áreas logadas.
 */
export function processarAprovacoesAutomaticas(): number {
  const agora = new Date();
  const pendentes = varios<PedidoResumo & { liberado_em: string; lembrado: number }>(
    `${SELECT_RESUMO.replace(
      "SELECT",
      `SELECT (SELECT MAX(e.criado_em) FROM eventos e WHERE e.pedido_id = p.id AND e.tipo = 'qualidade_aprovada') liberado_em,
              (SELECT COUNT(*) FROM eventos e WHERE e.pedido_id = p.id AND e.tipo = 'lembrete_aprovacao'
                 AND e.criado_em >= (SELECT MAX(e2.criado_em) FROM eventos e2 WHERE e2.pedido_id = p.id AND e2.tipo = 'qualidade_aprovada')) lembrado,`,
    )} WHERE p.status = 'revisao_cliente'`,
  );
  let aprovados = 0;
  for (const p of pendentes) {
    if (!p.liberado_em) continue;
    const liberado = deSql(p.liberado_em);
    if (adicionarDiasUteis(liberado, DIAS_APROVACAO_AUTOMATICA) <= agora) {
      transacao(() => {
        if (resumo(p.id)?.status !== "revisao_cliente") return; // alguém agiu nesse meio-tempo
        aprovarVersaoFinal(p, null, "aprovacao_automatica", { dias: DIAS_APROVACAO_AUTOMATICA });
        notificar(
          p.cliente_id,
          `O pedido ${p.codigo} foi aprovado automaticamente: não recebemos sua revisão em ${DIAS_APROVACAO_AUTOMATICA} dias úteis. Os arquivos finais estão liberados.`,
          linkCliente(p.id),
          IMPORTANTE,
        );
        if (p.designer_id) notificar(p.designer_id, `O pedido ${p.codigo} foi aprovado automaticamente.`, linkEquipe(p.id));
        notificarPapel(["diretor"], `Pedido ${p.codigo} aprovado automaticamente por falta de resposta do cliente.`, linkEquipe(p.id));
        aprovados++;
      });
    } else if (!p.lembrado && adicionarDiasUteis(liberado, DIAS_APROVACAO_AUTOMATICA - 1) <= agora) {
      transacao(() => {
        registrarEvento(p.id, null, "lembrete_aprovacao", null, null);
        notificar(
          p.cliente_id,
          `Falta 1 dia útil para revisar o pedido ${p.codigo}. Depois disso, a peça é aprovada automaticamente.`,
          linkCliente(p.id),
          IMPORTANTE,
        );
      });
    }
  }
  return aprovados;
}

/** Custo da próxima rodada de ajuste para este pedido (0 se ainda há revisões incluídas). */
export function custoProximoAjuste(
  p: Pick<PedidoResumo, "revisoes_usadas" | "revisoes_incluidas" | "tipo">,
  duracao: number | null,
) {
  return p.revisoes_usadas >= p.revisoes_incluidas ? custoRevisaoExtra(p.tipo as TipoPeca, duracao, precos()) : 0;
}

export function clientePedirAjuste(
  usuario: Usuario,
  pedidoId: number,
  dados: { texto: string; aceitaCobranca: boolean },
) {
  const p = carregarParaAcao(pedidoId, usuario, "cliente_ajuste");
  const comentados = um<{ n: number }>(
    "SELECT COUNT(*) n FROM comentarios WHERE pedido_id = ? AND versao_id = ? AND interno = 0 AND autor_id = ?",
    p.id,
    ultimaVersao(p.id)!.id,
    p.cliente_id,
  )!.n;
  if (dados.texto.trim().length < 5 && comentados === 0)
    throw new ErroNegocio("Diga o que precisa mudar, aqui ou em comentários no vídeo.");
  const b = pedidoParaUsuario(p.id, usuario).briefing;
  const custo = custoProximoAjuste(p, b.duracao);
  if (custo > 0 && !dados.aceitaCobranca)
    throw new ErroNegocio(`Suas revisões incluídas acabaram. Esta rodada custa ${custo} créditos; confirme para continuar.`);
  const v = ultimaVersao(p.id)!;

  transacao(() => {
    if (custo > 0) {
      const disponivel = saldo(p.cliente_id);
      if (disponivel < custo) throw new ErroNegocio(`Saldo insuficiente: a revisão extra custa ${custo} créditos.`, 402);
      lancar(p.cliente_id, -custo, "revisao_extra", `Revisão extra · ${p.codigo}`, { pedidoId: p.id });
    }
    executar("UPDATE versoes SET status = 'ajuste' WHERE id = ?", v.id);
    mudarStatus(p, "ajustes", { revisoes_usadas: p.revisoes_usadas + 1 });
    if (dados.texto.trim())
      executar(
        "INSERT INTO comentarios (pedido_id, versao_id, autor_id, texto, interno) VALUES (?, ?, ?, ?, 0)",
        p.id,
        v.id,
        usuario.id,
        dados.texto.trim().slice(0, 4000),
      );
    registrarEvento(p.id, usuario.id, "cliente_ajuste", p.status, "ajustes", {
      versao: v.numero,
      rodada: p.revisoes_usadas + 1,
      custo,
    });
    const alvo = p.designer_id;
    if (alvo) notificar(alvo, `O cliente pediu ajustes na versão ${v.numero} do ${p.codigo}.`, linkEquipe(p.id), IMPORTANTE);
    else notificarPapel(["diretor"], `Ajustes pedidos no ${p.codigo}, sem designer atribuído.`, linkEquipe(p.id), IMPORTANTE);
  });
}

export function clienteRejeitar(usuario: Usuario, pedidoId: number, dados: { motivo: string; texto: string }) {
  const p = carregarParaAcao(pedidoId, usuario, "cliente_rejeitar");
  if (!dados.motivo) throw new ErroNegocio("Escolha o motivo.");
  if (dados.texto.trim().length < 5) throw new ErroNegocio("Conte o que não funcionou para podermos recomeçar do jeito certo.");
  const v = ultimaVersao(p.id)!;
  transacao(() => {
    executar("UPDATE versoes SET status = 'rejeitada' WHERE id = ?", v.id);
    mudarStatus(p, "triagem", { designer_id: null });
    registrarEvento(p.id, usuario.id, "cliente_rejeitou", p.status, "triagem", {
      versao: v.numero,
      motivo: dados.motivo,
      texto: dados.texto.trim(),
    });
    executar(
      "INSERT INTO comentarios (pedido_id, versao_id, autor_id, texto, interno) VALUES (?, ?, ?, ?, 0)",
      p.id,
      v.id,
      usuario.id,
      `Rejeição total (${dados.motivo}): ${dados.texto.trim()}`,
    );
    notificarPapel(
      ["diretor", "admin"],
      `Rejeição total no ${p.codigo}. Converse com o cliente e ajuste o briefing antes de reatribuir.`,
      linkEquipe(p.id),
      IMPORTANTE,
    );
    if (p.designer_id) notificar(p.designer_id, `O pedido ${p.codigo} foi rejeitado pelo cliente e voltou para a triagem.`, linkEquipe(p.id), IMPORTANTE);
  });
}

/**
 * Cancelamento (só na triagem). Sem versão produzida: devolve tudo.
 * Com versão já produzida (ex.: após rejeição): cobrança parcial, devolve metade,
 * a menos que o diretor marque como erro da plataforma (devolução integral).
 */
export function cancelarPedido(usuario: Usuario, pedidoId: number, erroPlataforma = false) {
  const p = carregarParaAcao(pedidoId, usuario, "cancelar");
  const teveVersao = Boolean(ultimaVersao(p.id));
  const integral = !teveVersao || (erroPlataforma && ehEquipe(usuario.papel));
  const devolver = integral ? p.creditos : Math.floor(p.creditos / 2);
  transacao(() => {
    mudarStatus(p, "cancelado");
    if (devolver > 0) lancar(p.cliente_id, devolver, "estorno", `Cancelamento ${p.codigo}${integral ? "" : " (parcial)"}`, { pedidoId: p.id });
    registrarEvento(p.id, usuario.id, "cancelado", p.status, "cancelado", { devolvido: devolver, integral });
    if (usuario.id !== p.cliente_id)
      notificar(p.cliente_id, `O pedido ${p.codigo} foi cancelado e ${devolver} créditos voltaram para você.`, linkCliente(p.id), IMPORTANTE);
    else notificarPapel(["diretor"], `O cliente cancelou o pedido ${p.codigo}.`, linkEquipe(p.id));
  });
  return devolver;
}

export function comentar(
  usuario: Usuario,
  pedidoId: number,
  dados: { texto: string; tempo: number | null; versaoId: number | null; interno: boolean },
) {
  const p = resumo(pedidoId);
  const equipe = ehEquipe(usuario.papel);
  if (!p || (!equipe && p.cliente_id !== usuario.id)) throw new ErroNegocio("Pedido não encontrado.", 404);
  if (p.status === "cancelado") throw new ErroNegocio("Este pedido foi cancelado.");
  const textoLimpo = dados.texto.trim();
  if (!textoLimpo) throw new ErroNegocio("Escreva o comentário.");
  const interno = equipe && dados.interno;
  if (dados.versaoId) {
    const v = pedidoParaUsuario(p.id, usuario).versoes.find((x) => x.id === dados.versaoId);
    if (!v) throw new ErroNegocio("Versão não encontrada.", 404);
  }
  const tempo = dados.tempo !== null && Number.isFinite(dados.tempo) && dados.tempo >= 0 ? dados.tempo : null;
  executar(
    "INSERT INTO comentarios (pedido_id, versao_id, autor_id, texto, tempo, interno) VALUES (?, ?, ?, ?, ?, ?)",
    p.id,
    dados.versaoId,
    usuario.id,
    textoLimpo.slice(0, 4000),
    tempo,
    interno ? 1 : 0,
  );
  const marca = tempo !== null ? ` em ${formatarTempo(tempo)}` : "";
  if (!equipe) {
    if (p.designer_id) notificar(p.designer_id, `Novo comentário do cliente${marca} no ${p.codigo}.`, linkEquipe(p.id), SEM_EMAIL);
    else notificarPapel(["diretor"], `Novo comentário do cliente no ${p.codigo}.`, linkEquipe(p.id), SEM_EMAIL);
  } else if (!interno) {
    notificar(p.cliente_id, `A equipe respondeu no pedido ${p.codigo}.`, linkCliente(p.id));
  }
}

// ---------- Métricas ----------

export function metricas() {
  const aprovados = um<{ total: number; primeira: number }>(
    `SELECT COUNT(*) total, COALESCE(SUM(CASE WHEN revisoes_usadas = 0 AND tentativas_internas = 0 THEN 1 ELSE 0 END), 0) primeira
     FROM pedidos p WHERE status = 'aprovado'
       -- só aprovações reais do cliente; conclusão automática ou pela equipe não contam
       AND EXISTS (SELECT 1 FROM eventos e WHERE e.pedido_id = p.id AND e.tipo = 'cliente_aprovou')`,
  )!;
  const motivos = varios<{ origem: string; motivo: string; n: number }>(
    `SELECT CASE tipo WHEN 'qualidade_reprovada' THEN 'Interna' ELSE 'Cliente' END origem,
            COALESCE(json_extract(detalhe, '$.tipoErro'), json_extract(detalhe, '$.motivo'), 'Ajuste pedido') motivo,
            COUNT(*) n
     FROM eventos WHERE tipo IN ('qualidade_reprovada', 'cliente_ajuste', 'cliente_rejeitou')
     GROUP BY origem, motivo ORDER BY n DESC LIMIT 8`,
  );
  return {
    aprovados: aprovados.total,
    taxaPrimeira: aprovados.total ? Math.round((aprovados.primeira / aprovados.total) * 100) : null,
    motivos,
  };
}

export { ACOES };

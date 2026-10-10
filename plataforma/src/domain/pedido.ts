// Status do pedido e papéis. A máquina de estados fica aqui para que tela,
// API, notificações e o futuro app sigam exatamente as mesmas regras.

export type Papel = "cliente" | "designer" | "diretor" | "admin";

export const PAPEIS: Record<Papel, string> = {
  cliente: "Cliente",
  designer: "Designer",
  diretor: "Diretor de arte",
  admin: "Administrador",
};

export const ehEquipe = (p: Papel) => p !== "cliente";

/** Papéis com acesso à área da equipe. */
export const EQUIPE: Papel[] = ["designer", "diretor", "admin"];

export type StatusPedido =
  | "triagem"
  | "producao"
  | "qualidade"
  | "revisao_cliente"
  | "ajustes"
  | "aprovado"
  | "cancelado";

interface InfoStatus {
  rotulo: string; // nome curto, para a equipe
  cliente: string; // como o cliente vê
  tom: "neutro" | "andamento" | "acao" | "ok" | "parado";
}

export const STATUS: Record<StatusPedido, InfoStatus> = {
  triagem: { rotulo: "Triagem", cliente: "Recebido", tom: "neutro" },
  producao: { rotulo: "Produção", cliente: "Em produção", tom: "andamento" },
  qualidade: { rotulo: "Controle de qualidade", cliente: "Em produção", tom: "andamento" },
  revisao_cliente: { rotulo: "Com o cliente", cliente: "Aguardando sua revisão", tom: "acao" },
  ajustes: { rotulo: "Ajustes", cliente: "Em ajuste", tom: "andamento" },
  aprovado: { rotulo: "Aprovado", cliente: "Concluído", tom: "ok" },
  cancelado: { rotulo: "Cancelado", cliente: "Cancelado", tom: "parado" },
};

/** Etapas mostradas ao cliente na linha do tempo do pedido. */
export const LINHA_CLIENTE: { chave: string; rotulo: string; status: StatusPedido[] }[] = [
  { chave: "recebido", rotulo: "Recebido", status: ["triagem"] },
  { chave: "producao", rotulo: "Produção", status: ["producao", "qualidade", "ajustes"] },
  { chave: "revisao", rotulo: "Sua revisão", status: ["revisao_cliente"] },
  { chave: "concluido", rotulo: "Concluído", status: ["aprovado"] },
];

export type Acao =
  | "atribuir"
  | "enviar_versao"
  | "aprovar_qualidade"
  | "reprovar_qualidade"
  | "cliente_aprovar"
  | "cliente_ajuste"
  | "cliente_rejeitar"
  | "concluir"
  | "cancelar"
  | "reativar";

interface RegraAcao {
  de: StatusPedido[];
  para: StatusPedido | null; // null = não muda status (ex.: reatribuir em produção)
  papeis: Papel[];
}

export const ACOES: Record<Acao, RegraAcao> = {
  atribuir: { de: ["triagem", "producao", "ajustes"], para: null, papeis: ["diretor", "admin"] },
  enviar_versao: { de: ["producao", "ajustes"], para: "qualidade", papeis: ["designer", "admin"] },
  aprovar_qualidade: { de: ["qualidade"], para: "revisao_cliente", papeis: ["diretor", "admin"] },
  reprovar_qualidade: { de: ["qualidade"], para: "producao", papeis: ["diretor", "admin"] },
  cliente_aprovar: { de: ["revisao_cliente"], para: "aprovado", papeis: ["cliente", "admin"] },
  cliente_ajuste: { de: ["revisao_cliente"], para: "ajustes", papeis: ["cliente", "admin"] },
  cliente_rejeitar: { de: ["revisao_cliente"], para: "triagem", papeis: ["cliente", "admin"] },
  concluir: { de: ["revisao_cliente"], para: "aprovado", papeis: ["diretor", "admin"] },
  cancelar: { de: ["triagem"], para: "cancelado", papeis: ["cliente", "diretor", "admin"] },
  // Volta para a produção (com o mesmo designer) ou, sem designer ativo, para a triagem.
  reativar: { de: ["aprovado", "cancelado"], para: "producao", papeis: ["diretor", "admin"] },
};

/** O admin pode executar qualquer ação; os demais, só as do seu papel. O status sempre precisa permitir. */
export const podeExecutar = (acao: Acao, status: StatusPedido, papel: Papel) =>
  ACOES[acao].de.includes(status) && (papel === "admin" || ACOES[acao].papeis.includes(papel));

/** Depois de quantas reprovações internas o pedido deve ir para um designer mais sênior. */
export const LIMITE_TENTATIVAS = 2;

/** Dias úteis que o cliente tem para revisar uma versão antes da aprovação automática. */
export const DIAS_APROVACAO_AUTOMATICA = 5;

export const TIPOS_ERRO = [
  "Fora do briefing",
  "Erro de marca (cor, fonte, logo)",
  "Texto ou ortografia",
  "Ritmo ou timing",
  "Qualidade técnica (render, áudio)",
  "Outro",
];

export const MOTIVOS_REJEICAO = [
  "Não era o que eu tinha pedido",
  "Mudei de ideia sobre o conceito",
  "O briefing estava incompleto",
  "Outro",
];

export const formatarTempo = (seg: number) => {
  const s = Math.max(0, Math.floor(seg));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

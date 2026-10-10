// Canais de atendimento (out/2026).
/** Para quem ainda não é cliente: dúvidas sobre contratar os serviços. */
export const EMAIL_CONTATO = "contato@darkkitchen.art.br";
// Clientes falam com o atendimento (SAC) pelo chat da plataforma (services/atendimento.ts).
// E-mail do SAC, guardado para uso futuro (ex.: avisos por e-mail): sac@darkkitchen.art.br

/** Como o atendimento (admin) aparece para o cliente no chat, sem o nome de quem respondeu. */
export const NOME_ATENDIMENTO = "Atendimento DK Studio";

export const mailto = (email: string, assunto?: string) =>
  `mailto:${email}${assunto ? `?subject=${encodeURIComponent(assunto)}` : ""}`;

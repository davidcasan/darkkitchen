// Mensagens de confirmação exibidas no topo do pedido depois de uma ação que
// muda o status (o formulário da ação some da tela quando o status muda).

export const MENSAGENS = {
  atribuido: "Designer atribuído.",
  versao_enviada: "Versão enviada para o controle de qualidade.",
  qa_aprovada: "Versão liberada para o cliente.",
  qa_reprovada: "Versão devolvida ao designer com o diagnóstico.",
  aprovado: "Peça aprovada. Os arquivos finais estão liberados.",
  ajuste: "Ajuste enviado para a equipe.",
  rejeitado: "Recebemos. O diretor de arte vai falar com você para recomeçar.",
  cancelado: "Pedido cancelado e créditos devolvidos.",
  concluido: "Pedido concluído. O cliente foi avisado e os arquivos finais estão liberados.",
} as const;

export type CodigoMensagem = keyof typeof MENSAGENS;

export const mensagemDe = (codigo: unknown) =>
  typeof codigo === "string" && codigo in MENSAGENS ? MENSAGENS[codigo as CodigoMensagem] : null;

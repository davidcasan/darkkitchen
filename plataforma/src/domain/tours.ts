// Tours guiados do cliente (out/2026): balões que apontam para cada parte da tela.
// Cada tour abre sozinho na primeira vez (usuarios.tours_vistos) e pode ser refeito pelo
// botão "?" da página; o cliente pode pular a qualquer momento. Conteúdo puro (sem tela).
// `alvo` é um seletor CSS; passos cujo alvo não está visível (ex.: menu lateral no
// celular) são pulados. Sem `alvo`, o balão aparece no centro da tela.

export interface PassoTour {
  alvo?: string;
  titulo: string;
  texto: string;
  lado?: "top" | "right" | "bottom" | "left";
}

const nav = (href: string) => `[data-tour="nav:${href}"]`;
const campo = (id: string) => `#f-${id}`;

export const TOURS = {
  painel: [
    {
      titulo: "Bem-vindo à Dark Kitchen Studio",
      texto:
        "Você pede a peça por um formulário, nossa equipe de motion designers produz e você recebe tudo por aqui. Vamos ver em 1 minuto onde fica cada coisa. Pode pular quando quiser.",
    },
    { alvo: nav("/cliente/pedidos/novo"), titulo: "Novo pedido", texto: "Comece por aqui: um formulário em 8 etapas. Ele salva sozinho no navegador; se fechar, dá para continuar depois." },
    { alvo: nav("/cliente/pedidos"), titulo: "Pedidos", texto: "Todos os seus pedidos e a situação de cada um. Dentro do pedido você assiste às versões, comenta e aprova." },
    { alvo: nav("/cliente/creditos"), titulo: "Créditos", texto: "Seu saldo e o extrato: o que entrou com o plano, o que foi usado e o que foi devolvido." },
    { alvo: nav("/cliente/marcas"), titulo: "Marcas", texto: "Logo, manual, fontes e cores de cada marca ficam guardados aqui e já vêm prontos nos próximos pedidos." },
    { alvo: nav("/cliente/conta"), titulo: "Conta", texto: "Plano, pagamento, avisos por e-mail e senha. Também dá para mostrar todos os tours de novo." },
    { alvo: '[data-tour="saldo"]', titulo: "Seu saldo", texto: "Os créditos do plano renovam todo mês. Cada pedido mostra antes de enviar quanto vai usar." },
    { alvo: '[data-tour="sino"], [data-tour="novidades"]', titulo: "Avisos", texto: "Novidades dos seus pedidos aparecem aqui: versão pronta para revisar, prazo, pagamento." },
    { alvo: '[data-tour="atendimento"]', titulo: "Atendimento", texto: "Fale com a nossa equipe a qualquer momento, em qualquer página." },
    { alvo: '[data-tour="tour"]', titulo: "Ver de novo", texto: "Este botão refaz o tour da página. No formulário de pedido, ele explica cada etapa." },
  ],
  "etapa-1": [
    { alvo: '[data-tour="etapas"]', titulo: "As 8 etapas do pedido", texto: "Você avança por elas e pode voltar a qualquer uma já preenchida clicando aqui. Em cada etapa, um tour curto explica os campos." },
    { alvo: '[data-tour="resumo"], [data-tour="resumo-movel"]', titulo: "Créditos e prazo", texto: "O resumo mostra, item por item, quantos créditos o pedido vai usar, o prazo e as rodadas de ajuste incluídas." },
    {
      alvo: campo("tipo"),
      titulo: "Tipo de peça",
      texto:
        "Post animado: arte de feed com movimento. Vídeo curto: Reels, Stories e TikTok. Vídeo explicativo: produto ou serviço com roteiro. Animação de logo: vinheta para abrir ou fechar vídeos. Na dúvida, pense em onde a peça vai passar.",
    },
    { alvo: '[data-tour="tour"]', titulo: "Dúvida em alguma etapa?", texto: "Clique no \"?\" para ver de novo o tour da etapa em que você está." },
  ],
  "etapa-2": [
    { alvo: campo("nome"), titulo: "Nome do pedido", texto: "Um nome para você achar o pedido depois, como \"Promo Dia das Mães\"." },
    { alvo: campo("uso"), titulo: "Onde a vinheta aparece", texto: "Marque todos os usos: abertura, encerramento, redes, apresentações. Isso muda o ritmo e o final da animação." },
    { alvo: campo("objetivo"), titulo: "Objetivo", texto: "Escolha um objetivo principal. Se marcar \"Outro\", explique o job: o que precisa acontecer depois que a pessoa assistir?" },
    { alvo: campo("publico"), titulo: "Quem vai assistir", texto: "Seja específico: \"mulheres de 25 a 40 anos que já compram pela internet\" ajuda muito mais que \"todo mundo\"." },
    { alvo: campo("plataformas"), titulo: "Onde vai ser publicado", texto: "Cada lugar já marca a proporção certa do vídeo na próxima etapa (9:16 para Reels e Stories, 4:5 para o feed, 16:9 para o YouTube)." },
    { alvo: campo("cta"), titulo: "Chamada para ação", texto: "Uma ação só e clara: \"Compre pelo link da bio\", \"Agende pelo WhatsApp\". Duas chamadas disputam a atenção." },
  ],
  "etapa-3": [
    { alvo: campo("formatos"), titulo: "Proporções", texto: "Já vêm marcadas a partir de onde a peça vai ser publicada. A primeira está inclusa; cada proporção a mais é uma adaptação e custa créditos." },
    { alvo: campo("duracao"), titulo: "Duração", texto: "Menos é mais nas redes: os primeiros 3 segundos decidem se a pessoa continua. Escolha a menor duração que caiba a mensagem." },
    { alvo: campo("audio"), titulo: "Som", texto: "Sem som, só trilha ou trilha com efeitos. Nos vídeos curtos e explicativos dá para pedir locução." },
    { alvo: campo("legendas"), titulo: "Legendas", texto: "Recomendamos para redes sociais: a maioria das pessoas assiste sem som." },
    { alvo: campo("aberto"), titulo: "Arquivo aberto", texto: "Só marque se a sua equipe vai editar a peça no After Effects depois. Tem custo adicional." },
  ],
  "etapa-4": [
    {
      alvo: campo("revelacao"),
      titulo: "Como o logo aparece",
      texto: "Escolha o tipo de revelação: crescendo, montando em partes, descortinando, efeito de luz, desenho ou outline. Se nenhum servir, marque \"Outro\".",
    },
    { alvo: campo("revelacaoOutro"), titulo: "Descreva o movimento", texto: "Conte como imagina o logo aparecendo, como explicaria a um amigo. Ex.: \"as letras caem uma a uma e o símbolo gira no fim\"." },
    { alvo: campo("slogan"), titulo: "Slogan", texto: "Se o slogan deve aparecer junto ao logo, escreva exatamente como ele é." },
    {
      alvo: campo("cenas"),
      titulo: "Roteiro e como você imagina a animação",
      texto:
        "Para cada cena, escreva o texto exato que aparece e o que acontece nela: movimento, transição, ritmo, sensação. Ex.: \"o produto entra girando; texto: Coleção Verão; clima alegre\". O contador mostra quanto texto cabe (cerca de 1,5 palavra por segundo). Sem roteiro? Marque a opção e descreva a ideia geral.",
    },
    { alvo: campo("ideia"), titulo: "Conte a ideia", texto: "O que quer comunicar, a sensação e os pontos que não podem faltar. A equipe monta o roteiro a partir disso." },
    { alvo: campo("locucao"), titulo: "Locução", texto: "Mande o texto final, já revisado. Mudar a locução depois de gravada custa uma nova gravação." },
    { alvo: campo("obrig"), titulo: "Informações que não podem faltar", texto: "Preço, site, telefone, endereço, texto legal: escreva tudo exatamente como deve aparecer na tela." },
  ],
  "etapa-5": [
    { alvo: campo("marca"), titulo: "Marca do pedido", texto: "Use uma marca já cadastrada para reaproveitar logo, manual e cores, ou crie uma nova aqui mesmo." },
    {
      alvo: campo("logo"),
      titulo: "Logo em vetor, sempre que possível",
      texto:
        "Envie o logo em arquivo vetorial: .ai (Illustrator), .svg, .eps ou .pdf vetorial. O vetor cresce sem perder qualidade e permite animar cada parte do logo. Peça ao seu designer o \"arquivo aberto do logo\". Só tem PNG? Envie o maior que tiver, com fundo transparente.",
    },
    {
      alvo: campo("manual"),
      titulo: "Manual e fontes",
      texto:
        "Envie o PDF do manual e os arquivos das fontes da marca (.otf ou .ttf). Sem a fonte original, usamos a mais parecida. Não tem os arquivos? Escreva o nome exato das fontes nas observações da marca (menu Marcas).",
    },
    { alvo: campo("fotos"), titulo: "Fotos e imagens", texto: "Em alta resolução, sem marca d'água e com direito de uso. Fotos de produto com fundo limpo rendem as melhores animações." },
    { alvo: campo("cores"), titulo: "Cores", texto: "Use os códigos exatos da marca (ex.: #861169), que estão no manual ou com o seu designer." },
    { alvo: campo("visual"), titulo: "Visual desta peça", texto: "Seguir o padrão da marca ou criar um visual especial de campanha." },
  ],
  "etapa-6": [
    { alvo: campo("estilo"), titulo: "Estilo da animação", texto: "Escolha até 5 estilos. Todos serão considerados, então marque só o que quer de verdade." },
    { alvo: campo("tom"), titulo: "Tom", texto: "Até 5 tons: a sensação que a peça deve passar. Se marcar \"Outro\", descreva." },
    {
      alvo: campo("refs"),
      titulo: "Referências: diga o que você gosta",
      texto:
        "Cole links de vídeos que você gosta (YouTube, Instagram, Vimeo, Behance), mesmo de outra marca ou segmento. O mais importante: diga o que gosta em cada um (\"o ritmo das transições\", \"as cores\", \"como o texto entra\").",
    },
    { alvo: campo("evitar"), titulo: "O que evitar", texto: "Cores, efeitos, clichês do seu mercado: o que você não quer ver. Evita retrabalho." },
  ],
  "etapa-7": [
    { alvo: '[data-tour="prazo"]', titulo: "Prazo", texto: "O prazo padrão está incluso. O urgente entrega antes e custa mais créditos. O prazo começa a contar quando o pedido é enviado." },
    { alvo: campo("aprovador"), titulo: "Quem aprova", texto: "Indique uma pessoa que decide. Aprovações em grupo costumam gerar pedidos de ajuste que se contradizem." },
  ],
  "etapa-8": [
    { alvo: '[data-tour="revisao"]', titulo: "Confira tudo", texto: "Revise textos, números, datas e contatos. Cada parte tem um botão Editar. Depois de enviado, mudanças contam como revisão." },
    { alvo: '[data-tour="enviar"]', titulo: "Enviar", texto: "O total de créditos aparece aqui. Se faltar saldo, dá para mudar de plano na hora." },
  ],
  "pedido-revisao": [
    { alvo: '[data-tour="player"]', titulo: "Sua versão", texto: "Assista com calma, quantas vezes quiser." },
    {
      alvo: '[data-tour="comentar"]',
      titulo: "Comente no ponto exato",
      texto: "Pause o vídeo no momento que quer mudar e escreva o comentário: ele fica marcado com o tempo. Seja específico: \"trocar o texto da cena 2 por...\".",
    },
    { alvo: '[data-tour="rodadas"]', titulo: "Rodadas de ajuste", texto: "Ajustes dentro do briefing usam as rodadas inclusas. Mudar a ideia original (outro roteiro ou formato) pode custar créditos; avisamos antes." },
    { alvo: '[data-tour="aprovar"]', titulo: "Aprovar ou pedir ajustes", texto: "Gostou? Aprove e os arquivos finais ficam liberados. Senão, peça ajustes resumindo o que mudar." },
  ],
} satisfies Record<string, PassoTour[]>;

export type IdTour = keyof typeof TOURS;
export const ID_TOURS = Object.keys(TOURS) as IdTour[];
export const ehTour = (id: string): id is IdTour => (ID_TOURS as string[]).includes(id);
/** Tour de cada etapa do formulário de pedido (0 a 7). */
export const tourDaEtapa = (etapa: number) => `etapa-${etapa + 1}` as IdTour;

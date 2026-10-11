// Tutorial do cliente (out/2026): mostrado no primeiro acesso e sempre disponível em
// /cliente/tutorial e no botão "Dicas desta etapa" do formulário de pedido.
// Conteúdo puro (sem tela), para servir também ao futuro app.

export interface DicaTutorial {
  titulo: string;
  texto: string;
}

export interface CapituloTutorial {
  id: string;
  rotulo: string; // nome curto na navegação
  titulo: string;
  resumo: string;
  dicas: DicaTutorial[];
  destaque?: string; // recado principal do capítulo
}

export const CAPITULOS_TUTORIAL: CapituloTutorial[] = [
  {
    id: "bem-vindo",
    rotulo: "Boas-vindas",
    titulo: "Bem-vindo à Dark Kitchen Studio",
    resumo:
      "Você pede a peça por um formulário, nossa equipe de motion designers produz e você recebe tudo por aqui. Este tutorial leva uns 3 minutos e mostra como tirar o melhor da plataforma.",
    dicas: [
      { titulo: "Você compra entregas, não horas", texto: "Cada tipo de peça já vem com duração, prazo e rodadas de ajuste definidos. O valor aparece em créditos antes de você enviar." },
      { titulo: "Créditos do plano", texto: "Seu plano renova os créditos todo mês. Cada pedido mostra quanto vai usar, item por item, ao lado do formulário." },
      { titulo: "O caminho de um pedido", texto: "Você preenche o briefing, a direção de arte revisa, um designer produz, passamos pelo controle de qualidade e você recebe a versão para aprovar ou pedir ajustes." },
    ],
    destaque: "Quanto mais completo o briefing, mais rápido e certeiro fica o resultado. As próximas telas mostram como preencher cada parte.",
  },
  {
    id: "paginas",
    rotulo: "Suas páginas",
    titulo: "Onde fica cada coisa",
    resumo: "O menu fica à esquerda no computador e embaixo da tela no celular.",
    dicas: [
      { titulo: "Início", texto: "Resumo do que precisa da sua atenção: peças para revisar, pedidos em andamento, avisos e saldo." },
      { titulo: "Novo pedido", texto: "O formulário de briefing em 8 etapas. Ele salva sozinho no navegador: se fechar, dá para continuar de onde parou." },
      { titulo: "Pedidos", texto: "Todos os seus pedidos com a situação de cada um. Dentro do pedido você assiste às versões, comenta e aprova." },
      { titulo: "Créditos", texto: "Seu saldo e o extrato: o que entrou com o plano, o que foi usado e o que foi devolvido." },
      { titulo: "Marcas", texto: "Logo, manual, fontes e cores de cada marca ficam guardados aqui e já vêm prontos nos próximos pedidos." },
      { titulo: "Conta", texto: "Plano, pagamento, avisos por e-mail, senha e o atalho para rever este tutorial." },
      { titulo: "Atendimento e avisos", texto: "O botão \"Atendimento\" abre um chat com a nossa equipe em qualquer página. O sininho mostra as novidades dos seus pedidos." },
    ],
  },
  {
    id: "etapa-1",
    rotulo: "1 · Tipo de peça",
    titulo: "Etapa 1 · Tipo de peça",
    resumo: "Escolha o formato: post animado, vídeo curto, vídeo explicativo ou animação de logo.",
    dicas: [
      { titulo: "Post animado", texto: "Arte de feed que ganha movimento. Ideal para anúncios rápidos, promoções e lançamentos." },
      { titulo: "Vídeo curto", texto: "Reels, Stories e TikTok, com ritmo e cortes rápidos para prender a atenção nos primeiros segundos." },
      { titulo: "Vídeo explicativo", texto: "Para explicar um produto, serviço ou processo com roteiro, cenas e, se quiser, locução." },
      { titulo: "Animação de logo", texto: "Vinheta curta com o seu logo, para abrir ou fechar vídeos e apresentações." },
    ],
    destaque: "Na dúvida entre dois formatos, pense em onde a peça vai passar e em quanto tempo a pessoa vai dar a ela.",
  },
  {
    id: "etapa-2",
    rotulo: "2 · Contexto",
    titulo: "Etapa 2 · Para que serve a peça",
    resumo: "Objetivo, público e onde vai ser publicada mudam ritmo, texto e enquadramento.",
    dicas: [
      { titulo: "Objetivo", texto: "Escolha um objetivo principal. Se marcar \"Outro\", explique o job com suas palavras: o que precisa acontecer depois que a pessoa assistir?" },
      { titulo: "Público", texto: "Seja específico. \"Mulheres de 25 a 40 anos que já compram pela internet\" ajuda muito mais que \"todo mundo\"." },
      { titulo: "Onde vai ser publicada", texto: "Cada lugar já marca a proporção certa do vídeo (9:16 para Reels e Stories, 4:5 para o feed, 16:9 para o YouTube)." },
      { titulo: "Chamada para ação", texto: "Uma ação só e clara: \"Compre pelo link da bio\", \"Agende pelo WhatsApp\". Duas chamadas disputam a atenção." },
    ],
  },
  {
    id: "etapa-3",
    rotulo: "3 · Formato e som",
    titulo: "Etapa 3 · Formato, duração e som",
    resumo: "Aqui se define o arquivo final que você vai receber.",
    dicas: [
      { titulo: "Proporções", texto: "As proporções vêm marcadas a partir de onde a peça vai ser publicada. A primeira está inclusa; cada proporção a mais é uma adaptação e custa créditos." },
      { titulo: "Duração", texto: "Menos é mais nas redes: os primeiros 3 segundos decidem se a pessoa continua. Escolha a menor duração que caiba sua mensagem." },
      { titulo: "Som", texto: "Escolha entre sem som, só trilha ou trilha com efeitos. Nos vídeos curtos e explicativos dá para pedir locução." },
      { titulo: "Legendas", texto: "Recomendamos para redes sociais: a maioria das pessoas assiste sem som." },
      { titulo: "Arquivo aberto (.aep)", texto: "Só marque se a sua equipe vai editar a peça no After Effects depois. Tem custo adicional." },
    ],
  },
  {
    id: "etapa-4",
    rotulo: "4 · Conteúdo",
    titulo: "Etapa 4 · O que aparece e como você imagina a animação",
    resumo: "É a etapa mais importante: aqui você conta o que quer ver na tela.",
    dicas: [
      { titulo: "Roteiro cena por cena", texto: "Para cada cena, escreva o texto exato que aparece na tela e o que acontece nela. Ex.: \"Cena 1: o produto entra girando; texto: Coleção Verão\"." },
      { titulo: "Descreva como imagina a animação", texto: "Conte o movimento, as transições, o ritmo e a sensação: \"letras surgem uma a uma\", \"transições rápidas no ritmo da música\", \"clima calmo e elegante\". Não precisa de termos técnicos; descreva como explicaria a um amigo." },
      { titulo: "Quantidade de texto", texto: "O contador mostra quantas palavras cabem: cerca de 1,5 palavra por segundo. Texto demais vira leitura apressada." },
      { titulo: "Não tem roteiro?", texto: "Marque \"não tenho roteiro\" e descreva a ideia geral: o que quer comunicar, a sensação e os pontos que não podem faltar. A equipe monta a partir disso." },
      { titulo: "Locução", texto: "Mande o texto final, já revisado, e escolha o tipo de voz. Mudar a locução depois de gravada custa uma nova gravação." },
      { titulo: "Informações que não podem faltar", texto: "Preço, site, telefone, endereço, texto legal: liste tudo o que precisa aparecer, exatamente como deve aparecer." },
      { titulo: "Animação de logo", texto: "Escolha como o logo aparece (crescendo, montando em partes, descortinando, efeito de luz, desenho, outline). Se escolher \"Outro\", descreva o movimento que imagina." },
    ],
    destaque: "Escreva textos e números exatamente como devem aparecer. O que está no briefing é o que vai para a tela.",
  },
  {
    id: "etapa-5",
    rotulo: "5 · Marca",
    titulo: "Etapa 5 · Identidade da marca",
    resumo: "Escolha (ou crie) a marca do pedido. Tudo o que você enviar fica guardado nela para os próximos pedidos.",
    dicas: [
      { titulo: "Logo em vetor, sempre que possível", texto: "Envie o logo em arquivo vetorial: .ai (Illustrator), .svg, .eps ou .pdf vetorial. O vetor cresce sem perder qualidade e permite animar cada parte do logo separadamente. Peça ao seu designer ou à agência o \"arquivo aberto do logo\"." },
      { titulo: "Só tem PNG ou JPG?", texto: "Envie o PNG maior que tiver, de preferência com fundo transparente. Logo pequeno ou com fundo branco limita a animação e pode ficar serrilhado." },
      { titulo: "Fontes da marca", texto: "Envie os arquivos das fontes (.otf ou .ttf) junto com o manual, ou escreva o nome exato delas nas observações da marca (menu Marcas). Sem a fonte original, usamos a mais parecida." },
      { titulo: "Manual de marca", texto: "Se tiver, envie o PDF: ele mostra cores, usos permitidos e proibidos do logo e o estilo da marca." },
      { titulo: "Fotos e imagens", texto: "Em alta resolução, sem marca d'água e com direito de uso. Fotos de produto com fundo limpo rendem as melhores animações." },
      { titulo: "Cores", texto: "Use os códigos exatos (ex.: #861169), que estão no manual ou com o seu designer." },
    ],
    destaque: "Logo em vetor e fontes originais são o que mais melhora o resultado final.",
  },
  {
    id: "etapa-6",
    rotulo: "6 · Estilo",
    titulo: "Etapa 6 · Estilo e referências",
    resumo: "Uma boa referência vale mais que qualquer descrição.",
    dicas: [
      { titulo: "Estilo e tom", texto: "Escolha até 5 estilos e até 5 tons. Todos serão considerados, então marque só o que quer de verdade." },
      { titulo: "Referências", texto: "Cole links de vídeos que você gosta (YouTube, Instagram, Vimeo, Behance). Pode ser de outra marca ou de outro segmento." },
      { titulo: "Diga o que você gosta nela", texto: "É o campo mais importante da referência: \"o ritmo das transições\", \"as cores\", \"como o texto entra\". Sem isso, o designer precisa adivinhar." },
      { titulo: "O que evitar", texto: "Conte também o que não quer: cores, efeitos, clichês do seu mercado. Evita retrabalho." },
    ],
  },
  {
    id: "etapa-7",
    rotulo: "7 · Prazo",
    titulo: "Etapa 7 · Prazo e aprovação",
    resumo: "O prazo começa a contar quando o pedido é enviado com tudo preenchido.",
    dicas: [
      { titulo: "Padrão ou urgente", texto: "O prazo padrão está incluso. O urgente encurta a entrega e custa 50% a mais em créditos." },
      { titulo: "Quem aprova", texto: "Indique uma pessoa que decide. Aprovações em grupo costumam gerar pedidos de ajuste que se contradizem." },
    ],
  },
  {
    id: "etapa-8",
    rotulo: "8 · Revisão",
    titulo: "Etapa 8 · Confira antes de enviar",
    resumo: "O resumo mostra todas as respostas, com um botão Editar em cada parte.",
    dicas: [
      { titulo: "Revise com calma", texto: "Confira textos, números, datas e contatos. Depois de enviado, mudanças contam como revisão." },
      { titulo: "Créditos", texto: "O total aparece ao lado. Se faltar saldo, dá para mudar de plano na hora." },
    ],
  },
  {
    id: "depois",
    rotulo: "Depois de enviar",
    titulo: "Depois de enviar: versões, ajustes e aprovação",
    resumo: "Você acompanha tudo pela página do pedido e recebe aviso a cada novidade.",
    dicas: [
      { titulo: "Acompanhe a situação", texto: "Triagem, em produção, em revisão interna e pronto para você revisar: cada mudança aparece no pedido e no sininho." },
      { titulo: "Comente no ponto exato", texto: "Pause o vídeo no momento que quer mudar e escreva o comentário: ele fica marcado com o tempo do vídeo. Seja específico: \"trocar o texto da cena 2 por...\"." },
      { titulo: "Ajuste ou mudança de escopo", texto: "Ajustes dentro do briefing usam as rodadas inclusas. Mudar a ideia original (outro roteiro, outro formato) pode custar créditos; avisamos antes." },
      { titulo: "Aprovação", texto: "Gostou? Clique em \"Aprovar peça\" e baixe os arquivos. Eles ficam salvos no pedido." },
      { titulo: "Dúvidas", texto: "Use o botão Atendimento a qualquer momento. Este tutorial fica no menu \"Tutorial\" e no botão \"Dicas desta etapa\" do formulário." },
    ],
  },
];

/** Capítulo do tutorial de cada etapa do formulário de pedido (0 a 7). */
export const capituloDaEtapa = (etapa: number) => CAPITULOS_TUTORIAL.findIndex((c) => c.id === `etapa-${etapa + 1}`);

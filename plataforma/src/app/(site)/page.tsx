import Link from "next/link";
import { Stage } from "@/components/site/Stage";
import { formatarReais } from "@/domain/catalogo";
import { EMAIL_CONTATO, mailto } from "@/domain/contato";
import { pecasComPrecos, planosAtivos } from "@/domain/precos";
import { precos } from "@/server/services/precos";
import styles from "./page.module.css";

const PASSOS = [
  {
    t: "Você faz o pedido",
    d: "Um briefing guiado pergunta só o que importa: objetivo, formato, roteiro, marca e referências.",
  },
  {
    t: "A cozinha prepara",
    d: "Um motion designer da nossa rede pega o pedido e coloca a peça na brasa.",
  },
  {
    t: "O chef prova antes",
    d: "Um diretor de arte confere cada versão contra o briefing antes de ela sair da cozinha.",
  },
  {
    t: "Sai quente pra você",
    d: "Revise comentando direto no vídeo, no segundo exato. As rodadas de ajuste já estão incluídas.",
  },
];

const BENEFICIOS = [
  { t: "Preço fechado", d: "Cada pedido custa uma quantidade de créditos que você vê antes de enviar. Sem orçamento, sem surpresa." },
  { t: "Feito por gente", d: "Motion designers de verdade produzem e um diretor de arte revisa. Nada sai da cozinha sem passar pelo chef." },
  { t: "Sua marca na geladeira", d: "Logo, cores, fontes e manual ficam guardados por marca. Você envia uma vez e reaproveita sempre." },
  { t: "Prazo de delivery", d: "Cada peça tem prazo em dias úteis. Com pressa? Existe a entrega urgente." },
  { t: "Tudo num lugar", d: "Pedidos, versões, comentários, arquivos finais e créditos na sua área, no computador ou no celular." },
  { t: "Feito para redes", d: "Vertical, quadrado, feed ou horizontal. Um pedido, todos os formatos de que você precisa." },
];

const DUVIDAS: { q: string; r: React.ReactNode }[] = [
  {
    q: "Como funcionam os créditos?",
    r: "Cada plano traz uma quantidade de créditos por mês. Cada peça custa créditos conforme o tipo e a duração, e adicionais como locução, roteiro ou formato extra somam um pouco mais. Você vê o total antes de enviar o pedido.",
  },
  {
    q: "E se os créditos acabarem no meio do mês?",
    r: (
      <>
        Você tem dois caminhos. Subir de plano a qualquer momento: você paga só a diferença e os créditos extras entram na hora.
        Ou comprar créditos adicionais sem mudar de plano: é só falar com o atendimento pelo chat da sua área. Os créditos valem
        até o fim de cada mês do plano; o que sobrar expira na renovação.
      </>
    ),
  },
  {
    q: "E se eu não gostar da peça?",
    r: "Você comenta direto no vídeo e a cozinha ajusta. Cada peça tem rodadas de revisão incluídas. Se o resultado estiver longe do pedido, conversamos, ajustamos o briefing e recomeçamos.",
  },
  {
    q: "Preciso ter roteiro pronto?",
    r: "Não. No briefing você marca que não tem roteiro e conta a ideia geral. Um roteirista escreve a partir dela.",
  },
  {
    q: "Posso usar cenas em vídeo?",
    r: "Pode, sim. Envie suas gravações junto com o pedido e a cozinha monta a animação em cima delas: textos, grafismos, transições e a sua marca. Só trabalhamos com o material que você mandar, então as filmagens precisam ser suas ou ter direito de uso.",
  },
  {
    q: "Vocês fazem locução, trilha e efeitos sonoros?",
    r: "Fazemos. A locução é gravada por locutores profissionais de verdade, gente, não voz de IA. É só marcar no briefing: locução, trilha e efeitos sonoros entram como adicionais e custam alguns créditos a mais, conforme a duração da peça. Você vê o total antes de enviar o pedido.",
  },
  {
    q: "Como falo com vocês?",
    r: (
      <>
        Ainda não é cliente e quer saber como contratar? Escreva para{" "}
        <a href={mailto(EMAIL_CONTATO, "Quero contratar")}>{EMAIL_CONTATO}</a>. Já é cliente e tem dúvidas sobre um pedido, seus
        créditos ou sua conta? <Link href="/entrar">Entre na sua área</Link> e fale com o atendimento pelo chat: cada pedido tem a
        sua conversa, e tudo fica salvo.
      </>
    ),
  },
];

export default function Home() {
  const tabela = precos();
  const pecas = pecasComPrecos(tabela);
  const planos = planosAtivos(tabela);
  const prazoMinimo = Math.min(...pecas.map((p) => p.diasUteis));

  return (
    <>
      <section className={styles.heroWrap}>
        <div className={`container ${styles.hero}`}>
          <div className={styles.heroText}>
            <span className="eyebrow">Estúdio de criação digital</span>
            <h1>
              Motion graphics <span className="brasa">direto da cozinha.</span>
            </h1>
            <p className={styles.lead}>
              Sem reunião, sem fila, sem agência. Você faz o pedido, nossa cozinha de motion designers prepara, o diretor de arte
              aprova, e a peça sai quente direto pra você.
            </p>
            <div className={styles.ctas}>
              <Link href="/cadastro" className="btn btn-primary">
                Fazer meu pedido
              </Link>
              <Link href="/#servicos" className="btn">
                Ver o cardápio
              </Link>
            </div>
            <ul className={styles.proof}>
              <li>Preço fechado em créditos</li>
              <li>Revisões incluídas</li>
              <li>
                Entrega a partir de {prazoMinimo} {prazoMinimo === 1 ? "dia útil" : "dias úteis"}
              </li>
            </ul>
          </div>
          <div className={styles.heroArt}>
            <Stage />
          </div>
        </div>
      </section>

      <section id="servicos" className={`container ${styles.section}`}>
        <div className={styles.head}>
          <span className="eyebrow">Cardápio</span>
          <h2>Escolha o prato. A gente acende a brasa.</h2>
          <p>Cada peça já vem com escopo, prazo e rodadas de ajuste definidos. Você escolhe, descreve e recebe.</p>
        </div>
        <div className={styles.cards}>
          {pecas.map((p, i) => (
            <article key={p.id} className={styles.card}>
              <span className={styles.numero}>0{i + 1}</span>
              <h3>{p.nome}</h3>
              <p>{p.descricao}</p>
              <dl className={styles.meta}>
                <div>
                  <dt>Duração</dt>
                  <dd>até {p.duracoes[p.duracoes.length - 1]}s</dd>
                </div>
                <div>
                  <dt>Prazo</dt>
                  <dd>{p.diasUteis} dias úteis</dd>
                </div>
                <div>
                  <dt>Revisões</dt>
                  <dd>{p.revisoes} rodadas</dd>
                </div>
              </dl>
              <span className={styles.cr}>a partir de {p.creditos} créditos</span>
            </article>
          ))}
        </div>
      </section>

      <section id="como-funciona" className={`container ${styles.section}`}>
        <div className={styles.head}>
          <span className="eyebrow">Da comanda à entrega</span>
          <h2>Uma cozinha que só trabalha pra você</h2>
          <p>Dark kitchen é baixo custo, autoatendimento, agilidade e qualidade High End.</p>
        </div>
        <ol className={styles.steps}>
          {PASSOS.map((s, i) => (
            <li key={s.t}>
              <span className={styles.brasa} aria-hidden="true">
                {i + 1}
              </span>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={`container ${styles.section}`}>
        <div className={styles.head}>
          <span className="eyebrow">Por que Dark Kitchen</span>
          <h2>A agilidade de um delivery, o cuidado de um estúdio</h2>
        </div>
        <div className={styles.benefits}>
          {BENEFICIOS.map((b) => (
            <div key={b.t}>
              <h3>{b.t}</h3>
              <p>{b.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="planos" className={`container ${styles.section}`}>
        <div className={styles.head}>
          <span className="eyebrow">Planos</span>
          <h2>Assine uma vez. Peça quando quiser.</h2>
          <p>
            Créditos renovados todo mês. Precisa de mais? Suba de plano e os créditos extras entram na hora. Precisa de algo sob
            medida? Fale com a gente sobre o plano Personalizado.
          </p>
        </div>
        <div className={styles.plans}>
          {planos.map((p) => (
            <article key={p.id} className={styles.plan} data-destaque={p.destaque}>
              {p.destaque && <span className={styles.badge}>Mais pedido</span>}
              <h3>{p.nome}</h3>
              <p className={styles.planResumo}>{p.resumo}</p>
              <p className={styles.price}>
                <b>{formatarReais(p.precoMes)}</b>
                <span>/mês</span>
              </p>
              <p className={styles.credits}>{p.creditosMes} créditos por mês</p>
              <Link href={`/cadastro?plano=${p.id}`} className={`btn ${p.destaque ? "btn-primary" : ""}`}>
                Assinar {p.nome}
              </Link>
            </article>
          ))}
          <article className={styles.plan}>
            <h3>Personalizado</h3>
            <p className={styles.planResumo}>Para quem tem um volume ou uma rotina diferente. Montamos o plano com você.</p>
            <p className={styles.credits}>Créditos e valor de acordo com a sua necessidade</p>
            <Link href="/cadastro?plano=personalizado" className="btn">
              Montar meu plano
            </Link>
          </article>
        </div>
      </section>

      <section id="duvidas" className={`container ${styles.section}`}>
        <div className={styles.head}>
          <span className="eyebrow">Dúvidas</span>
          <h2>Perguntas frequentes</h2>
        </div>
        <div className={styles.faq}>
          {DUVIDAS.map((d) => (
            <details key={d.q}>
              <summary>{d.q}</summary>
              <p>{d.r}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="container">
        <div className={styles.final}>
          <div>
            <h2>A brasa já está acesa.</h2>
            <p>Seu próximo vídeo começa com um briefing de 5 minutos.</p>
          </div>
          <Link href="/cadastro" className="btn btn-primary">
            Criar minha conta
          </Link>
        </div>
      </section>
    </>
  );
}

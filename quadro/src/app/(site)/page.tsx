import Link from "next/link";
import { Stage } from "@/components/site/Stage";
import { PECAS, PLANOS, formatarReais } from "@/domain/catalogo";
import styles from "./page.module.css";

const PASSOS = [
  {
    t: "Escolha a peça",
    d: "Post, vídeo curto, explicativo ou animação de logo. Cada uma com duração, prazo e revisões já definidos.",
  },
  {
    t: "Preencha o briefing",
    d: "Um formulário guiado pergunta só o que importa: objetivo, formato, roteiro, marca e referências.",
  },
  {
    t: "A equipe produz",
    d: "Um designer da rede cria a peça e um diretor de arte confere tudo antes de chegar até você.",
  },
  {
    t: "Revise no próprio vídeo",
    d: "Comente direto na cena e no segundo exato. As rodadas de ajuste já estão incluídas.",
  },
];

const BENEFICIOS = [
  { t: "Preço por entrega, não por hora", d: "Você sabe quanto custa antes de pedir. Sem orçamento, sem surpresa." },
  { t: "Gente de verdade", d: "Cada peça é feita por um motion designer e revisada por um diretor de arte." },
  { t: "Sua marca salva", d: "Logo, cores, fontes e manual ficam no perfil. Você envia uma vez só." },
  { t: "Prazo definido", d: "Cada tipo de peça tem prazo em dias úteis. Precisa antes? Existe a opção urgente." },
  { t: "Tudo num lugar", d: "Pedidos, versões, comentários, arquivos finais e créditos na sua área." },
  { t: "Feito para redes", d: "Vertical, quadrado, feed ou horizontal. Formatos extras com poucos créditos." },
];

const DUVIDAS = [
  {
    q: "Como funcionam os créditos?",
    r: "Cada plano dá um número de créditos por mês. Cada tipo de peça custa uma quantidade fixa de créditos, e adicionais como locução ou formato extra somam alguns créditos a mais. Você vê o total antes de enviar o pedido.",
  },
  {
    q: "E se eu não gostar da peça?",
    r: "Você comenta direto no vídeo e a equipe ajusta. Cada peça tem rodadas de revisão incluídas. Se o resultado estiver muito longe do pedido, conversamos com você, ajustamos o briefing e recomeçamos.",
  },
  {
    q: "Preciso ter roteiro pronto?",
    r: "Não. No briefing você pode marcar que não tem roteiro e contar a ideia geral. Um redator escreve a partir dela.",
  },
  {
    q: "Recebo o arquivo aberto do After Effects?",
    r: "Sim, como adicional. É útil se a sua equipe vai editar a peça depois.",
  },
  {
    q: "Posso usar as peças na TV?",
    r: "Os planos cobrem uso digital: redes sociais, site, anúncios online e apresentações. Para TV e mídia nacional, fale com a gente.",
  },
];

export default function Home() {
  return (
    <>
      <section className={`container ${styles.hero}`}>
        <div className={styles.heroText}>
          <span className="eyebrow">Motion graphics sob demanda</span>
          <h1>Sua marca em movimento, sem contratar um estúdio.</h1>
          <p className={styles.lead}>
            Peça vídeos, posts animados e vinhetas por um briefing guiado. Designers de verdade produzem, um diretor de
            arte revisa, e você recebe a peça pronta na sua área.
          </p>
          <div className={styles.ctas}>
            <Link href="/cadastro" className="btn btn-primary">
              Começar agora
            </Link>
            <Link href="/#como-funciona" className="btn">
              Ver como funciona
            </Link>
          </div>
          <ul className={styles.proof}>
            <li>Preço fechado por peça</li>
            <li>Revisões incluídas</li>
            <li>Entrega a partir de 2 dias úteis</li>
          </ul>
        </div>
        <div className={styles.heroArt}>
          <Stage />
        </div>
      </section>

      <section id="servicos" className={`container ${styles.section}`}>
        <div className={styles.head}>
          <span className="eyebrow">Serviços</span>
          <h2>Quatro formatos, escopo já embalado</h2>
          <p>Cada peça já vem com duração máxima, prazo e número de revisões. Você escolhe, preenche e pronto.</p>
        </div>
        <div className={styles.cards}>
          {PECAS.map((p) => (
            <article key={p.id} className={styles.card}>
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
          <span className="eyebrow">Como funciona</span>
          <h2>Do briefing à peça pronta</h2>
        </div>
        <ol className={styles.steps}>
          {PASSOS.map((s, i) => (
            <li key={s.t}>
              <span className={styles.kf} aria-hidden="true">
                <b>{i + 1}</b>
              </span>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={`container ${styles.section}`}>
        <div className={styles.head}>
          <span className="eyebrow">Por que o Quadro</span>
          <h2>A agilidade de um app, o cuidado de um estúdio</h2>
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
          <h2>Assine e troque créditos por peças</h2>
          <p>Os créditos são renovados todo mês. Mude de plano quando quiser.</p>
        </div>
        <div className={styles.plans}>
          {PLANOS.map((p) => (
            <article key={p.id} className={styles.plan} data-destaque={p.destaque ?? false}>
              {p.destaque && <span className={styles.badge}>Mais escolhido</span>}
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
          <h2>Seu próximo vídeo começa com um briefing de 5 minutos.</h2>
          <Link href="/cadastro" className="btn btn-primary">
            Criar minha conta
          </Link>
        </div>
      </section>
    </>
  );
}

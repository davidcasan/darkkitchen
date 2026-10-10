import type { Metadata } from "next";
import Link from "next/link";
import { criarPerfilAction, moverPerfilAction, removerPerfilAction, salvarPerfilAction } from "@/app/actions/admin";
import { Enviar, FormAcao } from "@/components/app/FormAcao";
import { exigirUsuario } from "@/server/auth";
import { todosOsPerfis, urlMidia } from "@/server/services/perfis";
import { MidiaPerfil } from "./MidiaPerfil";
import styles from "./quem-somos.module.css";

export const metadata: Metadata = { title: "Quem somos" };

export default async function QuemSomosAdmin() {
  await exigirUsuario(["admin"]);
  const perfis = todosOsPerfis();
  const url = (nome: string | null) => (nome ? urlMidia(nome) : null);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Quem somos</h1>
          <p>
            Perfis dos colaboradores-chave na página <Link href="/quem-somos">Quem somos</Link> do site: foto, nome, função, bio
            e vídeos (16:9, 9:16, os dois ou nenhum). As mudanças aparecem no site na hora.
          </p>
        </div>
      </div>

      <div className="stack">
        {perfis.map((p, i) => (
          <section key={p.id} className="card" data-oculto={!p.visivel}>
            <div className="row-between" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>
                {p.nome} {!p.visivel && <span className="tag">Oculto no site</span>}
              </h2>
              <span className="row small">
                {i > 0 && (
                  <FormAcao action={moverPerfilAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="direcao" value="-1" />
                    <Enviar className="btn btn-sm" enviando="...">
                      ↑ Subir
                    </Enviar>
                  </FormAcao>
                )}
                {i < perfis.length - 1 && (
                  <FormAcao action={moverPerfilAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="direcao" value="1" />
                    <Enviar className="btn btn-sm" enviando="...">
                      ↓ Descer
                    </Enviar>
                  </FormAcao>
                )}
              </span>
            </div>

            <div className={styles.grade}>
              <MidiaPerfil perfilId={p.id} tipo="foto" url={url(p.foto)} rotulo="Foto" />
              <FormAcao action={salvarPerfilAction} className={styles.campos}>
                <input type="hidden" name="id" value={p.id} />
                <label className="field">
                  <span className="label">Nome</span>
                  <input className="txt" name="nome" defaultValue={p.nome} required minLength={2} maxLength={80} />
                </label>
                <label className="field">
                  <span className="label">Função</span>
                  <input className="txt" name="funcao" defaultValue={p.funcao} maxLength={80} placeholder="Diretor" />
                </label>
                <label className="field">
                  <span className="label">Bio</span>
                  <textarea className="txt" name="bio" defaultValue={p.bio} rows={8} maxLength={4000} />
                  <span className="hint">Linha em branco separa parágrafos.</span>
                </label>
                <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
                  <label className="field" style={{ flex: "1 1 180px" }}>
                    <span className="label">Título do vídeo 16:9</span>
                    <input className="txt" name="titulo_16x9" defaultValue={p.titulo_16x9} maxLength={80} placeholder="Reel 16x9" />
                  </label>
                  <label className="field" style={{ flex: "1 1 180px" }}>
                    <span className="label">Título do vídeo 9:16</span>
                    <input className="txt" name="titulo_9x16" defaultValue={p.titulo_9x16} maxLength={80} placeholder="Reel 9x16" />
                  </label>
                </div>
                <label className="check" style={{ marginBottom: 12 }}>
                  <input type="checkbox" name="visivel" value="1" defaultChecked={p.visivel === 1} />
                  <span>Mostrar no site</span>
                </label>
                <Enviar enviando="Salvando...">Salvar perfil</Enviar>
              </FormAcao>
            </div>

            <div className={styles.videos}>
              <MidiaPerfil perfilId={p.id} tipo="video_16x9" url={url(p.video_16x9)} rotulo="Vídeo 16:9 (horizontal)" />
              <MidiaPerfil perfilId={p.id} tipo="video_9x16" url={url(p.video_9x16)} rotulo="Vídeo 9:16 (vertical)" />
            </div>

            <FormAcao action={removerPerfilAction} confirmar={`Remover o perfil de ${p.nome}? A foto e os vídeos também são apagados.`}>
              <input type="hidden" name="id" value={p.id} />
              <Enviar className="link small" enviando="Removendo...">
                <span style={{ color: "var(--danger)" }}>Remover perfil</span>
              </Enviar>
            </FormAcao>
          </section>
        ))}

        <details className="card" open={perfis.length === 0}>
          <summary>
            <b>+ Novo perfil</b>
          </summary>
          <FormAcao action={criarPerfilAction} className={styles.campos}>
            <label className="field" style={{ marginTop: 12 }}>
              <span className="label">Nome</span>
              <input className="txt" name="nome" required minLength={2} maxLength={80} />
            </label>
            <label className="field">
              <span className="label">Função</span>
              <input className="txt" name="funcao" maxLength={80} />
            </label>
            <label className="field">
              <span className="label">Bio</span>
              <textarea className="txt" name="bio" rows={5} maxLength={4000} />
            </label>
            <p className="hint" style={{ marginBottom: 12 }}>
              Depois de criar, envie a foto e os vídeos no cartão do perfil.
            </p>
            <Enviar enviando="Criando...">Criar perfil</Enviar>
          </FormAcao>
        </details>
      </div>
    </>
  );
}

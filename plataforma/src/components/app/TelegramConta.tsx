"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { desligarTelegramAction, linkTelegramAction } from "@/app/actions/admin";
import { NOME_ATENDIMENTO } from "@/domain/contato";

// Liga o Telegram do admin ao atendimento: gera um link de uso único que abre o bot
// já com o código; basta tocar em "Iniciar" no Telegram.
export function TelegramConta({ ativo, ligados }: { ativo: boolean; ligados: { chat_id: string; nome: string | null }[] }) {
  const router = useRouter();
  const [estado, setEstado] = useState<{ carregando?: boolean; erro?: string; aguardando?: boolean }>({});

  async function ligar() {
    setEstado({ carregando: true });
    const r = await linkTelegramAction();
    if (!r.url) return setEstado({ erro: r.erro });
    window.open(r.url, "_blank", "noopener");
    setEstado({ aguardando: true });
  }

  async function desligar() {
    if (!window.confirm("Parar de receber o atendimento no Telegram?")) return;
    const r = await desligarTelegramAction();
    if (r?.erro) return setEstado({ erro: r.erro });
    setEstado({});
    router.refresh();
  }

  return (
    <section className="card">
      <h2>Atendimento no Telegram</h2>
      {!ativo ? (
        <p className="muted small">O bot do Telegram não está configurado neste servidor (TELEGRAM_BOT_TOKEN).</p>
      ) : ligados.length ? (
        <>
          <p className="small" style={{ marginBottom: 12 }}>
            ✅ Ligado{ligados[0].nome ? ` a ${ligados[0].nome}` : ""}. As mensagens dos clientes chegam no bot e você responde
            arrastando a mensagem para o lado. Para o cliente, aparece &quot;{NOME_ATENDIMENTO}&quot;.
          </p>
          <button type="button" className="btn btn-sm" onClick={desligar}>
            Desligar
          </button>
        </>
      ) : (
        <>
          <p className="muted small" style={{ marginBottom: 12 }}>
            Receba as mensagens do atendimento no Telegram e responda por lá. O cliente continua usando só o chat da plataforma.
          </p>
          {estado.aguardando ? (
            <p className="small" style={{ marginBottom: 12 }}>
              No Telegram, toque em <b>Iniciar</b> (ou mande a mensagem que aparecer). Depois{" "}
              <button type="button" className="link" onClick={() => router.refresh()}>
                atualize esta página
              </button>
              . O link vale por 15 minutos.
            </p>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={ligar} disabled={estado.carregando}>
            {estado.carregando ? "Gerando link..." : estado.aguardando ? "Gerar outro link" : "Ligar meu Telegram"}
          </button>
        </>
      )}
      {estado.erro && (
        <p className="alerta alerta-erro" style={{ marginTop: 12 }}>
          {estado.erro}
        </p>
      )}
    </section>
  );
}

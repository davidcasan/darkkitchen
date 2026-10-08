"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { Estado } from "@/server/acao";

// Formulário ligado a uma Server Action: mostra erro/sucesso e trava o botão enquanto envia.

export function FormAcao({
  action,
  children,
  className,
  confirmar,
}: {
  action: (estado: Estado, fd: FormData) => Promise<Estado>;
  children: React.ReactNode;
  className?: string;
  confirmar?: string;
}) {
  const [estado, formAction] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirmar && !window.confirm(confirmar)) e.preventDefault();
      }}
    >
      {children}
      {estado?.erro && (
        <p className="alerta alerta-erro" role="alert" style={{ marginTop: 12 }}>
          {estado.erro}
        </p>
      )}
      {estado?.ok && (
        <p className="alerta alerta-ok" role="status" style={{ marginTop: 12 }}>
          {estado.ok}
        </p>
      )}
    </form>
  );
}

export function Enviar({
  children,
  className = "btn btn-primary",
  enviando = "Enviando...",
}: {
  children: React.ReactNode;
  className?: string;
  enviando?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? enviando : children}
    </button>
  );
}

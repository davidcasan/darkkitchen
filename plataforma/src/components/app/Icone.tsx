// Ícones de traço simples (24x24), sem dependência externa.
const PATHS = {
  inicio: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  pedidos: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  novo: "M12 5v14M5 12h14",
  creditos: "M12 3l8 9-8 9-8-9z",
  conta: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  marca: "M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.6 0-1-.8-1.4-.8-2.4 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4c0-4.7-4-8.4-9-8.4zM7.5 11h.01M10 7h.01M15 7.5h.01",
  fila: "M4 5h16v4H4zM4 12h16v7H4z",
  sair: "M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3",
  sino: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21h4",
  grafico: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  chat: "M4 5h16v11H9l-5 4zM8 9.5h8M8 12.5h5",
  clipe: "M20.5 11.5l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9",
  lixeira: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
  olho: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  pessoas: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M18 14a6 6 0 0 1 4 7",
};

export type NomeIcone = keyof typeof PATHS;

export function Icone({ nome, tamanho = 20 }: { nome: NomeIcone; tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[nome]} />
    </svg>
  );
}

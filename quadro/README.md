# Quadro

Plataforma de motion graphics sob demanda: o cliente assina um plano, recebe créditos e troca por peças pedidas por um briefing guiado. A equipe (designers e diretor de arte) produz, revisa e entrega pela própria plataforma.

## Rodar no computador

Requisitos: Node.js 24 ou mais novo.

```bash
npm install
npm run dev
```

Abra http://localhost:3000. No celular, na mesma rede Wi-Fi, use o endereço "Network" que aparece no terminal.

Na primeira vez, o banco é criado com dados de teste. Todas as contas usam a senha `quadro123`:

| E-mail | Papel |
|---|---|
| cliente@teste.com | Cliente (plano Crescimento, marcas Verão Moda e Verão Kids, pedidos de exemplo) |
| designer@teste.com | Designer |
| senior@teste.com | Designer sênior |
| diretor@teste.com | Diretor de arte |
| admin@teste.com | Administrador: faz qualquer ação, gerencia contas e acessa como qualquer usuário |

Para recomeçar do zero: pare o servidor, rode `npm run db:reset` e inicie de novo.

## Fluxo de um pedido

1. **Cliente** preenche o briefing (8 etapas), escolhe a marca do pedido (ou cria uma nova) e os créditos são debitados. Cada marca guarda logo, manual e cores para os próximos pedidos.
2. **Diretor de arte** faz a triagem e atribui um designer.
3. **Designer** envia a versão (vídeo + arquivos de entrega).
4. **Diretor de arte** aprova ou reprova com diagnóstico (tipo de erro, cena, minutagem). Depois de 2 reprovações, o pedido é sinalizado para ir a um designer sênior.
5. **Cliente** comenta no segundo exato do vídeo e aprova, pede ajuste (rodadas extras custam créditos, com aviso antes) ou rejeita (volta para a triagem).
6. Se o cliente não responder em 5 dias úteis, a peça é **aprovada automaticamente** (com lembrete 1 dia antes). O **diretor** também pode concluir o pedido a qualquer momento nessa etapa, informando o motivo.

## Modo de teste

Pagamentos são **simulados**: toda cobrança é aprovada na hora, sem dinheiro real. Avisos aparecem como notificações dentro da plataforma (sem e-mail).

## Comandos

- `npm run dev` — servidor de desenvolvimento
- `npm run build` e `npm start` — versão de produção
- `npm run lint` — verificação de código
- `npm run db:reset` — apaga o banco e os arquivos enviados

## API

A API REST em `/api/v1` é a mesma base que o futuro app mobile vai usar. Login: `POST /api/v1/auth/login` com `{ "email", "senha" }` devolve um token; envie-o como `Authorization: Bearer <token>`.

- `GET /api/v1/me` — usuário, saldo e assinatura
- `GET /api/v1/pedidos` · `POST /api/v1/pedidos` (briefing em JSON) · `GET /api/v1/pedidos/:id`
- `GET /api/v1/creditos` — saldo e extrato
- `POST /api/v1/arquivos` (multipart: `arquivo`, `categoria`) · `GET /api/v1/arquivos/:id`

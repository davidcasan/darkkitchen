# Quadro

Plataforma de motion graphics sob demanda: o cliente assina um plano, recebe créditos e troca por peças pedidas por um briefing guiado. A equipe (designers, gerente de projetos, diretor de arte) produz, revisa e entrega pela própria plataforma.

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
| cliente@teste.com | Cliente (plano Crescimento, com pedidos de exemplo) |
| designer@teste.com | Designer |
| senior@teste.com | Designer sênior |
| gerente@teste.com | Gerente de projetos |
| diretor@teste.com | Diretor de arte |
| admin@teste.com | Administrador (faz tudo) |

Para recomeçar do zero: pare o servidor, rode `npm run db:reset` e inicie de novo.

## Fluxo de um pedido

1. **Cliente** preenche o briefing (8 etapas) e os créditos são debitados.
2. **Gerente** faz a triagem e atribui um designer.
3. **Designer** envia a versão (vídeo + arquivos de entrega).
4. **Diretor de arte** aprova ou reprova com diagnóstico (tipo de erro, cena, minutagem). Depois de 2 reprovações, o gerente é avisado para escalar.
5. **Cliente** comenta no segundo exato do vídeo e aprova, pede ajuste (rodadas extras custam créditos, com aviso antes) ou rejeita (volta para a triagem).

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

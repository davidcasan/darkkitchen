# Projeto: Quadro — plataforma de motion graphics sob demanda

Contexto trazido de uma conversa no claude.ai (out/2026). O nome "Quadro" é provisório.

## Conceito
Plataforma online brasileira onde empresas pedem peças de motion graphics por um formulário de briefing e recebem a peça pronta, tudo online. Referências: Vidsy (internacional), Motion Brand e Motion Blink (Brasil).

**Decisão:** produção 100% humana. A ideia de integrar agentes de IA (triagem, prompts, Higgsfield) foi descartada.

## Modelo de negócio
- O cliente compra **entregas**, não horas. Escopo já embalado por tipo de peça (duração, prazo, nº de revisões).
- Cobrança por **créditos** (planos mensais) ou avulso.
- Fontes de margem: diferença entre preço do crédito e custo de produção; créditos não usados; reaproveitamento de templates e arquivos da marca; receita recorrente; upsell (créditos extras, adicionais); adaptações de formato baratas de produzir.
- Fluxo: briefing estruturado → triagem (gerente de projetos) → designer da rede (núcleo fixo + freelancers) → controle de qualidade (diretor de arte) → entrega e revisões → arquivos salvos no perfil da marca.

## Escopo da plataforma (definido out/2026)
Sistema web rodando em servidor, com três áreas:
1. **Site público:** página inicial com serviços, benefícios e chamada para contratar; login de cliente e de artista.
2. **Área do cliente:** assinatura, saldo e histórico de créditos, formas de pagamento, novo pedido (briefing), pedidos anteriores e status de cada um.
3. **Área do artista/equipe:** acesso aos briefings gerados pelos pedidos, troca de informações entre as equipes.

**Plataformas:** precisa funcionar igualmente bem no navegador de computador e no do celular (responsivo). Alvo inicial: Chrome e Firefox no Windows. Um app mobile nativo fica para o futuro, mas a arquitetura já deve facilitar essa transição (ex.: API separada da interface).

**Créditos:** os valores no protótipo são simbólicos, usados só como experiência. A precificação abaixo ainda não é definitiva.

**Decisões (out/2026):**
- Hospedagem: por enquanto na máquina local (Windows); depois um serviço online. Atenção: hospedagem compartilhada comum (ex.: GoDaddy básico) não roda Node.js — será preciso VPS ou serviço com suporte a Node.
- Equipe de desenvolvimento: só o dono do projeto + Claude. Preferir soluções simples e com poucas dependências.
- Uma conta por usuário; cada usuário é responsável pelos próprios jobs (sem várias pessoas por marca).
- Ordem de construção: começar pelo que tem menor risco.

## Código
App em `quadro/` — Next.js 16 (App Router, TypeScript), CSS Modules + tokens em `src/app/globals.css` e componentes visuais em `src/app/ui.css`. O Next 16 tem APIs novas: consultar `quadro/node_modules/next/dist/docs/` antes de usar algo. `cacheComponents` está desligado de propósito (áreas logadas são dinâmicas).
- `src/domain/` — regras puras, sem banco nem tela: catálogo/planos, briefing (cálculo de créditos, validação por etapa), máquina de estados do pedido (`ACOES`, `podeExecutar`). Usado no navegador, no servidor e pelo futuro app.
- `src/server/` — `db.ts` (SQLite nativo `node:sqlite`, arquivo `data/quadro.db`; só esta camada muda para ir a PostgreSQL), `auth.ts` (sessão por token: cookie httpOnly no navegador, `Bearer` na API), `services/*` (toda regra de negócio), `seed.ts` (dados de teste criados ao subir com banco vazio, via `src/instrumentation.ts`).
- `src/app/(site)/` site público · `src/app/cliente/` área do cliente · `src/app/equipe/` área da equipe · `src/app/actions/` Server Actions · `src/app/api/v1/` API REST (login, me, pedidos, créditos, upload/download de arquivos com Range).
- Pagamento: `services/pagamentos.ts` tem a interface `Gateway`; hoje é simulado (aprova na hora). Para cobrar de verdade, implementar Asaas/Pagar.me e trocar a constante `GATEWAY`.
- Arquivos enviados ficam em `quadro/data/arquivos` (fora do git). Renovação de assinatura é verificada ao acessar a área do cliente (não há tarefa agendada).
- Comandos (em `quadro/`): `npm run dev` (http://localhost:3000), `npm run build`, `npm run lint`, `npm run db:reset` (apaga o banco; recriado com dados de teste ao subir).
- Contas de teste (senha `quadro123`): cliente@, designer@, senior@, gerente@, diretor@, admin@teste.com.

**Princípios para o futuro app mobile:** lógica no servidor exposta como API (`/api/v1/...`), login por token, layout mobile-first, uploads pela API, créditos como extrato de transações, status do pedido como máquina de estados, avisos centralizados em `services/notificacoes.ts`.

**Fases:** 1) site público ✅ · 2) login, perfis e banco ✅ · 3) briefing + área do cliente ✅ · 4) área da equipe ✅ · 5) assinatura e pagamento ✅ (simulado; falta ligar gateway real).

**Pendências conhecidas:** gateway de pagamento real; envio de e-mail (hoje só notificação interna); tarefa agendada de renovação; armazenamento de arquivos em nuvem e upload em partes para vídeos grandes; recuperação de senha; cadastro de membros da equipe por tela (hoje só via seed/banco); regra de expiração de créditos.

## Formulário de briefing (8 etapas)
Existe um protótipo clicável em HTML (`briefing-motion.html`, publicado como artifact no claude.ai).
1. **Tipo de peça:** post animado, vídeo curto, vídeo explicativo, animação de logo. Define os campos seguintes (lógica condicional).
2. **Contexto:** objetivo, público, onde será publicado, chamada para ação. (Logo: onde a vinheta será usada.)
3. **Técnico:** proporções (9:16, 1:1, 4:5, 16:9), duração, áudio (locução só em vídeo curto/explicativo), legendas, arquivo aberto (.aep).
4. **Conteúdo:** roteiro por cena com contador de palavras (~1,5 palavra/segundo), opção "não tenho roteiro", locução (texto + tipo de voz), informações obrigatórias. (Logo: tipo de revelação + slogan.)
5. **Marca:** logo (obrigatório), manual e fontes, fotos, cores, seguir padrão ou visual de campanha. Fica salvo no perfil.
6. **Estilo:** estilo de animação, referências com "o que você gosta nela", tom, o que evitar.
7. **Prazo e aprovação:** padrão ou urgente (+50%), quem aprova e e-mail.
8. **Revisão:** resumo com botão "Editar" por etapa.

## Processo de reprovação
- **Interna:** diretor de arte reprova com diagnóstico (tipo de erro, cena, minutagem) → volta só a parte com problema para o designer. Limite de tentativas; depois escala para designer mais sênior.
- **Cliente — ajuste:** comentários com marcação de tempo no vídeo; separar ajuste (incluso nas revisões) de mudança de escopo (cobra créditos, avisar antes).
- **Cliente — rejeição total:** sai da fila, conversa humana com o cliente, ajusta o briefing e recomeça.
- **Créditos:** revisões do plano grátis; extras cobradas; erro da plataforma = refaz sem custo; mudança de ideia do cliente = cobrança parcial. Na dúvida, favorecer o cliente.
- Registrar todo motivo de reprovação para melhorar formulário, triagem e a taxa de aprovação de primeira (métrica principal).

## Precificação
**Premissas:** designer R$ 60/h; diretor de arte R$ 90/h; impostos e taxas 15%; margem bruta alvo 40% → preço = custo direto ÷ 0,45. **1 crédito = R$ 50** (preço avulso). Uso digital apenas; TV/mídia nacional sob consulta.

| Serviço | Horas (designer + curadoria) | Custo direto | Preço | Créditos |
|---|---|---|---|---|
| Post animado (até 10s) | 3h + 0,5h | R$ 235 | R$ 500 | 10 |
| Vídeo curto (até 15s) | 5h + 0,75h | R$ 378 | R$ 850 | 17 |
| Vídeo curto (até 30s) | 8h + 1h | R$ 580 | R$ 1.300 | 26 |
| Explicativo (até 30s) | 14h + 2h | R$ 1.040 | R$ 2.300 | 46 |
| Explicativo (até 60s) | 24h + 3h | R$ 1.730 | R$ 3.800 | 76 |
| Explicativo (até 90s) | 34h + 4h | R$ 2.420 | R$ 5.400 | 108 |
| Logo (até 5s) | 6h + 1h | R$ 460 | R$ 1.000 | 20 |
| Logo (até 8s) | 9h + 1,2h | R$ 658 | R$ 1.500 | 30 |

**Adicionais:** formato extra 3 cr (até 30s) / 6 cr (acima); locução 8 / 12 / 16 cr (30 / 60 / 90s, margem ~15% por ser repasse); roteiro 4 cr (post/curto) / 12 cr (explicativo); personagens +40%; arquivo aberto +30%; urgência +50%; revisão extra 3 / 6 cr. Legendas inclusas.

**Referências de mercado (2026):** hora de motion designer autônomo ~R$ 31–159; reels 15s R$ 300–1.500; explicativo 60s R$ 3.000–12.000; vinheta R$ 300–3.000.

As horas são estimativas — recalibrar com o tempo real dos primeiros pedidos.

## Próximo passo
Fase 2 do código (login, perfis, banco). Em paralelo, no negócio: definir os pacotes mensais (créditos por plano, desconto no valor do crédito, se créditos acumulam ou expiram). Os planos no site (`src/domain/catalogo.ts`) são ilustrativos.

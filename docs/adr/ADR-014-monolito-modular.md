# ADR-014 · Monólito modular com fila própria em Postgres

Status: Aceito · Data: 04/10/2026 · Origem: auditoria 360 (`docs/audit/TARGET-ARCHITECTURE.md`)

## Contexto

A auditoria avaliou separar o sistema em módulos independentes (ingestão, agrupamento, verificação, geração, mídia, publicação, distribuição). O sistema roda numa conta Vercel e num projeto Supabase, com uma pessoa operando e volume de centenas de matérias por dia. `docs/architecture.md` ADR-004 prevê filas `pgmq`, mas o código usa uma tabela própria `jobs` com `FOR UPDATE SKIP LOCKED`.

## Decisão

1. **Um deploy, um banco.** Os módulos são fronteiras de código (pasta, tipos de entrada e saída, store próprio), não serviços. Microsserviço só com motivo medido: carga que um módulo não aguenta no mesmo processo, isolamento de falha comprovadamente necessário ou equipe separada.
2. **A fila é a tabela `jobs`** (idempotência por `unique(queue, dedupe_key)`, visibilidade, quarentena). `pgmq` deixa de ser requisito; ADR-004 fica anotado.
3. **Evolução por módulo:** dividir `src/lib/pipeline/ports.ts` e `src/lib/db/pipeline-store.ts` por módulo quando cada um for tocado, sem refatoração em massa.

## Alternativas consideradas

- **Microsserviços por etapa:** custo operacional e de observabilidade maior que todo o resto do sistema, sem gargalo que justifique.
- **Migrar a fila para `pgmq`:** funcionalidade equivalente, risco de migração sem ganho.
- **Fila externa (SQS, Redis):** mais um provedor, mais um ponto de falha.

## Consequências

- Simplicidade preservada; observabilidade continua num banco só.
- O limite real de escala é o tempo das rotas da Vercel (`maxDuration`) e o orçamento de IA, não a arquitetura.

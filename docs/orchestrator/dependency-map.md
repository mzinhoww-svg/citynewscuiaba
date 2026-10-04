# Mapa de dependências do fechamento

```
0148 ──► 0149 ──► fluxo "pedir e aprovar" (regras, prompts, pesos, papel admin, fontes, push)
0146 ─┐
0147 ─┼─► recuperar-materias-v2.sql ──► fontes reativadas + reescrita das matérias finas
0148 ─┘                                   │
deploy b0a277d (motivo do enrich) ────────┼─► diagnóstico HNT/RDNews (L-007) ──► correção do enrich
                                          ▼
                              admin religa auto_publish (A-125) ──► publicação automática nos limites 300/3.000
0143 ──► precheck de leitura anônima de article_versions ──► aplicar ──► B-023 (Confirm email, dono)
allow persistente do MCP Supabase (dono) ──► escritas de produção sem pedido de confirmação
```

| Item | Depende de | Bloqueio |
|---|---|---|
| Recuperação A-126 | 0146, 0147, 0148 (feitas); deploy do enrich observável (recomendado) | nenhum técnico |
| Religar `auto_publish` | recuperação concluída, disjuntor em 300/3.000 | ação do admin (A-125) |
| Correção definitiva do enrich | evidência de `pipeline_events.details.reason` em produção | merge + deploy de `b0a277d` |
| 0143 | precheck de código | PLATFORM_PERMISSION_BLOCKER nesta sessão |
| Fluxo A-128 verificado | admin logado no Estúdio | teste manual ou e2e contra produção |

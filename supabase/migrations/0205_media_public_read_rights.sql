-- ARD-T4 (revisão): a leitura pública de `media_assets` passa a seguir o Media Registry (D-02,
-- 0152) por inteiro. Além de aprovado (e reprodução só com `image_reproduction_enabled`), o ativo
-- público não pode estar retirado a pedido (`removed_at`), com a validade anterior a hoje
-- (`license_until < current_date`, a mesma regra de `media_rights_status_for`) nem com direitos
-- `blocked`/`expired` gravados. Vale para a agenda, as matérias, o Guia e a rota `/api/media/[id]`
-- (que lê o ativo com o cliente público). A equipe continua vendo tudo (`media_assets_read_staff`).
-- Só `alter policy` (sem drop). Reverter: `alter policy` com o predicado da 0004.
alter policy media_assets_read_public on public.media_assets
  using (
    status = 'approved'
    and removed_at is null
    and (license_until is null or license_until >= current_date)
    and coalesce(rights_status::text, '') not in ('blocked', 'expired')
    and (kind <> 'reproduction'
         or exists (select 1 from public.feature_flags f
                     where f.key = 'image_reproduction_enabled' and f.enabled))
  );

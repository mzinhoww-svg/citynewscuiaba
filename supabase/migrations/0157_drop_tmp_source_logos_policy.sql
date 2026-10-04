-- A-144: remove a política temporária usada uma única vez para enviar ao bucket `source-logos` os
-- 12 logotipos do pacote do dono (insert de `anon` só para os 12 nomes exatos). Ela já foi
-- neutralizada em produção (`to postgres with check (false)`); aqui sai de vez. Idempotente.
drop policy if exists tmp_source_logos_upload_20261004 on storage.objects;

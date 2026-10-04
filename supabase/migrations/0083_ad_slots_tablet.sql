-- ADS-T2 · Formatos dos campos com o tablet próprio (decisão do dono, 04/10/2026), iguais a
-- `SLOT_FORMATS` (src/lib/ads/slots.ts): desktop a partir de 1024, tablet de 768 a 1023, celular
-- abaixo de 768. Para cada aparelho vale o primeiro formato que tiver peça. Só atualiza dados.

update public.ad_slots set formats = v.formats::jsonb
  from (values
    ('TOP', '[{"width":970,"height":250,"devices":["desktop"]},{"width":728,"height":90,"devices":["tablet","desktop"]},{"width":320,"height":100,"devices":["mobile"]}]'),
    ('RAIL-A', '[{"width":300,"height":250,"devices":["desktop"]}]'),
    ('RAIL-B', '[{"width":300,"height":600,"devices":["desktop"]}]'),
    ('MID', '[{"width":970,"height":120,"devices":["desktop"]},{"width":728,"height":90,"devices":["tablet"]},{"width":320,"height":100,"devices":["mobile"]}]'),
    ('ART-1', '[{"width":728,"height":90,"devices":["desktop","tablet"]},{"width":320,"height":100,"devices":["mobile"]}]'),
    ('ART-2', '[{"width":728,"height":250,"devices":["desktop","tablet"]},{"width":300,"height":250,"devices":["mobile"]}]'),
    ('STICKY', '[{"width":320,"height":50,"devices":["mobile"]}]')
  ) as v(code, formats)
 where public.ad_slots.code = v.code;

UPDATE app_state
SET payload = jsonb_set(
      payload,
      '{clothingSales}',
      COALESCE(
        (
          SELECT jsonb_agg(
            CASE
              WHEN sale ? 'listUnitPrice' THEN sale
              ELSE sale || jsonb_build_object('listUnitPrice', COALESCE(sale -> 'unitPrice', '0'::jsonb))
            END
            ORDER BY ordinal
          )
          FROM jsonb_array_elements(COALESCE(payload -> 'clothingSales', '[]'::jsonb))
            WITH ORDINALITY AS sales(sale, ordinal)
        ),
        '[]'::jsonb
      ),
      true
    ),
    updated_at = now()
WHERE jsonb_typeof(COALESCE(payload -> 'clothingSales', '[]'::jsonb)) = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(payload -> 'clothingSales', '[]'::jsonb)) AS sales(sale)
    WHERE NOT (sale ? 'listUnitPrice')
  );

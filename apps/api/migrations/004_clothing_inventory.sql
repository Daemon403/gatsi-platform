UPDATE app_state
SET payload = jsonb_set(
      jsonb_set(payload, '{clothingItems}', '[]'::jsonb, true),
      '{clothingSales}',
      '[]'::jsonb,
      true
    ),
    updated_at = now()
WHERE NOT (payload ? 'clothingItems')
   OR NOT (payload ? 'clothingSales');

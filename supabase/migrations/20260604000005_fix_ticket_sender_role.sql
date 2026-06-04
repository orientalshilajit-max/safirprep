-- Fix support_ticket_messages rows where a non-admin user's message was
-- incorrectly stored with sender_role = 'admin'.
--
-- Root cause: early version of createTicket always used the service-role
-- client for the insert without explicitly checking isAdmin, so the first
-- message on client-created tickets landed with sender_role = 'admin'.
--
-- Strategy:
--   1. Flip sender_role to 'client' for any message whose sender_user_id
--      belongs to a non-admin auth user.
--   2. Back-fill sender_name from the clients table (contact_name preferred,
--      company_name as fallback, then email, then 'Client').
--   3. Ensure every admin message has sender_name = 'Support Team'.
--   4. Fill in sender_name for client messages that are still empty.

-- ── Step 1 & 2: fix wrongly-labelled admin messages ──────────────────────
UPDATE support_ticket_messages m
SET
  sender_role = 'client',
  sender_name = COALESCE(
    NULLIF(COALESCE(
      (SELECT NULLIF(TRIM(c.contact_name), '')
       FROM clients c
       WHERE c.id::text = au.raw_app_meta_data->>'client_id'
       LIMIT 1),
      (SELECT NULLIF(TRIM(c.company_name), '')
       FROM clients c
       WHERE c.id::text = au.raw_app_meta_data->>'client_id'
       LIMIT 1)
    ), ''),
    NULLIF(au.email, ''),
    'Client'
  )
FROM auth.users au
WHERE m.sender_user_id = au.id
  AND m.sender_role = 'admin'
  AND (au.raw_app_meta_data->>'role') IS DISTINCT FROM 'admin';

-- ── Step 3: normalise sender_name on admin messages ───────────────────────
UPDATE support_ticket_messages
SET sender_name = 'Support Team'
WHERE sender_role = 'admin'
  AND (sender_name = '' OR sender_name IS NULL);

-- ── Step 4: fill in empty sender_name on client messages ─────────────────
UPDATE support_ticket_messages m
SET sender_name = COALESCE(
  NULLIF(COALESCE(
    (SELECT NULLIF(TRIM(c.contact_name), '')
     FROM clients c
     WHERE c.id::text = au.raw_app_meta_data->>'client_id'
     LIMIT 1),
    (SELECT NULLIF(TRIM(c.company_name), '')
     FROM clients c
     WHERE c.id::text = au.raw_app_meta_data->>'client_id'
     LIMIT 1)
  ), ''),
  NULLIF(au.email, ''),
  'Client'
)
FROM auth.users au
WHERE m.sender_user_id = au.id
  AND m.sender_role = 'client'
  AND (m.sender_name = '' OR m.sender_name IS NULL);

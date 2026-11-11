--
-- Perfil del ADMIN en Supabase (ejecutar después de crear el usuario en Auth).
-- Sustituye '<uuid-del-usuario>' por el UUID copiado después de Authentication → Users → Add.
-- Idempotente: ON CONFLICT DO NOTHING evita duplicados si se re-ejecuta.
--
INSERT INTO perfiles (id, nombre, rol, activo)
VALUES ('<cb11ee76-7766-485a-a3a0-6f3fc6738c25>', 'Admin Pollito', 'admin', true)
ON CONFLICT (id) DO NOTHING;

-- Verificación
SELECT id, nombre, rol, activo FROM perfiles;

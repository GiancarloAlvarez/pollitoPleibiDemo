import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
export const ids={admin:'00000000-0000-4000-8000-000000000001',cajero:'00000000-0000-4000-8000-000000000002',cocina:'00000000-0000-4000-8000-000000000003',product:'10000000-0000-4000-8000-000000000001',stock:'20000000-0000-4000-8000-000000000001',ingredient2:'20000000-0000-4000-8000-000000000004',order:'50000000-0000-4000-8000-000000000001',adminBox:'60000000-0000-4000-8000-000000000001',cashierBox:'60000000-0000-4000-8000-000000000002'};
export const source=await readFile(new URL('../../docs/supabase/schema_completo.sql',import.meta.url),'utf8');
// PGlite dispone de gen_random_uuid() nativo; no se instala pgcrypto.
export const withoutExtension=sql=>sql.replace(/^CREATE EXTENSION IF NOT EXISTS pgcrypto;\s*$/m,'');
export async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE SCHEMA auth; CREATE SCHEMA extensions;
 CREATE ROLE anon NOLOGIN NOBYPASSRLS; CREATE ROLE authenticated NOLOGIN NOBYPASSRLS;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
 $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth,extensions TO anon,authenticated;
 SELECT set_config('pollito.qa_fixture','isolated-qa',false);`);
 // Solo DDL de la fuente: excluye seed comercial y texto final no SQL.
 // No modifica políticas, funciones, triggers, vistas ni constraints.
 const ddl=source.slice(0,source.indexOf('-- 21. SEED'));
 try{await db.exec(withoutExtension(ddl));await db.exec(await readFile(new URL('seed-test.sql',import.meta.url),'utf8'));}
 catch(e){await db.close();throw new Error('No se pudo preparar fixture: '+e.message);}
 return db;
}
// Cada caso hace ROLLBACK, también cuando una comprobación falla.
export async function asRole(db,role,userId,fn,prepare){
 if(!['anon','authenticated'].includes(role))throw Error('Rol de prueba inválido');
 await db.exec('BEGIN');
 try{if(prepare)await prepare(db);await db.exec(`SET LOCAL ROLE ${role}`);await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[userId||'']);return await fn(db);}
 finally{await db.exec('ROLLBACK');}
}

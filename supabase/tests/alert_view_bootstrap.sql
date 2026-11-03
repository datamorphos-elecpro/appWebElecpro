-- Local test doubles ONLY. Never install in a real Supabase project.
create schema auth;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select,insert,delete on storage.objects to authenticated;
-- Local test double for Storage operation context; never install this in a Supabase project.
create function storage.allow_any_operation(operations text[]) returns boolean language sql stable as $$select coalesce(current_setting('storage.operation',true),'') in (select 'storage.'||unnest(operations))$$;
grant execute on function storage.allow_any_operation(text[]) to authenticated;

-- 공개(publishable/anon) 키로 reviews, messages를 읽거나 쓰지 못하게 막는다.
-- 서버는 SUPABASE_SERVICE_ROLE_KEY(service_role)로 접속하며, 이 역할은 RLS를 우회한다.
-- 적용 순서: 1) Vercel과 .env.local에 SUPABASE_SERVICE_ROLE_KEY 등록 후 배포 → 2) 이 파일 실행.
-- (먼저 실행하면 서버가 아직 공개 키를 쓰고 있어 인덱싱·대화 저장이 실패한다.)

alter table public.reviews  enable row level security;
alter table public.messages enable row level security;

-- 기존 정책을 모두 제거한다. 정책이 없으면 anon/authenticated는 접근할 수 없다.
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public' and tablename in ('reviews', 'messages')
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- 정책 제거에 더해 테이블 권한도 회수한다.
revoke all on public.reviews  from anon, authenticated;
revoke all on public.messages from anon, authenticated;

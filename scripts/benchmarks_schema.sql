-- benchmarks 테이블 스키마 스냅샷 (시뮬레이터 자체 DB: mlykalmpqalxhwrfoaow)
-- 최초 적용: 2026-07-15, Supabase MCP apply_migration(create_benchmarks)로 반영됨.
-- 이 파일은 재구축·환경 복제용 버전관리 스냅샷(final review finding A 대응).
-- 데이터 재적재는 scripts/run_aggregate.py (또는 MCP 경로) 참조.

create table if not exists public.benchmarks (
  id uuid primary key default gen_random_uuid(),
  industry text not null,            -- 8개 업종 값 + '전체'
  mix_bucket text,                   -- 'low'|'mid'|'high' (buy_cvr용) | null (attend_rate/ft_rate용)
  metric text not null,              -- 'attend_rate' | 'buy_cvr' | 'ft_rate'(예약)
  n integer not null,
  mean numeric not null,
  stddev numeric,
  is_fallback boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (industry, mix_bucket, metric)
);

alter table public.benchmarks enable row level security;

-- 읽기: scenarios_read와 동형(is_allowed_user + not is_blocked, public 역할).
-- 쓰기 정책 없음 → 클라이언트 쓰기 불가, upsert는 service_role(집계)만 RLS 우회.
create policy "benchmarks_read"
  on public.benchmarks for select
  to public
  using (is_allowed_user() and (not is_blocked()));

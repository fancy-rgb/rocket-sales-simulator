-- SECURITY DEFINER 판정 함수 4개 검색 경로(search_path) 고정 — Supabase 보안 점검기 경고 해소
-- 배경: is_admin·is_blocked가 위치 없이 `admins`·`blocked_users`를 참조한다. 검색 경로가 고정되지 않으면
--       먼저 찾히는 위치에 같은 이름의 가짜 표·함수를 두었을 때 만든 사람 권한으로 그것을 실행할 수 있다.
--       운영 콘솔(rocket-launch-dashboard) 함수들은 이미 같은 방식으로 고정돼 있다.
-- 검증(2026-09-28, 롤백 트랜잭션): 관리자·일반 회사 계정·외부 계정 3종 모두 고정 전후 결과 동일
-- 근거: rocket-launch-cell-os/docs/privacy-audit/T2-result.md 「2026-09-28 재점검」
-- 되돌리기: alter function public.<이름>() reset search_path;
alter function public.is_admin()                      set search_path = public, pg_temp;
alter function public.is_blocked()                    set search_path = public, pg_temp;
alter function public.is_allowed_user()               set search_path = public, pg_temp;
alter function public.enforce_allowed_email_domain()  set search_path = public, pg_temp;

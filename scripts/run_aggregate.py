"""운영 콘솔 webinars 읽기 → 순수 집계 → 시뮬레이터 benchmarks upsert.
Claude가 사용자 요청("벤치마크 갱신해줘") 시 수동 실행. cron 아님.

주의(2026-07-15 최초 적재 방식): 최초 채우기는 운영 콘솔 read 키 취급을 피하려고
Supabase MCP(execute_sql로 webinars 조회 → benchmarks_agg.compute → mlyka insert)로
수행했다. 이 스크립트는 '향후 로컬에서 키로 재실행'하고 싶을 때를 위한 재현 경로다.
키 없이 갱신하려면 MCP 경로(운영 콘솔 execute_sql → compute → 시뮬레이터 insert)를 쓰면 된다.

재실행 시 필요: .env.local 에 운영 콘솔 read 키(service_role, 읽기 전용 용도) +
시뮬레이터 write 키. (git-and-security.md §4 — .env.local 은 .gitignore 등록 필수)
"""
import os
import sys
from pathlib import Path

from supabase import create_client  # supabase-py (pip install supabase)
from benchmarks_agg import compute

# .env.local 로드 (의존성 없이 직접 파싱)
ENV = Path(__file__).resolve().parent.parent / '.env.local'
if ENV.exists():
    for line in ENV.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, _, val = line.partition('=')
            os.environ.setdefault(k.strip(), val.strip())

DASH_URL = os.environ['DASHBOARD_SUPABASE_URL']
DASH_KEY = os.environ['DASHBOARD_SERVICE_ROLE_KEY']
SIM_URL = os.environ.get('SIM_SUPABASE_URL', 'https://mlykalmpqalxhwrfoaow.supabase.co')
SIM_KEY = os.environ['SIM_SERVICE_ROLE_KEY']  # 시뮬레이터 DB write용 service_role

FIELDS = 'industry,registrants,ad_registrants,attendees,buyers'


def fetch_webinars():
    dash = create_client(DASH_URL, DASH_KEY)
    res = dash.table('webinars').select(FIELDS).execute()
    return res.data or []


def upsert_benchmarks(recs):
    sim = create_client(SIM_URL, SIM_KEY)
    # 전량 교체(idempotent): 기존 삭제 후 삽입
    sim.table('benchmarks').delete().neq('id', '00000000-0000-0000-0000-000000000000').execute()
    if recs:
        sim.table('benchmarks').insert(recs).execute()


def main():
    rows = fetch_webinars()
    print(f'읽은 webinar 행: {len(rows)}')
    recs = compute(rows)
    print(f'생성된 benchmarks 레코드: {len(recs)}')
    upsert_benchmarks(recs)
    for r in sorted(recs, key=lambda x: (x['industry'], x['metric'], str(x['mix_bucket']))):
        print(f"  {r['industry']:<14} {r['metric']:<12} {str(r['mix_bucket']):<5} "
              f"n={r['n']:<3} mean={r['mean']:.4f} sd={(r['stddev'] or 0):.4f} fb={r['is_fallback']}")


if __name__ == '__main__':
    sys.exit(main())

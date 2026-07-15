# 매출 시뮬레이터 예측 정확도 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영 콘솔 `webinars`(114건) 실측을 소스로 업종·유료비중 구간별 벤치마크를 산출해 시뮬레이터의 결제CVR·참석률 제안값을 실데이터 기반으로 바꾸고, 결과에 실측 변동을 반영한 범위(밴드)를 표시한다.

**Architecture:** 오프라인 Python 집계(운영 콘솔 DB 읽기 → 순수 집계 로직 → 시뮬레이터 자체 DB `benchmarks` upsert)와, 클라이언트 JS(자체 DB `benchmarks` 조회 → 업종 드롭다운 자동 제안 + 범위 토글) 두 트랙. **계산식·입력 필드는 불변** — 바뀌는 것은 `s-cvr`·`s-attend` 제안값의 출처와 결과 화면의 범위 표시뿐이라 하위호환 마이그레이션이 불필요하다.

**Tech Stack:** 단일 `index.html`(바닐라 JS, `window.supabase` 클라이언트) + 신규 순수 로직 모듈 `js/benchmarks-logic.js`(UMD, 브라우저·Node 양용) + Python 집계 스크립트 `scripts/`. 테스트는 신규 의존성 없이 `node --test`(JS 순수 로직)와 `python3`(집계 순수 로직) 내장 러너 사용.

## Global Constraints

- **계산식 불변**: `결제자 = FT완주 × 결제CVR(단일값)`. `calcSim()`의 곱셈 체인([index.html:1147-1152](../../index.html#L1147-L1152))은 절대 바꾸지 않는다. 바뀌는 것은 `s-cvr`·`s-attend`에 채우는 *제안값의 출처*와 결과 렌더의 *범위 표시*뿐.
- **입력 필드 불변**: 신규 입력 필드를 만들지 않는다(업종 드롭다운은 입력이 아닌 제안 트리거). 기존 저장 시나리오 23건은 마이그레이션 없이 그대로 재현되어야 한다.
- **유료비중 정의**: `유료비중 = adReg / totalReg`, `adReg = adcost*10/cac`, `totalReg = adReg + organic`. 운영 콘솔 소스에서는 `ad_registrants / registrants`. 동일 정의 유지.
- **tertile 구간 경계**: `low < 0.82` / `mid 0.82~0.91` / `high > 0.91`. 실측 82건 분포의 p33=0.82·p66=0.91(임의 라운드 넘버 아님). 하드코딩 상수로 두고 주석에 근거 명시.
- **표본 부족 임계값**: `n < 10`이면 `is_fallback=true`, 전체(`industry='전체'`) pooled 값으로 대체.
- **fallback stddev**: 업종/구간 stddev를 못 구하면 전체 pooled stddev 사용 — 참석률 `0.173`(17.3%p), 결제CVR `0.108`(10.8%p).
- **Supabase 프로젝트 2개**: 읽기 소스 = 운영 콘솔 `biepgnnushywnwfdegxy`(webinars). 쓰기 대상 = 시뮬레이터 자체 `mlykalmpqalxhwrfoaow`(scenarios·신규 benchmarks). **클라이언트 코드는 운영 콘솔 DB에 절대 접속하지 않는다.**
- **키 취급**(`git-and-security.md` §4): 운영 콘솔 읽기용 service_role 키는 `.env.local`에만 저장(읽기 전용 용도), 커밋 금지. `.gitignore`에 `service-account-*.json`·`.env.local` 등록 확인 후 사용.
- **업종 미선택(기본 상태)**: 자동 제안 미적용. 기존 하드코딩 기본값(참석률 40%·결제CVR 10%) 유지 — 초기 화면 무변경 보장.
- **워딩**: 사용자 노출 텍스트에 "학생" 금지 → "수강생"(해당 시). (이 도구엔 해당 텍스트가 거의 없으나 원칙 준수.)

---

## File Structure

| 파일 | 책임 | 신규/수정 |
|---|---|---|
| `scripts/benchmarks_agg.py` | **순수 집계 로직** — webinar row 리스트 → benchmarks 레코드 리스트 (I/O 없음, 테스트 대상) | 신규 |
| `scripts/test_benchmarks_agg.py` | 위 순수 로직의 단위 테스트 (`python3`로 직접 실행, 픽스처 기반) | 신규 |
| `scripts/run_aggregate.py` | **I/O 래퍼** — 운영 콘솔에서 webinars 읽기 → `benchmarks_agg.compute()` → 시뮬레이터 DB upsert | 신규 |
| `js/benchmarks-logic.js` | **순수 JS 로직** — `classifyMixBucket()`·`computeRange()` (UMD: 브라우저 `window.SimBench` + Node `module.exports`) | 신규 |
| `test/benchmarks-logic.test.js` | 위 JS 로직의 `node --test` 단위 테스트 | 신규 |
| `index.html` | benchmarks 조회·업종 드롭다운·자동 제안·범위 토글·FT 라벨 배선 | 수정 |
| `CLAUDE.md` | 업종 분류 체계를 `webinars.industry` 실제 값으로 재정합 | 수정 |
| (Supabase mlyka) `benchmarks` 테이블 | 벤치마크 저장 | 신규(SQL) |

---

## Task 1: `benchmarks` 테이블 생성 (시뮬레이터 자체 DB)

**Files:**
- SQL 적용 대상: Supabase 프로젝트 `mlykalmpqalxhwrfoaow` (시뮬레이터 자체 DB — scenarios가 사는 곳)
- 참고: RLS 정책은 기존 `scenarios` 정책과 동일 형태 재사용

**Interfaces:**
- Produces: `benchmarks` 테이블 — 컬럼 `id, industry, mix_bucket, metric, n, mean, stddev, is_fallback, updated_at`. Task 3(upsert)·Task 5(client 조회)가 이 스키마에 의존.

- [ ] **Step 1: 현재 스키마 확인 (기존 정책 형태 파악)**

Supabase MCP로 시뮬레이터 프로젝트의 기존 테이블·RLS 정책을 확인한다(추측 금지).
- `list_tables` (project `mlykalmpqalxhwrfoaow`) → `scenarios` 존재 확인
- `scenarios`의 RLS 정책 형태를 참고(읽기=인증 사용자, 쓰기=제한). benchmarks도 동일 형태로 맞춘다.

- [ ] **Step 2: 마이그레이션 SQL 적용**

Supabase MCP `apply_migration` (project `mlykalmpqalxhwrfoaow`, name `create_benchmarks`):

```sql
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

-- 읽기: 인증 사용자 전체 허용 (scenarios 읽기 정책과 동형)
create policy "benchmarks_read_authenticated"
  on public.benchmarks for select
  to authenticated
  using (true);

-- 쓰기: 클라이언트(anon/authenticated) 차단 — upsert는 service_role(집계 스크립트)만.
-- service_role은 RLS를 우회하므로 별도 write 정책을 만들지 않음(=인증 사용자 쓰기 불가).
```

- [ ] **Step 3: 적용 검증**

Supabase MCP `execute_sql` (project `mlykalmpqalxhwrfoaow`):

```sql
select column_name, data_type from information_schema.columns
where table_name = 'benchmarks' order by ordinal_position;
```
Expected: 9개 컬럼(id, industry, mix_bucket, metric, n, mean, stddev, is_fallback, updated_at) 반환.

```sql
select count(*) from public.benchmarks;
```
Expected: `0` (빈 테이블, 아직 데이터 없음).

- [ ] **Step 4: (코드 변경 없음 — 커밋 생략)**

이 Task는 원격 DB 스키마만 바꾼다. 리포에 커밋할 파일이 없다. Task 2에서 첫 커밋 발생.

---

## Task 2: 순수 집계 로직 (Python) — TDD

**Files:**
- Create: `scripts/benchmarks_agg.py`
- Test: `scripts/test_benchmarks_agg.py`

**Interfaces:**
- Produces:
  - `MIX_LOW = 0.82`, `MIX_HIGH = 0.91` (상수)
  - `FALLBACK_N = 10` (상수)
  - `mix_bucket(paid_ratio: float) -> str` → `'low'|'mid'|'high'`
  - `compute(rows: list[dict]) -> list[dict]` — 각 row는 `{industry, registrants, ad_registrants, attendees, buyers}`(None 허용). 반환은 benchmarks 레코드 dict 리스트 `{industry, mix_bucket, metric, n, mean, stddev, is_fallback}`.
- Task 3(`run_aggregate.py`)가 `compute()`를 호출.

- [ ] **Step 1: 실패하는 테스트 작성**

`scripts/test_benchmarks_agg.py`:

```python
import math
from benchmarks_agg import mix_bucket, compute, MIX_LOW, MIX_HIGH, FALLBACK_N


def test_mix_bucket_boundaries():
    assert mix_bucket(0.50) == 'low'
    assert mix_bucket(0.8199) == 'low'
    assert mix_bucket(0.82) == 'mid'      # 경계 포함: [0.82, 0.91]
    assert mix_bucket(0.91) == 'mid'
    assert mix_bucket(0.9101) == 'high'
    assert mix_bucket(1.00) == 'high'


def _rows():
    # 업종 A: 12건(충분) — attend/cvr 계산 가능
    rows = []
    for i in range(12):
        rows.append({
            'industry': 'A', 'registrants': 100, 'ad_registrants': 50,  # 유료비중 0.5 → low
            'attendees': 40, 'buyers': 4,                               # attend 0.4, cvr 0.10
        })
    # 업종 B: 3건(부족 <10) → fallback 처리 대상
    for i in range(3):
        rows.append({
            'industry': 'B', 'registrants': 100, 'ad_registrants': 95,  # 유료비중 0.95 → high
            'attendees': 20, 'buyers': 1,
        })
    # 업종 null: 2건 — 업종 집계 제외, '전체'에는 포함
    for i in range(2):
        rows.append({
            'industry': None, 'registrants': 100, 'ad_registrants': 90,
            'attendees': 50, 'buyers': 3,
        })
    return rows


def test_compute_produces_attend_and_cvr_and_total():
    recs = compute(_rows())
    keys = {(r['industry'], r['mix_bucket'], r['metric']) for r in recs}

    # 업종 A attend_rate (mix_bucket=None)
    a_attend = next(r for r in recs if r['industry'] == 'A' and r['metric'] == 'attend_rate')
    assert a_attend['mix_bucket'] is None
    assert a_attend['n'] == 12
    assert abs(a_attend['mean'] - 0.40) < 1e-9
    assert a_attend['is_fallback'] is False

    # 업종 A buy_cvr는 mix_bucket별 — 모두 low 구간이므로 low에 12건
    a_cvr_low = next(r for r in recs if r['industry'] == 'A' and r['metric'] == 'buy_cvr' and r['mix_bucket'] == 'low')
    assert a_cvr_low['n'] == 12
    assert abs(a_cvr_low['mean'] - 0.10) < 1e-9

    # '전체' pooled attend_rate 존재 (null 업종 포함 → 총 17건)
    total_attend = next(r for r in recs if r['industry'] == '전체' and r['metric'] == 'attend_rate')
    assert total_attend['n'] == 17


def test_compute_marks_small_sample_as_fallback():
    recs = compute(_rows())
    # 업종 B는 3건(<10) → is_fallback True, mean은 '전체' pooled 값으로 대체
    b_recs = [r for r in recs if r['industry'] == 'B']
    assert b_recs, "업종 B 레코드가 있어야 함"
    assert all(r['is_fallback'] for r in b_recs)
    total_cvr_high = next(r for r in recs if r['industry'] == '전체' and r['metric'] == 'buy_cvr' and r['mix_bucket'] == 'high')
    b_cvr_high = next((r for r in b_recs if r['metric'] == 'buy_cvr' and r['mix_bucket'] == 'high'), None)
    if b_cvr_high:
        assert abs(b_cvr_high['mean'] - total_cvr_high['mean']) < 1e-9


def test_compute_stddev_is_population_like():
    # 값이 동일하면 stddev 0
    recs = compute(_rows())
    a_attend = next(r for r in recs if r['industry'] == 'A' and r['metric'] == 'attend_rate')
    assert abs(a_attend['stddev'] - 0.0) < 1e-9


if __name__ == '__main__':
    import sys, traceback
    fns = [v for k, v in sorted(globals().items()) if k.startswith('test_') and callable(v)]
    failed = 0
    for fn in fns:
        try:
            fn(); print(f'PASS {fn.__name__}')
        except Exception:
            failed += 1; print(f'FAIL {fn.__name__}'); traceback.print_exc()
    sys.exit(1 if failed else 0)
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `cd ~/ai-project/work/rocket-sales-simulator/scripts && python3 test_benchmarks_agg.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'benchmarks_agg'`

- [ ] **Step 3: 최소 구현 작성**

`scripts/benchmarks_agg.py`:

```python
"""순수 집계 로직 — I/O 없음. 운영 콘솔 webinars row → benchmarks 레코드.

구간 경계(0.82/0.91)는 실측 82건 유료비중 분포의 p33/p66 (임의 라운드 넘버 아님,
근거: .dev/learnings/2026-07-15-calibration-data-reality-check.md §2.3)."""
from statistics import pstdev

MIX_LOW = 0.82
MIX_HIGH = 0.91
FALLBACK_N = 10
TOTAL_LABEL = '전체'


def mix_bucket(paid_ratio):
    if paid_ratio < MIX_LOW:
        return 'low'
    if paid_ratio <= MIX_HIGH:
        return 'mid'
    return 'high'


def _attend_rate(row):
    reg = row.get('registrants') or 0
    att = row.get('attendees')
    if reg and att is not None:
        return att / reg
    return None


def _buy_cvr(row):
    att = row.get('attendees') or 0
    buy = row.get('buyers')
    if att and buy is not None:
        return buy / att
    return None


def _paid_ratio(row):
    reg = row.get('registrants') or 0
    ad = row.get('ad_registrants')
    if reg and ad is not None:
        return ad / reg
    return None


def _agg(values):
    """값 리스트 → (n, mean, stddev). n=0이면 None 반환."""
    if not values:
        return None
    n = len(values)
    mean = sum(values) / n
    sd = pstdev(values) if n > 1 else 0.0
    return n, mean, sd


def compute(rows):
    """rows: [{industry, registrants, ad_registrants, attendees, buyers}, ...]
    반환: benchmarks 레코드 dict 리스트."""
    # 1) 업종별·전체 attend_rate 관측치 수집
    attend_by_ind = {}
    # 2) 업종별·전체 buy_cvr 관측치 (mix_bucket 단위)
    cvr_by_ind_bucket = {}

    def push(d, key, val):
        if val is not None:
            d.setdefault(key, []).append(val)

    for row in rows:
        ind = row.get('industry')
        ar = _attend_rate(row)
        cvr = _buy_cvr(row)
        pr = _paid_ratio(row)
        bucket = mix_bucket(pr) if pr is not None else None

        # attend_rate: 업종 단위(믹스 무관) + 전체
        push(attend_by_ind, TOTAL_LABEL, ar)
        if ind:
            push(attend_by_ind, ind, ar)

        # buy_cvr: (업종, bucket) + (전체, bucket)
        if bucket is not None:
            push(cvr_by_ind_bucket, (TOTAL_LABEL, bucket), cvr)
            if ind:
                push(cvr_by_ind_bucket, (ind, bucket), cvr)

    recs = []

    # 전체 pooled 값 먼저 계산(부족 업종 대체용 참조)
    total_attend = _agg(attend_by_ind.get(TOTAL_LABEL, []))
    total_cvr = {b: _agg(cvr_by_ind_bucket.get((TOTAL_LABEL, b), [])) for b in ('low', 'mid', 'high')}

    # attend_rate 레코드
    for ind, vals in attend_by_ind.items():
        agg = _agg(vals)
        if agg is None:
            continue
        n, mean, sd = agg
        fallback = ind != TOTAL_LABEL and n < FALLBACK_N and total_attend is not None
        if fallback:
            _, mean, sd = total_attend
        recs.append({'industry': ind, 'mix_bucket': None, 'metric': 'attend_rate',
                     'n': n, 'mean': mean, 'stddev': sd, 'is_fallback': fallback})

    # buy_cvr 레코드 (bucket별)
    for (ind, bucket), vals in cvr_by_ind_bucket.items():
        agg = _agg(vals)
        if agg is None:
            continue
        n, mean, sd = agg
        ref = total_cvr.get(bucket)
        fallback = ind != TOTAL_LABEL and n < FALLBACK_N and ref is not None
        if fallback:
            _, mean, sd = ref
        recs.append({'industry': ind, 'mix_bucket': bucket, 'metric': 'buy_cvr',
                     'n': n, 'mean': mean, 'stddev': sd, 'is_fallback': fallback})

    # ft_rate: 소스 데이터 없음 → 이번엔 레코드 생성 안 함 (spec §8, 스키마만 예약)
    return recs
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `cd ~/ai-project/work/rocket-sales-simulator/scripts && python3 test_benchmarks_agg.py`
Expected: 모든 테스트 `PASS`, exit 0.

- [ ] **Step 5: 커밋**

```bash
cd ~/ai-project/work/rocket-sales-simulator
git add scripts/benchmarks_agg.py scripts/test_benchmarks_agg.py
git commit -m "feat(sim): 벤치마크 순수 집계 로직 + 단위 테스트 (tertile·fallback·전체 pooled)"
```

---

## Task 3: 집계 I/O 래퍼 + 1회 실행 (benchmarks 채우기)

**Files:**
- Create: `scripts/run_aggregate.py`
- Modify: `.gitignore` (필요 시 `.env.local` 추가)
- 읽기 소스: 운영 콘솔 `biepgnnushywnwfdegxy.webinars` / 쓰기 대상: `mlykalmpqalxhwrfoaow.benchmarks`

**Interfaces:**
- Consumes: `benchmarks_agg.compute()` (Task 2)
- Produces: `benchmarks` 테이블에 채워진 레코드(업종별·전체 attend_rate + buy_cvr 3구간). Task 5(client)가 조회.

- [ ] **Step 1: `.env.local` 키 슬롯 확인 + gitignore 보증**

`.gitignore`에 `.env.local`이 있는지 확인. 없으면 추가:

```bash
cd ~/ai-project/work/rocket-sales-simulator
grep -q '^\.env\.local$' .gitignore || printf '.env.local\n' >> .gitignore
grep -n 'env.local\|service-account' .gitignore
```
Expected: `.env.local`·`service-account-*.json` 라인 확인.

🚦 배포 브리핑 (이 Step은 prod 키를 다룸):
- 뭐가 바뀌나: 운영 콘솔 읽기 전용 키를 로컬 `.env.local`에 저장(커밋 안 함)
- 누가 영향받나: 나만 (로컬)
- 되돌릴 수 있나: 1분 내 (파일 삭제)
- 진행 방식: 사용자가 키 값을 `.env.local`에 직접 입력 (Claude는 위치·변수명만 안내)

사용자에게 안내(화면에 보이는 이름 기준):
> 운영 콘솔(Supabase 대시보드에서 **rocket-launch-dashboard** 프로젝트, 내부코드 biepg…) → Settings → API → service_role 키를 복사해 `.env.local`에 아래처럼 한 줄 넣어주세요. 읽기 전용으로만 씁니다.
> `DASHBOARD_SUPABASE_URL=https://biepgnnushywnwfdegxy.supabase.co`
> `DASHBOARD_SERVICE_ROLE_KEY=<붙여넣기>`

- [ ] **Step 2: I/O 래퍼 작성**

`scripts/run_aggregate.py`:

```python
"""운영 콘솔 webinars 읽기 → 순수 집계 → 시뮬레이터 benchmarks upsert.
Claude가 사용자 요청("벤치마크 갱신해줘") 시 수동 실행. cron 아님."""
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
    # 요약 출력(검증용)
    for r in sorted(recs, key=lambda x: (x['industry'], x['metric'], str(x['mix_bucket']))):
        print(f"  {r['industry']:<14} {r['metric']:<12} {str(r['mix_bucket']):<5} "
              f"n={r['n']:<3} mean={r['mean']:.4f} sd={(r['stddev'] or 0):.4f} fb={r['is_fallback']}")


if __name__ == '__main__':
    sys.exit(main())
```

> 대안(키 취급 회피): `.env.local`에 prod service_role를 두는 것이 부담되면, 이 1회 채우기는 Claude가 Supabase MCP로 대체 실행할 수 있다 — MCP `execute_sql`(project biepg)로 webinars를 조회해 `compute()`에 먹이고, MCP로 mlyka `benchmarks`에 insert. `run_aggregate.py`는 재실행용으로 리포에 남긴다.

- [ ] **Step 3: supabase-py 설치 여부 확인 후 실행**

```bash
cd ~/ai-project/work/rocket-sales-simulator/scripts
python3 -c "import supabase" 2>/dev/null || pip install supabase
python3 run_aggregate.py
```
Expected: `읽은 webinar 행: 114`(±, 실데이터 기준), `생성된 benchmarks 레코드: N`, 업종별 요약 출력. 상위 4개 업종(창업·부업/뷰티·라이프스타일/부동산·투자/교육비즈니스)은 `fb=False`, 나머지(건강·의료 n=8·마케팅·브랜딩·디자인·크리에이티브·취업·커리어)는 `fb=True`.

- [ ] **Step 4: DB 반영 검증**

Supabase MCP `execute_sql` (project `mlykalmpqalxhwrfoaow`):

```sql
select industry, metric, mix_bucket, n, round(mean::numeric,4) mean, is_fallback
from public.benchmarks order by industry, metric, mix_bucket;
```
Expected: attend_rate는 업종당 1행(mix_bucket=null), buy_cvr는 업종당 최대 3행(low/mid/high). `전체` 행 존재. 스크립트 stdout 요약과 값 일치.

교차 검증(원본 대조) — 운영 콘솔에서 전체 pooled 참석률 직접 계산해 대조:
```sql
-- project biepg
select round(avg(attendees::numeric/registrants),4)
from webinars where registrants>0 and attendees is not null;
```
Expected: benchmarks의 `전체 attend_rate mean`과 일치(±반올림).

- [ ] **Step 5: 커밋**

```bash
cd ~/ai-project/work/rocket-sales-simulator
git status --short   # .env.local 이 목록에 없어야 함(gitignore 확인)
git add scripts/run_aggregate.py .gitignore
git commit -m "feat(sim): benchmarks 집계 I/O 래퍼(webinars→benchmarks upsert) + .env.local 격리"
```

---

## Task 4: 순수 JS 로직 (유료비중 구간 + 범위 수식) — TDD

**Files:**
- Create: `js/benchmarks-logic.js` (UMD: 브라우저 `window.SimBench` + Node `module.exports`)
- Test: `test/benchmarks-logic.test.js` (`node --test`)

**Interfaces:**
- Produces:
  - `classifyMixBucket(mix: number) -> 'low'|'mid'|'high'` (경계: <0.82 low, [0.82,0.91] mid, >0.91 high — Python `mix_bucket`과 동일)
  - `computeRange({ totalReg, attendRate, ftRate, cvr, attendSd, cvrSd }) -> { point, lo, hi }` — 결제자 점추정 + 95% 범위(이항 노이즈 ⊕ 웨비나 간 실측 변동, quadrature 합산, 0 이상 clamp)
  - 상수 `MIX_LOW=0.82`, `MIX_HIGH=0.91`, `FALLBACK_ATTEND_SD=0.173`, `FALLBACK_CVR_SD=0.108`
- Task 5(제안값)·Task 6(범위 토글)이 소비.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/benchmarks-logic.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { classifyMixBucket, computeRange, MIX_LOW, MIX_HIGH } = require('../js/benchmarks-logic.js');

test('classifyMixBucket 경계', () => {
  assert.equal(classifyMixBucket(0.50), 'low');
  assert.equal(classifyMixBucket(0.8199), 'low');
  assert.equal(classifyMixBucket(0.82), 'mid');
  assert.equal(classifyMixBucket(0.91), 'mid');
  assert.equal(classifyMixBucket(0.9101), 'high');
  assert.equal(classifyMixBucket(1.0), 'high');
});

test('computeRange 점추정 = totalReg×p', () => {
  const r = computeRange({ totalReg: 160, attendRate: 0.4, ftRate: 0.8, cvr: 0.10, attendSd: 0, cvrSd: 0 });
  // p = 0.4*0.8*0.10 = 0.032 → point = 160*0.032 = 5.12
  assert.ok(Math.abs(r.point - 5.12) < 1e-9);
});

test('sd=0이어도 이항 노이즈로 범위는 점추정보다 넓다', () => {
  const r = computeRange({ totalReg: 160, attendRate: 0.4, ftRate: 0.8, cvr: 0.10, attendSd: 0, cvrSd: 0 });
  assert.ok(r.lo < r.point && r.hi > r.point, '범위가 점추정을 감싸야 함');
  assert.ok(r.lo >= 0, 'lo는 0 이상 clamp');
});

test('실측 변동(sd) 추가 시 범위가 더 넓어진다 (의도된 결과)', () => {
  const base = computeRange({ totalReg: 160, attendRate: 0.4, ftRate: 0.8, cvr: 0.10, attendSd: 0, cvrSd: 0 });
  const wide = computeRange({ totalReg: 160, attendRate: 0.4, ftRate: 0.8, cvr: 0.10, attendSd: 0.173, cvrSd: 0.108 });
  assert.ok((wide.hi - wide.lo) > (base.hi - base.lo), '실측 변동 반영 시 범위 확대');
});

test('lo는 0 미만으로 내려가지 않는다', () => {
  const r = computeRange({ totalReg: 20, attendRate: 0.3, ftRate: 0.8, cvr: 0.05, attendSd: 0.173, cvrSd: 0.108 });
  assert.ok(r.lo >= 0);
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `cd ~/ai-project/work/rocket-sales-simulator && node --test test/`
Expected: FAIL — `Cannot find module '../js/benchmarks-logic.js'`

- [ ] **Step 3: 최소 구현 작성**

`js/benchmarks-logic.js`:

```js
/* 순수 로직 — 브라우저(window.SimBench)와 Node(module.exports) 양용. DOM/네트워크 의존 없음.
   구간 경계 0.82/0.91 = 실측 82건 유료비중 p33/p66. fallback sd = 전체 pooled(17.3%p/10.8%p). */
(function (root) {
  var MIX_LOW = 0.82;
  var MIX_HIGH = 0.91;
  var FALLBACK_ATTEND_SD = 0.173;
  var FALLBACK_CVR_SD = 0.108;

  function classifyMixBucket(mix) {
    if (mix < MIX_LOW) return 'low';
    if (mix <= MIX_HIGH) return 'mid';
    return 'high';
  }

  // 결제자 = totalReg × p, p = attendRate×ftRate×cvr.
  // 범위 = 이항 표본노이즈 ⊕ 웨비나 간 실측 변동(상대분산 오차전파), 95%(±1.96), 0 clamp.
  function computeRange(o) {
    var totalReg = o.totalReg || 0;
    var attendRate = o.attendRate || 0;
    var ftRate = o.ftRate || 0;
    var cvr = o.cvr || 0;
    var attendSd = o.attendSd || 0;
    var cvrSd = o.cvrSd || 0;

    var p = attendRate * ftRate * cvr;
    var point = totalReg * p;
    if (totalReg <= 0 || p <= 0) return { point: point, lo: point, hi: point };

    var relVar = 0;
    if (attendRate > 0) relVar += Math.pow(attendSd / attendRate, 2);
    if (cvr > 0) relVar += Math.pow(cvrSd / cvr, 2);
    var sigmaBetween = p * Math.sqrt(relVar);                    // 웨비나 간 실측 변동(비율 기준)
    var sigmaBinom = Math.sqrt(totalReg * p * (1 - p)) / totalReg; // 표본추출 노이즈(비율 기준)
    var sigmaP = Math.sqrt(sigmaBetween * sigmaBetween + sigmaBinom * sigmaBinom);

    var half = 1.96 * totalReg * sigmaP;
    return { point: point, lo: Math.max(0, point - half), hi: point + half };
  }

  var api = {
    classifyMixBucket: classifyMixBucket,
    computeRange: computeRange,
    MIX_LOW: MIX_LOW, MIX_HIGH: MIX_HIGH,
    FALLBACK_ATTEND_SD: FALLBACK_ATTEND_SD, FALLBACK_CVR_SD: FALLBACK_CVR_SD
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SimBench = api;
})(this);
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `cd ~/ai-project/work/rocket-sales-simulator && node --test test/`
Expected: 5 tests `pass`, 0 fail.

- [ ] **Step 5: 커밋**

```bash
cd ~/ai-project/work/rocket-sales-simulator
git add js/benchmarks-logic.js test/benchmarks-logic.test.js
git commit -m "feat(sim): 유료비중 구간 분류 + 범위(이항⊕실측변동) 순수 로직 + node --test"
```

---

## Task 5: 클라이언트 — benchmarks 조회 + 업종 드롭다운 자동 제안

**Files:**
- Modify: `index.html` — 스크립트 include([index.html:1017](../../index.html#L1017)), 전환율 카드([index.html:691-716](../../index.html#L691-L716)), 인라인 JS(전역 + `loadScenariosFromSupabase` 근처 [index.html:1473](../../index.html#L1473))

**Interfaces:**
- Consumes: `window.SimBench.classifyMixBucket` (Task 4), `benchmarks` 테이블 (Task 3)
- Produces: 전역 `benchmarks`(배열), `curStddev`(`{attend, cvr}` — Task 6이 소비), 함수 `fetchBenchmarks()`, `suggestFromBenchmark(updateAttend)`

- [ ] **Step 1: 순수 로직 스크립트 include 추가**

`index.html` [1017](../../index.html#L1017) 라인의 supabase CDN `<script>` 바로 다음 줄에 추가:

```html
<script src="js/benchmarks-logic.js"></script>
```

- [ ] **Step 2: 전환율 카드에 업종 드롭다운 추가**

`index.html` 전환율 카드([691-716](../../index.html#L691-L716))의 `<div class="grid-2">` 바로 위(카드 타이틀 다음)에 삽입:

```html
<div class="field" style="margin-bottom:10px;">
  <label><span class="tip" data-tip="선택 시 해당 업종 실측 평균으로 참석률·결제CVR 제안값이 채워집니다. 직접 수정 가능.">업종 (실측 벤치마크)</span></label>
  <select id="s-industry" onchange="suggestFromBenchmark(true)">
    <option value="">미선택 (기본값 유지)</option>
  </select>
  <div id="s-industry-note" style="font-size:12px;color:var(--muted,#888);margin-top:4px;"></div>
</div>
```

- [ ] **Step 3: mix 영향 입력에 재제안 트리거 추가**

`index.html`에서 광고비·CAC·오거닉 입력의 `oninput`을 유료비중 변화 시 CVR 재제안이 되도록 확장한다. 세 라인을 각각 아래로 수정:

[657](../../index.html#L657): `oninput="calcSim()"` → `oninput="calcSim();suggestFromBenchmark(false)"`  (`s-adcost`)
[664](../../index.html#L664): `oninput="calcSim()"` → `oninput="calcSim();suggestFromBenchmark(false)"`  (`s-cac`)
[678](../../index.html#L678): `oninput="calcSim()"` → `oninput="calcSim();suggestFromBenchmark(false)"`  (`s-organic`)

(grep로 정확 매칭 후 치환: `grep -n 'id="s-adcost"\|id="s-cac"\|id="s-organic"' index.html`)

- [ ] **Step 4: 전역 + 조회/제안 함수 추가**

`index.html` 인라인 JS에 전역과 함수를 추가(예: `loadScenariosFromSupabase` 정의 [1473](../../index.html#L1473) 위):

```js
// ===================== BENCHMARKS =====================
let benchmarks = [];
let curStddev = { attend: SimBench.FALLBACK_ATTEND_SD, cvr: SimBench.FALLBACK_CVR_SD };

async function fetchBenchmarks() {
  const { data, error } = await supabaseClient.from('benchmarks').select('*');
  if (error) { console.error('fetchBenchmarks error', error); return; }
  benchmarks = data || [];
  // 업종 드롭다운 채우기 (attend_rate 행 기준으로 업종 목록 도출, '전체' 제외)
  const inds = [...new Set(benchmarks
    .filter(b => b.metric === 'attend_rate' && b.industry !== '전체')
    .map(b => b.industry))].sort();
  const sel = document.getElementById('s-industry');
  if (sel) {
    for (const ind of inds) {
      const opt = document.createElement('option');
      opt.value = ind; opt.textContent = ind;
      sel.appendChild(opt);
    }
  }
}

function bmLookup(industry, metric, bucket) {
  return benchmarks.find(b => b.industry === industry && b.metric === metric &&
    (bucket === undefined ? b.mix_bucket === null : b.mix_bucket === bucket));
}

// updateAttend=true: 업종 선택 시 참석률+CVR 둘 다 채움. false: mix 변화 시 CVR만 갱신.
function suggestFromBenchmark(updateAttend) {
  const ind = document.getElementById('s-industry')?.value;
  const note = document.getElementById('s-industry-note');
  if (!ind) { if (note) note.textContent = ''; return; }  // 미선택 → 기본값 유지

  // 현재 입력으로 유료비중 계산 (calcSim과 동일 정의)
  const adcost = v('s-adcost'), cac = v('s-cac'), organic = v('s-organic');
  const adReg = cac > 0 ? (adcost * 10) / cac : 0;
  const totalReg = adReg + organic;
  const mix = totalReg > 0 ? adReg / totalReg : 0;
  const bucket = SimBench.classifyMixBucket(mix);

  const cvrRec = bmLookup(ind, 'buy_cvr', bucket) || bmLookup('전체', 'buy_cvr', bucket);
  const attRec = bmLookup(ind, 'attend_rate');

  let fallbackHit = false;
  if (cvrRec) {
    document.getElementById('s-cvr').value = (cvrRec.mean * 100).toFixed(1);
    curStddev.cvr = (cvrRec.stddev != null) ? cvrRec.stddev : SimBench.FALLBACK_CVR_SD;
    fallbackHit = fallbackHit || cvrRec.is_fallback;
  }
  if (updateAttend && attRec) {
    document.getElementById('s-attend').value = (attRec.mean * 100).toFixed(0);
    curStddev.attend = (attRec.stddev != null) ? attRec.stddev : SimBench.FALLBACK_ATTEND_SD;
    fallbackHit = fallbackHit || attRec.is_fallback;
  }
  if (note) {
    note.textContent = fallbackHit
      ? '⚠️ 표본 부족 — 전체 평균 참고값 (유료비중 구간: ' + bucket + ')'
      : '실측 평균 적용됨 (유료비중 구간: ' + bucket + ')';
  }
  calcSim();
}
```

- [ ] **Step 5: 로그인 후 조회 호출 배선**

`loadScenariosFromSupabase()` 본문 마지막(`renderScenarios();` 다음, [1490 부근](../../index.html#L1490))에 추가:

```js
  await fetchBenchmarks();
```
(post-auth 초기화 지점에서 scenarios와 함께 1회 로드됨.)

- [ ] **Step 6: 브라우저 검증 (제안값 로직)**

`webapp-testing` 스킬 또는 `.dev/sim_capture.py` 하니스로 로컬 서빙 후 확인:
1. 업종 미선택 → s-attend=40·s-cvr=10 (기본값 무변경)
2. 업종 선택(예: 뷰티·라이프스타일) → s-attend·s-cvr이 실측값으로 바뀌고 note "실측 평균 적용됨" 표시
3. 광고비/CAC를 크게 바꿔 유료비중이 다른 구간으로 이동 → s-cvr 제안값이 구간값으로 갱신, note의 구간 라벨 변화
4. 표본 부족 업종(예: 취업·커리어) 선택 → note "⚠️ 표본 부족" 표시

Expected: 각 케이스가 위와 같이 동작. (실측값 자체는 Task 3 benchmarks에 의존.)

- [ ] **Step 7: 커밋**

```bash
cd ~/ai-project/work/rocket-sales-simulator
git add index.html
git commit -m "feat(sim): 업종 드롭다운 + benchmarks 기반 참석률·결제CVR 자동 제안(유료비중 구간)"
```

---

## Task 6: 결과 화면 범위(밴드) 토글

**Files:**
- Modify: `index.html` — 결과 카드 영역 + `calcSim()` 결제자/거래액 렌더([index.html:1244-1252](../../index.html#L1244-L1252), [1133](../../index.html#L1133))

**Interfaces:**
- Consumes: `SimBench.computeRange` (Task 4), 전역 `curStddev`·`simResult` (Task 5 / [index.html:1162](../../index.html#L1162))
- Produces: 전역 `showRange`(bool), 결제자·거래액 옆 범위 표기

- [ ] **Step 1: 범위 토글 UI 추가**

`index.html` 결과 카드 영역(퍼널 예측 카드 [723](../../index.html#L723) 위 또는 결과 카드 헤더 근처)에 토글 삽입:

```html
<label style="display:flex;align-items:center;gap:6px;font-size:13px;margin:6px 0;cursor:pointer;">
  <input type="checkbox" id="s-showrange" onchange="showRange=this.checked;calcSim()">
  <span class="tip" data-tip="표본추출 노이즈 + 웨비나 간 실측 변동을 합산한 95% 범위">범위 보기</span>
</label>
```

- [ ] **Step 2: 전역 선언**

`index.html` 인라인 JS 전역(다른 전역 근처)에 추가:

```js
let showRange = false;
```

- [ ] **Step 3: `calcSim` 결제자·거래액에 범위 주입**

`calcSim()` 내 결제자 metric 렌더([1244-1247](../../index.html#L1244-L1247))와 거래액 KPI([1183-1184](../../index.html#L1183-L1184))를 범위 반영 형태로 수정한다. `simResult` 산출 직후([1163](../../index.html#L1163)) 아래를 계산:

```js
  // 범위 계산 (토글 ON일 때만 표시)
  let rangeBuyers = null, rangeGmv = null;
  if (showRange) {
    const rb = SimBench.computeRange({
      totalReg, attendRate, ftRate, cvr,
      attendSd: curStddev.attend, cvrSd: curStddev.cvr
    });
    // cap 반영: 점추정과 동일 배율로 상·하한도 cap clamp
    const capClamp = (x) => cap > 0 ? Math.min(x, cap) : x;
    rangeBuyers = { lo: capClamp(rb.lo), hi: capClamp(rb.hi) };
    rangeGmv = { lo: capClamp(rb.lo) * price, hi: capClamp(rb.hi) * price };
  }
```

결제자 metric 값 라인([1246](../../index.html#L1246))을 아래로 교체:

```js
        <div class="m-value">${fmt(buyers, 1)}<span class="m-unit">명</span>${
          rangeBuyers ? `<div style="font-size:11px;color:var(--muted,#888);font-weight:400;">95% 범위 ${fmt(rangeBuyers.lo,1)}~${fmt(rangeBuyers.hi,1)}명</div>` : ''
        }</div>
```

거래액 KPI 값 라인([1184](../../index.html#L1184))을 아래로 교체:

```js
        <div><span class="kpi-value">${fmt(gmv)}</span><span class="kpi-unit">만원</span>${
          rangeGmv ? `<div style="font-size:11px;color:var(--muted,#888);font-weight:400;">95% 범위 ${fmt(rangeGmv.lo)}~${fmt(rangeGmv.hi)}만원</div>` : ''
        }</div>
```

- [ ] **Step 4: 브라우저 검증 (범위 계산)**

로컬 서빙 후:
1. "범위 보기" OFF(기본) → 점추정만 표시(기존과 동일 화면)
2. ON → 결제자·거래액에 "95% 범위 lo~hi" 표시. 범위가 점추정을 감싸고 lo≥0.
3. 수동 교차검증: 특정 입력(totalReg·p·sd)으로 `SimBench.computeRange`를 콘솔에서 직접 호출한 값과 화면 표기가 일치.

Expected: §6 수식대로 이항 단독보다 넓은 범위. (수식 자체는 Task 4 단위 테스트로 이미 검증됨.)

- [ ] **Step 5: 커밋**

```bash
cd ~/ai-project/work/rocket-sales-simulator
git add index.html
git commit -m "feat(sim): 결과 화면 범위(밴드) 토글 — 결제자·거래액 95% 범위 표시"
```

---

## Task 7: FT 라벨 + CLAUDE.md 업종 분류 정합

**Files:**
- Modify: `index.html` — FT 참석률 라벨([index.html:702](../../index.html#L702))
- Modify: `CLAUDE.md` — "카테고리 분류 체계" 절

**Interfaces:** 없음(문서·라벨).

- [ ] **Step 1: FT 참석률 라벨에 "실측 없음" 안내 추가**

`index.html` [702](../../index.html#L702) FT 참석률 라벨을 아래로 교체:

```html
              <label><span class="tip" data-tip="웨비나를 끝까지 시청한 참석자 비율. 🟡 실측 데이터 없음 — 경험치 입력값(다른 두 전환율과 신뢰도 다름)">FT 참석률 🟡</span></label>
```

- [ ] **Step 2: CLAUDE.md 업종 체계를 실제 값으로 재정합**

`CLAUDE.md`의 "카테고리 분류 체계" 절(7개 코드 표)을 `webinars.industry` 실제 채택 값 기준으로 갱신. 기존 표 아래에 정합 매핑을 추가(기존 코드 표는 "레거시(구 설계)"로 라벨링, 실제 벤치마크 어휘를 정본으로):

```markdown
## 업종 어휘 정합 (2026-07-15 — benchmarks 정본)

시뮬레이터 업종 드롭다운·`benchmarks.industry`는 운영 콘솔 `webinars.industry` 실제 값을 그대로 쓴다.
아래가 정본이며, 위의 7개 코드(MKT/BIZ 등)는 구 설계(레거시)다.

| 실제 업종 값(정본) | 표본 n | 벤치마크 | 구 코드(참고) |
|---|---|---|---|
| 창업·부업 | 24 | 실측 | BIZ |
| 뷰티·라이프스타일 | 23 | 실측 | BEAUTY |
| 부동산·투자 | 15 | 실측 | FIN |
| 교육비즈니스 | 13 | 실측 | EDU |
| 건강·의료 | 8 | 표본부족→전체 pooled | HEALTH |
| 마케팅·브랜딩 | 2 | 표본부족→전체 pooled | MKT |
| 디자인·크리에이티브 | 2 | 표본부족→전체 pooled | OTHER |
| 취업·커리어 | 1 | 표본부족→전체 pooled | EDU |

표본 n≥10만 업종별 실측, 나머지는 전체 pooled 대체(코드에서 is_fallback=true).
```

- [ ] **Step 3: 커밋**

```bash
cd ~/ai-project/work/rocket-sales-simulator
git add index.html CLAUDE.md
git commit -m "docs(sim): FT 실측없음 라벨 + CLAUDE.md 업종 어휘 정합(webinars 정본)"
```

---

## Task 8: 통합 검증 (spec §10) + 하위호환 확인

**Files:** 없음(검증 전용 — 발견 시 해당 Task로 되돌아가 수정)

**Interfaces:** 없음.

- [ ] **Step 1: 순수 로직 테스트 전량 재실행**

```bash
cd ~/ai-project/work/rocket-sales-simulator
node --test test/                    # Task 4 JS 로직
python3 scripts/test_benchmarks_agg.py  # Task 2 집계 로직
```
Expected: 둘 다 전부 PASS.

- [ ] **Step 2: 하위호환 검증 (기존 시나리오 23건 재현)**

로컬 서빙 → 시나리오 탭에서 기존 저장 시나리오 3~5개를 로드([index.html:1672-1675](../../index.html#L1672-L1675)에서 s-attend/s-ft/s-cvr 세팅됨).
확인: 로드 시 **업종 드롭다운은 미선택 상태**이고, 거래액·결제자·정산금액 등 결과값이 이번 변경 전과 **완전히 동일**(계산식·입력 불변이므로 자동 보장). 업종 자동 제안이 로드된 시나리오 값을 덮어쓰지 않아야 함(드롭다운 미선택이므로 `suggestFromBenchmark`는 early-return).

Expected: 23건 모두 이전과 동일 결과. (spec 성공기준 §5)

- [ ] **Step 3: 제안값·범위·fallback 통합 확인 (spec §10)**

Task 5 Step 6 + Task 6 Step 4의 브라우저 확인을 한 번에 재현:
- 유료비중 낮음/중간/높음 3케이스 → s-cvr 제안값이 올바른 구간으로 바뀜
- 범위 보기 토글 → 이항 단독보다 넓은 범위, lo≥0
- 표본 충분(뷰티) vs 부족(취업·커리어) → 안내 문구 차이

- [ ] **Step 4: 집계 원본 대조 (spec §10 집계 검증)**

Task 3 Step 4의 교차검증(운영 콘솔 원본 avg vs benchmarks '전체' mean) 재확인 — 일치.

- [ ] **Step 5: 키 격리 최종 확인**

```bash
cd ~/ai-project/work/rocket-sales-simulator
git ls-files | grep -E 'env.local|service-account' || echo "OK: 키 파일 미추적"
```
Expected: `OK: 키 파일 미추적`.

- [ ] **Step 6: 완료 요약 커밋(선택) 및 배포 판단**

배포는 GitHub Pages(main push = 배포). 광고 트래픽 없는 내부 전용 도구지만, **push 전 사용자 승인**(외부 반영). 4줄 브리핑 후 진행.
후속(별도 의제): UX 시각 개선(2026-06-02 spec) 적용, `webinars.offer_reach` 채워지면 ft_rate 활성화.

---

## Self-Review (작성자 체크)

**Spec coverage:**
- §4 benchmarks 테이블 → Task 1 ✅
- §3 집계 스크립트(순수+I/O) → Task 2·3 ✅
- §5 결제CVR 제안값 유료비중 구간 → Task 4(분류)·5(제안) ✅
- §6 범위(이항⊕실측변동) → Task 4(수식)·6(표시) ✅
- §7 업종 드롭다운+fallback 안내+미선택 기본값 유지 → Task 5 ✅
- §8 FT 라벨 + ft_rate 스키마 예약(미생성) → Task 2(compute 미생성)·7(라벨) ✅
- §9 하위호환(마이그레이션 불필요) → Task 8 Step 2 검증 ✅
- §10 검증 기준 5종 → Task 8 ✅
- §11 보류 항목 → 범위 밖(Task 없음, 의도됨) ✅

**Type consistency:** `classifyMixBucket`/`mix_bucket` 경계 규칙 Python·JS 동일(<0.82 low, ≤0.91 mid, else high). `computeRange` 반환 `{point,lo,hi}` — Task 6에서 동일 키 사용. `curStddev.{attend,cvr}` Task 5 정의 → Task 6 소비 일치. benchmarks 레코드 키(`industry,mix_bucket,metric,n,mean,stddev,is_fallback`) Task 2 생성 = Task 3 upsert = Task 5 조회 일치.

**Placeholder scan:** TBD/TODO 없음. 모든 코드 스텝에 실제 코드 포함.

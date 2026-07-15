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
        if ind is not None:
            push(attend_by_ind, ind, ar)

        # buy_cvr: (업종, bucket) + (전체, bucket)
        if bucket is not None:
            push(cvr_by_ind_bucket, (TOTAL_LABEL, bucket), cvr)
            if ind is not None:
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

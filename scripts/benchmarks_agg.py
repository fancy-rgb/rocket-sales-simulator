"""순수 집계 로직 — I/O 없음. 운영 콘솔 webinars row → benchmarks 레코드.

B안(2026-07-15): 결제CVR을 유료비중 구간(tertile)으로 쪼개지 않고 **업종별 단일 값**으로
집계한다(참석률과 동일 방식). 이유: (업종×3구간) 분할 시 큰 업종조차 칸당 n<10이라 전부
fallback이 되어 업종 차별화가 사라졌음(v2 체험 F-2). 구간 분할을 폐지해 업종 선택이
참석률·CVR 양쪽에 실제 반영되게 함. mix_bucket 컬럼은 스키마에 남기되 항상 null.
"""
from statistics import pstdev

FALLBACK_N = 10
TOTAL_LABEL = '전체'


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
    반환: benchmarks 레코드 dict 리스트. attend_rate·buy_cvr 모두 업종별(+전체) 단위,
    mix_bucket은 항상 None. 표본 n<FALLBACK_N인 업종은 전체 pooled 값으로 대체(is_fallback)."""
    attend_by_ind = {}
    cvr_by_ind = {}

    def push(d, key, val):
        if val is not None:
            d.setdefault(key, []).append(val)

    for row in rows:
        ind = row.get('industry')
        ar = _attend_rate(row)
        cvr = _buy_cvr(row)
        push(attend_by_ind, TOTAL_LABEL, ar)
        push(cvr_by_ind, TOTAL_LABEL, cvr)
        if ind is not None:
            push(attend_by_ind, ind, ar)
            push(cvr_by_ind, ind, cvr)

    recs = []
    total_attend = _agg(attend_by_ind.get(TOTAL_LABEL, []))
    total_cvr = _agg(cvr_by_ind.get(TOTAL_LABEL, []))

    def emit(by_ind, metric, total_ref):
        for ind, vals in by_ind.items():
            agg = _agg(vals)
            if agg is None:
                continue
            n, mean, sd = agg
            fallback = ind != TOTAL_LABEL and n < FALLBACK_N and total_ref is not None
            if fallback:
                _, mean, sd = total_ref
            recs.append({'industry': ind, 'mix_bucket': None, 'metric': metric,
                         'n': n, 'mean': mean, 'stddev': sd, 'is_fallback': fallback})

    emit(attend_by_ind, 'attend_rate', total_attend)
    emit(cvr_by_ind, 'buy_cvr', total_cvr)
    # ft_rate: 소스 데이터 없음 → 이번엔 레코드 생성 안 함 (spec §8, 스키마만 예약)
    return recs

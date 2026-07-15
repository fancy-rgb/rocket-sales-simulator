from benchmarks_agg import compute, FALLBACK_N


def _rows():
    # 업종 A: 12건(충분) — attend 0.4, cvr 0.10
    rows = []
    for i in range(12):
        rows.append({'industry': 'A', 'registrants': 100, 'ad_registrants': 50,
                     'attendees': 40, 'buyers': 4})
    # 업종 B: 3건(부족 <10) → fallback 대상. cvr 0.05, attend 0.2
    for i in range(3):
        rows.append({'industry': 'B', 'registrants': 100, 'ad_registrants': 95,
                     'attendees': 20, 'buyers': 1})
    # 업종 null: 2건 — 업종 집계 제외, '전체'에는 포함. cvr 0.06, attend 0.5
    for i in range(2):
        rows.append({'industry': None, 'registrants': 100, 'ad_registrants': 90,
                     'attendees': 50, 'buyers': 3})
    # 업종 C: 2건(부족 <10) — cvr 0.20 (전체 pool을 B raw와 다르게 이동시킴), attend 0.4
    for i in range(2):
        rows.append({'industry': 'C', 'registrants': 100, 'ad_registrants': 96,
                     'attendees': 40, 'buyers': 8})
    return rows


# 전체 cvr pool = A(12×0.10)+B(3×0.05)+null(2×0.06)+C(2×0.20) = 1.87/19
TOTAL_CVR = 1.87 / 19
# 전체 attend pool = A(12×0.4)+B(3×0.2)+null(2×0.5)+C(2×0.4) = 7.2/19
TOTAL_ATTEND = 7.2 / 19


def test_all_records_have_null_mix_bucket():
    # B안: mix_bucket 분할 폐지 — 모든 레코드 mix_bucket=None
    recs = compute(_rows())
    assert recs
    assert all(r['mix_bucket'] is None for r in recs)


def test_per_industry_attend_and_cvr():
    recs = compute(_rows())
    # 업종 A: 충분 표본 → 실측(비fallback)
    a_attend = next(r for r in recs if r['industry'] == 'A' and r['metric'] == 'attend_rate')
    assert a_attend['n'] == 12 and abs(a_attend['mean'] - 0.40) < 1e-9 and a_attend['is_fallback'] is False
    a_cvr = next(r for r in recs if r['industry'] == 'A' and r['metric'] == 'buy_cvr')
    assert a_cvr['n'] == 12 and abs(a_cvr['mean'] - 0.10) < 1e-9 and a_cvr['is_fallback'] is False
    # 업종당 buy_cvr 레코드는 정확히 1개(구간 분할 없음)
    a_cvr_recs = [r for r in recs if r['industry'] == 'A' and r['metric'] == 'buy_cvr']
    assert len(a_cvr_recs) == 1


def test_total_pooled_counts():
    recs = compute(_rows())
    total_attend = next(r for r in recs if r['industry'] == '전체' and r['metric'] == 'attend_rate')
    total_cvr = next(r for r in recs if r['industry'] == '전체' and r['metric'] == 'buy_cvr')
    assert total_attend['n'] == 19 and abs(total_attend['mean'] - TOTAL_ATTEND) < 1e-9
    assert total_cvr['n'] == 19 and abs(total_cvr['mean'] - TOTAL_CVR) < 1e-9


def test_small_sample_falls_back_to_total():
    recs = compute(_rows())
    b_cvr = next(r for r in recs if r['industry'] == 'B' and r['metric'] == 'buy_cvr')
    # B는 3건(<10) → fallback: 값이 전체 pool로 대체(0.05→0.0984...), raw와 달라야 대체 증명
    assert b_cvr['is_fallback'] is True
    assert abs(b_cvr['mean'] - TOTAL_CVR) < 1e-9
    assert abs(b_cvr['mean'] - 0.05) > 1e-6
    b_attend = next(r for r in recs if r['industry'] == 'B' and r['metric'] == 'attend_rate')
    assert b_attend['is_fallback'] is True
    assert abs(b_attend['mean'] - TOTAL_ATTEND) < 1e-9


def test_stddev_zero_when_uniform():
    recs = compute(_rows())
    a_attend = next(r for r in recs if r['industry'] == 'A' and r['metric'] == 'attend_rate')
    a_cvr = next(r for r in recs if r['industry'] == 'A' and r['metric'] == 'buy_cvr')
    assert abs(a_attend['stddev'] - 0.0) < 1e-9
    assert abs(a_cvr['stddev'] - 0.0) < 1e-9


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

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
    # 업종 C: 2건(부족 <10) — high 구간, cvr 0.20 (B의 0.05과 다름 → pool 이동 유도)
    for i in range(2):
        rows.append({
            'industry': 'C', 'registrants': 100, 'ad_registrants': 96,  # 유료비중 0.96 → high
            'attendees': 40, 'buyers': 8,                                # attend 0.4, cvr 0.20
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

    # '전체' pooled attend_rate 존재 (null 업종 포함 → 총 19건)
    total_attend = next(r for r in recs if r['industry'] == '전체' and r['metric'] == 'attend_rate')
    assert total_attend['n'] == 19


def test_compute_marks_small_sample_as_fallback():
    recs = compute(_rows())
    # 업종 B는 3건(<10) → is_fallback True, mean은 '전체' pooled 값으로 대체
    b_recs = [r for r in recs if r['industry'] == 'B']
    assert b_recs, "업종 B 레코드가 있어야 함"
    assert all(r['is_fallback'] for r in b_recs)
    # '전체' high pool = B(3건 cvr 0.05) + C(2건 cvr 0.20) → (0.15+0.40)/5 = 0.11
    total_cvr_high = next(r for r in recs if r['industry'] == '전체' and r['metric'] == 'buy_cvr' and r['mix_bucket'] == 'high')
    assert abs(total_cvr_high['mean'] - 0.11) < 1e-9
    # B의 high cvr은 대체되어 pool(0.11)과 같아야 하고, B 자기 raw 값(0.05)과 달라야 함 (대체 실제 증명)
    b_cvr_high = next(r for r in b_recs if r['metric'] == 'buy_cvr' and r['mix_bucket'] == 'high')
    assert abs(b_cvr_high['mean'] - total_cvr_high['mean']) < 1e-9
    assert abs(b_cvr_high['mean'] - 0.05) > 1e-6


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

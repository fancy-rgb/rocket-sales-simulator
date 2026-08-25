const test = require('node:test');
const assert = require('node:assert');
const M = require('../js/sim-model.js');

/* 실행: node --test        (슬래시 붙인 `node --test/` 는 Node v22에서 오작동 — CLAUDE.md 참조)

   [1] 골든 마스터 — index.html:1165~1178 원본 공식으로 뽑은 기대값과 완전 일치해야 한다.
       계산 모듈 추출(2026-08-25)이 숫자를 바꾸지 않았음을 증명하는 회귀 테스트.
   [2] 추적성 필드 — 정원 병목·손익분기 도달성·CAC 검산
   [3] 게이트가 실제로 막는지 (실패 케이스 강제 검증)
*/

/** 부동소수점 근사 비교 — 0.4×0.8×0.1 = 0.032000000000000015 같은 오차를 흡수한다 */
const near = (got, want, msg, eps = 1e-9) =>
  assert.ok(Math.abs(got - want) < eps, `${msg}: ${got} ≈ ${want} 이어야 함`);

const IN = (o) => Object.assign({
  price: 297, cap: 20, fee: 0.30, adcost: 100, cac: 5,
  organic: 0, othercost: 0, attendRate: 0.40, ftRate: 0.80, cvr: 0.10,
  landingCvr: 0
}, o);

// ─────────────────────────────────────────────────────────────────────────────
// [1] 골든 마스터
// ─────────────────────────────────────────────────────────────────────────────

const GOLDEN = {
  '기본값': {
    input: {},
    want: { adReg: 200, totalReg: 200, attends: 80, ftAttends: 64, buyers: 6.4,
      gmv: 1900.8000000000002, revenue: 1728, pgFee: 66.528, feeAmt: 518.4,
      netProfit: 1561.472, contribution: 468.4416, expectedSettlement: 1093.0303999999999,
      roas: 1728, beGmv: 114.40457618304733, beBuyers: 0.38520059320891353 },
  },
  '정원 무제한(cap=0)': {
    input: { cap: 0 },
    want: { adReg: 200, totalReg: 200, attends: 80, ftAttends: 64, buyers: 6.4,
      gmv: 1900.8000000000002, revenue: 1728, pgFee: 66.528, feeAmt: 518.4,
      netProfit: 1561.472, contribution: 468.4416, expectedSettlement: 1093.0303999999999,
      roas: 1728, beGmv: 114.40457618304733, beBuyers: 0.38520059320891353 },
  },
  '정원에 잘림(CAC 1천원)': {
    input: { cac: 1 },
    want: { adReg: 1000, totalReg: 1000, attends: 400, ftAttends: 320, buyers: 20,
      gmv: 5940, revenue: 5400, pgFee: 207.9, feeAmt: 1620,
      netProfit: 5092.1, contribution: 1527.63, expectedSettlement: 3564.4700000000003,
      roas: 5400, beGmv: 114.40457618304733, beBuyers: 0.38520059320891353 },
  },
  '오거닉·기타비용 포함': {
    input: { organic: 50, othercost: 10 },
    want: { adReg: 200, totalReg: 250, attends: 100, ftAttends: 80, buyers: 8,
      gmv: 2376, revenue: 2160, pgFee: 83.16000000000001, feeAmt: 648,
      netProfit: 1966.84, contribution: 590.0519999999999, expectedSettlement: 1376.7879999999998,
      roas: 2160, beGmv: 125.84503380135206, beBuyers: 0.4237206525298049 },
  },
  '수수료율 0%': {
    input: { fee: 0 },
    want: { adReg: 200, totalReg: 200, attends: 80, ftAttends: 64, buyers: 6.4,
      gmv: 1900.8000000000002, revenue: 1728, pgFee: 66.528, feeAmt: 0,
      netProfit: 1561.472, contribution: 0, expectedSettlement: 1561.472,
      roas: 1728, beGmv: 114.40457618304733, beBuyers: 0.38520059320891353 },
  },
};

for (const [name, c] of Object.entries(GOLDEN)) {
  test(`골든 마스터 — ${name}`, () => {
    const got = M.computeSim(IN(c.input));
    for (const [k, v] of Object.entries(c.want)) {
      assert.strictEqual(got[k], v, `${name}.${k}: ${got[k]} ≠ ${v}`);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// [2] 추적성 필드
// ─────────────────────────────────────────────────────────────────────────────

test('정원 병목 — 기본값은 정원에 걸리지 않는다', () => {
  const r = M.computeSim(IN({}));
  assert.strictEqual(r.bottleneck, 'funnel');
  assert.strictEqual(r.capBound, false);
});

test('정원 병목 — CAC 1천원이면 정원에 잘리고 매출이 고정된다', () => {
  const r = M.computeSim(IN({ cac: 1 }));
  assert.strictEqual(r.capBound, true);
  assert.strictEqual(r.bottleneck, 'cap');
  assert.strictEqual(r.rawBuyers, 32);   // 잘리기 전
  assert.strictEqual(r.buyers, 20);      // 정원에 잘림
  // CAC를 더 낮춰도 매출이 안 늘어난다 = 정원이 병목
  const r2 = M.computeSim(IN({ cac: 0.5 }));
  assert.strictEqual(r2.gmv, r.gmv, '정원에 걸린 뒤에는 CAC를 낮춰도 매출이 같아야 한다');
});

test('정원 경계 CAC — 결제자가 정확히 정원이 되는 CAC를 알려준다', () => {
  const r = M.computeSim(IN({}));
  near(r.regAtCap, 625, 'regAtCap');              // 20 / 0.032
  near(r.cacAtCap, 1.6, 'cacAtCap');              // (100×10)/625 = 1.6천원
  // 경계 그 자체에서는 아직 잘리지 않는다(=), 그 아래에서 잘린다
  assert.strictEqual(M.computeSim(IN({ cac: 1.6 })).capBound, false);
  assert.strictEqual(M.computeSim(IN({ cac: 1.59 })).capBound, true);
});

test('정원 경계 CAC — 오거닉이 있으면 경계가 낮아진다', () => {
  const r = M.computeSim(IN({ organic: 125 }));
  near(r.regAtCap, 625, 'regAtCap');
  near(r.cacAtCap, 2, 'cacAtCap');                // (100×10)/(625−125) = 2천원
});

test('손익분기 — 정원을 넘으면 도달 불가로 표시한다', () => {
  // 광고비를 크게 올리면 손익분기 인원이 정원을 넘는다
  // (광고비 3,000만원은 손익분기 11.6명으로 정원 미달 — 6,000만원이어야 23.1명으로 넘는다)
  const r = M.computeSim(IN({ adcost: 6000 }));
  assert.ok(r.beBuyers > 20, `손익분기 ${r.beBuyers}명이 정원 20명보다 커야 하는 케이스`);
  assert.strictEqual(r.beReachable, false);
  // 기본값에서는 도달 가능
  assert.strictEqual(M.computeSim(IN({})).beReachable, true);
});

test('CAC×상페CVR=CPC 교차검증 — 미입력이면 판정하지 않는다', () => {
  const r = M.computeSim(IN({ landingCvr: 0 }));
  assert.strictEqual(r.cpcCheck.status, 'none');
  assert.strictEqual(r.cpcCheck.impliedCpcKrw, null);
});

test('CAC×상페CVR=CPC 교차검증 — 현실적 CAC는 통과한다', () => {
  const r = M.computeSim(IN({ cac: 6.875, landingCvr: 0.176 }));
  assert.strictEqual(r.cpcCheck.status, 'ok');
  assert.ok(Math.abs(r.cpcCheck.impliedCpcKrw - 1210) < 1, `CPC ${r.cpcCheck.impliedCpcKrw}원`);
});

// ─────────────────────────────────────────────────────────────────────────────
// [3] 게이트가 실제로 막는지 — 실패 케이스 강제 검증
//     (incremental-build-and-verify §6: 통과만 확인하면 "항상 통과하는 고장난 게이트"를 못 잡는다)
// ─────────────────────────────────────────────────────────────────────────────

test('게이트 작동 — CAC 1천원 + 상페CVR 17.6%는 CPC 176원으로 걸린다', () => {
  const r = M.computeSim(IN({ cac: 1, landingCvr: 0.176 }));
  assert.strictEqual(r.cpcCheck.status, 'too_low');
  assert.ok(Math.abs(r.cpcCheck.impliedCpcKrw - 176) < 1);
  // 실측 관측 최소 CPC(290원)보다 낮다는 것이 판정 근거
  assert.ok(r.cpcCheck.impliedCpcKrw < M.BENCH.cpcMinKrw);
});

test('게이트 작동 — 비현실적으로 높은 CAC도 걸린다', () => {
  assert.strictEqual(M.computeSim(IN({ cac: 100 })).cacStatus, 'too_high');
  assert.strictEqual(M.computeSim(IN({ cac: 1 })).cacStatus, 'too_low');
  assert.strictEqual(M.computeSim(IN({ cac: 6.875 })).cacStatus, 'ok');
});

test('게이트 작동 — 상페CVR이 과하게 높으면 CPC 상한으로 걸린다', () => {
  // CAC 20천원 × 30% = CPC 6,000원 > 관측 최대 3,322원
  const r = M.computeSim(IN({ cac: 20, landingCvr: 0.30 }));
  assert.strictEqual(r.cpcCheck.status, 'too_high');
});

test('입력 0 방어 — CAC 0이면 신청자 0, 나눗셈 폭주 없음', () => {
  const r = M.computeSim(IN({ cac: 0 }));
  assert.strictEqual(r.adReg, 0);
  assert.strictEqual(r.buyers, 0);
  assert.strictEqual(r.gmv, 0);
  assert.strictEqual(r.roas, 0);
});

test('전환율 0이면 정원 경계가 정의되지 않는다', () => {
  const r = M.computeSim(IN({ cvr: 0 }));
  assert.strictEqual(r.regAtCap, null);
  assert.strictEqual(r.cacAtCap, null);
});

// ─────────────────────────────────────────────────────────────────────────────
// [4] 상페 CVR 개선 목표 — CAC 자동 조정 (2026-08-25 챌린저 검토 반영)
// ─────────────────────────────────────────────────────────────────────────────

test('CVR 목표 — 미입력이면 완전히 비활성, 기존과 동일한 결과', () => {
  const withTarget = M.computeSim(IN({ landingCvr: 0.176 }));       // 목표 없이 현재값만 입력
  const without = M.computeSim(IN({}));
  assert.strictEqual(withTarget.cvrTarget.active, false);
  assert.strictEqual(withTarget.cac, without.cac);
  assert.strictEqual(withTarget.gmv, without.gmv);
});

test('CVR 목표 — 목표를 현재값과 같게 넣으면 결과가 변하지 않는다', () => {
  const base = M.computeSim(IN({}));
  const same = M.computeSim(IN({ landingCvr: 0.176, targetLandingCvr: 0.176 }));
  assert.strictEqual(same.cvrTarget.direction, 'same');
  near(same.cac, base.cac, 'cac');
  near(same.gmv, base.gmv, 'gmv');
});

test('CVR 목표 — 개선하면 CAC가 낮아지고 매출이 늘어난다', () => {
  const r = M.computeSim(IN({ cac: 6.875, landingCvr: 0.176, targetLandingCvr: 0.25 }));
  assert.strictEqual(r.cvrTarget.active, true);
  assert.strictEqual(r.cvrTarget.direction, 'improve');
  assert.ok(r.cac < 6.875, `목표 CAC ${r.cac}가 기준 6.875보다 낮아야 함`);
  near(r.cac, 6.875 * (0.176 / 0.25), 'cacTarget');
  const base = M.computeSim(IN({ cac: 6.875, landingCvr: 0.176 }));
  assert.ok(r.gmv > base.gmv, `목표 매출 ${r.gmv}이 기준 ${base.gmv}보다 커야 함`);
});

test('CVR 목표 — 악화 방향도 계산되고 매출이 줄어든다 (에러 아님)', () => {
  const r = M.computeSim(IN({ cac: 6.875, landingCvr: 0.176, targetLandingCvr: 0.10 }));
  assert.strictEqual(r.cvrTarget.direction, 'worsen');
  assert.ok(r.cac > 6.875);
  const base = M.computeSim(IN({ cac: 6.875, landingCvr: 0.176 }));
  assert.ok(r.gmv < base.gmv);
});

test('CVR 목표 — 항등식 정합: 함의 CPC가 목표와 무관하게 동일하다', () => {
  const cpcs = [0.10, 0.176, 0.25, 0.276].map(t => {
    const r = M.computeSim(IN({ cac: 6.875, landingCvr: 0.176, targetLandingCvr: t }));
    return r.cac * 1000 * t;               // CAC_목표 × 목표CVR = CPC (불변이어야 함)
  });
  cpcs.forEach(c => near(c, cpcs[0], 'impliedCpc', 1e-6));
});

test('입력 방어 — 목표 0·음수는 비활성으로 처리된다 (나눗셈 폭주 없음)', () => {
  for (const bad of [0, -0.1, -1]) {
    const r = M.computeSim(IN({ landingCvr: 0.176, targetLandingCvr: bad }));
    assert.strictEqual(r.cvrTarget.active, false);
    assert.ok(isFinite(r.gmv) && !isNaN(r.gmv));
  }
});

test('입력 방어 — 현재 CVR을 안 넣으면 목표만으론 활성화되지 않는다', () => {
  const r = M.computeSim(IN({ landingCvr: 0, targetLandingCvr: 0.25 }));
  assert.strictEqual(r.cvrTarget.active, false);
  assert.strictEqual(r.cvrTarget.reason, 'no_current_cvr');
});

test('비현실적 목표 — 현재의 3배 넘으면 tooOptimistic 플래그', () => {
  const ok = M.computeSim(IN({ landingCvr: 0.10, targetLandingCvr: 0.29 }));   // 2.9배
  const over = M.computeSim(IN({ landingCvr: 0.10, targetLandingCvr: 0.31 })); // 3.1배
  assert.strictEqual(ok.cvrTarget.tooOptimistic, false);
  assert.strictEqual(over.cvrTarget.tooOptimistic, true);
});

test('목표 시나리오 병목 — 목표 CAC 기준으로 정원 병목이 재계산된다', () => {
  // 기준 CAC 6.875천원(정원 여유, 경계 1.6천원) → 목표 80%까지 올리면 cacTarget 1.512천원으로
  // 경계 아래로 떨어져 정원에 걸려야 한다 (6.875 × 0.176/0.8 = 1.512)
  const r = M.computeSim(IN({ cac: 6.875, landingCvr: 0.176, targetLandingCvr: 0.8 }));
  assert.ok(r.cac < 1.6, `목표 CAC ${r.cac}가 정원 경계 1.6보다 낮아야 하는 케이스 설계`);
  assert.strictEqual(r.capBound, true);
  assert.strictEqual(r.bottleneck, 'cap');
});

test('목표 시나리오 진단 — cacTargetStatus가 목표 CAC를 실측 범위로 검산한다', () => {
  // 목표 85% → cacTarget 1.4235천원(=1,423.5원) < 실측 관측 최소 여유선(1,500원) → too_low
  const r = M.computeSim(IN({ cac: 6.875, landingCvr: 0.176, targetLandingCvr: 0.85 }));
  assert.strictEqual(r.cacTargetStatus, 'too_low');
  // base cacStatus는 그대로 base(6.875천원=ok)를 봐야 한다 — 목표에 안 흔들림
  assert.strictEqual(r.cacStatus, 'ok');
});

test('base 진단은 목표 시나리오와 독립 — cpcCheck·cacStatus가 base 값 기준으로 고정된다', () => {
  const withTarget = M.computeSim(IN({ cac: 1, landingCvr: 0.176, targetLandingCvr: 0.25 }));
  const withoutTarget = M.computeSim(IN({ cac: 1, landingCvr: 0.176 }));
  // base cac(1천원)가 그대로 비현실적이므로 cpcCheck·cacStatus는 목표 유무와 무관하게 동일해야 한다
  assert.strictEqual(withTarget.cpcCheck.status, withoutTarget.cpcCheck.status);
  assert.strictEqual(withTarget.cacStatus, withoutTarget.cacStatus);
  near(withTarget.cpcCheck.impliedCpcKrw, withoutTarget.cpcCheck.impliedCpcKrw, 'impliedCpc');
});

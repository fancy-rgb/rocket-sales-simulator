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

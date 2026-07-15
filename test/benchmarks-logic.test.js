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

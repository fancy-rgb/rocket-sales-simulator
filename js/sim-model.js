/* 시뮬레이션 계산 — 순수 로직. 브라우저(window.SimModel)와 Node(module.exports) 양용.
   DOM/네트워크 의존 없음. js/benchmarks-logic.js와 같은 패턴.

   ⚠️ 이 파일이 계산식의 단일 원본(SoT)이다.
   index.html·index-v2.html 두 곳에 손으로 복제돼 있던 것을 2026-08-25에 여기로 모았다.
   계산식을 고칠 때 HTML을 직접 고치지 않는다 — 여기만 고치고 test/sim-model.test.js를 돌린다.

   단위 규약 (입력):
     price, adcost, othercost : 만원
     cac                      : 천원
     cap                      : 명 (0 = 무제한)
     fee, attendRate, ftRate, cvr, landingCvr : 분수 (0.30 = 30%)
     organic                  : 명
*/
(function (root) {

  // ── 실측 벤치마크 (운영 콘솔 prod `webinars`, n=84) ─────────────────────────
  // 재측정 SQL (근거를 다시 확인하거나 갱신할 때 그대로 실행):
  //   with d as (select ad_cost::numeric/ad_registrants cac,
  //                     ad_cost::numeric/ad_clicks cpc,
  //                     ad_registrants::numeric/ad_clicks lcvr
  //              from webinars where ad_clicks>0 and ad_registrants>0 and ad_cost>0)
  //   select count(*), min(cac), max(cac), min(cpc), max(cpc), avg(lcvr) from d;
  //
  // ⚠️ 전제(미확정): `webinars.ad_cost`의 부가세 포함 여부가 컬럼 주석에 없다(2026-08-25 확인).
  //    포함이라면 실측 CAC·CPC가 메타 화면 값보다 체계적으로 약 10% 높다.
  //    그래서 아래 경계는 관측 최소·최대에 ±10% 여유를 둔 값이다 — 정밀 판정용이 아니라
  //    "관측된 적 없는 값" 감지용이다. ad_cost 기준이 확정되면 여유를 좁힐 수 있다.
  var BENCH = {
    n: 84,
    cacMinKrw: 1673, cacP25Krw: 4821, cacMedianKrw: 6875, cacP75Krw: 11244, cacMaxKrw: 66192,
    cpcMinKrw: 290, cpcMedianKrw: 1256, cpcMaxKrw: 3322,
    landingCvrMean: 0.176, landingCvrMin: 0.024, landingCvrMax: 0.276,
    // 경고 경계 (관측 범위 ±10% 여유)
    cacWarnLoKrw: 1500, cacWarnHiKrw: 73000,
    cpcWarnLoKrw: 250, cpcWarnHiKrw: 3700
  };

  var VAT_RATE = 0.1;
  var PG_FEE_RATE = 0.035;
  var CVR_TARGET_MAX_RATIO = 3; // 목표가 현재의 3배를 넘으면 '비현실적으로 낙관적' 플래그

  /* 신청자 1명이 만드는 결제자 수 = 참석률 × FT참석률 × 결제CVR */
  function buyersPerReg(i) {
    return (i.attendRate || 0) * (i.ftRate || 0) * (i.cvr || 0);
  }

  /* 정원(cap)이 걸리기 시작하는 경계.
     - regAtCap : 결제자가 정확히 cap이 되는 총신청자 수
     - cacAtCap : 그 신청자를 만드는 CAC(천원). 이 값보다 CAC가 낮아지면 매출이 정원에 고정된다.
     cap=0(무제한)이거나 전환율이 0이면 null. */
  function capThreshold(i) {
    var per = buyersPerReg(i);
    var cap = i.cap || 0;
    if (cap <= 0 || per <= 0) return { regAtCap: null, cacAtCap: null };
    var regAtCap = cap / per;
    var adRegAtCap = regAtCap - (i.organic || 0);
    var cacAtCap = adRegAtCap > 0 ? ((i.adcost || 0) * 10) / adRegAtCap : null;
    return { regAtCap: regAtCap, cacAtCap: cacAtCap };
  }

  /* CAC × 상페CVR = CPC 교차검증.
     상페 CVR은 CAC에 이미 흡수돼 있어 매출 계산에는 쓸 수 없다(중복). 대신 이 항등식으로
     CAC 입력이 현실적인지 검산한다 — 새 입력을 요구하지 않고 화면에 이미 있는 값 2개로 닫힌다.
     landingCvr 미입력이면 status='none' (경고 아님). */
  function crossCheckCpc(i) {
    var lcvr = i.landingCvr || 0;
    var cacKrw = (i.cac || 0) * 1000;
    if (lcvr <= 0 || cacKrw <= 0) {
      return { status: 'none', impliedCpcKrw: null };
    }
    var cpc = cacKrw * lcvr;
    var status = 'ok';
    if (cpc < BENCH.cpcWarnLoKrw) status = 'too_low';
    else if (cpc > BENCH.cpcWarnHiKrw) status = 'too_high';
    return { status: status, impliedCpcKrw: cpc };
  }

  /* CAC 자체가 실측 관측 범위 안에 있는지. */
  function checkCac(i) {
    var cacKrw = (i.cac || 0) * 1000;
    if (cacKrw <= 0) return 'none';
    if (cacKrw < BENCH.cacWarnLoKrw) return 'too_low';
    if (cacKrw > BENCH.cacWarnHiKrw) return 'too_high';
    return 'ok';
  }

  /* 무엇이 매출을 결정하고 있는가 (병목).
     'cap'    = 정원이 결제자를 잘라내고 있다 → CAC·전환율을 개선해도 매출이 안 늘어난다
     'funnel' = 퍼널이 정원에 못 미친다 → 유입·전환율이 매출을 결정한다 */
  function bottleneck(rawBuyers, cap) {
    if (cap > 0 && rawBuyers > cap) return 'cap';
    return 'funnel';
  }

  /* 상페 CVR '개선 목표' → CAC 자동 조정.
     CAC = 클릭당비용(CPC) ÷ 상페CVR 이므로, CPC가 그대로라고 가정하면
     CAC_목표 = CAC_기준 × (현재CVR ÷ 목표CVR).
     🔴 이 가정("상페를 고쳐도 클릭당 비용은 안 변한다")이 이 기능 전체의 전제다.
        방향(오를지 내릴지)은 검증하지 않았다 — 화면에 방향 불확실성을 그대로 노출한다
        (2026-08-25 챌린저 검토: "대체로 오른다"는 주장은 실측 근거 없어 반영하지 않음).
     입력 방어: target<=0 이거나 현재CVR·CAC 중 하나라도 없으면 비활성(원본 그대로 사용) —
     나눗셈 폭주·NaN이 나올 수 없다. */
  function resolveCvrTarget(cacBase, landingCvr, targetLandingCvr) {
    if (!cacBase || cacBase <= 0 || !landingCvr || landingCvr <= 0 ||
        !targetLandingCvr || targetLandingCvr <= 0) {
      var reason = (!targetLandingCvr || targetLandingCvr <= 0) ? 'no_target'
                 : (!landingCvr || landingCvr <= 0) ? 'no_current_cvr'
                 : 'no_base_cac';
      return { active: false, reason: reason, direction: 'none', ratio: 1,
        cacBase: cacBase || 0, cacTarget: null, tooOptimistic: false,
        currentLandingCvr: landingCvr || 0, targetLandingCvr: targetLandingCvr || 0 };
    }
    var ratio = landingCvr / targetLandingCvr;      // CAC_목표 = CAC_기준 × ratio
    var cacTarget = cacBase * ratio;
    var direction = targetLandingCvr > landingCvr ? 'improve'
                  : targetLandingCvr < landingCvr ? 'worsen' : 'same';
    var tooOptimistic = (targetLandingCvr / landingCvr) > CVR_TARGET_MAX_RATIO;
    return { active: true, reason: 'ok', direction: direction, ratio: ratio,
      cacBase: cacBase, cacTarget: cacTarget, tooOptimistic: tooOptimistic,
      currentLandingCvr: landingCvr, targetLandingCvr: targetLandingCvr };
  }

  function computeSim(i) {
    var price = i.price || 0, cap = i.cap || 0, fee = i.fee || 0;
    var adcost = i.adcost || 0, othercost = i.othercost || 0;
    var cacBase = i.cac || 0;
    var organic = i.organic || 0;
    var attendRate = i.attendRate || 0, ftRate = i.ftRate || 0, cvr = i.cvr || 0;
    var landingCvr = i.landingCvr || 0;
    var targetLandingCvr = i.targetLandingCvr || 0;

    // 🔴 상페 CVR 목표가 유효하면 이하 전체 계산(퍼널·정원 병목·손익분기)이 CAC_목표로 흘러간다.
    //    (2026-08-25 챌린저 지적: 목표 시나리오의 병목 판단이 base CAC 기준으로 남으면
    //     목표 시나리오에서 경고가 무력화된다 — 그래서 "일부 필드만 목표로 교체"가 아니라
    //     cac 변수 자체를 유효값으로 바꿔 그 아래 계산이 자동으로 따라오게 한다)
    var cvrTarget = resolveCvrTarget(cacBase, landingCvr, targetLandingCvr);
    var cac = cvrTarget.active ? cvrTarget.cacTarget : cacBase;

    // ── 퍼널 (기존 index.html:1165~1170과 동일) ──
    var adReg = cac > 0 ? (adcost * 10) / cac : 0;
    var totalReg = adReg + organic;
    var attends = totalReg * attendRate;
    var ftAttends = attends * ftRate;
    var rawBuyers = ftAttends * cvr;
    var buyers = cap > 0 ? Math.min(rawBuyers, cap) : rawBuyers;

    // ── 손익 (기존과 동일) ──
    var gmv = buyers * price;
    var revenue = gmv / (1 + VAT_RATE);
    var pgFee = gmv * PG_FEE_RATE;
    var feeAmt = revenue * fee;
    var netProfit = revenue - adcost - othercost - pgFee;
    var contribution = netProfit * fee;
    var expectedSettlement = netProfit * (1 - fee);
    var roas = adcost > 0 ? (revenue / adcost) * 100 : 0;

    // ── 손익분기 ──
    // netProfit = 0 → gmv × (1/1.1 − 0.035) = adcost + othercost
    var beDenom = (1 / (1 + VAT_RATE)) - PG_FEE_RATE;
    var beGmv = beDenom > 0 ? (adcost + othercost) / beDenom : 0;
    var beBuyers = price > 0 ? beGmv / price : 0;
    // 🔴 정원 반영: 손익분기 인원이 정원을 넘으면 이 구조로는 도달 불가능하다.
    //    (기존 코드는 cap을 무시해 "정원 20명인데 손익분기 25명"을 태연히 표시했다)
    var beReachable = !(cap > 0 && beBuyers > cap);

    // capThreshold는 cac와 무관(정원을 채우는 CAC 경계 자체를 구하는 계산)이라 그대로 둔다.
    var thr = capThreshold(i);

    // 🔴 base 진단(cpcCheck·cacStatus)은 항상 매니저가 "지금 실제로 타이핑한" cacBase·현재CVR
    //    기준으로 고정한다 — 목표 시나리오를 켜도 안 흔들린다. 두 질문이 다르기 때문이다.
    //    ("당신이 입력한 CAC가 그럴듯한가" vs "그 목표를 달성하려면 필요한 CAC가 그럴듯한가")
    var cross = crossCheckCpc({ cac: cacBase, landingCvr: landingCvr });
    var cacStatus = checkCac({ cac: cacBase });
    // 목표 시나리오 전용 진단 — defect #2: 목표가 만드는 CAC도 실측 범위로 검산한다.
    var cacTargetStatus = cvrTarget.active ? checkCac({ cac: cvrTarget.cacTarget }) : 'none';

    return {
      // 기존 필드 (하위호환 — HTML이 그대로 구조분해한다)
      // 🔴 cac는 '유효 CAC' — 목표가 활성화되면 cacTarget, 아니면 cacBase와 같다.
      price: price, cap: cap, fee: fee, adcost: adcost, othercost: othercost, cac: cac,
      landingCvr: landingCvr, organic: organic,
      attendRate: attendRate, ftRate: ftRate, cvr: cvr,
      adReg: adReg, totalReg: totalReg, attends: attends, ftAttends: ftAttends,
      buyers: buyers, gmv: gmv, revenue: revenue, pgFee: pgFee, feeAmt: feeAmt,
      netProfit: netProfit, contribution: contribution,
      expectedSettlement: expectedSettlement, roas: roas,
      beGmv: beGmv, beBuyers: beBuyers,

      // 추가 필드 (추적성·검증)
      rawBuyers: rawBuyers,
      buyersPerReg: buyersPerReg(i),
      bottleneck: bottleneck(rawBuyers, cap),
      capBound: bottleneck(rawBuyers, cap) === 'cap',
      regAtCap: thr.regAtCap,
      cacAtCap: thr.cacAtCap,
      beReachable: beReachable,
      cacStatus: cacStatus,
      cpcCheck: cross,
      bench: BENCH,

      // 상페 CVR 목표 시나리오
      cacBase: cacBase,
      cvrTarget: cvrTarget,
      cacTargetStatus: cacTargetStatus
    };
  }

  var api = {
    computeSim: computeSim,
    buyersPerReg: buyersPerReg,
    capThreshold: capThreshold,
    crossCheckCpc: crossCheckCpc,
    checkCac: checkCac,
    bottleneck: bottleneck,
    resolveCvrTarget: resolveCvrTarget,
    BENCH: BENCH,
    VAT_RATE: VAT_RATE,
    PG_FEE_RATE: PG_FEE_RATE,
    CVR_TARGET_MAX_RATIO: CVR_TARGET_MAX_RATIO
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SimModel = api;

})(typeof self !== 'undefined' ? self : this);

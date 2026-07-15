/* 순수 로직 — 브라우저(window.SimBench)와 Node(module.exports) 양용. DOM/네트워크 의존 없음.
   fallback sd = 전체 pooled(참석률 17.3%p / 결제CVR 10.8%p). */
(function (root) {
  var FALLBACK_ATTEND_SD = 0.173;
  var FALLBACK_CVR_SD = 0.108;

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
    computeRange: computeRange,
    FALLBACK_ATTEND_SD: FALLBACK_ATTEND_SD, FALLBACK_CVR_SD: FALLBACK_CVR_SD
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SimBench = api;
})(this);

# 매출 시뮬레이터 UX 시각 개선 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단일 `index.html`의 퍼널·결과·시나리오 비교·시뮬vs실적 화면을 운영 콘솔 "Soft Gradient Glass" 디자인 언어로 시각 개선한다 (입력·계산·데이터·기능 불변).

**Architecture:** 단일 HTML 파일. `<style>`(7~568)에 `:root` 토큰 추가 + 컴포넌트 CSS 교체. JS 렌더 함수(`funnelHTML`·`calcSim` 결과 템플릿·`renderScenarios`·`hbarChart`)의 **반환 마크업만** 교체. 계산 수식·핸들러·Supabase·DOM 컨테이너 ID는 손대지 않는다.

**Tech Stack:** Vanilla HTML/CSS/JS, Supabase(불변), 검증 = Playwright 로컬 캡처(`/tmp/sim_capture.py`).

**Design SoT:** spec `docs/superpowers/specs/2026-06-02-simulator-ux-visual-refresh-design.md` + 승인 목업 `.superpowers/brainstorm/74639-1780390363/content/{funnel-polished,outcome-funnel,scenario-compare}.html` (CSS 정밀 참조용. gitignore 대상이므로 본 계획의 코드가 1차 기준).

**검증 원칙(공통):** 유닛 테스트 없음 → 각 Task는 ① 캡처 회귀 ② 기능 무결성(계산/버튼 동작)으로 검증. 캡처는 baseline(Task 0)과 시각 비교.

---

## File Structure

| 파일 | 변경 |
|---|---|
| `index.html` `<style>` 7~568 | `:root` 토큰 블록 추가, `.funnel*`·`.kpi*`·결과·시나리오 카드/표/필터·`.hbar*` CSS 교체 |
| `index.html` `funnelHTML()` 1425~1438 | 가로 막대 마크업으로 교체 |
| `index.html` `calcSim()` 1179~ (`#result-sim` 템플릿) | 거래액 분석톤 강조 영역 추가 |
| `index.html` `renderScenarios()` 1687~ | 카드/필터/비교표 마크업 교체 (빨강 제거·인셀막대) |
| `index.html` `hbarChart()` 1441~ | 토큰 색 + 달성도 비율 병기 |
| `index.html` 헤더 배지 604 · changelog 모달 923 · `CHANGELOG.md` | 버전 동기화 (Task 7) |

---

## Task 0: 캡처 하니스 baseline 확보

**Files:** Create `/tmp/sim_capture.py` (이미 존재 시 재사용)

- [ ] **Step 1: baseline 캡처 실행**

`/tmp/sim_capture.py`는 인증 오버레이 제거 + 가짜 시나리오 주입 후 3탭을 캡처한다(이미 작성됨). 실행:

Run: `python3 /tmp/sim_capture.py && cp -r /tmp/sim-capture /tmp/sim-baseline`
Expected: `/tmp/sim-baseline/{1-sim,2-actual,3-scenarios}.png` 생성

- [ ] **Step 2: baseline 육안 확인**
3개 PNG를 열어 현재 상태를 기록(비교 기준). 변경 없음 → 커밋 없음.

---

## Task 1: 디자인 토큰 `:root` 추가

**Files:** Modify `index.html` `<style>` 직후(line 7 다음)

- [ ] **Step 1: `:root` 토큰 블록 삽입**

`<style>` 여는 태그 바로 다음 줄에 삽입(기존 변수와 충돌 시 신규 변수명 우선):

```css
:root{
  --canvas-grad:linear-gradient(135deg,#F6F5FA,#F1EFF6 55%,#F4F1F7);
  --glass-surface:rgba(255,255,255,0.72); --glass-border:rgba(255,255,255,0.9); --glass-blur:12px;
  --vio-500:#6E56CF; --vio-600:#5E46C4;
  --grad-main:radial-gradient(140% 140% at 0% 0%,#8B5CF6,#6D28D9 50%,#4F46E5);
  --grad-violet-text:linear-gradient(135deg,#7C3AED,#5B21B6);
  --grad-green:linear-gradient(120deg,#10B981,#059669);
  --ok:#1FA463; --info:#2F6BFF; --shadow-glass:0 10px 34px rgba(80,60,160,.10);
}
```

- [ ] **Step 2: 페이지 배경 + 카드 토큰 정합**
기존 body 배경을 `background:var(--canvas-grad);`로, 주요 `.card` 류에 글래스 표면 적용(기존 흰 배경 카드):
```css
.card{background:var(--glass-surface);backdrop-filter:blur(var(--glass-blur));-webkit-backdrop-filter:blur(var(--glass-blur));border:1px solid var(--glass-border);box-shadow:var(--shadow-glass);}
```

- [ ] **Step 3: 캡처로 글로벌 룩 확인**
Run: `python3 /tmp/sim_capture.py`
Expected: 3탭 배경이 라벤더 그라디언트 + 카드가 글래스 톤. 레이아웃 깨짐 없음.

- [ ] **Step 4: Commit**
```bash
git add index.html
git commit -m "style: Soft Gradient Glass 디자인 토큰 :root 추가 + 카드 정합"
```

---

## Task 2: 퍼널 예측 — 가로 막대 (시뮬·실적 공통)

**Files:** Modify `index.html` `funnelHTML()` 1425~1438 + `.funnel*` CSS

- [ ] **Step 1: `funnelHTML` 본문 교체**
`steps` 입력(label·n·rate)은 그대로. 반환 마크업을 가로 막대로:

```javascript
function funnelHTML(steps){
  const max = Math.max(...steps.map(s=>Math.abs(s.n)||0),1);
  return steps.map((s,i)=>{
    const w = Math.max(4, Math.abs(s.n)/max*100);
    const last = i===steps.length-1;
    const conv = (i>0 && s.rate!==null && isFinite(s.rate))
      ? `<div class="fnl-conv"><span>${s.label==='참석'?'참석률':s.label==='FT참석'?'FT참석률':s.label==='결제'?'결제전환':'전환'}</span> <b>${(s.rate*100).toFixed(0)}%</b></div>` : '';
    return `${conv}
      <div class="fnl-row">
        <div class="fnl-name">${s.label}</div>
        <div class="fnl-track"><div class="fnl-fill${last?' end':''}" style="width:${w}%">
          <span class="fnl-n">${fmt(s.n,1)==='-'?'0':fmt(s.n,1)}</span><span class="fnl-u">명</span>
        </div></div>
      </div>`;
  }).join('');
}
```

- [ ] **Step 2: `.funnel*` CSS 교체**
기존 `.funnel`,`.funnel-step`,`.funnel-arrow`,`.funnel-rate` 규칙을 아래로 교체(목업 `funnel-polished.html` `.hb*` 정밀 참조):
```css
.funnel{display:block;}
.fnl-row{display:flex;align-items:center;gap:12px;margin-bottom:3px;}
.fnl-name{width:58px;font-size:12px;font-weight:600;color:var(--gray-700);text-align:right;flex:0 0 auto;}
.fnl-track{flex:1;height:38px;}
.fnl-fill{height:100%;border-radius:10px;background:var(--grad-main);display:flex;align-items:center;padding:0 14px;box-shadow:0 4px 14px rgba(109,40,217,.22);}
.fnl-fill.end{background:var(--grad-green);box-shadow:0 4px 14px rgba(5,150,105,.26);}
.fnl-n{color:#fff;font-weight:800;font-size:15px;} .fnl-u{color:rgba(255,255,255,.8);font-size:11px;margin-left:3px;}
.fnl-conv{margin:3px 0 3px 70px;font-size:11.5px;color:var(--gray-400);} .fnl-conv b{color:var(--vio-600);font-weight:700;}
```

- [ ] **Step 3: 캡처 — 시뮬·실적 퍼널 둘 다 확인**
Run: `python3 /tmp/sim_capture.py`
Expected: `1-sim.png`·`2-actual.png` 퍼널이 가로 막대, 이탈/빨강 없음, 마지막 막대 초록. (실적은 0값이라 막대 짧음 — 정상)

- [ ] **Step 4: Commit**
```bash
git add index.html
git commit -m "style(funnel): 가로 막대 퍼널 + 이탈 강조 제거 (시뮬·실적 공통)"
```

---

## Task 3: 매출 예측 결과 — 거래액 분석톤 강조

**Files:** Modify `index.html` `calcSim()` 1179 `#result-sim` 템플릿 + 관련 CSS

- [ ] **Step 1: 결과 템플릿 상단에 거래액 강조 영역 추가**
`document.getElementById('result-sim').innerHTML = \`` 의 맨 앞에 아래 블록을 추가(기존 KPI/워터폴/배분/손익은 그대로 뒤에 유지). 변수 `gmv`·`price`·`buyers`·`adcost`는 함수 내 기존 계산값:

```javascript
`<div class="gmv-hero">
   <div class="gmv-cap">예상 거래액 <span>(현재 입력 기준)</span></div>
   <div class="gmv-big">${fmt(gmv)}<span class="gmv-u">만원</span></div>
   <div class="gmv-sub">객단가 ${fmt(price)}만 · 결제 ${fmt(buyers,1)}명 · 광고비 ${fmt(adcost)}만 투입 기준</div>
 </div>` +
```
(기존 템플릿 문자열 앞에 `+`로 이어붙임. 기존 KPI 3카드는 유지하되 "거래액" 카드는 중복이므로 제거 — `grep`으로 거래액 kpi 블록 1곳만 삭제, 공헌이익·예상정산·결제자·ROAS는 유지.)

- [ ] **Step 2: `.gmv-hero` CSS 추가 (분석톤 — 절제된 강조)**
```css
.gmv-hero{background:var(--glass-surface);border:1px solid var(--glass-border);border-left:4px solid var(--vio-500);border-radius:14px;padding:18px 20px;margin-bottom:14px;box-shadow:var(--shadow-glass);}
.gmv-cap{font-size:12px;font-weight:600;color:var(--gray-500);} .gmv-cap span{color:var(--gray-400);font-weight:400;}
.gmv-big{font-size:38px;font-weight:800;letter-spacing:-.02em;margin-top:4px;background:var(--grad-violet-text);-webkit-background-clip:text;background-clip:text;color:transparent;}
.gmv-big .gmv-u{font-size:18px;font-weight:700;-webkit-text-fill-color:var(--vio-600);margin-left:4px;}
.gmv-sub{font-size:12px;color:var(--gray-500);margin-top:6px;}
```
(목업 `outcome-funnel.html` 참조하되 화려한 그라디언트 배너가 아닌 **좌측 보더 강조 분석 카드**로 — spec §4.2 "차분한 톤".)

- [ ] **Step 3: 거래액 중복 제거 확인**
Run: `grep -n "거래액" index.html`
Expected: hero(신규) + 매출흐름 워터폴 "거래액" 행만 남음. 기존 KPI "거래액" 카드 1곳 삭제됨(공헌이익·예상정산 카드는 유지).

- [ ] **Step 4: 캡처 + 계산 무결성**
Run: `python3 /tmp/sim_capture.py`
Expected: `1-sim.png` 결과 상단에 거래액 강조 카드, 숫자값이 baseline과 동일(계산 불변).

- [ ] **Step 5: Commit**
```bash
git add index.html
git commit -m "style(result): 거래액 분석톤 강조 영역 추가 + KPI 거래액 중복 제거"
```

---

## Task 4: 시나리오 비교 — 필터 1줄 + 카드 글래스

**Files:** Modify `index.html` `renderScenarios()` 필터/카드 마크업 + CSS

- [ ] **Step 1: 필터 영역 CSS — 1줄 압축**
필터 컨테이너(`#launch-filter`·`#type-filter`·`#author-filter`)를 한 줄로 묶는 wrapper 스타일. 버튼 핸들러(`setLaunchFilter` 등) **변경 금지**. CSS만:
```css
.filter-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px;}
.filter-btn{font-size:12px;padding:5px 12px;border-radius:99px;border:1px solid var(--gray-200);background:#fff;color:var(--gray-500);cursor:pointer;}
.filter-btn.active{background:var(--vio-500);color:#fff;border-color:var(--vio-500);box-shadow:0 3px 10px rgba(110,86,207,.25);}
```
필터 3개 컨테이너를 가로로 배치(기존 3줄 wrapper에 `.filter-bar` 적용 또는 display:flex 부모). 마크업 구조 최소 변경.

- [ ] **Step 2: 시나리오 카드 글래스 재스타일**
`.scenario-card` 등 CSS를 글래스 토큰으로. **불러오기 버튼(`loadScenario`)·삭제·체크박스 마크업과 위치는 유지.** 색·radius·shadow만:
```css
.scenario-card{background:var(--glass-surface);border:1px solid var(--glass-border);border-radius:14px;box-shadow:var(--shadow-glass);}
.scenario-actual{border-color:#BBD3FF;}
.badge-sim{background:var(--vio-100,#EBE7FD);color:var(--vio-600);} .badge-actual{background:#E7F0FF;color:var(--info);}
```

- [ ] **Step 3: 캡처 + 필터/불러오기 동작 확인**
Run: `python3 /tmp/sim_capture.py`
Expected: `3-scenarios.png` 필터 1줄, 카드 글래스. (불러오기 버튼 존재 확인 — 마크업 유지)

- [ ] **Step 4: Commit**
```bash
git add index.html
git commit -m "style(scenarios): 필터 1줄 압축 + 시나리오 카드 글래스 재스타일"
```

---

## Task 5: 시나리오 비교표 — 빨강 제거 + 인셀 막대

**Files:** Modify `index.html` `renderScenarios()` 비교표 생성부(1888~1904 부근) + `.compare-table` CSS

- [ ] **Step 1: 비교표 행 생성 로직 — worst 제거 + 막대 추가**
기존 `cells` 생성에서 `worst` 클래스를 제거하고, 각 셀에 인셀 막대 width(해당 지표 최댓값 대비) 추가. `best` 계산은 유지:

```javascript
const cells = vals.map((val,i)=>{
  let cls = filtered[i].isActual ? 'actcol' : '';
  if (val===best && vals.filter(x=>x===best).length<vals.length) cls += ' best';
  const w = Math.max(4, Math.abs(val)/(Math.max(...vals.map(Math.abs))||1)*100);
  return `<td class="${cls.trim()}"><div class="cc"><span class="ccv">${fmt(val,1)}${m.unit}</span><div class="ccb"><i style="width:${w}%"></i></div></div></td>`;
}).join('');
```

- [ ] **Step 2: `.compare-table` CSS 교체 (빨강 없음, 막대)**
기존 `.compare-table td.best`/`.worst` 규칙 교체(목업 `scenario-compare.html` `table.cmp` 참조):
```css
.compare-table td .cc{display:flex;flex-direction:column;align-items:flex-end;gap:3px;}
.compare-table td .ccv{font-weight:700;color:var(--gray-700);}
.compare-table td.best .ccv{color:var(--vio-600);} .compare-table td.best .ccv::after{content:" ★";font-size:9px;color:#9277EF;}
.compare-table td .ccb{width:100%;height:4px;border-radius:99px;background:#EEECFA;overflow:hidden;}
.compare-table td .ccb i{display:block;height:100%;background:linear-gradient(90deg,#9277EF,#6E56CF);}
.compare-table td.best .ccb i{background:linear-gradient(90deg,#6D28D9,#4F46E5);}
.compare-table td.actcol{background:#F4F8FF;} .compare-table td.actcol .ccb i{background:linear-gradient(90deg,#5B8DEF,#2F6BFF);}
```
(기존 `worst` 클래스 참조가 코드에 남지 않도록 `grep -n "worst" index.html`로 0건 확인.)

- [ ] **Step 3: 캡처 + worst 잔존 확인**
Run: `grep -n "worst" index.html` → Expected: 0건
Run: `python3 /tmp/sim_capture.py`
Expected: `3-scenarios.png` 비교표에 빨강 없음, 최고값 ★, 셀마다 보라 막대, 실적 열 파란 음영.

- [ ] **Step 4: Commit**
```bash
git add index.html
git commit -m "style(compare-table): 빨강=최저 제거 + 최고값 ★ + 인셀 막대"
```

---

## Task 6: 시뮬 vs 실적 비교 — 토큰 색 + 달성도 비율

**Files:** Modify `index.html` `hbarChart()` 1441~ + `.hbar*` CSS

- [ ] **Step 1: `hbarChart` — 달성도 비율 병기**
실적/시뮬 비율을 담백하게 병기. 색은 CSS 토큰으로(시뮬=바이올렛, 실적=블루). 반환 구조에 달성도 텍스트 추가:
```javascript
function hbarChart(items){
  const maxVal = Math.max(...items.flatMap(it=>[Math.abs(it.sVal||0),Math.abs(it.aVal||0)]),1);
  return items.map(it=>{
    const sv=it.sVal||0, av=it.aVal||0;
    const sPct=(Math.abs(sv)/maxVal*100).toFixed(1), aPct=(Math.abs(av)/maxVal*100).toFixed(1);
    const rate = sv!==0 ? Math.round(av/sv*100) : null;
    const ach = rate!==null ? `<span class="hbar-ach">목표 대비 ${rate}%</span>` : '';
    return `<div class="hbar-row">
      <div class="hbar-label">${it.label} ${ach}</div>
      <div class="hbar-pair"><span class="hbar-tag sim-tag">시뮬</span><div class="hbar-track"><div class="hbar-fill ${sv<0?'hbar-neg':'hbar-sim'}" style="width:${sPct}%"></div></div><span class="hbar-val">${fmt(sv,1)}${it.unit}</span></div>
      <div class="hbar-pair"><span class="hbar-tag act-tag">실적</span><div class="hbar-track"><div class="hbar-fill ${av<0?'hbar-neg':'hbar-actual'}" style="width:${aPct}%"></div></div><span class="hbar-val">${fmt(av,1)}${it.unit}</span></div>
    </div>`;
  }).join('');
}
```

- [ ] **Step 2: `.hbar*` 색 토큰 정합**
```css
.hbar-sim{background:var(--grad-main);} .hbar-actual{background:linear-gradient(90deg,#5B8DEF,#2F6BFF);}
.sim-tag{color:var(--vio-600);} .act-tag{color:var(--info);}
.hbar-ach{font-size:10.5px;color:var(--gray-400);font-weight:600;margin-left:4px;}
.hbar-neg{background:#E5484D;}
```

- [ ] **Step 3: 캡처 — 시뮬vs실적 뷰**
`/tmp/sim_capture.py`에 런칭 필터 캡처 추가가 필요(현재 '전체'라 차트 미표시). 임시로 캡처 스크립트의 MOCK 뒤에 `currentLaunchFilter='A런칭'` 설정한 4번째 캡처를 추가하거나, 실행 중 `setLaunchFilter('A런칭')` 호출 후 캡처.
Run: 수정한 캡처 스크립트 실행
Expected: 시뮬(보라)/실적(파랑) 막대쌍 + "목표 대비 N%" 병기, 빨강 경보 없음.

- [ ] **Step 4: Commit**
```bash
git add index.html
git commit -m "style(sim-vs-actual): 토큰 색 정합 + 목표 대비 달성도 비율 병기"
```

---

## Task 7: 버전 동기화 + 최종 회귀

**Files:** Modify `index.html` 헤더 배지(604)·changelog 모달(923~) + `CHANGELOG.md`

- [ ] **Step 1: 버전 결정 + 헤더 배지**
시각 개선 = minor. `v1.3.0` → `v1.4.0`. line 604 배지 텍스트 변경.

- [ ] **Step 2: changelog 모달 항목 추가**
모달 본문 최상단에 `v1.4.0` 섹션 추가:
```html
<h3>v1.4.0 — 2026-06-02</h3>
<h4>디자인</h4>
<ul>
  <li>퍼널 예측 가로 막대로 개선 (이탈 강조 제거)</li>
  <li>매출 예측에 거래액 강조 영역 추가</li>
  <li>시나리오 비교 가독성 개선 (인셀 막대·필터 1줄)</li>
  <li>시뮬 vs 실적에 목표 대비 달성도 표시</li>
</ul>
```

- [ ] **Step 3: CHANGELOG.md 추가**
파일 최상단(`# Changelog` 다음)에:
```markdown
## [v1.4.0] — 2026-06-02

### 디자인
- 퍼널 예측 가로 막대 + 이탈 강조 제거
- 매출 예측 거래액 강조(분석 톤) + KPI 중복 정리
- 시나리오 비교 빨강=최저 제거 + 인셀 막대 + 필터 1줄
- 시뮬 vs 실적 목표 대비 달성도 표시
- 운영 콘솔 Soft Gradient Glass 디자인 언어 정합
```

- [ ] **Step 4: 최종 회귀 — baseline 대비 3탭 + 기능**
Run: `python3 /tmp/sim_capture.py`
Expected: 3탭 모두 새 디자인. baseline(`/tmp/sim-baseline`)과 비교해 **숫자값 동일**(계산 불변), 레이아웃 정상.
수동 점검 항목(배포 후, CLAUDE.md "배포 후 검증" 재사용): 로그인 → 입력 → 계산 → 저장 → 불러오기 → 삭제 → 필터.

- [ ] **Step 5: Commit**
```bash
git add index.html CHANGELOG.md
git commit -m "chore: v1.4.0 — UX 시각 개선 릴리즈 (버전 3곳 동기화)

Next: 배포 후 매니저 기능 점검 (로그인·저장·불러오기·필터) — index.html"
```

---

## 보류 (이번 계획 제외 — spec §6)
- 보수/현실/이상 3안 구조 + 현실 기본 (입력 방식 변화 수반 → 별도 의제)
- 운영 콘솔 `/tools/sales-simulator` 통합 (P0 이후 — `.dev/adr/2026-06-02_ux-first-integration-deferred.md`)

## Self-Review 결과
- **Spec coverage**: §4.1→Task2, §4.2→Task3, §4.3→Task4·5, §4.4→Task6, §3 토큰→Task1, §7 버전동기화→Task7. 전 항목 매핑됨.
- **Placeholder**: 각 Step에 실제 코드/명령 포함. "적절히 처리" 류 없음.
- **Type/이름 일관성**: `.fnl-*`·`.gmv-*`·`.cc/.ccv/.ccb`·`.hbar-*` 신규 클래스명 Task 간 일치. 기존 핸들러명(`setLaunchFilter`·`loadScenario`) 변경 없음.
- **불변 보증**: 계산 변수(gmv·price·buyers·adcost·sv·av)만 읽기 재사용, 수식 미변경.

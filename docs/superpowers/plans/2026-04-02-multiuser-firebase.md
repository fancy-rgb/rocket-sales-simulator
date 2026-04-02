# 멀티유저 Firebase 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단일 HTML 파일 시뮬레이터의 localStorage 저장소를 Firebase Firestore로 교체하여, 팀원 누구나 같은 시나리오 목록을 공유하도록 전환

**Architecture:** 기존 `index.html` 단일 파일 구조 유지. Firebase compat SDK를 CDN으로 로드하고, 기존 시나리오 저장/로드/삭제 함수를 모두 비동기 Firestore 호출로 교체. 작성자 필드를 추가하고 저장 모달에 팀원 드롭다운을 삽입.

**Tech Stack:** Vanilla JS, Firebase Firestore compat SDK (CDN), GitHub Pages

---

## 사전 준비: Firebase 프로젝트 설정 (사용자가 직접)

이 단계는 코드 작업 전에 사용자가 직접 브라우저에서 완료해야 합니다.

- [ ] **Step 1: Firebase 콘솔 접속**

  https://console.firebase.google.com → 구글 계정 로그인

- [ ] **Step 2: 새 프로젝트 생성**

  "프로젝트 만들기" 클릭 → 프로젝트 이름 입력(예: `rocket-sales-sim`) → Google Analytics 비활성화 → 프로젝트 만들기

- [ ] **Step 3: Firestore Database 활성화**

  좌측 메뉴 "빌드" → "Firestore Database" → "데이터베이스 만들기" → **테스트 모드**로 시작 → 위치: `asia-northeast3 (서울)` → 사용 설정

- [ ] **Step 4: 웹 앱 등록 및 config 복사**

  프로젝트 개요 → "</>" 아이콘 클릭 → 앱 닉네임 입력(예: `simulator`) → "앱 등록" → 아래 형태의 설정값 메모 (나중에 코드에 붙여넣기)

  ```javascript
  const firebaseConfig = {
    apiKey: "AIzaSy...",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abc..."
  };
  ```

---

## Task 1: .gitignore 생성 및 Firebase SDK 스크립트 추가

**Files:**
- Create: `rocket-sales-simulator/.gitignore`
- Modify: `rocket-sales-simulator/index.html` (line 1553 앞, `</body>` 태그 앞)

- [ ] **Step 1: .gitignore 파일 생성**

  ```
  .superpowers/
  ```

  파일 경로: `rocket-sales-simulator/.gitignore`

- [ ] **Step 2: index.html `</body>` 바로 앞에 Firebase SDK 스크립트 추가**

  현재 `</body>` (line 1553) 위에 다음을 삽입:

  ```html
  <!-- Firebase SDK (compat) -->
  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js"></script>
  ```

- [ ] **Step 3: 브라우저에서 index.html 열어 콘솔 오류 없는지 확인**

  브라우저 개발자도구(F12) → Console 탭 → 빨간 오류 없으면 OK

- [ ] **Step 4: 커밋**

  ```bash
  git -C ~/ai-project/work/rocket-sales-simulator add .gitignore index.html
  git -C ~/ai-project/work/rocket-sales-simulator commit -m "chore: Firebase SDK CDN 추가 및 .gitignore 생성"
  ```

---

## Task 2: Firebase 초기화 + 팀원 목록 + 작성자 드롭다운

**Files:**
- Modify: `index.html` (line 821 `<script>` 블록 상단, line 806 저장 모달 HTML)

- [ ] **Step 1: `<script>` 블록 최상단(line 822 `// STATE` 섹션 위)에 Firebase 초기화 코드 추가**

  현재:
  ```javascript
  // ===================== STATE =====================
  let simResult = {};
  ```

  변경 후 (위에 삽입):
  ```javascript
  // ===================== FIREBASE =====================
  const firebaseConfig = {
    apiKey: "여기에_복사한_값_입력",
    authDomain: "여기에_복사한_값_입력",
    projectId: "여기에_복사한_값_입력",
    storageBucket: "여기에_복사한_값_입력",
    messagingSenderId: "여기에_복사한_값_입력",
    appId: "여기에_복사한_값_입력"
  };
  firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();

  // 팀원 목록 (실제 팀원 이름으로 수정)
  const TEAM_MEMBERS = ['홍길동', '김민준', '이서연', '박찬희'];

  // ===================== STATE =====================
  let simResult = {};
  ```

  > ⚠️ `firebaseConfig` 값은 사전 준비 Step 4에서 복사한 값으로 교체. `TEAM_MEMBERS`는 실제 팀원 이름으로 수정.

- [ ] **Step 2: 저장 모달 HTML에 작성자 드롭다운 추가**

  현재 모달 (line 809-813):
  ```html
  <div class="field">
    <label>런칭명</label>
    <select id="launch-select" class="modal-select" onchange="onLaunchSelectChange()"></select>
    <input type="text" id="launch-new-input" placeholder="새 런칭명 입력 (예: A사 1차 런칭)" style="width:100%; margin-top:8px; display:none;">
  </div>
  ```

  변경 후 (런칭명 필드 아래에 작성자 필드 추가):
  ```html
  <div class="field">
    <label>런칭명</label>
    <select id="launch-select" class="modal-select" onchange="onLaunchSelectChange()"></select>
    <input type="text" id="launch-new-input" placeholder="새 런칭명 입력 (예: A사 1차 런칭)" style="width:100%; margin-top:8px; display:none;">
  </div>
  <div class="field" style="margin-top:12px;">
    <label>작성자</label>
    <select id="author-select" class="modal-select"></select>
  </div>
  ```

- [ ] **Step 3: `openSaveModal()` 함수 안에 작성자 드롭다운 채우는 코드 추가**

  현재 `openSaveModal()` 함수 (line 1202):
  ```javascript
  function openSaveModal() {
    const names = [...new Set(scenarios.map(s => s.launchName).filter(Boolean))];
    const select = document.getElementById('launch-select');
    const newInput = document.getElementById('launch-new-input');
    newInput.value = '';
  ```

  변경 후 (맨 위에 두 줄 추가):
  ```javascript
  function openSaveModal() {
    document.getElementById('author-select').innerHTML =
      TEAM_MEMBERS.map(n => `<option value="${n}">${n}</option>`).join('');

    const names = [...new Set(scenarios.map(s => s.launchName).filter(Boolean))];
    const select = document.getElementById('launch-select');
    const newInput = document.getElementById('launch-new-input');
    newInput.value = '';
  ```

- [ ] **Step 4: 브라우저에서 확인 — 저장 모달에 "작성자" 드롭다운이 보이는지 확인**

- [ ] **Step 5: 커밋**

  ```bash
  git -C ~/ai-project/work/rocket-sales-simulator add index.html
  git -C ~/ai-project/work/rocket-sales-simulator commit -m "feat: Firebase 초기화 및 저장 모달 작성자 드롭다운 추가"
  ```

---

## Task 3: 시나리오 로드 → Firestore로 교체

**Files:**
- Modify: `index.html` (line 825, `showTab()` 함수)

- [ ] **Step 1: 초기 `scenarios` 선언 변경 (line 825)**

  현재:
  ```javascript
  let scenarios = JSON.parse(localStorage.getItem('rls_scenarios') || '[]');
  ```

  변경 후:
  ```javascript
  let scenarios = [];
  ```

- [ ] **Step 2: `loadScenariosFromFirestore()` 함수 추가**

  `// ===================== SCENARIOS =====================` 섹션 (line 1197) 바로 위에 추가:

  ```javascript
  // ===================== FIRESTORE LOAD =====================
  async function loadScenariosFromFirestore() {
    const snapshot = await db.collection('scenarios').orderBy('createdAt', 'desc').get();
    scenarios = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderScenarios();
  }
  ```

- [ ] **Step 3: `showTab()` 함수에서 `renderScenarios()` → `loadScenariosFromFirestore()` 변경**

  현재 (line 833):
  ```javascript
  if (name === 'scenarios') renderScenarios();
  ```

  변경 후:
  ```javascript
  if (name === 'scenarios') loadScenariosFromFirestore();
  ```

- [ ] **Step 4: `// INIT` 섹션(line 1549)에 초기 로드 추가**

  현재:
  ```javascript
  // ===================== INIT =====================
  calcSim();
  calcActual();
  ```

  변경 후:
  ```javascript
  // ===================== INIT =====================
  calcSim();
  calcActual();
  loadScenariosFromFirestore();
  ```

- [ ] **Step 5: 브라우저 확인 — 시나리오 탭 클릭 시 "저장된 시나리오가 없습니다" 빈 상태 정상 표시되는지 확인 (콘솔 오류 없어야 함)**

- [ ] **Step 6: 커밋**

  ```bash
  git -C ~/ai-project/work/rocket-sales-simulator add index.html
  git -C ~/ai-project/work/rocket-sales-simulator commit -m "feat: 시나리오 로드를 Firestore로 교체"
  ```

---

## Task 4: 시나리오 저장 → Firestore로 교체

**Files:**
- Modify: `index.html` (`confirmSave()` 함수, line 1251)

- [ ] **Step 1: `confirmSave()` 함수를 async로 교체**

  현재 `confirmSave()` (line 1251-1270):
  ```javascript
  function confirmSave() {
    const select = document.getElementById('launch-select');
    const newInput = document.getElementById('launch-new-input');

    let launchName;
    if (select.style.display === 'none') {
      launchName = newInput.value.trim();
    } else if (select.value === '__new__') {
      launchName = newInput.value.trim();
    } else {
      launchName = select.value;
    }
    if (!launchName) { alert('런칭명을 입력해주세요.'); return; }

    const data = savingActual ? { ...actualResult, isActual: true } : { ...simResult, isActual: false };
    scenarios.push({ id: Date.now(), name: launchName, launchName, date: new Date().toLocaleDateString('ko'), ...data });
    localStorage.setItem('rls_scenarios', JSON.stringify(scenarios));
    closeModal();
    showToast(savingActual ? '실적이 저장되었습니다.' : '시나리오가 저장되었습니다.');
  }
  ```

  변경 후:
  ```javascript
  async function confirmSave() {
    const select = document.getElementById('launch-select');
    const newInput = document.getElementById('launch-new-input');

    let launchName;
    if (select.style.display === 'none') {
      launchName = newInput.value.trim();
    } else if (select.value === '__new__') {
      launchName = newInput.value.trim();
    } else {
      launchName = select.value;
    }
    if (!launchName) { alert('런칭명을 입력해주세요.'); return; }

    const author = document.getElementById('author-select').value;
    const data = savingActual ? { ...actualResult, isActual: true } : { ...simResult, isActual: false };
    const docData = { name: launchName, launchName, author, date: new Date().toLocaleDateString('ko'), createdAt: Date.now(), ...data };

    const docRef = await db.collection('scenarios').add(docData);
    scenarios.push({ id: docRef.id, ...docData });
    closeModal();
    showToast(savingActual ? '실적이 저장되었습니다.' : '시나리오가 저장되었습니다.');
  }
  ```

- [ ] **Step 2: 브라우저 확인 — 시뮬레이션 입력 후 저장 → 작성자 선택 → 저장 버튼 → 시나리오 탭에서 카드 확인**

- [ ] **Step 3: Firebase 콘솔에서 데이터 확인**

  console.firebase.google.com → 해당 프로젝트 → Firestore Database → `scenarios` 컬렉션에 문서가 생성됐는지 확인

- [ ] **Step 4: 커밋**

  ```bash
  git -C ~/ai-project/work/rocket-sales-simulator add index.html
  git -C ~/ai-project/work/rocket-sales-simulator commit -m "feat: 시나리오 저장을 Firestore로 교체"
  ```

---

## Task 5: 시나리오 삭제 → Firestore로 교체

**Files:**
- Modify: `index.html` (`deleteScenario()`, `clearScenarios()`, 카드 렌더링 onclick)

- [ ] **Step 1: `deleteScenario()` 함수를 async로 교체 (line 1282)**

  현재:
  ```javascript
  function deleteScenario(id) {
    scenarios = scenarios.filter(s => s.id !== id);
    localStorage.setItem('rls_scenarios', JSON.stringify(scenarios));
    renderScenarios();
  }
  ```

  변경 후:
  ```javascript
  async function deleteScenario(id) {
    await db.collection('scenarios').doc(id).delete();
    scenarios = scenarios.filter(s => s.id !== id);
    renderScenarios();
  }
  ```

- [ ] **Step 2: `clearScenarios()` 함수를 async로 교체 (line 1288)**

  현재:
  ```javascript
  function clearScenarios() {
    if (!confirm('저장된 시나리오를 모두 삭제할까요?')) return;
    scenarios = [];
    localStorage.removeItem('rls_scenarios');
    renderScenarios();
  }
  ```

  변경 후:
  ```javascript
  async function clearScenarios() {
    if (!confirm('저장된 시나리오를 모두 삭제할까요?')) return;
    const snapshot = await db.collection('scenarios').get();
    await Promise.all(snapshot.docs.map(doc => doc.ref.delete()));
    scenarios = [];
    renderScenarios();
  }
  ```

- [ ] **Step 3: 시나리오 카드 onclick에서 문자열 ID 따옴표 처리**

  카드 렌더링 (line 1455, 1485) — Firestore ID는 문자열이므로 따옴표 필요:

  현재:
  ```javascript
  <button class="btn btn-danger btn-sm" onclick="deleteScenario(${s.id})">삭제</button>
  ```
  변경 후:
  ```javascript
  <button class="btn btn-danger btn-sm" onclick="deleteScenario('${s.id}')">삭제</button>
  ```

  현재:
  ```javascript
  ${s.isActual ? '' : `<button class="btn btn-secondary btn-sm" onclick="loadScenario(${s.id})">📥 불러오기</button>`}
  ```
  변경 후:
  ```javascript
  ${s.isActual ? '' : `<button class="btn btn-secondary btn-sm" onclick="loadScenario('${s.id}')">📥 불러오기</button>`}
  ```

- [ ] **Step 4: 브라우저 확인 — 시나리오 카드의 삭제 버튼 클릭 → 카드 사라지는지 확인**

- [ ] **Step 5: 커밋**

  ```bash
  git -C ~/ai-project/work/rocket-sales-simulator add index.html
  git -C ~/ai-project/work/rocket-sales-simulator commit -m "feat: 시나리오 삭제를 Firestore로 교체"
  ```

---

## Task 6: 시나리오 카드 작성자 배지 추가

**Files:**
- Modify: `index.html` (카드 렌더링 영역 line 1453)

- [ ] **Step 1: 시나리오 카드 `scenario-meta` 줄에 작성자 추가**

  현재 (line 1453):
  ```javascript
  <div class="scenario-meta">${s.date} · 객단가 ${fmt(s.price)}만원</div>
  ```

  변경 후:
  ```javascript
  <div class="scenario-meta">${s.date}${s.author ? ` · ${s.author}` : ''} · 객단가 ${fmt(s.price)}만원</div>
  ```

- [ ] **Step 2: 브라우저 확인 — 시나리오 카드에 작성자 이름이 날짜 옆에 표시되는지 확인**

- [ ] **Step 3: 커밋**

  ```bash
  git -C ~/ai-project/work/rocket-sales-simulator add index.html
  git -C ~/ai-project/work/rocket-sales-simulator commit -m "feat: 시나리오 카드에 작성자 표시 추가"
  ```

---

## Task 7: 남은 localStorage 코드 완전 제거

**Files:**
- Modify: `index.html`

- [ ] **Step 1: `index.html`에서 `localStorage` 검색하여 남은 참조 모두 확인**

  ```bash
  grep -n "localStorage" ~/ai-project/work/rocket-sales-simulator/index.html
  ```

  이 시점에서 결과가 0줄이면 완료. 남은 줄이 있으면 해당 줄 확인 후 제거.

- [ ] **Step 2: 커밋 (변경사항 있을 경우)**

  ```bash
  git -C ~/ai-project/work/rocket-sales-simulator add index.html
  git -C ~/ai-project/work/rocket-sales-simulator commit -m "chore: localStorage 잔여 코드 제거"
  ```

---

## Task 8: GitHub Pages 배포

**Files:**
- 없음 (git push만)

- [ ] **Step 1: 배포 전 최종 동작 확인**

  브라우저에서 `index.html` 직접 열어:
  1. 시뮬레이션 입력 → 시나리오 저장 → 작성자 선택 후 저장 → 시나리오 탭에서 카드 확인
  2. 다른 브라우저 탭에서 같은 파일 열어 같은 시나리오 보이는지 확인
  3. 삭제 버튼 동작 확인

- [ ] **Step 2: GitHub에 push**

  ```bash
  git -C ~/ai-project/work/rocket-sales-simulator push
  ```

- [ ] **Step 3: GitHub Pages 설정 확인 (첫 배포 시)**

  GitHub → `rocket-sales-simulator` 레포 → Settings → Pages → Source: `main` 브랜치 / `/ (root)` → Save

  배포 URL: `https://fancy-rgb.github.io/rocket-sales-simulator/`

- [ ] **Step 4: 배포된 URL에서 최종 동작 확인**

  두 개의 브라우저 탭에서 같은 URL 접속 → 한 탭에서 저장 → 다른 탭 새로고침 → 시나리오 보이는지 확인

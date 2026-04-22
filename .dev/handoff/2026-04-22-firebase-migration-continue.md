# 핸드오프 — Firebase 프로젝트 통합 이전 (v1.3.0) 중단 지점

**세션 종료 시점**: 2026-04-22
**다음 세션 목표**: Phase 2-4 완료 → simulator push → GitHub Pages 배포 → 팀 공지

---

## ⚠️ 가장 중요한 주의사항

**simulator는 현재 "로컬 commit 완료 + push 대기" 상태**입니다.

- 로컬 최신 커밋: `43afcc5` (feat: Firebase 프로젝트 통합 준비 v1.3.0)
- 원격(GitHub): 여전히 `51d41c4` (구 v1.2.1 상태)
- **지금 push하면** 팀이 쓰고 있는 simulator가 깨집니다 (새 Firebase 프로젝트에 Rules 미게시 상태)
- **반드시 Phase 2-4(Rules 게시 + admins 재입력)를 먼저 끝내고 push**

---

## 📊 전체 진행 상황

### ✅ Phase 1: Firebase/OAuth 설정 (완료)
- 1-1 `rocket-launch-489213`에 Firebase 추가
- 1-2 Authentication 활성화 (Google provider)
- 1-3 Firestore Database 생성 (asia-northeast3 서울, Standard, 프로덕션 모드)
- 1-4 웹 앱 `rocket-integrated` 등록 + firebaseConfig 확보
- 1-5 승인된 도메인에 `fancy-rgb.github.io` 추가
- 1-6 Google Sheets API 이미 활성화됨 확인
- 1-7 기존 OAuth 클라이언트 `rocket-launch-dashboard-web` 재사용 (Netlify URI 제거 + 새 JS 원본 4개 등록)

### ✅ Phase 2: simulator 코드 교체 (일부 완료)
- 2-1 `index.html` firebaseConfig 교체 ✓ (로컬만)
- 2-2 `firestore.rules` 작성 ✓ (파일 생성만, 아직 Firebase Console에 게시 안 됨)
- 2-3 CHANGELOG/버전 배지/모달 v1.3.0 반영 ✓

### ⚠️ Phase 2-4: **미완료 — 내일 첫 작업**
- 새 프로젝트 Firebase Console에서 수행:
  1. Firestore Rules 게시 (`firestore.rules` 내용 복사 → 규칙 탭 → 게시)
  2. `admins` 컬렉션 생성 + 문서 1건(`fancy@futureschole.com`) 추가

### ⏳ Phase 2-5: 미완료 — 2-4 완료 후
- simulator commit `43afcc5` push (origin + company 둘 다)
- GitHub Pages 자동 배포 확인
- 로그인·시나리오 저장·관리자 삭제 권한 검증
- 팀 Slack 공지 ("재로그인 필요")

### ⏳ Phase 3: dashboard v2.0 Firebase 전환
- 어제 작성된 설계(`2026-04-21-to-firebase-migration.md`) 그대로 진행
- 선행 조건(Firebase 활성화 + OAuth 클라이언트 ID) 이미 완료 — 바로 코드 작업 가능

---

## 🔑 필요한 값 (내일 쓸 것)

### 새 Firebase 프로젝트 config
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyB7vShchYS6M5VUvOxbbwhJLRru8lbmiHg",
  authDomain: "rocket-launch-489213.firebaseapp.com",
  projectId: "rocket-launch-489213",
  storageBucket: "rocket-launch-489213.firebasestorage.app",
  messagingSenderId: "887078227984",
  appId: "1:887078227984:web:fbf7c94198a3b1c065fa95",
  measurementId: "G-WF30MWNBFH"
};
```

### OAuth 2.0 클라이언트 ID (dashboard v2.0용)
```
887078227984-fah9ddkhqgdpq9277s1jo78ghgj1nanb.apps.googleusercontent.com
```

### 이전 데이터 정리
- `admins`: 1명 (`fancy@futureschole.com`)
- `blocked_users`: 컬렉션 없음 (재입력 불필요)
- `scenarios`: 버림 (B옵션 확정)

---

## 🎬 내일 첫 액션 — 순서

### 1. 세션 시작 자동화
사용자가 "작업 시작" / "이어서 하자" → `/sync` 실행 → 이 핸드오프 읽기

### 2. Phase 2-4 완료 (사용자 수동 작업, 약 5분)

**Firebase Console → `rocket-launch-489213` 프로젝트**

(a) Firestore Database → 규칙 탭 → 아래 내용 붙여넣기 → 게시:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() {
      return request.auth != null;
    }
    function isAllowedDomain() {
      return isSignedIn() &&
        (request.auth.token.email.matches('.*@liveklass\\.com') ||
         request.auth.token.email.matches('.*@futureschole\\.com'));
    }
    function isAdmin() {
      return isSignedIn() &&
        exists(/databases/$(database)/documents/admins/$(request.auth.token.email));
    }
    function isNotBlocked() {
      return isSignedIn() &&
        !exists(/databases/$(database)/documents/blocked_users/$(request.auth.token.email));
    }
    function canUseApp() {
      return isAllowedDomain() && isNotBlocked();
    }
    match /admins/{email} {
      allow read: if isSignedIn();
      allow write: if false;
    }
    match /blocked_users/{docId} {
      allow read: if isSignedIn();
      allow write: if false;
    }
    match /scenarios/{docId} {
      allow read: if canUseApp();
      allow create: if canUseApp();
      allow update: if canUseApp();
      allow delete: if false;
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

(b) 데이터 탭 → + 컬렉션 시작 → `admins` → 문서 ID: `fancy@futureschole.com`, 필드 `email`(string): `fancy@futureschole.com`

### 3. Phase 2-5 실행 (Claude 작업)

```bash
cd ~/ai-project/work/rocket-sales-simulator
git push origin main         # 개인 계정
git push company main        # 회사 org (MEMORY.md상 "둘 다" 프로젝트)
```

GitHub Pages 자동 배포 대기 (1~2분) → https://fancy-rgb.github.io/rocket-sales-simulator/ 에서:
- [ ] `fancy@futureschole.com`으로 로그인 성공
- [ ] 시나리오 목록 빈 상태로 정상 표시 (초기화됨)
- [ ] 삭제 버튼 보임 (admin 권한 인식)
- [ ] 새 시나리오 저장 성공
- [ ] 외부 도메인(gmail) 계정 로그인 시 접근 차단 화면

### 4. 팀 공지 (Slack) — Phase 2 검증 완료 후

```
simulator 업데이트 v1.3.0 (2026-04-23)

안녕하세요. 로켓런칭 시뮬레이터가 새 Firebase 프로젝트로 이전됐습니다.

변경점
- URL은 그대로: fancy-rgb.github.io/rocket-sales-simulator
- 기존 로그인 세션 초기화 → 다시 로그인 한 번 필요
- 기존 저장된 시나리오는 전부 초기화됨 (재생성 필요)

왜 이전했나요
- dashboard / guide와 같은 인증 풀 공유 → 퇴사자·관리자 관리 한 곳에서 처리

문의는 저에게 DM 주세요.
```

### 5. Phase 3 착수 (dashboard v2.0 전환)

어제 핸드오프(`~/ai-project/work/rocket-launch-dashboard/.dev/handoff/2026-04-21-to-firebase-migration.md`)의 8단계 진행.
- ① functions/ → functions-legacy/ 백업
- ② js/auth.js 교체 (Firebase Auth + Google Sheets scope)
- ③ js/sheets-client.js 교체 (OAuth access_token으로 REST API 직접 호출)
- ④ Firebase SDK CDN 추가
- ⑤ firebase.json · .firebaserc 생성
- ⑥ 로컬 테스트
- ⑦ firebase deploy --only hosting
- ⑧ 설계 문서 v1.9 업데이트

---

## 📂 오늘 추가/수정된 파일

### 로컬 커밋됨 (push 대기)
- `index.html` — firebaseConfig 교체 + 버전 배지 v1.3.0 + 모달 항목 추가 (로컬 커밋 `43afcc5`)
- `CHANGELOG.md` — v1.3.0 추가 (로컬 커밋 `43afcc5`)
- `firestore.rules` — 신규 (로컬 커밋 `43afcc5`)

### 아직 커밋 안 된 것
- `.dev/handoff/2026-04-22-firebase-migration-continue.md` — 이 핸드오프 파일 (곧 커밋 예정)

### 이전 커밋된 상태에서 변화 없음
- 기타 파일 전부

---

## 🔗 관련 자료

- dashboard 핸드오프: `~/ai-project/work/rocket-launch-dashboard/.dev/handoff/2026-04-21-to-firebase-migration.md` (어제 작성)
- MEMORY.md 진행 상황: `rocket-launch-dashboard` / `rocket-sales-simulator` 두 항목 모두 업데이트됨
- 구 `rocket-simulator-f988e` 프로젝트: 30일간 보관 후 삭제 예정 (이전 검증 완료 후 3~4주 뒤)

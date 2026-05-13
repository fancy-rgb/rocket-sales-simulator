// scripts/migrate-simulator.mjs
// Firestore scenarios → Supabase scenarios 마이그레이션
//
// 실행 전 준비:
//   1. .env.migration 파일에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 입력
//   2. Firebase 서비스 계정 키: rocket-launch-automation/service-account.json 사용
//
// 실행:
//   node --env-file=.env.migration scripts/migrate-simulator.mjs --dry-run  (미리보기)
//   node --env-file=.env.migration scripts/migrate-simulator.mjs             (실제 실행)

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DRY_RUN = process.argv.includes('--dry-run')
if (DRY_RUN) console.log('=== DRY RUN 모드 (실제 데이터 변경 없음) ===\n')

// Firebase 초기화 (rocket-launch-automation의 서비스 계정 재사용)
const SERVICE_ACCOUNT_PATH = resolve(__dirname, '../service-account-launch.json')
const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'))
initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()

// Supabase 초기화
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ .env.migration 파일에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY를 설정하세요.')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// 1. Firestore에서 scenarios 전체 읽기
console.log('Firestore에서 scenarios 읽는 중...')
const snap = await db.collection('scenarios').get()
const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
console.log(`Firestore scenarios: ${docs.length}건 (deleted 포함)`)

const activeDocs = docs.filter(d => !d.deleted)
const deletedDocs = docs.filter(d => d.deleted)
console.log(`  - 활성: ${activeDocs.length}건`)
console.log(`  - 소프트삭제: ${deletedDocs.length}건`)

// 2. Firestore 문서 → Supabase 행 변환
function toSupabaseRow(d) {
  const {
    id: _id,
    name,
    launchName,
    author,
    date,
    isActual,
    deleted,
    deletedBy,
    deletedAt,
    createdAt,
    ...rest  // 나머지 시뮬레이션 파라미터 전부 params JSONB에
  } = d

  // Firestore Timestamp 또는 숫자(ms) 모두 ISO 문자열로 변환
  function toISO(val) {
    if (!val) return null
    if (typeof val === 'object' && val._seconds) {
      return new Date(val._seconds * 1000).toISOString()
    }
    if (typeof val === 'number') return new Date(val).toISOString()
    return String(val)
  }

  return {
    name: name || null,
    launch_name: launchName || null,
    author: author || null,
    date: date || null,
    is_actual: !!isActual,
    params: rest,
    deleted: !!deleted,
    deleted_by: deletedBy || null,
    deleted_at: toISO(deletedAt),
    created_at: toISO(createdAt),
  }
}

const rows = docs.map(toSupabaseRow)
console.log(`\n변환 완료: ${rows.length}건`)

if (DRY_RUN) {
  console.log('\n--- 샘플 (첫 2건) ---')
  rows.slice(0, 2).forEach((r, i) => {
    const preview = { ...r, params: `{...${Object.keys(r.params).length}개 필드}` }
    console.log(`[${i}]`, JSON.stringify(preview, null, 2))
  })
  console.log('\n--- params 키 목록 (첫 번째 문서) ---')
  if (rows[0]) console.log(Object.keys(rows[0].params).join(', '))
  process.exit(0)
}

// 3. Supabase INSERT (배치 처리)
console.log('\nSupabase에 INSERT 중...')
const BATCH = 50
let inserted = 0
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH)
  const { data, error } = await supabase.from('scenarios').insert(batch).select('id')
  if (error) {
    console.error(`❌ INSERT 실패 (배치 ${Math.floor(i/BATCH) + 1}):`, error)
    process.exit(1)
  }
  inserted += data.length
  process.stdout.write(`  ${inserted}/${rows.length}건\r`)
}
console.log(`\n✅ 마이그레이션 완료: ${inserted}건 삽입`)

// 4. 건수 검증
const { count, error: countErr } = await supabase
  .from('scenarios')
  .select('*', { count: 'exact', head: true })
if (countErr) {
  console.error('건수 확인 실패:', countErr)
} else {
  console.log(`Supabase scenarios 총 건수: ${count}건`)
  if (count !== docs.length) {
    console.warn(`⚠️  건수 불일치! Firestore ${docs.length} vs Supabase ${count}`)
  } else {
    console.log('✅ 건수 일치 확인')
  }
}

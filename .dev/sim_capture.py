import os
from playwright.sync_api import sync_playwright

OUT = "/tmp/sim-capture"
os.makedirs(OUT, exist_ok=True)
FILE = "file:///Users/fancy/ai-project/work/rocket-sales-simulator/index.html"

# 시나리오 비교 탭용 가짜 데이터 (구조 파악 목적)
# scenarios 는 스크립트 스코프 let 변수 → 베어 식별자로 직접 재할당
MOCK = """() => {
  scenarios = [
    {id:'1',name:'보수안',isActual:false,author:'테오',date:'2026-06-01',launchName:'A런칭',price:297,adcost:1000,cac:5,buyers:14,gmv:4158,revenue:3780,contribution:900,expectedSettlement:2100,roas:519,attendRate:0.55,ftRate:0.68,cvr:0.12,adReg:200,totalReg:280,attends:154,ftAttends:105},
    {id:'2',name:'공격안',isActual:false,author:'테오',date:'2026-06-01',launchName:'A런칭',price:297,adcost:1500,cac:6,buyers:22,gmv:6534,revenue:5940,contribution:1800,expectedSettlement:2600,roas:436,attendRate:0.55,ftRate:0.70,cvr:0.13,adReg:250,totalReg:350,attends:192,ftAttends:134},
    {id:'3',name:'중간안',isActual:false,author:'노바',date:'2026-05-30',launchName:'A런칭',price:297,adcost:1100,cac:5.5,buyers:18,gmv:5346,revenue:4860,contribution:1450,expectedSettlement:2400,roas:486,attendRate:0.56,ftRate:0.69,cvr:0.12,adReg:220,totalReg:300,attends:168,ftAttends:116},
    {id:'4',name:'실제결과',isActual:true,author:'테오',date:'2026-05-28',launchName:'A런칭',price:297,adcost:1050,cac:5.8,buyers:16,gmv:4752,revenue:4320,contribution:1280,expectedSettlement:2300,roas:452,attendRate:0.54,ftRate:0.67,buyCvr:0.11,adReg:210,totalReg:290,attends:157,ftAttends:105}
  ];
  currentLaunchFilter = '전체';
  currentTypeFilter = '전체';
  currentAuthorFilter = '전체';
  isAdmin = false;
}"""

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 1400}, device_scale_factor=2)
    logs = []
    page.on("console", lambda m: logs.append(m.text))
    page.goto(FILE)
    page.wait_for_timeout(1500)  # Supabase CDN 로드 대기

    # 인증 오버레이 제거 + 앱 노출
    page.evaluate("""() => {
      const ov = document.getElementById('auth-overlay');
      if (ov) ov.remove();
      document.body.style.overflow = 'auto';
    }""")

    def switch(name):
        page.evaluate("""(name) => {
          document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
          const el = document.getElementById('page-'+name);
          if (el) el.classList.add('active');
          document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        }""", name)

    # 1) 시뮬레이션 탭
    try:
        switch('sim'); page.evaluate("() => calcSim()")
    except Exception as e: logs.append('sim err: '+str(e))
    page.wait_for_timeout(400)
    page.screenshot(path=f"{OUT}/1-sim.png", full_page=True)

    # 2) 실적 입력 탭
    try:
        switch('actual'); page.evaluate("() => calcActual()")
    except Exception as e: logs.append('actual err: '+str(e))
    page.wait_for_timeout(400)
    page.screenshot(path=f"{OUT}/2-actual.png", full_page=True)

    # 3) 시나리오 비교 탭 (가짜 데이터 주입)
    try:
        page.evaluate(MOCK)
        switch('scenarios'); page.evaluate("() => renderScenarios()")
    except Exception as e: logs.append('scenarios err: '+str(e))
    page.wait_for_timeout(500)
    page.screenshot(path=f"{OUT}/3-scenarios.png", full_page=True)

    browser.close()
    print("CONSOLE LOGS (last 15):")
    for l in logs[-15:]: print(" ", l)
    print("\nSaved to", OUT)

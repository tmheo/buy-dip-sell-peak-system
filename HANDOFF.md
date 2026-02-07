# Handoff Document

## Goal

두 가지 작업을 진행 중이었습니다:

1. **모바일 반응형 UI 수정** (완료, 커밋됨)
2. **Vercel 프로덕션 배포 문제 해결** (해결됨 - Vercel 플랫폼 자체 복구)

---

## Current Progress

### 1. 모바일 반응형 UI 수정 (완료)

커밋 `254cfa9`로 반영됨. 변경 파일:

**`src/styles/globals.css`**:
- `.table-responsive::after`의 `margin-top: -100%` + `position: sticky` 방식이 모바일 세로 모드에서 주문표 컨테이너를 0 높이로 축소시키는 버그 수정
- `position: absolute` + `top: 0; bottom: 0`으로 변경하여 스크롤 그림자 효과 유지하면서 레이아웃 문제 해결
- 모바일 `.btn-sm`에 `display: inline-flex; align-items: center; justify-content: center` 추가하여 버튼 텍스트 수직 중앙 정렬
- `.navbar .btn-sm` 오버라이드 추가하여 네비바 내 버튼은 `min-height: auto`로 복원

**`src/components/TopControlBar.tsx`**:
- Trading, My Page 버튼에 `btn-sm` 클래스 추가하여 로그아웃 버튼과 크기 통일

### 2. Vercel 프로덕션 배포 문제 (해결됨)

커밋 `254cfa9` 이후 모든 프로덕션 배포가 "Staged" 상태에 머물며 "Current"로 승격되지 않음.

**증상**:
- 빌드는 성공 (Ready, 45s)
- "Deployment Checks" 단계가 pending 상태로 영원히 대기
- "Assigning Custom Domains" 단계가 Skipped 처리
- GitHub 커밋 상태가 "pending" ("Vercel is deploying your app")으로 멈춤
- 이전 성공 배포(52987b9)는 GitHub 상태가 "success" ("Deployment has completed")

**마지막으로 정상 배포된 커밋**: `52987b9` (fix: calculateTradingDays 시작일 포함으로 변경 및 보유기간 표시 수정)
**현재 main HEAD**: `386b815` (chore: Vercel Git 재연결 후 배포 트리거) - 빈 커밋

---

## What Worked

- 모바일 UI 수정 자체는 정상적으로 코드 반영됨
- Vercel 상태 페이지 확인 -> 플랫폼 전체 장애는 아님
- GitHub API로 커밋별 status 비교하여 문제 범위 특정

---

## What Didn't Work (반복하지 말 것)

1. **Vercel 대시보드에서 Redeploy** -> 여전히 Staged로만 감
2. **Vercel 대시보드에서 Promote** -> 작동하지 않음
3. **빈 커밋 푸시 (c7894fc, 386b815)** -> 새 배포 트리거되지만 여전히 Staged
4. **Settings > Git에서 Disconnect 후 Reconnect** -> 자동 배포 트리거 안 됨, 수동 푸시 후에도 여전히 Staged
5. **Vercel CLI `npx vercel --prod`** -> "Missing files" 오류 (`.moai-backups/` 등 대용량 파일 때문)
6. **Vercel CLI `npx vercel promote`** -> "Promote in progress..." 무한 대기 후 타임아웃

---

## Resolution (2026-02-07)

### 원인: Vercel 플랫폼 일시적 장애

Vercel 서버 측 문제로 확인됨:
- **Deployment Checks**가 pending 상태로 무한 대기 → 배포가 "Staged"에 머무름
- **CLI 배포** (`npx vercel --prod`)도 "Missing files" 에러 발생 — 파일 업로드 성공 후에도 서버가 같은 파일을 다시 요구하는 서버 측 버그
- Vercel Authentication (Standard Protection) 비활성화해도 영향 없음 → 인증 설정이 원인이 아님

### 해결

- Vercel 플랫폼 자체적으로 복구됨 (약 수시간 후)
- 기존 "Staged" 상태 배포들이 모두 자동 promote되어 프로덕션 반영

### 시도한 방법 (효과 없었음)

1. Vercel 대시보드 Redeploy/Promote
2. 빈 커밋 푸시 (c7894fc, 386b815, 24bbe71)
3. Git Disconnect/Reconnect
4. Vercel CLI `npx vercel --prod` (Missing files 서버 버그)
5. Vercel CLI `npx vercel promote` (무한 대기)
6. Deployment Protection > Vercel Authentication 비활성화

### 추가 작업

- `.vercelignore` 생성: CLI 배포 시 `.moai-backups/` 등 대용량 파일 제외
- `.gitignore`에 `.vercel` 추가: CLI 로컬 설정 제외
- Vercel Authentication: 비활성화 상태로 유지 (필요 시 재활성화)

---

## Key Files

- `src/styles/globals.css` - 모바일 반응형 CSS (수정 완료)
- `src/components/TopControlBar.tsx` - 상단 네비게이션 바 (수정 완료)
- `src/components/trading/DailyOrdersTable.tsx` - 주문표 컴포넌트
- `src/components/trading/AccountListTable.tsx` - 계좌 목록 컴포넌트

## Vercel 관련 정보

- **Vercel Domain**: https://buy-dip-sell-peak-system.vercel.app
- **Vercel Plan**: Hobby
- **GitHub Repo**: tmheo/buy-dip-sell-peak-system
- **Git 연결 상태**: Connected (2026-02-07 재연결됨)
- **Vercel CLI**: 로그인 완료 (npx vercel login 실행됨)

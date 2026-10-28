# Rhythm Log — 실제 웹서비스 배포 절차

> 코드가 배포되었다는 것과 회원가입/데이터 저장/RLS가 정상 동작한다는 것은 별개입니다.
> 이 프로젝트는 개인 식사·수면 기록을 다룹니다. 실제 사용자 가입 전 **두 계정 교차 접근 테스트와 기록 삭제 테스트**를 반드시 완료하세요.

## 0. GitHub Pages 배포 완료

저장소: https://github.com/Andcha37/rhythm-log
웹주소: https://andcha37.github.io/rhythm-log/
도메인 구매는 필요 없습니다. GitHub Pages는 정적 호스팅이며 인증과 데이터는 Clerk·Supabase에 보관됩니다.

## 1. Clerk 설정 (아이디만 사용)

1. https://dashboard.clerk.com 에서 새 애플리케이션 생성.
2. User & Authentication에서 **Username + Password** 로그인·가입을 활성화; email/phone은 요구하지 않도록 설정.
3. 테스트 사용자 ID를 생성하여 아이디가 대소문자 구분 없이 중복 차단되는지 확인.
4. **Publishable Key (`pk_...`)만** 복사. 서버 Secret (`sk_...`)은 GitHub에 넣지 않음.
5. 개발·프로덕션 인스턴스가 다를 수 있으니 연결한 키와 승인 도메인을 확인. 사용자명만 사용할 경우 자체적인 안전한 계정 복구 정책이 필요.

## 2. Supabase 설정 (RLS 포함)

1. https://supabase.com/dashboard 에서 새로운 프로젝트 생성.
2. Clerk 통합: Clerk 대시보드에서 Supabase integration 활성화 및 Clerk 도메인 확인 → Supabase > Authentication > Third-Party Auth > Clerk에 등록.
3. Supabase SQL Editor에서 순서대로 `supabase/migrations/001_initial.sql`, `002_user_data_purge.sql` 실행.
4. Project URL과 **publishable key (`sb_publishable_...` 또는 제공되는 공개 anon key)** 복사. `service_role` 키는 사용하지 않음.
5. GitHub **Settings → Secrets and variables → Actions → Variables**에서 `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` 세 개의 공개 변수를 설정합니다. `app/config.js`는 빌드 시 해당 변수들을 읽습니다. 비밀키는 절대 VITE 변수에 입력하지 않습니다.

## 3. 아이디 중복 검사 — 추가 서비스 불필요

- 기본 설정은 Cloudflare Worker 없이 작동합니다.
- **아이디 형식 확인** 버튼은 브라우저에서 형식만 검증합니다. 이미 사용 중인지는 미리 확인하지 않습니다.
- 사용자가 **회원가입**을 누르면 Clerk 서버가 아이디 중복 여부를 최종 확인합니다. 중복일 경우 가입을 거절합니다.
- 이 방식으로 충분하며 새로운 API 서비스나 별도 SQL username 테이블이 필요하지 않습니다.
- '가입 버튼 전' 중복 여부를 따로 조회하는 기능은 선택 사항입니다. 필요하다면 이미 사용 중인 Supabase의 Edge Function에서 서버 측 Clerk API를 호출할 수 있습니다. Clerk Secret Key는 Edge Function Secret에만 보관하고 조회 속도를 제한해야 합니다.
- 공개 사용자명 존재 확인 기능은 사용자 열거 위험이 있으므로 초기 버전에서는 구현하지 않는 편이 안전합니다.

## 4. GitHub Pages 배포

Windows에서는 PowerShell과 GitHub CLI(`gh`) 설치 후 프로젝트 폴더에서:

```powershell
.\scripts\publish-windows.ps1
```

또는 Git으로 `main` 브랜치에 push. 저장소 Settings > Pages > Source는 **GitHub Actions**로 설정.
배포 워크플로가 `npm test` → `npm run build` → Pages 배포를 수행.
최종 주소는 일반적으로 `https://andcha37.github.io/rhythm-log/`.

## 5. 출시 차단 검증표

- [ ] 실제 Clerk 계정 A 생성, 아이디 중복 확인·가입 및 로그인 성공
- [ ] 동일 아이디 가입 B가 서버에서 차단됨
- [ ] 계정 A에서 식사/수면 기록 1개씩 추가 후 재접속 시 조회됨
- [ ] 계정 B는 A의 행 조회/변경/삭제/meal_id 참조 삽입 모두 실패함
- [ ] 공개 Supabase 키로 인증 없는 읽기 요청이 차단됨
- [ ] 전체 삭제 기능은 본인 자료만 지움; A 삭제 후 B 데이터 유지
- [ ] WebGPU 지원 PC에서 실제 Qwen 7B 다운로드·추출 확인 (미지원 시 수동 입력 가능)
- [ ] 모바일 기기 PWA 설치 여부와 저사양 환경 수동 기록 확인
- [ ] 개인정보처리방침, 저장/삭제/보유 기간, 운영자 연락처 안내 게시
- [ ] 계정 완전 탈퇴 및 비밀번호 복구 정책 확인

## 운영 비용과 제한

- WebLLM 로컬 추론 사용료 자체는 0원. 이용자의 GPU·대역폭·전기 자원이 필요.
- Clerk/Supabase/Cloudflare/GitHub Pages 무료 플랜에는 호출량/사용량 제한이 있으며 향후 정책 변경 가능.
- SQL RLS는 정상 사용자 간 자료 격리 장치이고 **Supabase 프로젝트 소유자의 관리자 권한까지 막지는 않음**.
- 호스팅 및 운영자가 통제하는 DB는 종단간 암호화 서비스가 아님.
- 본 서비스는 건강 진단 도구가 아니며, 영양값은 검증되지 않으면 NULL로 유지.


## 6. GitHub Actions 변수 설정 및 재배포 (권장)

https://github.com/Andcha37/rhythm-log/settings/variables/actions

공개 값만 Repository variables에 저장하세요:

| Name | 어디서 가져오나 |
|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk Dashboard의 Publishable Key (`pk_...`) |
| `VITE_SUPABASE_URL` | Supabase Project URL (`https://...supabase.co`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase Publishable Key (`sb_publishable_...`) |
| `VITE_USERNAME_CHECK_URL` | 선택: Cloudflare Worker의 `/check` 주소 |

변수를 저장한 다음 https://github.com/Andcha37/rhythm-log/actions/workflows/pages.yml 에서 **Run workflow**를 실행하세요. GitHub의 Repository Variables는 **기존 빌드에 자동 반영되지 않고 새로운 빌드부터 적용**됩니다.

**주의:** `VITE_*` 값은 최종 사이트의 JavaScript에 공개됩니다. `CLERK_SECRET_KEY`, Supabase secret/service_role, DB 비밀번호를 넣으면 안 됩니다.

### 별도 Supabase 프로젝트 권장

현재 연결된 `lifetrack_skill_app` Supabase 프로젝트에는 `todo_tasks` 테이블이 존재합니다. 이는 다른 용도의 기존 앱으로 보이므로 Rhythm Log의 스키마를 임의로 적용하지 않았습니다. 새 Supabase 프로젝트를 만들고 거기에 마이그레이션을 적용하는 편이 안전합니다.

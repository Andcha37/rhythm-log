# Run from the Rhythm Log root folder. This script does not upload any secrets.
$ErrorActionPreference='Stop'
if (-not (Test-Path 'package.json')) { throw '프로젝트 루트에서 실행해야 합니다.' }
foreach ($cmd in @('git','gh','node','npm')) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "필요한 명령을 찾지 못했습니다: $cmd" }
}
& gh auth status
if ($LASTEXITCODE -ne 0) { throw '먼저 gh auth login을 실행하세요.' }
$config=Get-Content 'app/config.js' -Raw
if ($config -match 'YOUR_CLERK|YOUR_PROJECT|YOUR_SUPABASE') {
  Write-Warning 'Clerk/Supabase 공개키가 아직 미설정입니다. 화면은 배포되지만 회원가입과 기록 저장이 동작하지 않습니다.'
}
if ($config -match 'sk_(test|live)_|sb_secret_|service_role') {throw '비밀키로 보이는 값을 발견했습니다. 즉시 제거하고 키를 교체하세요.'}
& npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) {throw 'npm 의존성 설치 실패'}
& npm test
if ($LASTEXITCODE -ne 0) {throw '테스트 실패'}
& npm run build
if ($LASTEXITCODE -ne 0) {throw '빌드 실패'}
$repo='Andcha37/rhythm-log'
& gh repo view $repo --json name *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "신규 공개 저장소 $repo 를 생성합니다."
  & gh repo create $repo --public --confirm
  if ($LASTEXITCODE -ne 0) {throw 'GitHub 저장소 생성 실패'}
}
if (-not (Test-Path '.git')) {& git init -b main}
& git add .
& git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {& git commit -m 'Deploy Rhythm Log username-auth PWA'}
& git remote get-url origin *> $null
if ($LASTEXITCODE -ne 0) {& git remote add origin "https://github.com/$repo.git"}
& git branch -M main
& git push -u origin main
if ($LASTEXITCODE -ne 0) {throw 'GitHub push 실패'}
Write-Host 'GitHub 업로드 완료. Settings > Pages에서 GitHub Actions를 선택하고 Actions 결과를 확인하세요.'
Write-Host 'https://github.com/Andcha37/rhythm-log/actions'
Write-Host '예상 주소: https://andcha37.github.io/rhythm-log/'

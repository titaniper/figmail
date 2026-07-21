# 003 · 테마 (다크/라이트)

> 상태: MVP (Text 모드). Image 모드 다크 프레임 스왑은 추후.

## 배경 / 목적

주요 메일 클라이언트(Apple Mail, 일부 Gmail 환경)는 **다크 모드**에서 색을
자동 반전하거나 사용자 지정 다크 스타일을 적용한다. 의도치 않은 반전으로 로고가
사라지거나 대비가 깨지는 사고가 흔하다. Figmail은 라이트/다크를 **명시적으로**
관리·미리보기하게 한다.

## 범위

- 미리보기에서 **Light / Dark 토글**.
- Text 모드 export: `<meta name="color-scheme" content="light dark">` +
  `@media (prefers-color-scheme: dark)` 오버라이드(배경/텍스트 색) 삽입.
- Image 모드: 텍스트가 픽셀이므로 자동 반전 불가 → **라이트용/다크용 프레임을
  각각 지정**해 두 이미지를 조건부로 노출(`prefers-color-scheme`)한다.

## 요구사항

- **R1** 미리보기 Light/Dark 토글을 제공한다(클라이언트 크롬 + 본문 모두 반영).
- **R2** export HTML에 `color-scheme`/`supported-color-schemes` 메타 + `@media
(prefers-color-scheme: dark)` 오버라이드를 emit한다(배경 `#16181c`/서피스
  `#1f2226`/전경 `#e6e8eb`). 클라이언트가 다크일 때 자동 적용.
- **R3** 프리뷰 Dark는 고정 스킴 iframe에서도 보이도록 동일 규칙을 **무조건
  적용(forceDark)** 해 시뮬레이션한다. HTML 탭/export는 media query 버전.
- **R4** (추후) 다크 색 사용자 오버라이드, Image 모드 라이트/다크 프레임 스왑.

## 구현 메모

- `mj-text`에 `fm-text`, `mj-section`에 `fm-section`, `mj-body`에 `fm-body`
  클래스를 부여하고, 다크 규칙이 이 클래스를 `!important`로 덮는다.
- 현재 다크 팔레트는 고정(블랙 배경 + 라이트 텍스트). 링크/버튼 등 액센트 색은
  유지된다.

## 열린 결정

1. 다크 색 자동 매핑 규칙(단순 반전 vs 팔레트 매핑)?
2. Image 모드 다크: 별도 프레임 지정 UX(두 번째 프레임 선택)로 갈지?

## 관련

[[001-html-email-export]], [[004-client-preview]] (토글이 프리뷰에 함께 노출).

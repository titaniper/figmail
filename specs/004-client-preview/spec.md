# 004 · 클라이언트 프리뷰

> 상태: 부분 구현(Gmail chrome). 나머지 제안.

## 배경 / 목적

생성된 HTML을 맨몸으로 보면 실제 수신 모습과 다르다. 발송 전 확신을 주려면
**실제 메일 클라이언트에서 받은 것처럼** 보여야 한다 — 발신자/제목/받은편지함
프레임 안에서.

## 범위

- 미리보기를 **클라이언트 chrome**으로 감싼다: 아바타, 발신자(이름/주소),
  제목, 날짜, 받은편지함 배경.
- **클라이언트 선택**: Gmail / Apple Mail / Outlook — 본문 최대 폭·헤더 스타일·
  다크 처리 차이를 반영.
- 발신자/제목/preheader를 편집 가능한 필드로 노출(프리뷰용).
- 미리보기는 **탭으로 분리**되어 있고(자동으로 즉시 렌더 강요하지 않음),
  Preview를 눌러 본다. Light/Dark([[003-theming-dark-light]]) 및
  Mockup/Variables([[002-variables-and-bindings]]) 토글과 결합된다.

## 요구사항 (초안)

- **R1** 프리뷰가 이메일을 클라이언트 chrome(발신자/제목/받은편지함) 안에 렌더한다.
- **R2** 이메일 본문은 자체 iframe에 두어 UI CSS와 격리하고, 콘텐츠 높이에 맞춰
  iframe 높이를 조정한다.
- **R3** 클라이언트 선택으로 본문 최대 폭/헤더 룩을 전환한다(Gmail 기본).
- **R4** 발신자/제목/preheader 필드를 편집하면 프리뷰 헤더에 즉시 반영된다.

## 현재 구현

- Gmail 스타일 chrome(아바타 + 발신자 + 제목 + 받은편지함 배경) 안에 본문 iframe.
- 본문 iframe은 로드 후 contentDocument 높이로 자동 리사이즈.

## 관련

[[001-html-email-export]], [[002-variables-and-bindings]],
[[003-theming-dark-light]].

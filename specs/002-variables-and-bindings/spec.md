# 002 · 변수 & 바인딩 (템플릿화)

> 상태: 제안(Proposed). 구현 전 핵심 결정 확정 필요 — 아래 "열린 결정" 참고.

## 배경 / 목적

이메일은 대부분 **동적 템플릿**이다 — 수신자 이름, 포털 링크, 이미지 URL 등이
발송 시 치환된다. 원본 Figma는 목업 값("Dear Jiyun Yeom,")을 보여주고 별도
legend로 `customerName`, `{{ customerPortalUrl }}` 같은 변수를 문서화한다.

Figmail은 **목업을 유지한 채** 텍스트/링크/이미지를 변수에 바인딩하고, export 시
handlebars(`{{ name }}`) 템플릿 + 기본값을 내보내 **바로 사용 가능한** 이메일을
만든다.

## 핵심 개념 (도메인 언어)

- **Template**: 캡처된 이메일 1개.
- **Variable**: `{ name, type: 'text' | 'url' | 'image', sample }` — `sample`은
  목업/미리보기용 기본값.
- **Binding**: Figma 노드(또는 텍스트의 일부 run) ↔ Variable 연결.

## 변수 캡처 방식

- **자동**: 텍스트에 이미 `{{ name }}`이 있으면 Variable로 인식하고, 주변 목업
  텍스트를 `sample`로 삼는다.
- **수동(주력)**: 노드를 선택해 변수명을 지정한다. 바인딩은 노드의
  `setPluginData('figmail', …)`에 저장 → **파일에 동행**(재실행/협업 시 유지).

## 속성 패널 (Figma 선택 연동)

- `figma.on('selectionchange')`로 현재 선택 노드를 패널에 반영한다.
- **텍스트 선택** → 변수 바인딩(변수명/타입/sample) 편집.
- **버튼/링크 선택** → `href` 편집, URL 변수 바인딩.
- **이미지 선택** → `src` URL 변수 바인딩.

## 미리보기 토글

- **Mockup**: `sample` 값으로 렌더(원본 그대로 보임).
- **Variables**: `{{ name }}` 플레이스홀더로 렌더(무엇이 변수인지 한눈에).

## Export

- Text 모드: handlebars 텍스트를 그대로 HTML에 심는다(`{{ name }}`).
- 변수 목록 + 기본값을 `variables.json`으로 zip에 동봉.
- (옵션) 사용자가 export 시 각 변수 값을 채우면 그 값으로 치환해 정적 HTML도 출력.

## 요구사항 (초안)

- **R1** 텍스트의 `{{ name }}` 패턴을 변수로 자동 인식한다.
- **R2** 노드를 선택해 수동으로 변수 바인딩을 만들고 `setPluginData`에 저장한다.
- **R3** 속성 패널이 현재 Figma 선택의 타입별 속성(텍스트/버튼/이미지)을 보여주고
  편집(링크/변수)을 지원한다.
- **R4** 미리보기 Mockup ↔ Variables 토글을 제공한다.
- **R5** export에 handlebars HTML + `variables.json`을 포함한다.

## 열린 결정 (구현 전 확정)

1. 변수 문법: `{{ name }}`(handlebars) 확정? 아니면 `${name}` 등?
2. 바인딩 저장: `setPluginData`(파일 동행) vs `clientStorage`(로컬) — 기본은 전자.
3. 부분 바인딩: 텍스트의 일부 run만 변수화 지원할지(예: "Dear **{{name}}**,").
4. Image 모드에서는 텍스트가 픽셀이라 변수 치환 불가 → 변수는 Text 모드 전용?

## 관련

[[001-html-email-export]] (Text 모드가 변수의 기반), [[004-client-preview]]
(Mockup/Variables 토글이 프리뷰에 노출).

# 002 · 변수 & 바인딩 (템플릿화)

> 상태: 구현(MVP). 결정 확정: **수동 바인딩만**, **Text 모드 전용**, 저장은
> `setPluginData`(파일 동행), 텍스트는 **전체 단위** 바인딩(부분 run 미지원).

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

## 변수 캡처 방식 (확정: 수동 바인딩만)

- 노드를 Figma에서 선택 → 속성 패널에서 변수명을 지정한다. 바인딩은 노드의
  `setPluginData('figmail', …)`에 저장 → **파일에 동행**(재실행/협업 시 유지).
- 템플릿 루트는 "Capture"로 고정되며, 이후 자식 노드를 선택해도 루트는 바뀌지
  않는다(선택 = 바인딩 대상). 바인딩 저장 후 루트를 재캡처해 프리뷰에 반영한다.
- (자동 `{{}}` 인식은 이번 범위에서 제외 — 필요 시 추후.)

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

## 결정 (확정)

1. 변수 문법: **handlebars `{{ name }}`**.
2. 바인딩 저장: **`setPluginData`**(파일 동행).
3. 텍스트 바인딩 단위: **전체 텍스트 단위**(부분 run 변수화는 추후).
4. 변수는 **Text 모드 전용**(Image 모드는 픽셀이라 치환 불가).

## 남은 작업 (추후)

- 부분 run 변수화("Dear **{{name}}**,").
- 변수 목록에서 sample 편집 / 타입 변경 / export 시 값 채워 정적 HTML 출력.
- 자동 `{{}}` 인식(디자이너가 Figma에 직접 쓴 경우).

## 관련

[[001-html-email-export]] (Text 모드가 변수의 기반), [[004-client-preview]]
(Mockup/Variables 토글이 프리뷰에 노출).

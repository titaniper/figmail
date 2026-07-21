# 001 · HTML 이메일 export

## 배경 / 목적

Figma로 디자인한 이메일을 손으로 `<table>`/inline-CSS HTML로 옮기는 작업은
느리고 오류가 잦다. Figmail은 선택한 프레임 하나를 **이메일 클라이언트에서
그대로 렌더되는 HTML**로 변환한다 (Emailify와 같은 목적).

직접 table 해킹을 유지보수하지 않기 위해, 중간 표현(IR)을 거쳐 **MJML**로
변환하고 MJML이 Outlook까지 대응하는 HTML을 생성하게 한다.

## 범위

**In scope (MVP)**

- 선택한 프레임 1개 → 이메일 HTML 변환
- 두 가지 export 모드:
  - **Exact (image)** — 프레임 전체를 2x PNG로 rasterize해 한 장 이미지로 감싼다.
    폰트·배경·레이아웃이 **원본 그대로** 재현된다 (기본 모드).
  - **Text (editable)** — 노드를 의미 기반으로 매핑(텍스트는 선택 가능). 이메일
    HTML 제약상 원본과 근사하며 편집·번역이 쉽다.
- 프리뷰(플러그인 UI 안), HTML 복사, zip 폴더 export
- 텍스트 / 이미지 / 버튼 / 아이콘·일러스트 매핑 (Text 모드)
- 플러그인 창 크기 조절(우하단 드래그 핸들)

**Out of scope (현재)**

- 다중 프레임 동시 export
- 반응형 breakpoint, 다크모드 변형
- Text 모드에서 gradient / stroke / shadow의 정밀 재현, 레이어 겹침(z-order) 재현

## Export 액션 (상단 Export ▾ 메뉴)

하단 버튼 대신 상단 우측 `Export ▾` 하나로 모은다:

- **Copy HTML** — 현재 렌더 HTML을 클립보드로.
- **Download HTML template (.zip)** — `email.html`(바인딩은 `{{ name }}` 템플릿) +
  `images/` (+ `variables.json`). 파일명은 `<템플릿이름>-<YYYYMMDD-HHmm>.zip`.
- **Download images only (.zip)** — 이메일 안의 **이미지 에셋만** (`figmail-images/`).
  프레임 전체를 한 장으로 뽑던 것과 구분된다.
- **Create filled copy in Figma** — 캡처한 프레임을 원본 옆에 clone하고, 변수의
  적용값을 텍스트 노드에 써넣어 **값이 채워진 결과를 Figma에서 바로 확인**한다.
  (텍스트 값 치환 위주; 링크/이미지 URL 반영은 추후.)

## 파이프라인

```
Figma node tree → IR → MJML → email HTML
```

- **traverse**: 선택 프레임을 순회해 IR로 flatten (이미지 노드는 PNG로 export)
- **render**: IR → MJML (순수 변환)
- **UI**: mjml-browser로 MJML → HTML, 프리뷰 / 복사 / export

IR 구조: `document > section > column > content`. MJML 모델과 1:1에 가깝게 두어
render 매핑을 단순하게 유지한다.

## 요구사항

- **R1** 프레임이 선택되지 않았으면 안내 메시지를 표시한다.
- **R2** 선택이 바뀌면 프리뷰가 자동으로 갱신된다.
- **R2a** 모드 토글(Exact/Text)을 제공하며 기본은 **Exact**다. 두 모드 모두
  프리뷰·복사·export가 동일하게 동작한다.
- **R2b** Exact 모드는 선택 프레임 전체를 2x PNG로 export해 body 폭 = 프레임 폭인
  단일 `mj-image`로 감싼다 → 원본과 픽셀 단위로 동일.
- **R2c** 플러그인 창은 우하단 핸들 드래그로 크기 조절된다(최소 320px).
- **R3** 프레임 트리를 section의 **평탄한 리스트**로 선형화한다. 이메일 HTML은
  임의 중첩이 불가하므로(MJML: body > section > column > content), 세로 스택을
  펼친다: leaf 묶음은 단일 column section, 가로 행은 다중 column section, 가로
  행을 품은 컨테이너는 재귀적으로 분해한다.
- **R4** 가로(auto layout HORIZONTAL, 자식 2개 이상) 프레임은 **깊이에 상관없이**
  다중 column section이 된다 (자식 1개 = column 1개).
- **R5** 텍스트는 선택 가능한 텍스트(`mj-text`)로 유지한다 — 색/폰트/크기/자간/
  행간/정렬을 반영한다.
- **R5a** 텍스트 노드 내부의 **부분 스타일(run)** — 부분 볼드/기울임/색 — 을
  `getStyledTextSegments`로 읽어 인라인 `<span>`으로 보존한다.
- **R5b** auto-layout의 `itemSpacing`(자식 간 간격)을 spacer로 반영해 원본의
  세로 리듬을 유지한다. MJML 기본 padding은 `mj-attributes`로 0으로 무력화한다.
- **R6** 이미지 채우기(image fill)를 가진 노드는 PNG로 export해 `mj-image`로 넣는다.
- **R7** 아이콘·일러스트(텍스트 없이 벡터로 구성된 그룹) 및 단일 벡터 노드는
  **한 장의 이미지로 flatten**해 원본 그대로 재현한다.
- **R8** 이름에 `button`/`btn`/`cta`가 포함된 노드는 `mj-button`으로 만든다.
- **R9** 프리뷰와 복사용 HTML은 이미지를 **data URL로 인라인**해 외부 파일 없이
  렌더된다.
- **R10** export는 zip 폴더로 받는다: `figmail-export/email.html` +
  `figmail-export/images/<id>.png`, HTML은 이미지를 **상대 경로**로 참조한다.
- **R11** 숨김(visible=false) 또는 opacity 0 노드는 제외한다.
- **R12** 텍스트 폰트는 (a) 디자인 폰트를 우선하는 fallback 스택
  (`'디자인폰트', Helvetica, Arial, sans-serif` / serif면 serif 계열)으로 지정하고,
  (b) 사용된 폰트를 `mj-head`의 `mj-font`로 Google Fonts에서 로드 시도한다.
  Google Fonts에 없는 폰트는 무해하게 실패하고 fallback으로 떨어진다.

## 동작 규칙 (노드 매핑)

| Figma                                    | IR / MJML                        |
| ---------------------------------------- | -------------------------------- |
| `TEXT`                                   | text → `mj-text`                 |
| image fill 보유 노드                     | image(PNG) → `mj-image`          |
| 벡터 / 텍스트 없는 벡터 그룹 (아이콘 등) | flatten image → `mj-image`       |
| 이름 `button`/`btn`/`cta`                | button → `mj-button`             |
| auto layout HORIZONTAL 프레임            | 다중 column section              |
| 그 외 컨테이너                           | 하위 leaf 콘텐츠를 순서대로 수집 |

- 이미지는 2x scale로 export한다(레티나).
- 이미지 파일명 = IR의 `id`(`image-N.png`), export 실행마다 카운터를 리셋한다.

## 인수 조건

- **A1** 텍스트·이미지·버튼이 있는 프레임을 선택하면 프리뷰에 셋 다 보인다.
- **A2** 아이콘/로고가 조각나지 않고 한 장의 이미지로 표시된다. (R7)
- **A3** "Copy HTML"로 복사한 HTML을 단독 파일로 열면 이미지가 보인다. (R9)
- **A4** export한 zip을 풀면 `email.html`과 `images/` 폴더가 있고, `email.html`을
  열면 `images/`의 PNG를 참조해 디자인이 그대로 재현된다. (R10)
- **A5** 생성된 HTML이 MJML 컴파일에서 치명적 에러 없이 통과한다.
- **A6** Google Fonts에 있는 디자인 폰트(Inter, Roboto 등)는 프리뷰에서 해당
  폰트로 렌더되고, 없는 폰트는 fallback 스택으로 렌더된다. (R12)
- **A7** 원본에서 문장 일부만 볼드/색이 다른 텍스트가, 미리보기에서도 동일하게
  부분 스타일로 보인다. (R5a)
- **A8** 가로로 배치된 카드/열이 세로로 쌓이지 않고 나란히 렌더된다. (R4)
- **A9** 섹션·요소 간 간격이 원본의 auto-layout 간격에 근접한다(과도한 여백 없음). (R5b)

## 한계 & 로드맵

**현재 한계**

- column 안에 다시 가로 행이 중첩되면 column 내부는 세로로 flatten된다
  (MJML은 column 안에 section을 못 넣음). 대부분의 이메일(세로 스택의 가로 행들)은
  잘 처리되지만, 복잡한 그리드는 부분적으로만 재현된다.
- 커스텀/브랜드 폰트는 이메일 클라이언트가 웹폰트를 무시하면 fallback으로 떨어진다
  (이메일 HTML의 근본 제약).
- data URL 이미지는 프리뷰/로컬에는 문제없지만, 실제 이메일 발송 시 다수
  클라이언트가 차단한다 → 호스팅된 이미지 URL이 필요하다.
- 가로 행의 column 간 간격(가로 gap), gradient/stroke/shadow, 반응형 미지원.

**로드맵**

1. 호스팅 이미지 업로드 옵션(data URL → 실제 URL 치환)
2. 가로 행 column 간 gap 반영, column 폭 비율(자식 width 기반) 지정
3. 버튼 링크(프로토타입 interaction / 레이어 메타데이터)에서 `href` 추출
4. 폰트 100% 유지가 필요한 텍스트 블록의 이미지 rasterize 옵션
5. 설정 패널(최대 폭, 폰트 fallback, 이미지 scale)
6. `renderMjml` 유닛 테스트 + traverse fixture

# ibk-legis-morning-brief Skill

> **v2.3 기준** — IBK_아침에읽는규제변화_v2.3_Final_20260610.docx XML 실측값으로 작성.
> 아래 수치를 임의로 변경하지 말 것. 수정 시 반드시 버전 표기.

---

## 트리거

| 조건 | 값 |
|------|-----|
| 스케줄 | 평일 07:00 KST |
| 입력 | `crawl_result_graded.json` (크롤링 + Claude 등급 판정 결과) |
| 출력 | `reports/legis/{YYYYMMDD}_morning_brief.docx` |
| 의존 스킬 | `anthropic-skills:docx` |

수동 트리거: "오늘 입법예고 브리핑", "법령 모니터링 보고서 생성", "아침 규제 변화 보고서"

---

## 페이지 설정 (실측)

```javascript
// A4 portrait
page: {
  size:   { width: 11906, height: 16838 },          // DXA
  margin: { top: 850, right: 1020, bottom: 850, left: 1020,
            header: 708, footer: 708, gutter: 0 }   // DXA
}
// 본문폭 CW = 11906 - 1020 - 1020 = 9866 DXA
```

---

## 색상 상수 (실측)

```javascript
const ibkBlue   = "0D2F8B";   // 섹션 헤딩 배경 / 액션 텍스트 / 체크리스트 헤더
const skyBlue   = "1E88BC";   // 대시보드 2열 배경
const skyText   = "CCE8F5";   // skyBlue 배경 위 텍스트
const red       = "C0392B";   // 대시보드 3열 배경 / 즉시검토 강조
const redText   = "FFBBBB";   // red 배경 위 텍스트
const lightBlue = "D0E4F5";   // 요약 카드 / 다음액션 카드 배경
const lightRed  = "FDE8E8";   // 법령카드 헤더 배경 / 사고사례 카드 배경
const darkPurple= "555577";   // 체크리스트 헤더 우측셀 배경 (첫 번째 그룹)
const gray1     = "666666";   // 날짜, 대시보드 레이블, 출처 메타
const gray2     = "888888";   // 세칙 조문 근거 (subbullet)
const black     = "1A1A1A";   // 일반 본문
const white     = "FFFFFF";
```

---

## 폰트

모든 텍스트: **맑은 고딕** (`rFonts: { ascii, cs, eastAsia, hAnsi: "맑은 고딕" }`)

---

## 간격 · 스페이서 (실측)

```javascript
// 섹션 헤딩 단락
spacing: { before: 280, after: 140 }

// 섹션 간 스페이서 (line 방식 빈 단락)
const SP_LARGE  = { line: 560, lineRule: "exact" };   // 섹션 사이
const SP_MEDIUM = { line: 320, lineRule: "exact" };   // 체크리스트 그룹 사이
const SP_SMALL  = { line: 160, lineRule: "exact" };   // 카드·표 사이
const SP_MICRO  = { line:  80, lineRule: "exact" };   // 체크리스트 헤더 직후
const SP_HEADER = { line: 600, lineRule: "exact" };   // 문서 최상단 여백
const SP_TITLE  = { line: 240, lineRule: "exact" };   // 제목 직후
const SP_RULE   = { after: 0, before: 0 };             // 구분선 단락

// 불릿 spacing
bulAfter:    40     // 뭐가 바뀌나요? 불릿
bulAfterBig: 48     // 우리 업무에는요? 불릿 / 체크 action 불릿
subAfter:    28     // 세칙 조문 근거 subbullet
sectionBefore: 80  // 소제목 (뭐가 바뀌나요? etc.) before
sectionAfterH: 36  // 소제목 after
bodyAfter:   60    // 한줄 요약 단락 after
bodyAfter2:  80    // 체크 포인트 intro 단락 after
cardAfter:   50    // 요약 카드 내부 줄 after (마지막 줄 제외)
saccardAfter:36   // 사고사례 카드 내부 불릿 after (마지막 줄 0)
```

---

## 불릿 numbering config (실측)

```javascript
numbering: {
  config: [
    {
      reference: "bullets",
      levels: [{
        level: 0,
        format: LevelFormat.BULLET,
        text: "•",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 340, hanging: 240 } } }
      }]
    },
    {
      reference: "subbullets",
      levels: [{
        level: 0,
        format: LevelFormat.BULLET,
        text: "–",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 680, hanging: 240 } } }
      }]
    }
  ]
}
// numId:2 → bullets  (main •)
// numId:3 → subbullets  (reference –)
// 반드시 별도 reference — 동일 abstractNum 혼용 금지
```

---

## 문서 구조 상세

### 0. 문서 상단

```
[SP_HEADER] 빈 단락 (sz:1)

날짜 단락: "2026. 06. 10. (수)"
  font: 맑은 고딕, sz:19(9.5pt), color:gray1(666666), Bold:false
  spacing: { after:20, before:0 }, indent.left:0

제목 단락 (단일 단락, 4개 run):
  run1: "🌞 "        sz:36(18pt) color:black(1A1A1A) Bold:false
  run2: "아침에 읽는 규제 변화"  sz:36(18pt) color:ibkBlue(0D2F8B) Bold:true
  run3: "  "          sz:24(12pt) color:black Bold:false
  run4: "IBK AI Agent 법령 모니터링  —  내부통제점검팀"
                      sz:20(10pt) color:skyBlue(1E88BC) Bold:true
  spacing: { after:60, before:0 }, indent.left:0

구분선 단락: bottom border { style:SINGLE, color:ibkBlue(0D2F8B), sz:2 }
  spacing: { after:0, before:0 }

[SP_TITLE] 빈 단락 (sz:1)
```

---

### ❶ 오늘의 요약

#### 섹션 헤딩 단락
```javascript
{
  shading: { fill: ibkBlue, val: "clear" },
  spacing: { before: 280, after: 140 },
  indent: { left: 0 },
  keepNext: true,
  children: [TextRun("❶  오늘의 요약", {
    font: "맑은 고딕", bold:true, sz:23, color:white
  })]
}
```

#### 대시보드 3칸 표

```javascript
Table({
  width: { size: 9866, type: WidthType.DXA },
  columnWidths: [3288, 3288, 3290],
  borders: { all: { style:SINGLE, color:"auto", sz:4 } },   // 외곽 테이블 border
  rows: [TableRow([
    // 열 1 — 신규 입법예고
    TableCell({
      width: { size:3288, type:DXA },
      borders: { all: { style:SINGLE, color:"CCCCCC", sz:1 } },
      shading: { fill:"FFFFFF", val:"clear" },
      margins: { top:100, left:120, bottom:100, right:120 },
      children: [
        Paragraph({ jc:"center", children:[
          TextRun("신규 입법예고", { font:"맑은 고딕", sz:15, color:gray1, bold:false })
        ]}),
        Paragraph({ spacing:{before:10}, jc:"center", children:[
          TextRun("N건", { font:"맑은 고딕", sz:34, color:black, bold:true })
        ]}),
        Paragraph({ jc:"center", children:[
          TextRun("오늘 기준", { font:"맑은 고딕", sz:14, color:gray1, bold:false })
        ]}),
      ]
    }),
    // 열 2 — 기업은행 영향
    TableCell({
      width: { size:3288, type:DXA },
      borders: { all: { style:"none", color:white, sz:0 } },   // 테두리 없음
      shading: { fill:skyBlue, val:"clear" },
      margins: { top:100, left:120, bottom:100, right:120 },
      children: [
        Paragraph({ jc:"center", children:[
          TextRun("기업은행 영향", { font:"맑은 고딕", sz:15, color:skyText, bold:false })
        ]}),
        Paragraph({ spacing:{before:10}, jc:"center", children:[
          TextRun("N건", { font:"맑은 고딕", sz:34, color:white, bold:true })
        ]}),
        Paragraph({ jc:"center", children:[
          TextRun("기업은행에 영향", { font:"맑은 고딕", sz:14, color:skyText, bold:false })
        ]}),
      ]
    }),
    // 열 3 — 즉시 검토
    TableCell({
      width: { size:3290, type:DXA },
      borders: { all: { style:"none", color:white, sz:0 } },   // 테두리 없음
      shading: { fill:red, val:"clear" },
      margins: { top:100, left:120, bottom:100, right:120 },
      children: [
        Paragraph({ jc:"center", children:[
          TextRun("즉시 검토", { font:"맑은 고딕", sz:15, color:redText, bold:false })
        ]}),
        Paragraph({ spacing:{before:10}, jc:"center", children:[
          TextRun("N건", { font:"맑은 고딕", sz:34, color:white, bold:true })
        ]}),
        Paragraph({ jc:"center", children:[
          TextRun("7월 전 반영", { font:"맑은 고딕", sz:14, color:redText, bold:false })
          // ↑ 내용은 실제 데이터로 대체
        ]}),
      ]
    }),
  ])]
})
```

#### [SP_SMALL] 스페이서

#### 핵심 요약 카드 (단일열 표)

```javascript
Table({
  width: { size:9866, type:DXA },
  columnWidths: [9866],
  rows: [TableRow([TableCell({
    width: { size:9866, type:DXA },
    borders: { all: { style:"none", color:white, sz:0 } },
    shading: { fill:lightBlue, val:"clear" },
    margins: { top:160, left:200, bottom:160, right:200 },
    children: [
      // 3줄, 각 spacing.after:50 (마지막은 기본)
      Paragraph({ spacing:{after:50}, children:[
        TextRun("오늘 [법령명] [핵심변경]이 있어요.", { font:"맑은 고딕", sz:20, color:black, bold:true })
      ]}),
      Paragraph({ spacing:{after:50}, children:[
        TextRun("[핵심 영향 한 줄]. ", { font:"맑은 고딕", sz:20, color:black, bold:true }),
        TextRun("[추가 설명].", { font:"맑은 고딕", sz:20, color:black, bold:false })
      ]}),
      Paragraph({ children:[
        TextRun("[마감/시행 관련 한 줄]. ", { font:"맑은 고딕", sz:20, color:black, bold:true }),
        TextRun("[지금 해야 할 것].", { font:"맑은 고딕", sz:20, color:black, bold:false })
      ]}),
    ]
  })])]
})
```

#### [SP_LARGE] 스페이서

---

### ❷ 법령 브리핑

> grade="상"→"중"→"하" 순. 각 법령마다 아래 구조 반복.

#### 섹션 헤딩 (❶과 동일 패턴)

#### 법령 카드 헤더 (단일열 표)

```javascript
// grade="상": 즉시 검토 스타일
TableCell({
  borders: {
    top:    { style:SINGLE, color:red,   sz:6 },
    left:   { style:SINGLE, color:red,   sz:6 },
    bottom: { style:SINGLE, color:"CCCCCC", sz:1 },
    right:  { style:SINGLE, color:"CCCCCC", sz:1 },
  },
  shading: { fill:lightRed, val:"clear" },
  margins: { top:110, left:180, bottom:110, right:180 },
  children: [
    Paragraph({ spacing:{after:28}, children:[
      TextRun("🔴 즉시 검토", { font:"맑은 고딕", sz:18, color:red, bold:true }),
      TextRun("  ·  [소관부처]  ·  예고 YYYY.MM.DD.  ·  의견 마감 YYYY.MM.DD.",
              { font:"맑은 고딕", sz:16, color:gray1, bold:false }),
    ]}),
    Paragraph({ children:[
      TextRun("｢[법령명]｣ [개정안명]", { font:"맑은 고딕", sz:21, color:red, bold:true })
    ]}),
  ]
})

// grade="중": 관심 모니터링 스타일
// - border: top+left color:skyBlue sz:6
// - shading: D0E4F5
// - 🟡 관심 모니터링 / color:skyBlue sz:18

// grade="하": 참고 스타일
// - border: top+left color:gray1 sz:2
// - shading: FFFFFF
// - 🟢 참고 / color:gray1 sz:18
```

#### [SP_SMALL] 스페이서

#### 한줄 요약 단락

```javascript
Paragraph({
  spacing: { after:60, before:0 }, indent: { left:0 },
  children: [
    TextRun("한줄 요약  ", { font:"맑은 고딕", sz:19, color:ibkBlue, bold:true }),
    TextRun("[왜 IBK에 중요한지 한 문장]", { font:"맑은 고딕", sz:19, color:black, bold:false }),
  ]
})
```

#### 뭐가 바뀌나요? 소제목 + 불릿

```javascript
// 소제목
Paragraph({
  spacing: { before:80, after:36 }, indent: { left:0 }, keepNext:true,
  children: [TextRun("뭐가 바뀌나요?", { font:"맑은 고딕", sz:18, color:ibkBlue, bold:true })]
})

// 불릿 (3~5개)
Paragraph({
  style: "ListParagraph",
  numbering: { reference:"bullets", level:0 },
  spacing: { after:40, before:0 }, keepLines:true,
  children: [TextRun("[변경사항]", { font:"맑은 고딕", sz:20, color:black, bold:false })]
})
```

#### 우리 업무에는요? 소제목 + 불릿

```javascript
// 소제목 — 동일 패턴
Paragraph({
  spacing: { before:80, after:36 }, keepNext:true,
  children: [TextRun("우리 업무에는요?", { font:"맑은 고딕", sz:18, color:ibkBlue, bold:true })]
})

// 액션 불릿 (Bold ibkBlue)
Paragraph({
  style: "ListParagraph",
  numbering: { reference:"bullets", level:0 },
  spacing: { after:48, before:0 }, keepLines:true,
  children: [TextRun("[액션 항목]", { font:"맑은 고딕", sz:20, color:ibkBlue, bold:true })]
})

// 참고 불릿 (regular black)
Paragraph({
  style: "ListParagraph",
  numbering: { reference:"bullets", level:0 },
  spacing: { after:40, before:0 }, keepLines:true,
  children: [TextRun("[참고 사항]", { font:"맑은 고딕", sz:20, color:black, bold:false })]
})
```

#### [SP_SMALL] 스페이서

#### 다음 액션 카드 (단일열 표)

```javascript
TableCell({
  borders: { all: { style:"none", color:white, sz:0 } },
  shading: { fill:lightBlue, val:"clear" },
  margins: { top:160, left:200, bottom:160, right:200 },
  children: [Paragraph({
    children: [
      TextRun("👉  ", { font:"맑은 고딕", sz:19, color:black, bold:false }),
      TextRun("[담당부서]가 [행동]을 [기한]까지 완료해 주세요.",
              { font:"맑은 고딕", sz:19, color:ibkBlue, bold:false }),
    ]
  })]
})
```

#### [SP_LARGE] 스페이서

---

### ❸ 내부통제점검팀 체크 포인트

> grade="상" 항목이 하나라도 있을 때만 섹션 생성.

#### 섹션 헤딩

#### 근거 부제 단락

```javascript
Paragraph({
  spacing: { after:60, before:0 }, indent: { left:0 },
  children: [TextRun(
    "근거: 「내부통제 점검·조사 및 조치에 관한 세칙」 (2026.4.2. 제2차 개정)",
    { font:"맑은 고딕", sz:16, color:gray1, italic:true }
  )]
})
```

#### 사고사례 카드 (단일열 표)

```javascript
TableCell({
  borders: { all: { style:"none", color:white, sz:0 } },
  shading: { fill:lightRed, val:"clear" },
  margins: { top:160, left:200, bottom:160, right:200 },
  children: [
    Paragraph({ spacing:{after:36}, children:[
      TextRun("📌  관련 사고 사례 & 맥락",
              { font:"맑은 고딕", sz:19, color:red, bold:true })
    ]}),
    // 불릿: "• " red + 본문 black (수동 run 방식)
    Paragraph({ spacing:{after:36}, children:[
      TextRun("• ", { font:"맑은 고딕", sz:19, color:red, bold:false }),
      TextRun("[사고사례 내용]", { font:"맑은 고딕", sz:19, color:black, bold:false }),
    ]}),
    // ... 최대 3개
    Paragraph({ spacing:{after:0}, children:[
      TextRun("• ", { font:"맑은 고딕", sz:19, color:red }),
      TextRun("[사례 없으면: 유사 제재 사례: 해당 없음]", { font:"맑은 고딕", sz:19, color:black }),
    ]}),
  ]
})
```

**⚠️ 사고사례 카드 내부는 numbering 불릿이 아닌 수동 "• " run 방식 사용.**

#### [SP_SMALL] 스페이서

#### 체크리스트 intro 단락

```javascript
Paragraph({
  spacing: { after:80, before:0 }, indent: { left:0 },
  children: [
    TextRun("세칙 해당 조항에 의거해 지금 챙겨야 할 점검 포인트를 정리했어요. ",
            { font:"맑은 고딕", sz:20, color:black, bold:true }),
    TextRun("파란색은 즉시 액션이 필요한 항목이에요.",
            { font:"맑은 고딕", sz:20, color:black, bold:false }),
  ]
})
```

#### 체크리스트 헤더 표 (2열: 8466 + 1400)

```javascript
// 세칙 조항 그룹마다 반복
Table({
  width: { size:9866, type:DXA },
  columnWidths: [8466, 1400],
  rows: [TableRow([
    TableCell({
      width: { size:8466, type:DXA },
      borders: { all: { style:"none", color:white, sz:0 } },
      shading: { fill:ibkBlue, val:"clear" },
      margins: { top:80, left:160, bottom:80, right:80 },
      children: [Paragraph({ keepNext:true, children:[
        TextRun("세칙 제7·8·9조  |  점검 품의 & 사전 준비",
                { font:"맑은 고딕", sz:18, color:white, bold:true })
      ]})]
    }),
    TableCell({
      width: { size:1400, type:DXA },
      borders: { all: { style:"none", color:white, sz:0 } },
      shading: { fill:darkPurple, val:"clear" },  // 첫 번째 그룹: 555577
      // 이후 그룹: ibkBlue(0D2F8B)
      margins: { top:80, left:80, bottom:80, right:80 },
      children: [Paragraph({ keepNext:true, jc:"center", children:[
        TextRun("지금 챙길 것", { font:"맑은 고딕", sz:16, color:white, bold:true })
      ]})]
    }),
  ])]
})
```

#### [SP_MICRO] 스페이서 (line:40)

#### 체크리스트 불릿

```javascript
// 액션 항목 (Bold ibkBlue)
Paragraph({
  style: "ListParagraph",
  numbering: { reference:"bullets", level:0 },
  spacing: { after:48, before:0 }, keepLines:true,
  children: [TextRun("[챙길 액션]", { font:"맑은 고딕", sz:20, color:ibkBlue, bold:true })]
})

// 세칙 조문 근거 (gray subbullet, reference:"subbullets")
Paragraph({
  style: "ListParagraph",
  numbering: { reference:"subbullets", level:0 },
  spacing: { after:28, before:0 }, keepLines:true,
  children: [TextRun("제7조 제2항 — ① 목적 ② 부문·방법 ...",
                     { font:"맑은 고딕", sz:17, color:gray2, bold:false })]
})

// 일반 안내 불릿 (black)
Paragraph({
  style: "ListParagraph",
  numbering: { reference:"bullets", level:0 },
  spacing: { after:40, before:0 }, keepLines:true,
  children: [TextRun("[안내 사항]", { font:"맑은 고딕", sz:20, color:black, bold:false })]
})
```

**세칙 조항 그룹 구성 (고정):**
1. `세칙 제7·8·9조  |  점검 품의 & 사전 준비`  (우측셀: 555577)
2. `세칙 제5·6·10·11조  |  현장 점검 실시`     (우측셀: 0D2F8B)
3. `세칙 제12·13·19조  |  결과 정리 & 보고`    (우측셀: 0D2F8B)
4. `세칙 제15·16조  |  조치 & 통보`           (우측셀: 0D2F8B)
5. `세칙 제17·18조  |  이행 관리`             (우측셀: 0D2F8B)

그룹 사이: [SP_MEDIUM] 스페이서 (line:320)

#### [SP_LARGE] 스페이서

---

### ❹ 마감 캘린더

#### 섹션 헤딩

#### 마감 캘린더 표 (5열)

```javascript
// columnWidths 합계 = 9866 (실제 XML 기준: 700+3900+1700+1700+1766 = 9766 — 실측 확인 필요)
// 임시: 700+3900+1700+1700+1866 = 9866 으로 조정
Table({
  columnWidths: [700, 3900, 1700, 1700, 1866],
  // 헤더 행: ibkBlue 배경, 흰 텍스트
  // 데이터 행: D-14이내=lightRed bg, D-30이내=lightBlue bg, 나머지=white bg
  rows: [
    // 헤더
    TableRow([
      TableCell({ shading:{fill:ibkBlue}, children:[TextRun("D-day", {color:white, bold:true, sz:17})] }),
      TableCell({ shading:{fill:ibkBlue}, children:[TextRun("법령명",   {color:white, bold:true, sz:17})] }),
      TableCell({ shading:{fill:ibkBlue}, children:[TextRun("마감일",   {color:white, bold:true, sz:17})] }),
      TableCell({ shading:{fill:ibkBlue}, children:[TextRun("담당",     {color:white, bold:true, sz:17})] }),
      TableCell({ shading:{fill:ibkBlue}, children:[TextRun("중요도",   {color:white, bold:true, sz:17})] }),
    ]),
    // 데이터 행 (동적 생성)
    // days_left <= 14: shading fill=lightRed
    // days_left <= 30: shading fill=lightBlue
    // 없으면: "이번 주 마감 건 없음" 단일 행
  ]
})
```

#### [SP_LARGE] 스페이서

---

### ❺ 오늘의 규제 용어

#### 섹션 헤딩

#### 용어 카드 (단일열 표, lightBlue 배경)

```javascript
TableCell({
  shading: { fill:lightBlue, val:"clear" },
  borders: { all: { style:"none", color:white, sz:0 } },
  margins: { top:160, left:200, bottom:160, right:200 },
  children: [Paragraph({
    children: [
      TextRun("[용어]", { font:"맑은 고딕", sz:22, color:ibkBlue, bold:true }),
      TextRun(": [30자 이내 정의]  ", { font:"맑은 고딕", sz:20, color:black, bold:false }),
      TextRun("([출처 조항])", { font:"맑은 고딕", sz:18, color:gray1, bold:false }),
    ]
  })]
})
```

#### [SP_LARGE] 스페이서

---

### 마무리 — 오늘 할 일은 하나예요

#### 섹션 헤딩 (ibkBlue 배경 단락, 동일 패턴)

#### 마무리 카드 (단일열 표, lightBlue 배경)

```javascript
TableCell({
  shading: { fill:lightBlue, val:"clear" },
  borders: { all: { style:"none", color:white, sz:0 } },
  margins: { top:160, left:200, bottom:160, right:200 },
  children: [Paragraph({
    children: [
      TextRun("오늘은 ", { font:"맑은 고딕", sz:22, color:black, bold:false }),
      TextRun("[법령명] [핵심 액션 한 가지]", { font:"맑은 고딕", sz:22, color:ibkBlue, bold:true }),
      TextRun(" 하나예요.", { font:"맑은 고딕", sz:22, color:black, bold:false }),
    ]
  })]
})
```

---

## 섹션 넘버링 규칙

**❶ ~ ❺ 번호는 항상 고정 출력한다.** 콘텐츠 유무와 관계없이 5개 섹션 헤딩을 모두 표시하여 독자가 "2·3·4번은 어디 있지?"라는 혼란을 겪지 않도록 한다.

해당 콘텐츠가 없는 섹션은 헤딩 바로 아래에 **단일 안내 문구 단락**만 출력하고 [SP_LARGE] 스페이서 후 다음 섹션으로 넘어간다.

```
섹션 헤딩 (ibkBlue 배경)
  └─ 안내 문구 단락 (sz:20, color:gray1)
[SP_LARGE]
```

| 섹션 | 안내 문구 (콘텐츠 없을 때) |
|------|---------------------------|
| ❷ 법령 브리핑 | "오늘은 IBK 관련 법령 브리핑이 없습니다." |
| ❸ 체크 포인트 | "오늘은 즉시 검토가 필요한 항목이 없습니다." |
| ❹ 마감 캘린더 | "향후 30일 이내 의견 제출 마감 건이 없습니다." |

---

## 섹션 생성 조건 요약

| 섹션 | 생성 조건 | 없을 때 처리 |
|------|-----------|-------------|
| 제목·날짜 | 항상 | — |
| ❶ 오늘의 요약 | 항상 | 대시보드 전부 0, 카드에 "오늘은 IBK 관련 신규 입법예고가 없었습니다." |
| ❷ 법령 브리핑 | **항상 (헤딩 고정)** | 안내 문구만 출력 |
| ❸ 체크 포인트 | **항상 (헤딩 고정)** | 안내 문구만 출력 |
| ❹ 마감 캘린더 | **항상 (헤딩 고정)** | 안내 문구만 출력 |
| ❺ 규제 용어 | 항상 | — |
| 마무리 | 항상 | — |

---

## 중요도 판정 로직

```python
def grade(score, days_left):
    if days_left <= 14: score += 2
    elif days_left <= 30: score += 1
    # score: tier1 매칭 +3, tier2 매칭 +1 (ibk-keywords.md 참조)
    if score >= 4: return "상"   # 🔴 즉시 검토
    if score >= 2: return "중"   # 🟡 관심 모니터링
    if score >= 1: return "하"   # 🟢 참고
    return None                  # 제외
```

---

## 주의 사항

1. **스페이서 단락 sz:1** — 빈 단락은 반드시 `<w:sz w:val="1"/>` 적용. 기본 크기 단락으로 만들면 줄 높이가 과도하게 커짐.
2. **keepNext:true** — 섹션 헤딩에 필수. 페이지 끝에서 헤딩만 고립 방지.
3. **keepLines:true** — 불릿 항목에 필수. 항목 중간 페이지 나눔 방지.
4. **강제 PageBreak 사용 금지** — 스페이서 단락으로만 간격 조절.
5. **섹션 번호: ❶❷❸❹❺** — "1." 자동 목록 변환 방지 위해 원문자 사용.
6. **사고사례 카드 불릿** — numbering 방식이 아닌 수동 "• " run 방식 사용.
7. **subbullets reference 분리** — bullets와 동일 abstractNum 공유 금지.

---

## 의존 파일

| 파일 | 용도 |
|------|------|
| `ibk-keywords.md` | 법령 필터링 키워드 사전 |
| `tone-guide.md` | 라이팅 원칙 |
| `crawler/moleg_crawler.py` | 법제처 수집 |
| `세칙 PDF` | ❸ 조항 근거 원문 |

---

_v2.3 기준 실측 작성 — 2026-06-12_
_원본: IBK_아침에읽는규제변화_v2.3_Final_20260610.docx_

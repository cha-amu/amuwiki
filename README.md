# 아무위키 공개 스냅샷과 임베드 지도

위키의 독자 화면은 [채아무 블로그의 `/wiki/`](https://cha-amu.github.io/wiki/)입니다. 블로그 글과 같은 헤더·메뉴·본문 레이아웃 안에서 문서, 검색, 태그, 연결 지도를 제공합니다. 저장소 분리는 데이터 발행 경계를 위한 것이며, 별도의 위키 웹사이트를 운영하기 위한 것이 아닙니다.

이 저장소는 공개 JSON과 React + TypeScript + Vite 기반 **임베드 연결 지도만** GitHub Pages에 제공합니다. `/amuwiki/`, 문서 해시 주소, `?view=graph` 등 일반 방문 주소는 블로그 `/wiki/`로 이동합니다. 리다이렉트는 React를 마운트하거나 JSON을 요청하기 전에 `location.replace`로 실행합니다. `?embed=graph`만 이 저장소에서 렌더링합니다.

## 실행과 검증

Node 24를 사용합니다. `.nvmrc`와 `package-lock.json`이 포함되어 있습니다.

```sh
npm ci
npm test
npm run build
npm run dev
```

개발 주소는 `http://127.0.0.1:5173/amuwiki/`입니다. 일반 주소로 들어가면 설정된 블로그로 이동하므로, 지도만 확인할 때는 `http://127.0.0.1:5173/amuwiki/?embed=graph&scope=all`을 사용합니다. 빌드 결과는 `dist/`이며 `npm run preview`로 제공할 수 있습니다. `build`는 타입 검사와 공개 JSON 검증을 먼저 수행하며 잘못된 공개본이면 실패합니다.

로컬 블로그가 5178 포트에서 실행 중이면 다음과 같이 연결합니다. JSON과 임베드는 계속 이 저장소의 서버에서 제공됩니다.

```sh
VITE_BLOG_URL=http://127.0.0.1:5178/ npm run dev
VITE_BLOG_URL=http://127.0.0.1:5178/ npm run build
```

`npm test`는 리다이렉트·설정·진입점 분기, 서버 렌더링 결과의 링크, 그래프 도메인, 공개본 검증, Escape의 origin 검증을 실행합니다. 서버 렌더링 테스트는 브라우저의 크기·동작 검수를 대신하지 않습니다.

`npm run test:e2e`는 별도로 설치된 Google Chrome에서 데스크톱·모바일 검수를 실행합니다. 먼저 같은 환경 변수로 `npm run build`를 실행해야 합니다. 다른 Chromium 채널에는 `PLAYWRIGHT_CHANNEL`을 사용합니다. 테스트 서버는 4186 포트, cross-origin 부모는 4187 포트를 사용합니다. 블로그 목적지는 테스트 응답으로 대체하여 이동 주소만 검증합니다. 실제 블로그의 `/wiki/` 화면은 블로그 저장소에서 검수해야 합니다.

기존 독립 사이트의 목록·마크다운·대화상자·푸터 검수는 제거했습니다. E2E에는 리다이렉트, 오류/재시도, 지도 이동·확대·키보드, `_top` 링크, cross-origin Escape, 190×240px의 스크롤 없는 임베드 검수가 남아 있습니다. 스크린샷은 `artifacts/browser/`, 실패 trace는 `test-results/`에 저장됩니다. 이 패치의 브라우저/E2E 검수는 실행하지 않았으며 부모 작업에서 수행합니다.

## 공개본과 개인정보 경계

`public/wiki.json`에는 공개 대상으로 선택해 발행한 문서와 연결 자료를 담습니다. 발행한 문서가 없을 때 빈 지도는 정상이며, 검수용 데이터를 공개본에 넣지 않습니다. JSON endpoint는 기본 `https://cha-amu.github.io/amuwiki/wiki.json`이고 리다이렉트 대상이 아닙니다.

데이터 계약은 `src/domain/wiki.ts`, 검증은 `src/domain/validation.ts`에 있습니다. 공개를 허용한 문서·링크·출처·자료만 입력해야 합니다. 이 프로젝트는 개인 원본 저장소에 접근하거나 공개/비공개를 분류하는 exporter 역할을 하지 않습니다.

- 지도는 실행 중 fetch한 공개 JSON에서만 계산합니다. 연결선은 `links`와 `resources[].documentIds`에서만 만들며 태그가 같다는 이유로 연결하지 않습니다.
- 알려지지 않은 필드, 중복 ID, 없는 항목 참조, 안전하지 않은 URL을 만나면 공개본 전체를 거부합니다. 비공개 항목의 대체 노드·제목·연결선·개수를 만들지 않습니다.
- `links[].target`은 `doc:<id>`, `post:<id>`, `asset:<id>`를 권장합니다. 접두사 없는 문서 ID도 호환하며 충돌 시 완전한 key를 우선합니다. `resources[].documentIds`에는 원래 문서 ID를 넣습니다.
- HTTP 404/410은 미발행, 다른 HTTP/네트워크 실패는 읽기 실패, 계약 위반은 잘못된 공개본으로 구분합니다. 정상적인 빈 공개본과 알 수 없는 local focus도 구분합니다.
- 요청은 `credentials: 'omit'`, `cache: 'no-store'`이며 15초 후 중단합니다. 이전 응답·로컬 저장소·샘플 데이터로 대체하지 않습니다.
- 입력 예산은 8 MiB, 문서 5,000개, 자료 5,000개, 연결 50,000개입니다. 초과하면 전체 공개본을 거부합니다.

가상 검수 데이터는 `tests/fixtures/`에만 있습니다. 테스트에서만 사용하며 `public/`과 배포 번들에 포함하지 않습니다. 기존 공개 데이터·자료 링크·이미지는 유지합니다.

## 주소 설정과 리다이렉트

`.env.example`의 값은 브라우저 번들에 포함되는 공개 설정입니다. 비밀 값을 넣지 마세요.

| 변수                  | 용도와 기본값                                                                    |
| --------------------- | -------------------------------------------------------------------------------- |
| `VITE_BLOG_URL`       | 블로그 및 상대 자료 URL의 기준. 기본 `https://cha-amu.github.io/`                |
| `VITE_WIKI_URL`       | 블로그 위키 페이지를 명시적으로 재정의. 기본은 `VITE_BLOG_URL` origin의 `/wiki/` |
| `VITE_WIKI_INDEX_URL` | 공개 JSON 주소. 기본은 현재 배포 origin과 Vite base 아래 `wiki.json`             |
| `VITE_BASE_PATH`      | 공개본·임베드의 Vite base. 기본 `/amuwiki/`                                      |

`VITE_WIKI_BASE_URL`은 `VITE_WIKI_URL`의 이전 별칭이고, 둘 다 설정하면 `VITE_WIKI_URL`이 우선합니다. `VITE_PUBLIC_INDEX_URL`도 이전 JSON 주소 별칭으로 지원합니다. 위키 주소에 남아 있는 query/hash는 제거하며, 예전 `/amuwiki/` 배포 루트를 가리키는 설정은 리다이렉트 반복을 막기 위해 블로그 기본 `/wiki/`로 대체합니다. 다른 origin에서 JSON을 제공하면 해당 서버의 CORS 허용이 필요합니다.

일반 방문 URL은 다음 상태만 보존합니다. 입력이 목적지 origin이나 경로를 바꾸지는 못합니다.

- 문서 해시: `#${encodeURIComponent(id)}`. 문단은 `#${encodeURIComponent(id)}/${encodeURIComponent(heading)}`. 한글·예약문자는 해석 후 다시 인코딩하며, 잘못된 인코딩·제어문자·빈 ID·2,048자를 넘는 ID/문단은 버립니다.
- 그래프: `view=graph`일 때 `focus=doc:<id>|post:<id>|asset:<id>`와 `scope=local|all`을 보존합니다.
- 필터: `tag`와 검색 매개변수 `q`, `search`, `query`를 보존합니다. 제어문자·빈 값·예산을 넘는 값(tag 100자, 검색 2,048자)은 버립니다.
- `embed`, `parentOrigin`, 기타 매개변수는 블로그로 전달하지 않습니다.

문서 URL의 기본값은 `/wiki/#<id>`, 전체 지도 URL의 기본값은 `/wiki/?view=graph`입니다. `src/domain/navigation.ts`의 `documentUrl`, `graphUrl`, `embedUrl`은 문서 페이지와 임베드의 기본 URL을 구분합니다. 과거에 발행한 `/amuwiki/#<id>` 링크도 일반 방문 리다이렉트를 통해 블로그 문서로 이어집니다.

## 블로그의 지도 iframe

임베드는 `/amuwiki/?embed=graph&focus=<URL로 인코딩한 key>&scope=local|all`에 있습니다. 예를 들어 전체 공개 지도에는 focus 없이 `/amuwiki/?embed=graph&scope=all`을 사용합니다.

`scope=local`은 지정한 문서·글·자료와 양방향 1-hop 이웃만 포함합니다. focus가 없거나 존재하지 않으면 다른 항목으로 대체하지 않습니다. `scope=all`은 focus 유무와 관계없이 모든 공개 노드를 보여 줍니다. scope를 생략하거나 잘못 지정하면 local입니다.

블로그가 헤더·탐색·본문·확대 영역을 담당합니다. 임베드에는 별도의 사이트 헤더나 문서 화면이 없습니다. 모든 그래프 링크는 `target="_top"`입니다. 문서 링크는 설정된 **블로그 `/wiki/#id`**로, 공개 post/asset 링크는 공개본의 canonical URL로 이동합니다. 상대 자료 URL은 `VITE_BLOG_URL` 기준입니다. iframe에 sandbox를 사용하면 사용자 클릭에 의한 최상위 이동을 허용해야 합니다.

iframe 내부 Escape는 부모에게 `{type: 'amuwiki:escape'}`를 보냅니다. `useEmbedEscape`는 `embed=graph`에서만 사용하며 `targetOrigin`은 검증된 `VITE_BLOG_URL` origin입니다. 부모는 iframe의 `contentWindow`와 공개본 서버 origin을 함께 확인해야 합니다. 운영에서 임의의 origin이나 wildcard를 허용하지 않습니다.

로컬 포트가 다르고 `referrerPolicy="no-referrer"`라면 iframe URL에 `parentOrigin=http://127.0.0.1:5178`처럼 **정확한 origin만** 추가할 수 있습니다. 추가 loopback 허용은 임베드와 부모 모두 `localhost`, `127.0.0.1`, `[::1]`일 때만 적용됩니다. 로컬 referrer가 있으면 그 loopback origin도 사용할 수 있습니다.

지도는 iframe 크기에 맞게 렌더링하며 HTML·body·root에 최소 폭이나 스크롤 여백을 두지 않습니다. 190×240px local 지도와 로딩/오류 상태도 이 경계를 사용합니다. 초기 배치 이후 지속적인 requestAnimationFrame·타이머·물리 시뮬레이션은 없습니다. 120개 이하의 노드만 최대 60회 충돌 조정을 거치며 큰 지도는 모든 노드를 유지하는 제한된 배치를 사용합니다. ResizeObserver와 wheel 리스너는 컴포넌트 정리 시 해제합니다.

마우스/터치로 지도와 노드를 옮기고 버튼·휠로 확대/축소합니다. 작은 지도는 Ctrl/⌘ 없는 휠을 가로채지 않습니다. 키보드는 Tab/Enter로 링크 이동, 방향키로 지도 이동, Shift+방향키로 노드 이동, `+`/`-`로 배율 조절, `0`/Home으로 초기화합니다. 접근 가능한 이름에는 전체 명칭을 유지합니다.

## 배포 순서

`.github/workflows/pages.yml`은 `main` push 또는 수동 실행 시 Node 24에서 설치·단위 테스트·검증·빌드를 거쳐 기존 Pages artifact를 배포합니다.

**블로그의 네이티브 `/wiki/` 경로가 먼저 배포되어야 합니다.** 그 뒤 이 리다이렉트 패치를 배포해야 방문자가 존재하지 않는 블로그 경로로 이동하지 않습니다. 커밋·push·배포와 실제 블로그 통합 검수는 부모 작업에서 처리합니다.

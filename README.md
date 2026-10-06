# 아무위키

채아무 블로그에 연결하는 공개 개인 백과사전입니다. React + TypeScript + Vite로 만들며, 서버 없이 GitHub Pages에서 동작합니다.

## 실행

Node 24를 사용합니다. `.nvmrc`와 `package-lock.json`이 포함되어 있습니다.

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

기본 개발 주소는 `http://127.0.0.1:5173/amuwiki/`입니다. 빌드 결과는 `dist/`입니다. `build`는 타입 검사와 공개 JSON 검증을 먼저 수행하며 잘못된 공개본이면 실패합니다.

`npm run test:e2e`는 설치된 Google Chrome으로 데스크톱·모바일 브라우저 검수를 실행합니다. 먼저 `npm run build`를 실행하세요. 다른 Chromium 채널을 쓸 때는 `PLAYWRIGHT_CHANNEL`을 지정할 수 있습니다. 테스트 전용 위키 서버는 4186, cross-origin 부모 페이지는 4187 포트를 사용합니다. 스크린샷은 Git에서 제외한 `artifacts/browser/`, 실패 trace는 `test-results/`에 저장됩니다.

## 공개본

`public/wiki.json`은 최초 상태에서 다음 빈 공개본입니다. 사용자가 발행하기 전에는 빈 화면이 정상입니다.

```json
{
  "version": 1,
  "generatedAt": "2026-10-07T00:00:00.000Z",
  "documents": [],
  "resources": []
}
```

데이터 계약은 `src/domain/wiki.ts`, 검증은 `src/domain/validation.ts`에 있습니다. 입력에는 공개를 허용한 문서·링크·출처·자료만 있어야 합니다. 이 프론트엔드는 개인 원본 저장소에 접근하지 않으며, 원본을 공개/비공개로 분류하는 exporter 역할도 수행하지 않습니다.

- 목록·검색·태그·역링크·지도는 오직 실행 중 fetch한 공개 JSON에서 계산합니다.
- 알려지지 않은 필드, 중복 ID, 공개본 안에서 찾을 수 없는 참조, 안전하지 않은 URL을 거부합니다. 잘못된 부분을 제외하고 성공으로 보이게 하지 않습니다.
- 공개되지 않은 항목의 노드, 대체 제목, 연결선, 개수를 생성하지 않습니다.
- 태그는 검색과 필터에만 사용합니다. 연결선은 `links`와 `resources[].documentIds`에서만 생깁니다.
- `links[].target`은 `doc:<id>`, `post:<id>`, `asset:<id>` 형식의 공개 key를 권장합니다. 접두사가 없는 문서 ID도 호환하며, 충돌 시 완전한 key를 우선합니다. `resources[].documentIds`에는 원래 문서 ID를 넣습니다.
- HTTP 404/410은 아직 미발행 상태, 다른 HTTP/네트워크 실패는 읽기 실패, 계약 위반은 잘못된 공개본으로 구분합니다. 정상적인 빈 공개본과 존재하지 않는 문서도 각각 구분합니다.
- 쿠키 없이 `cache: 'no-store'`로 요청하고 15초 후 중단합니다. 이전 응답·로컬 저장소·샘플 데이터로 대체하지 않습니다.
- 입력 예산은 8 MiB, 문서 5,000개, 자료 5,000개, 연결 50,000개입니다. 초과하면 전체 공개본을 거부합니다.

가상 검수 데이터는 `tests/fixtures/`에만 있습니다. 브라우저 테스트는 네트워크 응답을 가로채 사용하며, 이를 `public/` 또는 기본 빌드에 넣지 않습니다.

## 주소와 블로그 연결

기본 배포 주소는 `https://cha-amu.github.io/amuwiki/`, JSON은 같은 위치의 `wiki.json`입니다. 환경 변수를 지정하지 않으면 현재 origin과 Vite base를 사용하므로 임시 정적 서버에서도 동작합니다.

`.env.example`을 참고해 다음 공개 환경 변수를 설정할 수 있습니다. 환경 변수에는 비밀 값을 넣지 마세요.

| 변수                  | 용도                                      |
| --------------------- | ----------------------------------------- |
| `VITE_WIKI_BASE_URL`  | 문서·지도 링크의 기본 URL                 |
| `VITE_WIKI_INDEX_URL` | 공개 JSON 주소                            |
| `VITE_BLOG_URL`       | 채아무 블로그 링크와 상대 자료 URL의 기준 |
| `VITE_BASE_PATH`      | Vite base, 기본 `/amuwiki/`               |

`VITE_WIKI_URL`, `VITE_PUBLIC_INDEX_URL` 별칭도 지원합니다. 다른 origin에서 JSON을 제공할 경우 해당 서버에서 CORS를 허용해야 합니다.

- 문서: `/amuwiki/#${encodeURIComponent(id)}`
- 문단: `/amuwiki/#${encodeURIComponent(id)}/${encodeURIComponent(headingSlug)}`
- 전체 지도: `/amuwiki/?view=graph`
- 임베드: `/amuwiki/?embed=graph&focus=<URL로 인코딩한 key>&scope=local`
- 전체 임베드: 같은 주소에서 `scope=all`

`src/domain/navigation.ts`의 `documentUrl`, `graphUrl`, `embedUrl`이 안전한 URL 생성 함수입니다. 한글·슬래시·물음표·해시·퍼센트·콜론을 포함한 ID를 지원합니다. `scope=local`은 지정 항목과 양방향 1-hop 이웃만 포함합니다. 존재하지 않는 focus는 빈 오류 상태이며 다른 항목으로 대체하지 않습니다.

블로그는 iframe으로 같은 `Graph` 컴포넌트를 재사용합니다. 임베드에는 위키 메뉴나 본문이 없고, 문서 링크는 `target="_top"`으로 위키의 최상위 화면을 엽니다. 부모 iframe에 sandbox를 지정한다면 클릭에 의한 최상위 이동을 허용해야 합니다. 임베드 자체에 별도 확대 헤더가 없으므로 부모가 큰 지도 영역을 열 수 있습니다.

iframe 내부의 Escape는 부모에게 `{type: 'amuwiki:escape'}` 메시지를 보냅니다. `embed=graph` 화면에서만 활성화되며 targetOrigin은 `VITE_BLOG_URL`의 origin입니다. 부모는 iframe의 `contentWindow`와 위키 origin을 함께 확인해야 합니다. 운영에서는 다른 origin을 허용하지 않습니다. 로컬 포트가 다르고 `referrerPolicy="no-referrer"`라면 iframe URL에 `parentOrigin=http://127.0.0.1:5178`처럼 **정확한 origin만** 추가하세요. 이 예외는 위키와 부모 모두 `localhost`, `127.0.0.1`, `[::1]`일 때만 허용됩니다. referrer가 제공되는 로컬 환경에서는 그 loopback origin도 사용할 수 있습니다. wildcard targetOrigin은 사용하지 않습니다.

## 본문과 지도

마크다운은 `react-markdown`과 `remark-gfm`으로 렌더링합니다. raw HTML은 실행하거나 삽입하지 않습니다. `doc:<encodeURIComponent(id)>`를 문서 링크로, `#heading-slug`를 현재 문서의 문단 링크로 사용합니다. 문단·각주 이동이 문서 라우트와 충돌하지 않도록 문서 ID를 주소에 보존합니다.

exporter가 본문에 넣은 `https://cha-amu.github.io/amuwiki/#<id>` 절대 문서 링크도 현재 `VITE_WIKI_BASE_URL`로 옮겨 엽니다. 로컬 미리보기 및 다른 배포 경로에서 ID와 문단을 그대로 유지하며, 다른 사이트나 블로그 경로의 링크는 바꾸지 않습니다.

오른쪽 230~244px 영역에 230px 높이 지도를 두고, 좁은 화면에서는 읽기 영역 아래의 접힌 지도로 바꿉니다. 확대 dialog는 native modal과 명시적 Tab 순환을 함께 사용하며 Escape, 초점 복귀, 스크롤 위치 복원을 지원합니다.

임베드에서는 일반 페이지의 최소 폭과 스크롤 여백을 적용하지 않습니다. 190×240px에서도 HTML·body·root·지도 영역에 가로/세로 스크롤바가 없고 로컬 노드와 명칭이 화면에 들어오는 것을 브라우저에서 검수합니다.

지도는 초기 배치 후 멈춥니다. 120개 이하의 노드만 제한된 60회 충돌 조정으로 배치하며, 더 큰 지도는 선형 배치를 사용합니다. 모든 공개 노드를 유지하고 화면을 그리기 위해 데이터를 잘라내지 않습니다. 지속적인 requestAnimationFrame, 타이머, 물리 시뮬레이션이 없습니다. `ResizeObserver`, wheel 리스너는 컴포넌트 정리 시 해제합니다.

마우스/터치 드래그로 지도와 노드를 옮기고, 버튼·휠로 확대/축소합니다. 작은 지도는 Ctrl/⌘ 없는 휠을 가로채지 않습니다. 키보드로는 Tab과 Enter로 링크 이동, 방향키로 지도 이동, Shift+방향키로 선택 노드 이동, `+`/`-`로 배율 조절, `0`/Home으로 초기화합니다. 긴 명칭은 링크의 접근 가능한 이름과 항목 선택 목록에 모두 남습니다.

## 배포

`.github/workflows/pages.yml`은 `main` push 또는 수동 실행 시 Node 24에서 설치·단위 테스트·빌드 후 Pages artifact를 배포합니다. Pages의 GitHub Actions 연결과 저장소 정책 설정은 저장소 관리자가 별도로 완료해야 합니다. 이 작업에서는 GitHub 설정 변경, 커밋, push, 배포를 실행하지 않았습니다.

## 참조

- [Vite 시작하기](https://vite.dev/guide/), [GitHub Pages 배포](https://vite.dev/guide/static-deploy.html#github-pages)
- [React effect 정리](https://react.dev/reference/react/useEffect)
- [react-markdown 안전한 렌더링](https://github.com/remarkjs/react-markdown#security), [remark-gfm](https://github.com/remarkjs/remark-gfm)
- [Vitest](https://vitest.dev/guide/), [Playwright web server](https://playwright.dev/docs/test-webserver)
- [Modal dialog](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal)

그림은 지정된 기존 `guestbook-icon.png`를 수정 없이 복사했습니다. 새 이미지 생성이나 개인 지식 원본의 읽기·복사는 하지 않았습니다.

# 아무위키 공개 데이터와 연결 지도

아무위키는 [채아무 블로그의 `/wiki/`](https://cha-amu.github.io/wiki/)에서 읽습니다. 이 저장소는 블로그가 쓰는 두 가지를 GitHub Pages로 제공합니다.

- 공개 데이터: `https://cha-amu.github.io/amuwiki/wiki.json`
- 블로그가 iframe으로 넣는 연결 지도: `https://cha-amu.github.io/amuwiki/?embed=graph`

`/amuwiki/`, 문서 해시 주소, `?view=graph` 같은 일반 방문 주소는 React를 띄우거나 데이터를 받기 전에 블로그 `/wiki/`로 이동합니다.

## 공개 데이터가 배포되는 방식

공개본은 이 저장소에 커밋하지 않습니다.

1. 개인 원본에서 공개로 지정한 문서만 모아 공개본을 만듭니다. 비공개 문서를 가리키는 링크와 연결은 이 단계에서 빠집니다.
2. 발행하면 이 저장소의 릴리스 `wiki-data`에 있는 `wiki.json` 파일 하나를 새 내용으로 바꾸고, `amuwiki-publish` 이벤트로 Pages 작업을 실행합니다.
3. Pages 작업은 그 파일을 내려받아 테스트·검증·빌드한 뒤 배포합니다. `main`에 코드를 push할 때도 같은 파일로 다시 배포합니다.

문서를 비공개로 돌리고 다시 발행하면 다음 배포에서 사이트와 릴리스 파일에서 사라지고, 이 저장소의 git 이력에도 남지 않습니다. GitHub Actions가 보관하는 Pages 배포 산출물은 하루 동안 남습니다. 이 방식으로 바꾸기 전(2026-10-07)에 커밋된 공개본은 과거 커밋에 남아 있습니다.

## 실행과 검증

Node 24를 사용합니다.

```sh
npm ci
gh release download wiki-data --pattern wiki.json --dir public --clobber
npm test
npm run build
npm run dev
```

`public/wiki.json`은 git에서 제외되어 있습니다. 실제 공개본 대신 테스트 데이터로 확인하려면 `tests/fixtures/public-wiki.json`을 `public/wiki.json`으로 복사합니다. `npm run build`는 타입 검사와 공개본 검증을 먼저 하며, 계약에 어긋나면 실패합니다.

개발 중에는 `http://127.0.0.1:5173/amuwiki/?embed=graph&scope=all`로 지도를 엽니다. 다른 주소는 설정된 블로그로 이동합니다. 로컬 블로그와 연결할 때는 `VITE_BLOG_URL=http://127.0.0.1:5178/ npm run dev`처럼 블로그 주소를 지정합니다.

`npm test`는 단위 테스트를, `npm run test:e2e`는 별도로 설치된 Google Chrome에서 데스크톱·모바일 브라우저 검사를 실행합니다. e2e 전에는 `npm run build`를 먼저 실행합니다.

## 데이터 계약

계약은 `src/domain/wiki.ts`, 검증은 `src/domain/validation.ts`에 있습니다.

- 연결선은 문서의 `links`와 `resources[].documentIds`로만 만듭니다. 같은 태그는 연결선이 아닙니다.
- 알 수 없는 필드, 중복 ID, 없는 항목 참조, 안전하지 않은 URL이 있으면 공개본 전체를 거부합니다. 빠진 항목을 대신하는 노드·제목·개수는 만들지 않습니다.
- 크기 제한은 8 MiB, 문서 5,000개, 자료 5,000개, 연결 50,000개입니다.

## 블로그 iframe 계약

| 매개변수 | 의미 |
| --- | --- |
| `embed=graph` | 지도 화면을 렌더링합니다. 없으면 블로그로 이동합니다. |
| `focus=doc:<id>`, `post:<id>`, `asset:<id>` | 중심 항목입니다. URL 인코딩합니다. |
| `scope=local` / `scope=all` | `local`은 중심 항목과 바로 연결된 항목만, `all`은 전체 공개 지도입니다. |
| `resources=parent` | 블로그가 보내는 목록에 있는 글·자료만 노드로 그립니다. |
| `compact=1` | 본문 옆 작은 지도용 배치입니다. 확대 대화상자에는 붙이지 않습니다. |
| `lang=ko` / `lang=en` | 지도 문구 언어입니다. 기본은 한국어입니다. |

`resources=parent`일 때 지도는 마운트 직후 부모 창에 `{ type: 'amuwiki:ready' }`를 보냅니다. 부모는 지금 블로그에 보이는 글·자료 키 목록을 `{ type: 'amuwiki:resources', keys: ['post:<id>', 'asset:<id>'] }`로 보냅니다. 지도는 부모 창과 origin이 맞는 메시지만 받고, 목록에 없는 글·자료는 그리지 않습니다. 4초 안에 목록이 오지 않으면 문서만 그리고 계속 기다립니다. 그래서 블로그에서 글을 숨기면 아무위키를 다시 발행하기 전에도 지도에서 빠집니다.

모든 노드 링크는 `target="_top"`입니다. 문서는 블로그 `/wiki/#<id>`로, 글·자료는 블로그의 해당 주소로 이동합니다. iframe 안에서 Escape를 누르면 부모에게 `{ type: 'amuwiki:escape' }`를 보냅니다. 메시지를 보내는 대상 origin은 `VITE_BLOG_URL`이며, 부모도 iframe 창과 origin을 함께 확인해야 합니다.

## 주소 설정

`.env.example`의 값은 브라우저 번들에 포함되는 공개 설정입니다. 비밀 값을 넣지 마세요.

| 변수 | 용도와 기본값 |
| --- | --- |
| `VITE_BLOG_URL` | 블로그와 상대 자료 URL의 기준. 기본 `https://cha-amu.github.io/` |
| `VITE_WIKI_URL` | 블로그 위키 화면. 기본은 `VITE_BLOG_URL` origin의 `/wiki/` |
| `VITE_WIKI_INDEX_URL` | 공개 데이터 주소. 기본은 배포 origin과 Vite base 아래 `wiki.json` |
| `VITE_BASE_PATH` | Vite base. 기본 `/amuwiki/` |

이전 이름인 `VITE_WIKI_BASE_URL`과 `VITE_PUBLIC_INDEX_URL`도 받습니다. 예전 `/amuwiki/#<id>` 링크는 블로그 `/wiki/#<id>`로 이어집니다.


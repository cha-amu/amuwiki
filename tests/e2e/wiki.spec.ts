import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadEnv } from 'vite';
import fixture from '../fixtures/public-wiki.json' with { type: 'json' };
import { resolveConfig } from '../../src/domain/config';
import { documentUrl, embedUrl } from '../../src/domain/navigation';

const base = 'http://127.0.0.1:4186/amuwiki/';
const { wikiUrl } = resolveConfig(
  {
    ...loadEnv('production', process.cwd(), 'VITE_'),
    ...process.env,
    BASE_URL: '/amuwiki/',
  },
  base,
);
const documentId = fixture.documents[0].id;
const focus = `doc:${documentId}`;
const fixtureRoute = async (page: Page) =>
  page.route('**/wiki.json', (route) => route.fulfill({ json: fixture }));
// The parent repository owns the blog UI. This sentinel only verifies the
// navigation destination, without depending on a live/deployed blog route.
const blogRoute = async (page: Page) => {
  const wiki = new URL(wikiUrl);
  await page.route(
    (url) => url.origin === wiki.origin && url.pathname === wiki.pathname,
    (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<main id="blog-wiki">Blog wiki destination</main>',
      }),
  );
};
const evidence = (name: string, project: string) =>
  `artifacts/browser/${project}-${name}.png`;

test('visitor routes redirect to the blog without fetching the public index', async ({
  page,
}) => {
  await blogRoute(page);
  const indexRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/wiki.json'))
      indexRequests.push(request.url());
  });
  await page.goto(base);
  await expect(page.locator('#blog-wiki')).toBeVisible();
  expect(page.url()).toBe(wikiUrl);
  const source = new URL(documentUrl(documentId, base, '작은-기록'));
  source.search = new URLSearchParams({
    view: 'graph',
    scope: 'all',
    focus,
    tag: '읽기',
    q: '두 단어',
    parentOrigin: 'https://untrusted.example',
  }).toString();
  await page.goto(source.href);
  await expect(page.locator('#blog-wiki')).toBeVisible();
  const destination = new URL(page.url());
  expect(destination.hash).toBe(
    new URL(documentUrl(documentId, wikiUrl, '작은-기록')).hash,
  );
  expect(Object.fromEntries(destination.searchParams)).toEqual({
    view: 'graph',
    scope: 'all',
    focus,
    tag: '읽기',
    q: '두 단어',
  });
  expect(indexRequests).toEqual([]);
});

test('an empty public graph and an unknown local focus are distinct', async ({
  page,
}) => {
  await page.goto(embedUrl(undefined, 'all', base));
  await expect(page.getByText('아직 공개된 문서가 없어요.')).toBeVisible();
  await fixtureRoute(page);
  await page.goto(embedUrl('doc:missing', 'local', base));
  await expect(page.getByText('이 항목을 찾을 수 없어요.')).toBeVisible();
  await expect(page.locator('.graph-node')).toHaveCount(0);
});

test('all-scope graph links target blog documents and canonical public resources', async ({
  page,
}) => {
  await fixtureRoute(page);
  await page.goto(embedUrl(undefined, 'all', base));
  await expect(page.locator('.graph-node')).toHaveCount(7);
  for (const resource of fixture.resources) {
    const node = page.locator(`.graph-node[data-kind="${resource.kind}"]`);
    await expect(node).toHaveAttribute('href', resource.url);
    await expect(node).toHaveAttribute('target', '_top');
  }
  for (const doc of fixture.documents) {
    const node = page.getByRole('link', { name: new RegExp(doc.title) });
    await expect(node).toHaveAttribute(
      'href',
      documentUrl(doc.id, wikiUrl),
    );
    await expect(node).toHaveAttribute('target', '_top');
  }
});

test('unpublished, failed fetch and invalid public index have different states', async ({
  page,
}) => {
  await page.route('**/wiki.json', (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.goto(embedUrl(undefined, 'all', base));
  await expect(
    page.getByRole('heading', { name: '아직 공개본이 없어요.' }),
  ).toBeVisible();
  await page.unroute('**/wiki.json');
  await page.route('**/wiki.json', (route) =>
    route.fulfill({ status: 503 }),
  );
  await page.getByRole('button', { name: '다시 불러오기' }).click();
  await expect(
    page.getByRole('heading', { name: '문서를 불러오지 못했어요.' }),
  ).toBeVisible();
  await page.unroute('**/wiki.json');
  await page.route('**/wiki.json', (route) =>
    route.fulfill({
      json: { ...fixture, private: ['synthetic-forbidden'] },
    }),
  );
  await page.getByRole('button', { name: '다시 불러오기' }).click();
  await expect(
    page.getByRole('heading', { name: '공개본을 읽을 수 없어요.' }),
  ).toBeVisible();
  await expect(page.getByText('synthetic-forbidden')).toHaveCount(0);
  await expect(page.getByText('읽기에서 이어지는 생각')).toHaveCount(0);
});

test('graph click navigates and dragging a node or canvas never navigates', async ({
  page,
}, info) => {
  await blogRoute(page);
  await fixtureRoute(page);
  await page.goto(embedUrl(undefined, 'all', base));
  const canvas = page.getByRole('group', {
    name: '연결 지도',
    exact: true,
  });
  const node = page.locator('.graph-node').filter({
    has: page.locator('title', { hasText: '읽기에서 이어지는 생각' }),
  });
  await expect(node).toHaveCount(1);
  await expect(canvas).toBeVisible();
  const originalUrl = page.url();
  const shape = node.locator('.graph-node-shape');
  const bounds = await shape.boundingBox();
  expect(bounds).not.toBeNull();
  const before = await node.locator('..').getAttribute('transform');
  await page.mouse.move(
    bounds!.x + bounds!.width / 2,
    bounds!.y + bounds!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 70, bounds!.y + 35, { steps: 8 });
  await page.mouse.up();
  expect(page.url()).toBe(originalUrl);
  expect(await node.locator('..').getAttribute('transform')).not.toBe(
    before,
  );
  const cameraBefore = await page
    .locator('[data-camera]')
    .getAttribute('transform');
  const canvasBounds = await canvas.boundingBox();
  await page.mouse.move(
    canvasBounds!.x + canvasBounds!.width - 30,
    canvasBounds!.y + 50,
  );
  await page.mouse.down();
  await page.mouse.move(
    canvasBounds!.x + canvasBounds!.width - 95,
    canvasBounds!.y + 90,
    { steps: 8 },
  );
  await page.mouse.up();
  expect(page.url()).toBe(originalUrl);
  expect(
    await page.locator('[data-camera]').getAttribute('transform'),
  ).not.toBe(cameraBefore);
  await page
    .getByRole('button', { name: '지도 처음 위치', exact: true })
    .click();
  await page
    .getByRole('button', { name: '지도 확대', exact: true })
    .click();
  await expect(page.getByLabel('지도 배율')).toHaveText('125%');
  await canvas.focus();
  await page.keyboard.press('+');
  await expect(page.getByLabel('지도 배율')).toHaveText('156%');
  await page.keyboard.press('0');
  await page.screenshot({
    path: evidence('graph', info.project.name),
    fullPage: true,
  });
  if (info.project.name === 'mobile') await shape.tap();
  else await shape.click();
  await expect(page.locator('#blog-wiki')).toBeVisible();
  expect(page.url()).toBe(documentUrl(documentId, wikiUrl));
});

test('embed is graph-only and its document links leave the iframe', async ({
  page,
}) => {
  await blogRoute(page);
  await fixtureRoute(page);
  const url = embedUrl(focus, 'local', base);
  await page.route('**/embed-parent', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<html lang="ko"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><iframe title="검수용 연결 지도" style="width:min(500px,95vw);height:400px" src="${url.replaceAll('&', '&amp;')}"></iframe></body></html>`,
    }),
  );
  await page.goto('http://127.0.0.1:4186/embed-parent');
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('.graph-node')).toHaveCount(4);
  await expect(frame.locator('.site-header')).toHaveCount(0);
  await expect(frame.locator('.document')).toHaveCount(0);
  const node = frame.locator('.graph-node').filter({
    has: page.locator('title', { hasText: '읽기에서 이어지는 생각' }),
  });
  await expect(node).toHaveAttribute('target', '_top');
  await node.locator('.graph-node-shape').click();
  await expect(page.locator('#blog-wiki')).toBeVisible();
  expect(page.url()).toBe(documentUrl(documentId, wikiUrl));
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('viewport stays within the screen and no simulation runs while idle', async ({
  page,
}) => {
  await fixtureRoute(page);
  await page.addInitScript(() => {
    const original = window.requestAnimationFrame;
    (window as unknown as { __frameCalls: number }).__frameCalls = 0;
    window.requestAnimationFrame = (callback) => {
      (window as unknown as { __frameCalls: number }).__frameCalls++;
      return original(callback);
    };
  });
  await page.goto(embedUrl(undefined, 'all', base));
  await expect(page.locator('.graph-node')).toHaveCount(7);
  const initial = await page.evaluate(
    () => (window as unknown as { __frameCalls: number }).__frameCalls,
  );
  // A finite observation window tests the no-idle-animation requirement.
  await page.waitForTimeout(350);
  expect(
    await page.evaluate(
      () => (window as unknown as { __frameCalls: number }).__frameCalls,
    ),
  ).toBe(initial);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('graph nodes can be found, moved and opened entirely with the keyboard', async ({
  page,
}) => {
  await blogRoute(page);
  await fixtureRoute(page);
  await page.goto(embedUrl(undefined, 'all', base));
  await page
    .getByRole('combobox', { name: '지도의 항목 선택' })
    .selectOption(focus);
  const node = page.locator('.graph-node').filter({
    has: page.locator('title', { hasText: '읽기에서 이어지는 생각' }),
  });
  await expect(node).toBeFocused();
  const before = await node.locator('..').getAttribute('transform');
  await page.keyboard.press('Shift+ArrowRight');
  expect(await node.locator('..').getAttribute('transform')).not.toBe(
    before,
  );
  await page.keyboard.press('Enter');
  await expect(page.locator('#blog-wiki')).toBeVisible();
  expect(page.url()).toBe(documentUrl(documentId, wikiUrl));
});

test('Escape in a sandboxed cross-origin embed signals only the allowed parent', async ({
  page,
}) => {
  await fixtureRoute(page);
  const parentOrigin = 'http://127.0.0.1:4187';
  const embed = new URL(embedUrl(focus, 'all', base));
  embed.searchParams.set('parentOrigin', parentOrigin);
  const parent = new URL('/escape-parent', parentOrigin);
  parent.searchParams.set('embed', embed.href);
  await page.goto(parent.href);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('.graph-node')).toHaveCount(7);
  await frame
    .getByRole('group', { name: '연결 지도', exact: true })
    .focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#message')).toHaveText('amuwiki:escape');
});

test('a 190px sidebar embed fits the local graph without any document scrollbars', async ({
  page,
}, info) => {
  await fixtureRoute(page);
  await page.setViewportSize({ width: 190, height: 240 });
  await page.goto(embedUrl(focus, 'local', base));
  await expect(page.locator('.graph-node')).toHaveCount(4);
  await expect(page.locator('.graph-canvas')).toHaveAttribute(
    'viewBox',
    '0 0 190 240',
  );
  const dimensions = await page.evaluate(() =>
    [
      document.documentElement,
      document.body,
      document.querySelector('#root')!,
      document.querySelector('.embed-shell')!,
    ].map((element) => ({
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
      height: element.clientHeight,
      scrollHeight: element.scrollHeight,
    })),
  );
  for (const item of dimensions) {
    expect(item.scrollWidth).toBeLessThanOrEqual(item.width);
    expect(item.scrollHeight).toBeLessThanOrEqual(item.height);
    expect(item.width).toBe(190);
    expect(item.height).toBe(240);
  }
  for (const node of await page.locator('.graph-node').all()) {
    const box = await node.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(190);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(240);
  }
  await page.screenshot({
    path: evidence('embed-190px', info.project.name),
  });
});

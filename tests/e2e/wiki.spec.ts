import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import fixture from '../fixtures/public-wiki.json' with { type: 'json' };
import { documentUrl, embedUrl } from '../../src/domain/navigation';

const base = 'http://127.0.0.1:4186/amuwiki/';
const documentId = fixture.documents[0].id;
const focus = `doc:${documentId}`;
const fixtureRoute = async (page: Page) =>
  page.route('**/wiki.json', (route) => route.fulfill({ json: fixture }));
const evidence = (name: string, project: string) =>
  `artifacts/browser/${project}-${name}.png`;

test('published empty state and missing document are distinct', async ({
  page,
}, info) => {
  await page.goto(base);
  await expect(
    page.getByRole('heading', { name: '첫 문서를 기다리고 있어요.' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: '모든 문서' })).toBeVisible();
  await page.screenshot({
    path: evidence('empty', info.project.name),
    fullPage: true,
  });
  await page.goto(documentUrl('찾을 수 없는 문서', base));
  await expect(
    page.getByRole('heading', { name: '문서를 찾을 수 없어요.' }),
  ).toBeVisible();
  await page.screenshot({
    path: evidence('missing', info.project.name),
    fullPage: true,
  });
});

test('unpublished, failed fetch and invalid public index have different states', async ({
  page,
}) => {
  await page.route('**/wiki.json', (route) => route.fulfill({ status: 404 }));
  await page.goto(base);
  await expect(
    page.getByRole('heading', { name: '아직 공개본이 없어요.' }),
  ).toBeVisible();
  await page.unroute('**/wiki.json');
  await page.route('**/wiki.json', (route) => route.fulfill({ status: 503 }));
  await page.getByRole('button', { name: '다시 불러오기' }).click();
  await expect(
    page.getByRole('heading', { name: '문서를 불러오지 못했어요.' }),
  ).toBeVisible();
  await page.unroute('**/wiki.json');
  await page.route('**/wiki.json', (route) =>
    route.fulfill({ json: { ...fixture, private: ['synthetic-forbidden'] } }),
  );
  await page.getByRole('button', { name: '다시 불러오기' }).click();
  await expect(
    page.getByRole('heading', { name: '공개본을 읽을 수 없어요.' }),
  ).toBeVisible();
  await expect(page.getByText('synthetic-forbidden')).toHaveCount(0);
  await expect(page.getByText('읽기에서 이어지는 생각')).toHaveCount(0);
});

test('public search, tag filters and reserved-character direct links work', async ({
  page,
}, info) => {
  await fixtureRoute(page);
  await page.goto(base);
  await expect(
    page.getByRole('heading', { name: '읽기에서 이어지는 생각' }),
  ).toBeVisible();
  await page.screenshot({
    path: evidence('list', info.project.name),
    fullPage: true,
  });
  await page.getByRole('searchbox', { name: '문서 검색' }).fill('개인 기록');
  await expect(page.locator('.document-card')).toHaveCount(1);
  await page.getByRole('searchbox').fill('없는단어');
  await expect(
    page.getByRole('heading', { name: '찾는 문서가 없어요.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '다시 둘러보기' }).click();
  await page
    .locator('.tag-cloud')
    .getByRole('button', { name: '#읽기', exact: true })
    .click();
  await expect(page.locator('.document-card')).toHaveCount(1);
  await page
    .getByRole('link', { name: '읽기에서 이어지는 생각', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: '읽기에서 이어지는 생각', exact: true }),
  ).toBeVisible();
  expect(decodeURIComponent(new URL(page.url()).hash.slice(1))).toBe(
    documentId,
  );
});

test('markdown headings and footnotes never replace the document hash', async ({
  page,
}, info) => {
  await fixtureRoute(page);
  await page.goto(documentUrl(documentId, base));
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('#wiki-section-작은-기록')).toBeVisible();
  await expect(page.locator('#wiki-section-작은-기록-1')).toHaveCount(1);
  await expect(page.locator('.markdown script')).toHaveCount(0);
  await expect(page.locator('.markdown a[href^="javascript:"]')).toHaveCount(0);
  await page.getByRole('link', { name: '같은 문단으로' }).click();
  expect(new URL(page.url()).hash).toContain(encodeURIComponent(documentId));
  await expect(page.locator('#document-title')).toHaveText(
    '읽기에서 이어지는 생각',
  );
  await page.locator('.markdown a').filter({ hasText: /^1$/ }).click();
  await expect(page.locator('#document-title')).toHaveText(
    '읽기에서 이어지는 생각',
  );
  await page.goto(documentUrl(documentId, base));
  await page.screenshot({
    path: evidence('document', info.project.name),
    fullPage: true,
  });
  await page.getByRole('link', { name: '다음 문서', exact: true }).click();
  await expect(page.locator('#document-title')).toHaveText(
    '작은 기록실 만들기',
  );
});

test('graph click navigates and dragging a node or canvas never navigates', async ({
  page,
}, info) => {
  await fixtureRoute(page);
  await page.goto(`${base}?view=graph`);
  const canvas = page.getByRole('group', { name: '연결 지도', exact: true });
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
  expect(await node.locator('..').getAttribute('transform')).not.toBe(before);
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
  await page.getByRole('button', { name: '지도 확대', exact: true }).click();
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
  await expect(page.locator('#document-title')).toHaveText(
    '읽기에서 이어지는 생각',
  );
});

test('expanded graph traps focus, closes with Escape and restores scroll/focus', async ({
  page,
}, info) => {
  await fixtureRoute(page);
  await page.goto(documentUrl(documentId, base));
  await page.evaluate(() => document.fonts.ready);
  if (info.project.name === 'mobile') {
    await expect(page.locator('.sidebar-map-body')).not.toBeVisible();
    await page.getByRole('button', { name: '연결 지도 펼치기' }).click();
    await expect(page.locator('.sidebar-map-body')).toBeVisible();
  }
  const opener = page.getByRole('button', { name: '지도로 둘러보기' });
  await opener.scrollIntoViewIfNeeded();
  await opener.focus();
  await opener.evaluate((element) =>
    element.addEventListener(
      'click',
      () => {
        (window as unknown as { __openScroll: number }).__openScroll =
          window.scrollY;
      },
      { once: true, capture: true },
    ),
  );
  await opener.click();
  const scrollY = await page.evaluate(
    () => (window as unknown as { __openScroll: number }).__openScroll,
  );
  const dialog = page.getByRole('dialog', { name: '연결 지도' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  const first = dialog.getByRole('button', { name: '주변', exact: true });
  await first.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(
    dialog.getByRole('combobox', { name: '지도의 항목 선택' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
  await dialog.getByRole('button', { name: '전체', exact: true }).click();
  await expect(dialog.locator('.graph-node')).toHaveCount(7);
  await page.screenshot({ path: evidence('dialog', info.project.name) });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  const afterScroll = await page.evaluate(() => window.scrollY);
  expect(Math.abs(afterScroll - scrollY)).toBeLessThan(2);
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});

test('embed is graph-only and its document links leave the iframe', async ({
  page,
}) => {
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
  await expect(page.locator('#document-title')).toHaveText(
    '읽기에서 이어지는 생각',
  );
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
  await page.goto(`${base}?view=graph`);
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
  await fixtureRoute(page);
  await page.goto(`${base}?view=graph`);
  await page
    .getByRole('combobox', { name: '지도의 항목 선택' })
    .selectOption(focus);
  const node = page.locator('.graph-node').filter({
    has: page.locator('title', { hasText: '읽기에서 이어지는 생각' }),
  });
  await expect(node).toBeFocused();
  const before = await node.locator('..').getAttribute('transform');
  await page.keyboard.press('Shift+ArrowRight');
  expect(await node.locator('..').getAttribute('transform')).not.toBe(before);
  await page.keyboard.press('Enter');
  await expect(page.locator('#document-title')).toHaveText(
    '읽기에서 이어지는 생각',
  );
});

test('closing the map releases its resize observer', async ({ page }, info) => {
  await fixtureRoute(page);
  await page.addInitScript(() => {
    const active = new Set<ResizeObserver>();
    const OriginalObserver = window.ResizeObserver;
    window.ResizeObserver = class extends OriginalObserver {
      observe(target: Element, options?: ResizeObserverOptions) {
        active.add(this);
        super.observe(target, options);
      }
      disconnect() {
        active.delete(this);
        super.disconnect();
      }
    };
    (
      window as unknown as { __activeObservers: () => number }
    ).__activeObservers = () => active.size;
  });
  await page.goto(documentUrl(documentId, base));
  await expect(page.locator('#document-title')).toBeVisible();
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: '연결 지도 펼치기' }).click();
  const observerCount = () =>
    page.evaluate(() =>
      (
        window as unknown as { __activeObservers: () => number }
      ).__activeObservers(),
    );
  const before = await observerCount();
  await page.getByRole('button', { name: '지도로 둘러보기' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await observerCount()).toBe(before + 1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await observerCount()).toBe(before);
});

test('published wiki links stay on the active host and programmatic title focus has no outline', async ({
  page,
}) => {
  await fixtureRoute(page);
  await page.goto(documentUrl(documentId, base));
  await expect(page.locator('#document-title')).toBeFocused();
  await expect(page.locator('#document-title')).toHaveCSS(
    'outline-style',
    'none',
  );
  const publishedLink = page.getByRole('link', {
    name: '발행한 문서 링크',
    exact: true,
  });
  await expect(publishedLink).toHaveAttribute(
    'href',
    documentUrl(fixture.documents[1].id, base),
  );
  await publishedLink.focus();
  await expect(publishedLink).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect(page.locator('#document-title')).toHaveText(
    '작은 기록실 만들기',
  );
  expect(new URL(page.url()).origin).toBe(new URL(base).origin);
  await expect(page.getByText('조금 더 일상적인 이야기')).toHaveCount(0);
  await expect(page.getByText('기록하고, 잇고, 다시 읽기.')).toHaveCount(0);
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
  await frame.getByRole('group', { name: '연결 지도', exact: true }).focus();
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
  await page.screenshot({ path: evidence('embed-190px', info.project.name) });
});

test('footer font replacement cannot shorten the page during modal scroll restoration', async ({
  page,
}) => {
  await fixtureRoute(page);
  await page.goto(documentUrl(documentId, base));
  await expect(page.locator('#document-title')).toBeVisible();
  const footer = page.locator('.site-footer');
  const heightBefore = await footer.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  await footer
    .locator('a')
    .first()
    .evaluate((element) => {
      element.style.fontFamily = 'Arial, sans-serif';
    });
  expect(
    await footer.evaluate((element) => element.getBoundingClientRect().height),
  ).toBe(heightBefore);
  await page.evaluate(() => document.fonts.ready);
  await footer
    .locator('a')
    .first()
    .evaluate((element) => {
      element.style.fontFamily = '';
    });
  expect(
    await footer.evaluate((element) => element.getBoundingClientRect().height),
  ).toBe(heightBefore);
});

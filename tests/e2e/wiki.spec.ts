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

const parentOrigin = 'http://127.0.0.1:4187';
const resourceKeys = fixture.resources.map(
  (resource) => `${resource.kind}:${resource.id}`,
);
const parentUrl = (options: Record<string, string> = {}, keys?: string[]) => {
  const embed = new URL(embedUrl(undefined, 'all', base));
  for (const [key, value] of Object.entries({
    resources: 'parent',
    parentOrigin,
    ...options,
  }))
    embed.searchParams.set(key, value);
  const parent = new URL('/resources-parent', parentOrigin);
  parent.searchParams.set('embed', embed.href);
  if (keys !== undefined)
    parent.searchParams.set('keys', JSON.stringify(keys));
  return parent.href;
};
const sendResourceMessage = (page: Page, data: unknown) =>
  page.evaluate((message) => {
    document
      .querySelector('iframe')!
      .contentWindow!.postMessage(message, 'http://127.0.0.1:4186');
  }, data);

// Six connected nodes with long Korean titles reproduce the narrow blog panel.
const sixNodeFixture = () => {
  const value = structuredClone(fixture);
  value.documents = value.documents.slice(0, 4);
  value.documents[0].title = '물건쌓는겜 물리 구현';
  value.documents[0].links = value.documents
    .slice(1)
    .map((doc) => ({ target: `doc:${doc.id}`, type: 'related' }));
  for (const resource of value.resources) resource.documentIds = [documentId];
  return value;
};
const twoNodeFixture = () => {
  const value = structuredClone(fixture);
  value.documents = value.documents.slice(0, 2);
  value.documents[0].links = [
    { target: `doc:${value.documents[1].id}`, type: 'uses' },
  ];
  value.documents[1].links = [];
  value.resources = [];
  return value;
};

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
  await page.route('**/wiki.json', (route) =>
    route.fulfill({ json: { ...fixture, documents: [], resources: [] } }),
  );
  await page.goto(embedUrl(undefined, 'all', base));
  await expect(page.getByText('아직 공개된 문서가 없어요.')).toBeVisible();
  await page.unroute('**/wiki.json');
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
    await expect(node).toHaveAttribute('href', documentUrl(doc.id, wikiUrl));
    await expect(node).toHaveAttribute('target', '_top');
  }
});

test('unpublished, failed fetch and invalid public index have different states', async ({
  page,
}) => {
  await page.route('**/wiki.json', (route) => route.fulfill({ status: 404 }));
  await page.goto(embedUrl(undefined, 'all', base));
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
  const label = node.locator('.graph-label');
  if (info.project.name === 'mobile') await label.tap();
  else await label.click();
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
  await node.locator('.graph-label').click();
  await expect(page.locator('#blog-wiki')).toBeVisible();
  expect(page.url()).toBe(documentUrl(documentId, wikiUrl));
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('parent resources wait, time out to documents, and replace the complete allowlist on late messages', async ({
  page,
}) => {
  await fixtureRoute(page);
  const frozen = new Date('2026-10-07T00:00:00Z');
  await page.clock.install({ time: frozen });
  await page.clock.pauseAt(frozen);
  await page.goto(parentUrl());
  const frame = page.frameLocator('iframe');
  await expect(page.locator('#message')).toHaveText('amuwiki:ready');
  await expect(frame.getByText('문서를 불러오고 있어요.')).toBeVisible();
  await expect(frame.locator('.graph-node')).toHaveCount(0);
  await sendResourceMessage(page, {
    type: 'amuwiki:resources',
    keys: ['post:valid', 123],
  });
  await sendResourceMessage(page, { type: 'other', keys: resourceKeys });
  await page.clock.fastForward(3_999);
  await expect(frame.getByText('문서를 불러오고 있어요.')).toBeVisible();
  await page.clock.fastForward(1);
  await expect(frame.locator('.graph-node')).toHaveCount(5);
  await expect(
    frame.locator(
      '.graph-node[data-kind="post"], .graph-node[data-kind="asset"]',
    ),
  ).toHaveCount(0);
  await expect(frame.locator('.graph-edges line')).toHaveCount(4);
  await expect(frame.locator('select option')).toHaveCount(6);

  await sendResourceMessage(page, {
    type: 'amuwiki:resources',
    keys: [resourceKeys[0]],
  });
  await expect(frame.locator('.graph-node[data-kind="post"]')).toHaveCount(1);
  await expect(frame.locator('.graph-node[data-kind="asset"]')).toHaveCount(
    0,
  );
  await expect(frame.locator('.graph-edges line')).toHaveCount(5);
  await expect(frame.locator('select option')).toHaveCount(7);
  await sendResourceMessage(page, { type: 'amuwiki:resources', keys: [''] });
  await expect(frame.locator('.graph-node[data-kind="post"]')).toHaveCount(1);

  await sendResourceMessage(page, {
    type: 'amuwiki:resources',
    keys: [resourceKeys[1]],
  });
  await expect(frame.locator('.graph-node[data-kind="post"]')).toHaveCount(0);
  await expect(frame.locator('.graph-node[data-kind="asset"]')).toHaveCount(
    1,
  );
  await expect(frame.locator('.graph-edges line')).toHaveCount(5);
  await expect(frame.locator('select option')).toHaveCount(7);
  await sendResourceMessage(page, { type: 'amuwiki:resources', keys: [] });
  await expect(frame.locator('.graph-node')).toHaveCount(5);
  await expect(frame.locator('.graph-edges line')).toHaveCount(4);
  await expect(frame.locator('select option')).toHaveCount(6);
});

test('an immediate parent response enables resources and rejected resource focus stays missing', async ({
  page,
}) => {
  await fixtureRoute(page);
  await page.goto(parentUrl({ focus: resourceKeys[0], lang: 'en' }, []));
  const frame = page.frameLocator('iframe');
  await expect(page.locator('#message')).toHaveText('amuwiki:ready');
  await expect(
    frame.getByText('This item could not be found.'),
  ).toBeVisible();
  await expect(frame.locator('.graph-node')).toHaveCount(0);
  await sendResourceMessage(page, {
    type: 'amuwiki:resources',
    keys: resourceKeys,
  });
  await expect(frame.locator('.graph-node')).toHaveCount(7);
  await sendResourceMessage(page, { type: 'amuwiki:resources', keys: [] });
  await expect(
    frame.getByText('This item could not be found.'),
  ).toBeVisible();
  await page.goto(parentUrl({}, resourceKeys));
  await expect(
    page.frameLocator('iframe').locator('.graph-node'),
  ).toHaveCount(7);
});

test('an untrusted parent cannot release resources, and standalone embeds retain existing behavior', async ({
  page,
}) => {
  await fixtureRoute(page);
  const frozen = new Date('2026-10-07T00:00:00Z');
  await page.clock.install({ time: frozen });
  await page.clock.pauseAt(frozen);
  await page.goto(
    parentUrl({ parentOrigin: 'https://untrusted.example' }, resourceKeys),
  );
  const frame = page.frameLocator('iframe');
  await expect(frame.getByText('문서를 불러오고 있어요.')).toBeVisible();
  await sendResourceMessage(page, {
    type: 'amuwiki:resources',
    keys: resourceKeys,
  });
  await page.clock.fastForward(4_000);
  await expect(frame.locator('.graph-node')).toHaveCount(5);
  await expect(page.locator('#message')).toHaveText('대기');
  await page.goto(`${embedUrl(undefined, 'all', base)}&resources=parent`);
  await expect(page.locator('.graph-node')).toHaveCount(7);
});

for (const scope of ['local', 'all'] as const) {
  test(`198×240 ${scope} compact graph has readable one-line labels and screen-sized hit targets`, async ({
    page,
  }, info) => {
    const value = sixNodeFixture();
    await blogRoute(page);
    await page.route('**/wiki.json', (route) =>
      route.fulfill({ json: value }),
    );
    await page.setViewportSize({ width: 198, height: 240 });
    await page.goto(`${embedUrl(focus, scope, base)}&compact=1`);
    await expect(page.locator('.graph-node')).toHaveCount(6);
    await expect(page.locator('.graph-canvas')).toHaveAttribute(
      'viewBox',
      '0 0 198 240',
    );
    await expect(page.getByRole('combobox')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    const labels = await page
      .locator('.graph-label')
      .evaluateAll((elements) =>
        elements.map((element) => {
          const label = element as SVGTextElement;
          const box = label.getBoundingClientRect();
          const matrix = label.getScreenCTM()!;
          return {
            text: label.textContent!,
            lines: label.children.length,
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            fontSize:
              parseFloat(getComputedStyle(label).fontSize) *
              Math.hypot(matrix.a, matrix.b),
          };
        }),
      );
    for (const [i, label] of labels.entries()) {
      expect(Array.from(label.text).length).toBeLessThanOrEqual(9);
      expect(label.lines).toBe(1);
      expect(label.fontSize).toBeGreaterThanOrEqual(9.99);
      expect(label.fontSize).toBeLessThanOrEqual(11.01);
      expect(label.x).toBeGreaterThanOrEqual(0);
      expect(label.x + label.width).toBeLessThanOrEqual(198);
      expect(label.y).toBeGreaterThanOrEqual(0);
      expect(label.y + label.height).toBeLessThanOrEqual(198);
      for (const other of labels.slice(i + 1)) {
        const overlapWidth =
          Math.min(label.x + label.width, other.x + other.width) -
          Math.max(label.x, other.x);
        const overlapHeight =
          Math.min(label.y + label.height, other.y + other.height) -
          Math.max(label.y, other.y);
        expect(
          overlapWidth <= 0 || overlapHeight <= 0,
          `${label.text} overlaps ${other.text}`,
        ).toBe(true);
      }
    }
    await page.screenshot({
      path: evidence(`embed-198px-${scope}`, info.project.name),
      scale: 'css',
    });
    for (const zoom of ['100%', '80%', '100%']) {
      await expect(page.getByLabel('지도 배율')).toHaveText(zoom);
      for (const hit of await page.locator('.graph-node-hit').all()) {
        const box = await hit.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(27.99);
        expect(box!.height).toBeGreaterThanOrEqual(27.99);
      }
      if (zoom === '80%')
        await page
          .getByRole('button', { name: '지도 처음 위치', exact: true })
          .click();
      else
        await page
          .getByRole('button', { name: '지도 축소', exact: true })
          .click();
    }
    await page
      .getByRole('button', { name: '지도 처음 위치', exact: true })
      .click();
    const focused = page.getByRole('link', {
      name: `${value.documents[0].title} · 개념`,
      exact: true,
    });
    await expect(focused.locator('title')).toHaveText(
      `${value.documents[0].title} · 개념`,
    );
    if (info.project.name === 'mobile')
      await focused.locator('.graph-label').tap();
    else await focused.locator('.graph-label').click();
    await expect(page.locator('#blog-wiki')).toBeVisible();
    expect(page.url()).toBe(documentUrl(documentId, wikiUrl));
  });
}

test('341×240 two-node compact graph keeps every label above the map controls', async ({
  page,
}, info) => {
  // A phone-width map with few nodes reaches the largest compact scale, where
  // the label offset grows with the drawing and once slid under the controls.
  const value = twoNodeFixture();
  await blogRoute(page);
  await page.route('**/wiki.json', (route) =>
    route.fulfill({ json: value }),
  );
  await page.setViewportSize({ width: 341, height: 240 });
  await page.goto(`${embedUrl(focus, 'local', base)}&compact=1`);
  await expect(page.locator('.graph-node')).toHaveCount(2);
  await page.evaluate(() => document.fonts.ready);
  const controls = (await page.locator('.graph-controls').boundingBox())!;
  for (const label of await page.locator('.graph-label').all()) {
    const box = (await label.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(198);
    expect(box.y + box.height).toBeLessThanOrEqual(controls.y);
  }
  await page.screenshot({
    path: evidence('embed-341px-two-nodes', info.project.name),
    scale: 'css',
  });
});

test('1100×730 graph caps initial fit for one and two nodes and styles the English picker', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1100, height: 730 });
  for (const count of [1, 2]) {
    const value = structuredClone(fixture);
    value.documents = value.documents.slice(0, count);
    value.documents.forEach((doc) => {
      doc.links = [];
    });
    value.resources = [];
    await page.route('**/wiki.json', (route) =>
      route.fulfill({ json: value }),
    );
    await page.goto(`${embedUrl(focus, 'all', base)}&lang=en`);
    await expect(page.locator('.graph-node')).toHaveCount(count);
    await expect(page.locator('.graph-canvas')).toHaveAttribute(
      'viewBox',
      '0 0 1100 730',
    );
    await expect(page).toHaveTitle('Connection map · Cha Amu Wiki');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(
      page.getByRole('group', { name: 'Connection map', exact: true }),
    ).toBeVisible();
    const picker = page.getByRole('combobox', { name: 'Select a map item' });
    await expect(picker).toBeVisible();
    await expect(picker).toHaveCSS('appearance', 'none');
    await expect(picker).toHaveCSS('border-top-color', 'rgb(31, 31, 31)');
    await expect(picker).toHaveCSS('border-top-style', 'solid');
    for (const shape of await page.locator('.graph-node-shape').all()) {
      const box = await shape.boundingBox();
      expect(box!.width).toBeLessThanOrEqual(32);
      expect(box!.height).toBeLessThanOrEqual(32);
    }
    const fontSizes = await page
      .locator('.graph-label')
      .evaluateAll((labels) =>
        labels.map((element) => {
          const label = element as SVGTextElement;
          const matrix = label.getScreenCTM()!;
          return (
            parseFloat(getComputedStyle(label).fontSize) *
            Math.hypot(matrix.a, matrix.b)
          );
        }),
      );
    expect(fontSizes.every((size) => size <= 24)).toBe(true);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: evidence(`graph-1100px-${count}-nodes`, info.project.name),
      scale: 'css',
    });
    const canvas = page.getByRole('group', {
      name: 'Connection map',
      exact: true,
    });
    await canvas.focus();
    for (let i = 0; i < 9; i++) await page.keyboard.press('-');
    await expect(page.getByLabel('Map zoom')).toHaveText('20%');
    for (const hit of await page.locator('.graph-node-hit').all()) {
      expect((await hit.boundingBox())!.width).toBeGreaterThanOrEqual(27.99);
    }
    await page.unroute('**/wiki.json');
  }
});

test('English loading, retry and all index failures use the selected language', async ({
  page,
}) => {
  await page.route('**/wiki.json', (route) => route.fulfill({ status: 404 }));
  await page.goto(`${embedUrl(undefined, 'all', base)}&lang=en`);
  await expect(
    page.getByRole('heading', { name: 'Nothing has been published yet.' }),
  ).toBeVisible();
  await page.unroute('**/wiki.json');
  await page.route('**/wiki.json', (route) => route.fulfill({ status: 503 }));
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(
    page.getByRole('heading', { name: 'Could not load documents.' }),
  ).toBeVisible();
  await page.unroute('**/wiki.json');
  await page.route('**/wiki.json', (route) =>
    route.fulfill({ json: { invalid: true } }),
  );
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Could not read the published index.',
    }),
  ).toBeVisible();
  await page.unroute('**/wiki.json');
  await fixtureRoute(page);
  await page.goto(parentUrl({ lang: 'en' }));
  const frame = page.frameLocator('iframe');
  await expect(frame.getByText('Loading documents.')).toBeVisible();
  await sendResourceMessage(page, { type: 'amuwiki:resources', keys: [] });
  await expect(
    frame.getByRole('group', { name: 'Connection map', exact: true }),
  ).toBeVisible();
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
  expect(await node.locator('..').getAttribute('transform')).not.toBe(before);
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
  await page.screenshot({
    path: evidence('embed-190px', info.project.name),
  });
});

import { describe, expect, it } from 'vitest';
import { embedParentOrigin } from '../src/domain/embed';

const wiki = 'https://cha-amu.github.io/amuwiki/?embed=graph';
const blog = 'https://cha-amu.github.io/';
describe('embed Escape origin boundary', () => {
  it('uses the configured blog origin even with no referrer', () => {
    expect(embedParentOrigin(wiki, blog)).toBe('https://cha-amu.github.io');
    expect(embedParentOrigin(wiki, 'https://blog.example.com/notes/')).toBe(
      'https://blog.example.com',
    );
  });
  it('does not signal from a normal document or full graph page', () => {
    expect(
      embedParentOrigin('https://cha-amu.github.io/amuwiki/?view=graph', blog),
    ).toBeUndefined();
    expect(
      embedParentOrigin('https://cha-amu.github.io/amuwiki/#one', blog),
    ).toBeUndefined();
  });
  it('does not accept arbitrary parent origins in production', () => {
    expect(
      embedParentOrigin(`${wiki}&parentOrigin=https://untrusted.example`, blog),
    ).toBeUndefined();
    expect(
      embedParentOrigin(wiki, blog, 'https://untrusted.example/page'),
    ).toBeUndefined();
    expect(
      embedParentOrigin(`${wiki}&parentOrigin=http://localhost:5178`, blog),
    ).toBeUndefined();
  });
  it('allows a loopback-only parent query or referrer for cross-port QA', () => {
    expect(
      embedParentOrigin(
        'http://127.0.0.1:4174/amuwiki/?embed=graph&parentOrigin=http%3A%2F%2F127.0.0.1%3A5178',
        blog,
      ),
    ).toBe('http://127.0.0.1:5178');
    expect(
      embedParentOrigin(
        'http://localhost:4174/amuwiki/?embed=graph',
        blog,
        'http://127.0.0.1:5178/posts/',
      ),
    ).toBe('http://127.0.0.1:5178');
  });
  it.each([
    '*',
    'null',
    'javascript:alert(1)',
    'https://u:p@cha-amu.github.io',
    'https://cha-amu.github.io/path',
    'https://cha-amu.github.io/?other=1',
  ])('rejects malformed or non-origin parent input: %s', (parent) => {
    expect(
      embedParentOrigin(
        `${wiki}&parentOrigin=${encodeURIComponent(parent)}`,
        blog,
      ),
    ).toBeUndefined();
  });
  it('never expands the loopback allowance to lookalikes or arbitrary external sites', () => {
    expect(
      embedParentOrigin(
        'http://127.0.0.1:4174/amuwiki/?embed=graph&parentOrigin=https://evil.example',
        blog,
      ),
    ).toBeUndefined();
    expect(
      embedParentOrigin(
        'http://localhost.evil.example/amuwiki/?embed=graph&parentOrigin=http://localhost:5178',
        blog,
      ),
    ).toBeUndefined();
  });
});

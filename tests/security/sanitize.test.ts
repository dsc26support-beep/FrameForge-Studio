import { describe, expect, it } from 'vitest';
import { createProject } from '@frameforge/project-schema';
import { compileProjectHtml, sanitizeCss, sanitizeHtmlFragment } from '@frameforge/render-core';

describe('HTML/CSS sanitizer (malicious project HTML)', () => {
  const attacks = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<iframe src="https://evil.test"></iframe>',
    '<a href="javascript:alert(1)">x</a>',
    '<svg><script>alert(1)</script></svg>',
    '<svg onload=alert(1)></svg>',
    '<object data="x"></object><embed src="x">',
    '<form action="https://evil.test"><input></form>',
    '<link rel=stylesheet href="https://evil.test/a.css">',
    '<meta http-equiv="refresh" content="0;url=https://evil.test">',
    '<base href="https://evil.test/">',
    '<div style="background:url(https://evil.test/x)">x</div>',
    '<style>@import "https://evil.test/a.css";</style>',
    '<style>div{background:u\\72l(https://evil.test)}</style>',
    '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
    '<svg><use href="https://evil.test/a.svg#x"/></svg>',
    '<svg><foreignObject><div>x</div></foreignObject></svg>',
    '<template><script>1</script></template>',
    '<img src="https://evil.test/a.png">',
    '<img src="data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Pjwvc2NyaXB0Pjwvc3ZnPg==">',
  ];
  it.each(attacks)('neutralises %s', (attack) => {
    const { html } = sanitizeHtmlFragment(attack);
    expect(html).not.toMatch(
      /<script|<iframe|<object|<embed|<form|<link|<meta|<base|<use|foreignobject|onerror|onload|javascript:|https?:\/\/|@import|<math/i,
    );
  });

  it('keeps safe markup, class names and project asset references', () => {
    const { html } = sanitizeHtmlFragment('<div class="a b" style="color:#fff"><h1>Hi &amp; bye</h1><img src="asset:ast_1" alt="x"></div>');
    expect(html).toContain('class="a b"');
    expect(html).toContain('Hi &amp; bye');
    expect(html).toContain('src="asset:ast_1"');
  });

  it('removes CSS escapes, expression() and @font-face', () => {
    const w: string[] = [];
    const css = sanitizeCss('a{width:expression(alert(1))} @font-face{src:url(https://x)} b{c:\\75rl(x)}', w);
    expect(css).not.toMatch(/expression|font-face|https|\\/);
    expect(w.length).toBeGreaterThan(0);
  });

  it('compiled documents carry a restrictive CSP and only one script', () => {
    const p = createProject('S');
    p.scenes[0]!.mode = 'html';
    p.scenes[0]!.html = '<script>alert(1)</script><p>x</p>';
    const out = compileProjectHtml(p, { assetUrl: () => null, imgSrc: 'https://ff-assets.invalid', nonce: 'abc' });
    expect(out.html).toContain("default-src 'none'");
    expect(out.html).toContain("script-src 'nonce-abc'");
    expect(out.html.match(/<script/g)?.length).toBe(2); // JSON data block + runtime
    expect(out.html).not.toContain('alert(1)');
    expect(out.warnings.join()).toMatch(/script/);
  });

  it('escapes text so user text cannot inject markup', () => {
    const p = createProject('S');
    const el = p.scenes[0]!.elements[0]!;
    if (el.type === 'text') el.text = '</div><script>alert(1)</script>';
    const out = compileProjectHtml(p, { assetUrl: () => null, imgSrc: 'x', nonce: 'n' });
    expect(out.html).not.toContain('<script>alert');
    expect(out.html).toContain('&lt;script&gt;');
  });
});

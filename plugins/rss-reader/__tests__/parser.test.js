import { describe, it, expect } from 'vitest';
const { parseFeed } = require('../parser.js');

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
  <title><![CDATA[Demo Feed]]></title>
  <item><title>One</title><link>http://x/1</link><guid>1</guid><pubDate>Mon, 19 May 2026 00:00:00 GMT</pubDate><description><![CDATA[<p>hi</p>]]></description></item>
  <item><title>Two</title><link>http://x/2</link><guid>2</guid></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Demo</title>
  <entry><id>a1</id><title>A</title><link href="http://x/a"/><updated>2026-05-19T00:00:00Z</updated><summary>sum</summary></entry>
</feed>`;

describe('parseFeed', () => {
  it('parses RSS 2.0 with CDATA', () => {
    const f = parseFeed(RSS);
    expect(f.title).toBe('Demo Feed');
    expect(f.items).toHaveLength(2);
    expect(f.items[0].description).toContain('<p>hi</p>');
    expect(f.items[0].guid).toBe('1');
    expect(f.items[1].link).toBe('http://x/2');
  });
  it('parses Atom feeds', () => {
    const f = parseFeed(ATOM);
    expect(f.title).toBe('Atom Demo');
    expect(f.items[0].link).toBe('http://x/a');
    expect(f.items[0].guid).toBe('a1');
  });
  it('throws on garbage', () => {
    expect(() => parseFeed('<html/>')).toThrow();
  });
});

// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { nextLinkFromHeader } from '../../src/definition/link-header.js';
import { nextPage } from '../../src/definition/paginators.js';
import { stream } from './fixtures/streams.js';

const noHeaders = () => null;

function paginatorOf(paginator: Record<string, unknown>) {
  return stream({ paginator }).paginator;
}

function response(body: unknown, headers: Record<string, string> = {}) {
  return {
    body,
    header: (name: string) =>
      Object.entries(headers).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] ?? null,
  };
}

describe('nextPage', () => {
  it('none has no next page', () => {
    expect(nextPage(paginatorOf({ type: 'none' }), response({}), 3, null)).toEqual({ next: null });
  });

  describe('page_number', () => {
    const paginator = paginatorOf({
      type: 'page_number',
      param: 'page',
      in: 'query',
      start: 0,
      lastPagePointer: '/last_page',
    });

    it('advances from the start on the first page and from the current page after', () => {
      expect(nextPage(paginator, response({ last_page: false }), 2, null)).toEqual({
        next: { kind: 'token', value: '1' },
      });
      expect(nextPage(paginator, response({ last_page: false }), 2, '4')).toEqual({
        next: { kind: 'token', value: '5' },
      });
    });

    it('stops when the last-page flag is true', () => {
      expect(nextPage(paginator, response({ last_page: true }), 2, '4')).toEqual({ next: null });
    });

    it('stops on an empty page', () => {
      expect(nextPage(paginator, response({ last_page: false }), 0, '4')).toEqual({ next: null });
    });

    it('keeps going when the flag is absent', () => {
      expect(nextPage(paginator, response({}), 1, '1')).toEqual({
        next: { kind: 'token', value: '2' },
      });
    });
  });

  describe('cursor', () => {
    const paginator = paginatorOf({
      type: 'cursor',
      param: 'pageToken',
      in: 'query',
      nextPointer: '/nextPageToken',
    });

    it('returns the token at nextPointer', () => {
      expect(nextPage(paginator, response({ nextPageToken: 'abc' }), 1, null)).toEqual({
        next: { kind: 'token', value: 'abc' },
      });
    });

    it.each([
      ['absent', {}],
      ['null', { nextPageToken: null }],
      ['an empty string', { nextPageToken: '' }],
    ])('stops when the token is %s', (_label, body) => {
      expect(nextPage(paginator, response(body), 1, null)).toEqual({ next: null });
    });

    it('accepts a numeric token and ignores an object', () => {
      expect(nextPage(paginator, response({ nextPageToken: 7 }), 1, null)).toEqual({
        next: { kind: 'token', value: '7' },
      });
      expect(nextPage(paginator, response({ nextPageToken: { a: 1 } }), 1, null)).toEqual({
        next: null,
      });
    });
  });

  describe('offset', () => {
    const paginator = paginatorOf({
      type: 'offset',
      param: 'offset',
      limitParam: 'limit',
      in: 'query',
      limit: 50,
    });

    it('advances by the limit', () => {
      expect(nextPage(paginator, response({}), 50, null)).toEqual({
        next: { kind: 'token', value: '50' },
      });
      expect(nextPage(paginator, response({}), 50, '50')).toEqual({
        next: { kind: 'token', value: '100' },
      });
    });

    it('stops on a short page', () => {
      expect(nextPage(paginator, response({}), 49, '50')).toEqual({ next: null });
    });
  });

  describe('next_url', () => {
    const paginator = paginatorOf({ type: 'next_url', nextUrlPointer: '/@odata.nextLink' });

    it('returns the URL as is', () => {
      expect(
        nextPage(
          paginator,
          response({ '@odata.nextLink': 'https://api.example.test/p2' }),
          1,
          null,
        ),
      ).toEqual({ next: { kind: 'url', url: 'https://api.example.test/p2' } });
    });

    it('stops when the link is absent, null or empty', () => {
      for (const body of [{}, { '@odata.nextLink': null }, { '@odata.nextLink': '' }]) {
        expect(nextPage(paginator, response(body), 1, null)).toEqual({ next: null });
      }
    });
  });

  describe('link_header', () => {
    const paginator = paginatorOf({ type: 'link_header' });

    it('follows rel="next" and ignores rel="prev"', () => {
      const headers = {
        Link: '<https://api.example.test/p1>; rel="prev", <https://api.example.test/p3>; rel="next"',
      };
      expect(nextPage(paginator, response({}, headers), 1, null)).toEqual({
        next: { kind: 'url', url: 'https://api.example.test/p3' },
      });
    });

    it('stops without a next link', () => {
      expect(
        nextPage(paginator, response({}, { Link: '<https://x.test/p1>; rel="prev"' }), 1, null),
      ).toEqual({ next: null });
      expect(nextPage(paginator, { body: {}, header: noHeaders }, 1, null)).toEqual({ next: null });
    });
  });
});

describe('nextLinkFromHeader', () => {
  it('returns null for an absent header', () => {
    expect(nextLinkFromHeader(null)).toBeNull();
  });

  it('reads a quoted rel', () => {
    expect(nextLinkFromHeader('<https://a.test/2>; rel="next"')).toBe('https://a.test/2');
  });

  it('reads an unquoted rel', () => {
    expect(nextLinkFromHeader('<https://a.test/2>; rel=next')).toBe('https://a.test/2');
  });

  it('picks the next link among several, whatever the order', () => {
    const value =
      '<https://a.test/1>; rel="first", <https://a.test/9>; rel="last", <https://a.test/3>; rel="next"';
    expect(nextLinkFromHeader(value)).toBe('https://a.test/3');
    expect(
      nextLinkFromHeader('<https://a.test/3>; rel="next", <https://a.test/1>; rel="prev"'),
    ).toBe('https://a.test/3');
  });

  it('finds next in a multi-valued rel', () => {
    expect(nextLinkFromHeader('<https://a.test/3>; rel="next last"')).toBe('https://a.test/3');
  });

  it('keeps a comma inside the URL', () => {
    expect(nextLinkFromHeader('<https://a.test/p?x=1,2>; rel="next"')).toBe(
      'https://a.test/p?x=1,2',
    );
  });

  it('does not take a title or other parameter for the rel', () => {
    expect(nextLinkFromHeader('<https://a.test/3>; title="next"; rel="prev"')).toBeNull();
  });

  it.each(['', 'garbage', '<https://a.test/3', 'https://a.test/3; rel="next"', '<>; rel="next"'])(
    'returns null for the malformed value %j',
    (value) => {
      expect(nextLinkFromHeader(value)).toBeNull();
    },
  );
});

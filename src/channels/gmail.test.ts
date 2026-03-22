import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock registry (registerChannel runs at import time)
vi.mock('./registry.js', () => ({ registerChannel: vi.fn() }));

import { GmailChannel, GmailChannelOpts } from './gmail.js';

function makeOpts(overrides?: Partial<GmailChannelOpts>): GmailChannelOpts {
  return {
    onMessage: vi.fn(),
    onChatMetadata: vi.fn(),
    registeredGroups: () => ({}),
    ...overrides,
  };
}

describe('GmailChannel', () => {
  let channel: GmailChannel;

  beforeEach(() => {
    channel = new GmailChannel(makeOpts());
  });

  describe('ownsJid', () => {
    it('returns true for gmail: prefixed JIDs', () => {
      expect(channel.ownsJid('gmail:abc123')).toBe(true);
      expect(channel.ownsJid('gmail:thread-id-456')).toBe(true);
    });

    it('returns false for non-gmail JIDs', () => {
      expect(channel.ownsJid('12345@g.us')).toBe(false);
      expect(channel.ownsJid('tg:123')).toBe(false);
      expect(channel.ownsJid('dc:456')).toBe(false);
      expect(channel.ownsJid('user@s.whatsapp.net')).toBe(false);
    });
  });

  describe('name', () => {
    it('is gmail', () => {
      expect(channel.name).toBe('gmail');
    });
  });

  describe('isConnected', () => {
    it('returns false before connect', () => {
      expect(channel.isConnected()).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('sets connected to false', async () => {
      await channel.disconnect();
      expect(channel.isConnected()).toBe(false);
    });
  });

  describe('extractTextBody', () => {
    function callExtract(payload: unknown): string {
      return (
        channel as unknown as {
          extractTextBody: (p: unknown) => string;
        }
      ).extractTextBody(payload);
    }

    it('extracts text/plain body', () => {
      const payload = {
        mimeType: 'text/plain',
        body: { data: Buffer.from('Hello world').toString('base64') },
      };
      expect(callExtract(payload)).toBe('Hello world');
    });

    it('extracts text/html body when no text/plain', () => {
      const payload = {
        mimeType: 'text/html',
        body: {
          data: Buffer.from('<p>Hello <b>world</b></p>').toString('base64'),
        },
      };
      expect(callExtract(payload)).toBe('Hello world');
    });

    it('prefers text/plain over text/html in multipart', () => {
      const payload = {
        mimeType: 'multipart/alternative',
        parts: [
          {
            mimeType: 'text/plain',
            body: { data: Buffer.from('Plain text').toString('base64') },
          },
          {
            mimeType: 'text/html',
            body: {
              data: Buffer.from('<p>HTML text</p>').toString('base64'),
            },
          },
        ],
      };
      expect(callExtract(payload)).toBe('Plain text');
    });

    it('falls back to text/html in multipart when no text/plain', () => {
      const payload = {
        mimeType: 'multipart/alternative',
        parts: [
          {
            mimeType: 'text/html',
            body: {
              data: Buffer.from('<div>Only HTML</div>').toString('base64'),
            },
          },
        ],
      };
      expect(callExtract(payload)).toBe('Only HTML');
    });

    it('strips style and script tags from HTML', () => {
      const html =
        '<style>body{color:red}</style><script>alert(1)</script><p>Content</p>';
      const payload = {
        mimeType: 'text/html',
        body: { data: Buffer.from(html).toString('base64') },
      };
      expect(callExtract(payload)).toBe('Content');
    });

    it('converts HTML entities', () => {
      const html = '<p>A &amp; B &lt; C &gt; D &quot;E&quot; &#39;F&#39;</p>';
      const payload = {
        mimeType: 'text/html',
        body: { data: Buffer.from(html).toString('base64') },
      };
      expect(callExtract(payload)).toBe('A & B < C > D "E" \'F\'');
    });

    it('returns empty string for undefined payload', () => {
      expect(callExtract(undefined)).toBe('');
    });
  });

  describe('constructor options', () => {
    it('accepts custom poll interval', () => {
      const ch = new GmailChannel(makeOpts(), 30000);
      expect(ch.name).toBe('gmail');
    });

    it('defaults to unread query when no filter configured', () => {
      const ch = new GmailChannel(makeOpts());
      const query = (
        ch as unknown as { buildQuery: () => string }
      ).buildQuery();
      expect(query).toBe('is:unread category:primary');
    });

    it('defaults with no options provided', () => {
      const ch = new GmailChannel(makeOpts());
      expect(ch.name).toBe('gmail');
    });
  });
});

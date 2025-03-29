import * as urlUtils from '../../../src/url-utils';
import { TEST_VIDEO_ID } from '../../mocks';

describe('url-utils', () => {
  describe('getVideoID', () => {
    it('should extract video ID from full YouTube URL', () => {
      const url = `https://www.youtube.com/watch?v=${TEST_VIDEO_ID}`;
      expect(urlUtils.getVideoID(url)).toBe(TEST_VIDEO_ID);
    });

    it('should extract video ID from youtu.be shortlink', () => {
      const url = `https://youtu.be/${TEST_VIDEO_ID}`;
      expect(urlUtils.getVideoID(url)).toBe(TEST_VIDEO_ID);
    });

    it('should extract video ID from embed URL', () => {
      const url = `https://www.youtube.com/embed/${TEST_VIDEO_ID}`;
      expect(urlUtils.getVideoID(url)).toBe(TEST_VIDEO_ID);
    });

    it('should extract video ID from URL with time parameter', () => {
      const url = `https://www.youtube.com/watch?v=${TEST_VIDEO_ID}&t=30s`;
      expect(urlUtils.getVideoID(url)).toBe(TEST_VIDEO_ID);
    });

    it('should extract video ID from list URL', () => {
      const url = `https://www.youtube.com/watch?v=${TEST_VIDEO_ID}&list=PL123`;
      expect(urlUtils.getVideoID(url)).toBe(TEST_VIDEO_ID);
    });

    it('should extract video ID from music.youtube.com URL', () => {
      const url = `https://music.youtube.com/watch?v=${TEST_VIDEO_ID}`;
      expect(urlUtils.getVideoID(url)).toBe(TEST_VIDEO_ID);
    });

    it('should work with video ID directly', () => {
      expect(urlUtils.getVideoID(TEST_VIDEO_ID)).toBe(TEST_VIDEO_ID);
    });

    it('should throw error for invalid YouTube URL', () => {
      expect(() => urlUtils.getVideoID('https://example.com')).toThrow('Not a YouTube domain');
    });

    it('should throw error for invalid playlist URL without video ID', () => {
      expect(() => urlUtils.getVideoID('https://www.youtube.com/playlist?list=PL123')).toThrow('No video id found');
    });
  });

  describe('validateID', () => {
    it('should return true for a valid video ID', () => {
      expect(urlUtils.validateID(TEST_VIDEO_ID)).toBe(true);
    });

    it('should return false for an invalid video ID', () => {
      expect(urlUtils.validateID('invalid')).toBe(false);
    });

    it('should return false for an empty string', () => {
      expect(urlUtils.validateID('')).toBe(false);
    });

    it('should return false for a video ID that is too short', () => {
      expect(urlUtils.validateID('abc')).toBe(false);
    });

    it('should return false for a video ID that is too long', () => {
      expect(urlUtils.validateID('a'.repeat(20))).toBe(false);
    });
  });

  describe('validateURL', () => {
    it('should return true for a valid watch URL', () => {
      const url = `https://www.youtube.com/watch?v=${TEST_VIDEO_ID}`;
      expect(urlUtils.validateURL(url)).toBe(true);
    });

    it('should return true for a valid short URL', () => {
      const url = `https://youtu.be/${TEST_VIDEO_ID}`;
      expect(urlUtils.validateURL(url)).toBe(true);
    });

    it('should return true for a valid embed URL', () => {
      const url = `https://www.youtube.com/embed/${TEST_VIDEO_ID}`;
      expect(urlUtils.validateURL(url)).toBe(true);
    });

    it('should return true for a valid music.youtube.com URL', () => {
      const url = `https://music.youtube.com/watch?v=${TEST_VIDEO_ID}`;
      expect(urlUtils.validateURL(url)).toBe(true);
    });

    it('should return false for a non-YouTube URL', () => {
      expect(urlUtils.validateURL('https://example.com')).toBe(false);
    });

    it('should return false for an invalid YouTube URL', () => {
      expect(urlUtils.validateURL('https://youtube.com/invalid')).toBe(false);
    });

    it('should return false for a YouTube playlist URL', () => {
      expect(urlUtils.validateURL('https://www.youtube.com/playlist?list=PL123')).toBe(false);
    });

    it('should return false for non-URL strings', () => {
      expect(urlUtils.validateURL('not a url')).toBe(false);
    });
  });
});
/**
 * Utility functions for YouTube URL parsing and validation
 */

/**
 * Valid domains that can be used in youtube.com/watch?v= format
 */
const validQueryDomains: Set<string> = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'gaming.youtube.com',
]);

/**
 * Valid domains for youtu.be/ID and youtube.com/(embed|v|shorts|live)/ID formats
 */
const validPathDomains = /^https?:\/\/(youtu\.be\/|(www\.)?youtube\.com\/(embed|v|shorts|live)\/)/;

/**
 * Regex for valid YouTube video IDs
 */
const idRegex = /^[a-zA-Z0-9-_]{11}$/;

/**
 * Regex to test if a string is a URL
 */
const urlRegex = /^https?:\/\//;

/**
 * Get video ID from a YouTube URL.
 *
 * There are a few types of video URL formats:
 *  - https://www.youtube.com/watch?v=VIDEO_ID
 *  - https://m.youtube.com/watch?v=VIDEO_ID
 *  - https://youtu.be/VIDEO_ID
 *  - https://www.youtube.com/v/VIDEO_ID
 *  - https://www.youtube.com/embed/VIDEO_ID
 *  - https://music.youtube.com/watch?v=VIDEO_ID
 *  - https://gaming.youtube.com/watch?v=VIDEO_ID
 *
 * @param link - A YouTube URL
 * @returns The video ID extracted from the URL
 * @throws {Error} If unable to find an ID
 * @throws {TypeError} If video ID doesn't match expected format
 */
export const getURLVideoID = (link: string): string => {
  const parsed = new URL(link.trim());
  let id = parsed.searchParams.get('v');

  if (validPathDomains.test(link.trim()) && !id) {
    const paths = parsed.pathname.split('/');
    id = parsed.host === 'youtu.be' ? paths[1] : paths[2];
  } else if (parsed.hostname && !validQueryDomains.has(parsed.hostname)) {
    throw new Error('Not a YouTube domain');
  }

  if (!id) {
    throw new Error(`No video id found: "${link}"`);
  }

  id = id.substring(0, 11);

  if (!validateID(id)) {
    throw new TypeError(`Video id (${id}) does not match expected format (${idRegex.toString()})`);
  }

  return id;
};

/**
 * Gets video ID either from a URL or by checking if the given string
 * matches the video ID format.
 *
 * @param str - A YouTube URL or video ID
 * @returns The extracted video ID
 * @throws {Error} If unable to find an ID
 * @throws {TypeError} If video ID doesn't match expected format
 */
export const getVideoID = (str: string): string => {
  if (validateID(str)) {
    return str;
  } else if (urlRegex.test(str.trim())) {
    return getURLVideoID(str);
  } else {
    throw new Error(`No video id found: ${str}`);
  }
};

/**
 * Returns true if the given ID satisfies YouTube's ID format.
 *
 * @param id - A string to check if it's a valid YouTube video ID
 * @returns Whether the ID is valid
 */
export const validateID = (id: string): boolean => idRegex.test(id.trim());

/**
 * Checks whether the input string includes a valid YouTube video ID.
 *
 * @param string - A string to check if it contains a valid YouTube video ID
 * @returns Whether the string contains a valid YouTube video ID
 */
export const validateURL = (string: string): boolean => {
  try {
    getURLVideoID(string);
    return true;
  } catch (e) {
    return false;
  }
};

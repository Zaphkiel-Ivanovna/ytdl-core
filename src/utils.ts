import { request as undiciRequest } from 'undici';
import { writeFileSync } from 'fs';
import * as AGENT from './agent';
import type { Agent } from './agent';
import pkg from '../package.json';

/**
 * Custom error for unrecoverable errors
 */
class UnrecoverableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnrecoverableError';
  }
}

/**
 * Interface for escaping sequences used in JS parsing
 */
interface EscapingSequence {
  start: string;
  end: string;
  startPrefix?: RegExp;
}

/**
 * Options for making requests
 */
export interface RequestOptions {
  requestOptions: {
    headers: Record<string, string>;
    query?: Record<string, string>;
    localAddress?: string;
    dispatcher?: any;
    [key: string]: any;
  };
  rewriteRequest?: (url: string, requestOptions: any) => { url?: string; requestOptions?: any };
  fetch?: (url: string, requestOptions: any) => Promise<Response>;
  agent?: Agent;
  IPv6Block?: string;
  lang?: string;
  playerClients?: Array<'WEB_EMBEDDED' | 'TV' | 'IOS' | 'ANDROID' | 'WEB'>;
}

/**
 * YouTube player response interface
 */
interface PlayerResponse {
  playabilityStatus?: {
    status?: string;
    reason?: string;
    messages?: string[];
  };
  [key: string]: any;
}

/**
 * Extract string between two delimiters.
 *
 * @param haystack - The string to search in
 * @param left - The string or regex that precedes the desired substring
 * @param right - The string that follows the desired substring
 * @returns The string between left and right, or empty string if not found
 */
export const between = (haystack: string, left: string | RegExp, right: string): string => {
  let startPos: number;

  if (left instanceof RegExp) {
    const match = haystack.match(left);

    if (!match || match.index === undefined) return '';
    startPos = match.index + match[0].length;
  } else {
    startPos = haystack.indexOf(left);

    if (startPos === -1) return '';
    startPos += left.length;
  }

  const subStr = haystack.slice(startPos);

  const endPos = subStr.indexOf(right);

  if (endPos === -1) return '';

  return subStr.slice(0, endPos);
};

/**
 * Try to parse JSON data between two strings
 *
 * @param body - The string to search in
 * @param left - The string that precedes the JSON
 * @param right - The string that follows the JSON
 * @param prepend - String to prepend to the extracted data before parsing
 * @param append - String to append to the extracted data before parsing
 * @returns Parsed JSON object or null if parsing fails
 */
export const tryParseBetween = (body: string, left: string | RegExp, right: string, prepend = '', append = ''): any => {
  try {
    const data = between(body, left, right);
    if (!data) return null;
    return JSON.parse(`${prepend}${data}${append}`);
  } catch (e) {
    return null;
  }
};

/**
 * Convert an abbreviated number string to a full number.
 *
 * @param string - The abbreviated number string (e.g., "15K", "2.5M")
 * @returns The number as a regular number, or null if parsing fails
 */
export const parseAbbreviatedNumber = (string: string): number | null => {
  const normalized = string.replace(',', '.').replace(/\s+/g, '');

  const match = normalized.match(/([\d.]+)([MK]?)/i);

  if (!match) return null;

  const [, numStr, multiplier] = match;
  const num = parseFloat(numStr);

  const multipliers: Record<string, number> = {
    K: 1000,
    k: 1000,
    M: 1000000,
    m: 1000000,
  };

  const factor = multiplier ? multipliers[multiplier] || 1 : 1;

  return Math.round(num * factor);
};

/**
 * Escape sequences for cutAfterJS
 */
const ESCAPING_SEQUENZES: EscapingSequence[] = [
  { start: '"', end: '"' },
  { start: "'", end: "'" },
  { start: '`', end: '`' },

  { start: '/', end: '/', startPrefix: /(^|[[{:;,/])\s?$/ },
];

/**
 * Extract valid JSON by matching begin and end braces of input string.
 * Handles nested objects, strings, regex patterns, and escaped characters.
 *
 * @param mixedJson - The string containing JSON with potential trailing content
 * @returns Clean JSON string with matching braces
 * @throws Error if JSON is invalid or has unmatched braces
 */
export const cutAfterJS = (mixedJson: string): string => {
  const firstChar = mixedJson[0];

  if (firstChar !== '[' && firstChar !== '{') {
    throw new Error(`Invalid JSON: must begin with [ or { but got: ${firstChar}`);
  }

  const open = firstChar;
  const close = firstChar === '[' ? ']' : '}';

  let isEscapedObject: EscapingSequence | null = null;
  let isEscaped = false;
  let bracketCount = 0;

  for (let i = 0; i < mixedJson.length; i++) {
    const char = mixedJson[i];

    if (!isEscaped && isEscapedObject !== null && char === isEscapedObject.end) {
      isEscapedObject = null;
      continue;
    }

    if (!isEscaped && isEscapedObject === null) {
      for (const escapeSeq of ESCAPING_SEQUENZES) {
        if (char !== escapeSeq.start) continue;

        if (!escapeSeq.startPrefix || mixedJson.substring(Math.max(0, i - 10), i).match(escapeSeq.startPrefix)) {
          isEscapedObject = escapeSeq;
          break;
        }
      }

      if (isEscapedObject !== null) continue;
    }

    isEscaped = char === '\\' && !isEscaped;

    if (isEscapedObject !== null) continue;

    if (char === open) {
      bracketCount++;
    } else if (char === close) {
      bracketCount--;
    }

    if (bracketCount === 0) {
      return mixedJson.substring(0, i + 1);
    }
  }

  throw new Error('Invalid JSON: no matching closing bracket found');
};

/**
 * Checks if there is a playability error.
 *
 * @param player_response - The player response object from YouTube
 * @returns An error if there's a playability issue, or null if no issues
 */
export const playError = (player_response?: PlayerResponse): Error | null => {
  const playability = player_response?.playabilityStatus;
  if (!playability) return null;

  if (['ERROR', 'LOGIN_REQUIRED'].includes(playability.status || '')) {
    return new UnrecoverableError(
      playability.reason || (playability.messages && playability.messages[0]) || 'Unknown error',
    );
  }

  if (playability.status === 'LIVE_STREAM_OFFLINE') {
    return new UnrecoverableError(playability.reason || 'The live stream is offline.');
  }

  if (playability.status === 'UNPLAYABLE') {
    return new UnrecoverableError(playability.reason || 'This video is unavailable.');
  }

  return null;
};

/**
 * Makes a fetch request using the fetch API
 */
const useFetch = async (
  fetch: (url: string, requestOptions: any) => Promise<Response>,
  url: string,
  requestOptions: any,
): Promise<{ body: any; statusCode: number; headers: Record<string, string> }> => {
  const query = requestOptions.query;
  if (query) {
    const urlObject = new URL(url);
    for (const key in query) {
      urlObject.searchParams.append(key, String(query[key]));
    }
    url = urlObject.toString();
  }

  const response = await fetch(url, requestOptions);

  const statusCode = response.status;
  const body = Object.assign(response, response.body || {});
  const headers = Object.fromEntries(response.headers.entries());

  return { body, statusCode, headers };
};

/**
 * Make an HTTP request with error handling and redirection support
 */
export const request = async (url: string, options: Partial<RequestOptions> = {}): Promise<any> => {
  let { requestOptions = {} } = options;
  const { rewriteRequest, fetch } = options;

  if (typeof rewriteRequest === 'function') {
    const rewritten = rewriteRequest(url, requestOptions);
    requestOptions = rewritten.requestOptions || requestOptions;
    url = rewritten.url || url;
  }

  const req =
    typeof fetch === 'function' ? await useFetch(fetch, url, requestOptions) : await undiciRequest(url, requestOptions);

  const code = req.statusCode.toString();

  if (code.startsWith('2')) {
    if (req.headers['content-type']?.includes('application/json')) {
      return req.body.json();
    }
    return req.body.text();
  }

  if (code.startsWith('3') && req.headers.location) {
    const location = Array.isArray(req.headers.location) ? req.headers.location[0] : req.headers.location;
    return request(location, options);
  }

  const e: Error & { statusCode?: number } = new Error(`Status code: ${code}`);
  e.statusCode = req.statusCode;
  throw e;
};

/**
 * Temporary helper to help deprecating a few properties.
 */
export const deprecate = <T>(
  obj: Record<string, any>,
  prop: string,
  value: T,
  oldPath: string,
  newPath: string,
): void => {
  Object.defineProperty(obj, prop, {
    get: () => {
      console.warn(`\`${oldPath}\` will be removed in a near future release, use \`${newPath}\` instead.`);
      return value;
    },
  });
};

const UPDATE_INTERVAL = 1000 * 60 * 60 * 12;
let updateWarnTimes = 0;
export let lastUpdateCheck = 0;

/**
 * Checks for updates to the package
 */
export const checkForUpdates = (): Promise<void> | null => {
  if (
    !process.env.YTDL_NO_UPDATE &&
    !pkg.version.startsWith('0.0.0-') &&
    Date.now() - lastUpdateCheck >= UPDATE_INTERVAL
  ) {
    lastUpdateCheck = Date.now();
    return request('https://api.github.com/repos/distubejs/ytdl-core/contents/package.json', {
      requestOptions: {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.3',
        },
      },
    }).then(
      (response: { content: string; encoding: string }) => {
        const buf = Buffer.from(response.content, response.encoding as BufferEncoding);
        const pkgFile = JSON.parse(buf.toString('ascii'));
        if (pkgFile.version !== pkg.version && updateWarnTimes++ < 5) {
          console.warn(
            '\x1b[33mWARNING:\x1B[0m @distube/ytdl-core is out of date! Update with "npm install @distube/ytdl-core@latest".',
          );
        }
      },
      (err: Error) => {
        console.warn('Error checking for updates:', err.message);
        console.warn('You can disable this check by setting the `YTDL_NO_UPDATE` env variable.');
      },
    );
  }
  return null;
};

/**
 * Validates if a string is a valid IPv6 address
 */
const isIPv6 = (ip: string): boolean => {
  const IPV6_REGEX =
    /^(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?:(?::[0-9a-fA-F]{1,4}){1,6})|:(?:(?::[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(?::[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(?:ffff(?::0{1,4}){0,1}:){0,1}(?:(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9])|(?:[0-9a-fA-F]{1,4}:){1,4}:(?:(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9]))(?:\/(?:1[0-1][0-9]|12[0-8]|[1-9][0-9]|[1-9]))?$/;
  return IPV6_REGEX.test(ip);
};

/**
 * Normalizes an IPv6 address into an array of 8 integers.
 * Handles abbreviated IPv6 notation with :: correctly.
 *
 * @param ip - The IPv6 address to normalize
 * @returns An array of 8 integers representing the IPv6 address
 */
const normalizeIP = (ip: string): number[] => {
  const parts = ip.split('::');

  const leftParts = parts[0] ? parts[0].split(':') : [];
  const rightParts = parts[1] ? parts[1].split(':') : [];

  const missingGroups = 8 - (leftParts.length + rightParts.length);

  const fullGroups = [...leftParts, ...Array(missingGroups).fill('0'), ...rightParts];

  return fullGroups.map(part => parseInt(part || '0', 16));
};

/**
 * Generates a random IPv6 address within a specified CIDR block.
 *
 * @param cidr - The IPv6 block in CIDR notation (e.g., "2001:db8::/64")
 * @returns A random IPv6 address within the given block
 * @throws Error if IP format or subnet mask is invalid
 */
const getRandomIPv6 = (cidr: string): string => {
  if (!isIPv6(cidr)) {
    throw new Error('Invalid IPv6 format');
  }

  const [baseAddress, prefixString] = cidr.split('/');
  const prefixLength = parseInt(prefixString, 10);

  if (isNaN(prefixLength) || prefixLength < 1 || prefixLength > 128) {
    throw new Error('Invalid IPv6 subnet mask (must be between 1 and 128)');
  }

  const numericAddress = normalizeIP(baseAddress);

  const fixedGroups = Math.floor(prefixLength / 16);
  const partialBits = prefixLength % 16;

  const randomAddress = new Array(8);

  for (let i = 0; i < 8; i++) {
    if (i < fixedGroups) {
      randomAddress[i] = numericAddress[i];
    } else if (i === fixedGroups && partialBits > 0) {
      const maskBits = 0xffff << (16 - partialBits);
      const fixedPart = numericAddress[i] & maskBits;
      const randomPart = Math.floor(Math.random() * (1 << (16 - partialBits)));
      randomAddress[i] = fixedPart | randomPart;
    } else {
      randomAddress[i] = Math.floor(Math.random() * 0x10000);
    }
  }

  return randomAddress.map(x => x.toString(16).padStart(4, '0')).join(':');
};

/**
 * Saves debug information to a file
 */
export const saveDebugFile = (name: string, body: string): string => {
  const filename = `${+new Date()}-${name}`;
  writeFileSync(filename, body);
  return filename;
};

/**
 * Finds a property key in an object case-insensitively.
 *
 * @param obj - The object to search in
 * @param prop - The property name to find (case-insensitive)
 * @returns The actual property name if found, or null if not found
 */
const findPropKeyInsensitive = (obj: Record<string, any>, prop: string): string | null => {
  if (!obj || !prop) return null;

  const lowerProp = prop.toLowerCase();

  return Object.keys(obj).find(key => key.toLowerCase() === lowerProp) || null;
};

/**
 * Gets a property value from an object using case-insensitive key matching.
 *
 * @param obj - The object to get the property from
 * @param prop - The property name to find (case-insensitive)
 * @returns The property value if found, or undefined if not found
 */
export const getPropInsensitive = (obj: Record<string, any>, prop: string): any => {
  if (!obj) return undefined;

  const actualKey = findPropKeyInsensitive(obj, prop);
  return actualKey !== null ? obj[actualKey] : undefined;
};

/**
 * Sets a property in an object using case-insensitive key matching.
 * If the property is found (case-insensitive), updates the existing property.
 * Otherwise, creates a new property with the specified name.
 *
 * @param obj - The object to set the property on
 * @param prop - The property name to find or create
 * @param value - The value to set
 * @returns The actual key that was used (found or created), or null if obj is invalid
 */
export const setPropInsensitive = (obj: Record<string, any>, prop: string, value: any): string | null => {
  if (!obj || !prop) return null;

  const actualKey = findPropKeyInsensitive(obj, prop);
  const keyToUse = actualKey || prop;

  obj[keyToUse] = value;
  return keyToUse;
};

let oldCookieWarning = true;
let oldDispatcherWarning = true;

/**
 * Applies default agent to options if none provided
 */
export const applyDefaultAgent = (options: RequestOptions): void => {
  if (!options.agent) {
    const { jar } = AGENT.defaultAgent;
    const c = getPropInsensitive(options.requestOptions.headers, 'cookie');
    if (c) {
      jar.removeAllCookiesSync();
      AGENT.addCookiesFromString(jar, String(c));
      if (oldCookieWarning) {
        oldCookieWarning = false;
        console.warn(
          '\x1b[33mWARNING:\x1B[0m Using old cookie format, ' +
            'please use the new one instead. (https://github.com/distubejs/ytdl-core#cookies-support)',
        );
      }
    }
    if (options.requestOptions.dispatcher && oldDispatcherWarning) {
      oldDispatcherWarning = false;
      console.warn(
        '\x1b[33mWARNING:\x1B[0m Your dispatcher is overridden by `ytdl.Agent`. ' +
          'To implement your own, check out the documentation. ' +
          '(https://github.com/distubejs/ytdl-core#how-to-implement-ytdlagent-with-your-own-dispatcher)',
      );
    }
    options.agent = AGENT.defaultAgent;
  }
};

let oldLocalAddressWarning = true;

/**
 * Applies old local address option to maintain backward compatibility
 */
export const applyOldLocalAddress = (options?: RequestOptions): void => {
  if (!options?.requestOptions?.localAddress || options.requestOptions.localAddress === options.agent?.localAddress) {
    return;
  }

  options.agent = AGENT.createAgent([], { localAddress: options.requestOptions.localAddress });

  if (oldLocalAddressWarning) {
    oldLocalAddressWarning = false;
    console.warn(
      '\x1b[33mWARNING:\x1B[0m Using old localAddress option, ' +
        'please add it to the agent options instead. (https://github.com/distubejs/ytdl-core#ip-rotation)',
    );
  }
};

let oldIpRotationsWarning = true;

/**
 * Applies IPv6 rotations for IP rotation
 */
export const applyIPv6Rotations = (options: RequestOptions): void => {
  if (options.IPv6Block) {
    options.requestOptions = {
      ...options.requestOptions,
      localAddress: getRandomIPv6(options.IPv6Block),
    };

    if (oldIpRotationsWarning) {
      oldIpRotationsWarning = false;
      oldLocalAddressWarning = false;
      console.warn(
        '\x1b[33mWARNING:\x1B[0m IPv6Block option is deprecated, ' +
          'please create your own ip rotation instead. (https://github.com/distubejs/ytdl-core#ip-rotation)',
      );
    }
  }
};

/**
 * Applies default headers to request options
 */
export const applyDefaultHeaders = (options: RequestOptions): void => {
  options.requestOptions = { ...options.requestOptions };
  options.requestOptions.headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.101 Safari/537.36',
    ...options.requestOptions.headers,
  };
};

/**
 * Generates a client playback nonce (CPN) for tracking video playback.
 * Creates a random string using characters from the Base64URL character set.
 *
 * @param length - The desired length of the nonce string
 * @returns A random string of the specified length
 */
export const generateClientPlaybackNonce = (length: number): string => {
  const BASE64_URL_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const charCount = BASE64_URL_CHARS.length;

  const result = new Array(length);

  for (let i = 0; i < length; i++) {
    result[i] = BASE64_URL_CHARS.charAt(Math.floor(Math.random() * charCount));
  }

  return result.join('');
};

/**
 * Applies default player clients if none provided
 */
export const applyPlayerClients = (options: RequestOptions): void => {
  if (!options.playerClients || options.playerClients.length === 0) {
    options.playerClients = ['WEB_EMBEDDED', 'IOS', 'ANDROID', 'TV'];
  }
};

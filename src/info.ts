/* eslint-disable no-unused-vars */
import sax from 'sax';

import * as utils from './utils';
import { setTimeout } from 'timers';
import * as formatUtils from './format-utils';
import { VideoFormat } from './format-utils';
import * as urlUtils from './url-utils';
import * as extras from './info-extras';
import Cache from './cache';
import * as sig from './sig';
import { RequestOptions } from './utils';

const BASE_URL = 'https://www.youtube.com/watch?v=';

export const cache = new Cache<string, any>();
export const watchPageCache = new Cache<string, string>();

const AGE_RESTRICTED_URLS = ['support.google.com/youtube/?p=age_restrictions', 'youtube.com/t/community_guidelines'];

/**
 * YouTube video info object
 */
export interface VideoInfo {
  page?: string;
  player_response?: any;
  response?: any;
  html5player?: string;
  formats?: VideoFormat[];
  related_videos?: extras.RelatedVideo[];
  videoDetails?: any;
  full?: boolean;
  bestFormat?: VideoFormat;
  videoUrl?: string;
  selectedFormat?: VideoFormat;
}

/**
 * Gets info from a video without getting additional formats.
 *
 * @param id - The video ID
 * @param options - Request options
 * @returns Promise resolving to the video info
 */
export const getBasicInfo = async (id: string, options: Partial<RequestOptions> = {}): Promise<VideoInfo> => {
  utils.applyIPv6Rotations(options as RequestOptions);
  utils.applyDefaultHeaders(options as RequestOptions);
  utils.applyDefaultAgent(options as RequestOptions);
  utils.applyOldLocalAddress(options as RequestOptions);

  const retryOptions = Object.assign({}, options.requestOptions);
  const { jar, dispatcher } = options.agent!;

  utils.setPropInsensitive(
    options.requestOptions!.headers,
    'cookie',
    jar.getCookieStringSync('https://www.youtube.com'),
  );

  options.requestOptions!.dispatcher = dispatcher;
  const info = await retryFunc(getWatchHTMLPage, [id, options], retryOptions);

  const playErr = utils.playError(info.player_response);
  if (playErr) throw playErr;

  Object.assign(info, {
    related_videos: extras.getRelatedVideos(info),
  });

  const media = extras.getMedia(info);
  const additional = {
    author: extras.getAuthor(info),
    media,
    likes: extras.getLikes(info),
    age_restricted: !!(
      media && AGE_RESTRICTED_URLS.some(url => Object.values(media).some(v => typeof v === 'string' && v.includes(url)))
    ),

    video_url: BASE_URL + id,
    storyboards: extras.getStoryboards(info),
    chapters: extras.getChapters(info),
  };

  info.videoDetails = extras.cleanVideoDetails(
    Object.assign(
      {},
      info.player_response?.microformat?.playerMicroformatRenderer,
      info.player_response?.videoDetails,
      additional,
    ),
    info,
  );

  return info;
};

/**
 * Constructs the watch HTML URL
 */
const getWatchHTMLURL = (id: string, options: Partial<RequestOptions>): string =>
  `${BASE_URL + id}&hl=${options.lang || 'en'}&bpctr=${Math.ceil(Date.now() / 1000)}&has_verified=1`;

/**
 * Gets the watch HTML page body
 */
const getWatchHTMLPageBody = (id: string, options: Partial<RequestOptions>): Promise<string> => {
  const url = getWatchHTMLURL(id, options);
  return watchPageCache.getOrSet(url, async () => {
    return await utils.request(url, options);
  });
};

const EMBED_URL = 'https://www.youtube.com/embed/';

/**
 * Gets the embed page body
 */
const getEmbedPageBody = (id: string, options: Partial<RequestOptions>): Promise<string> => {
  const embedUrl = `${EMBED_URL + id}?hl=${options.lang || 'en'}`;
  return utils.request(embedUrl, options);
};

/**
 * Extracts the HTML5 player URL from the page body
 */
const getHTML5player = (body: string): string | undefined => {
  const html5playerRes =
    /<script\s+src="([^"]+)"(?:\s+type="text\/javascript")?\s+name="player_ias\/base"\s*>|"jsUrl":"([^"]+)"/.exec(body);
  return html5playerRes?.[1] || html5playerRes?.[2];
};

/**
 * Retry function options
 */
interface RetryOptions {
  maxRetries?: number;
  backoff?: {
    inc: number;
    max: number;
  };
  [key: string]: any;
}

/**
 * Given a function, calls it with `args` until it's successful,
 * or until it encounters an unrecoverable error.
 * Currently, any error from miniget is considered unrecoverable. Errors such as
 * too many redirects, invalid URL, status code 404, status code 502.
 */
const retryFunc = async <T>(func: (...args: any[]) => Promise<T>, args: any[], options: RetryOptions): Promise<T> => {
  let currentTry = 0;
  let result: T;

  if (!options.maxRetries) options.maxRetries = 3;
  if (!options.backoff) options.backoff = { inc: 500, max: 5000 };

  while (currentTry <= options.maxRetries) {
    try {
      result = await func(...args);
      break;
    } catch (err: any) {
      if (err?.statusCode < 500 || currentTry >= options.maxRetries) throw err;
      const wait = Math.min(++currentTry * options.backoff.inc, options.backoff.max);
      await new Promise(resolve => setTimeout(resolve, wait));
    }
  }

  return result!;
};

const jsonClosingChars = /^[)\]}'\s]+/;

/**
 * Parse JSON safely
 */
const parseJSON = <T>(source: string, varName: string, json: string | T): T => {
  if (!json || typeof json === 'object') {
    return json as T;
  } else {
    try {
      const modifiedJson = (json as string).replace(jsonClosingChars, '');
      return JSON.parse(modifiedJson) as T;
    } catch (err: any) {
      throw new Error(`Error parsing ${varName} in ${source}: ${err.message}`);
    }
  }
};

/**
 * Find and parse JSON from a string
 */
const findJSON = <T>(
  source: string,
  varName: string,
  body: string,
  left: string | RegExp,
  right: string,
  prependJSON: string,
): T => {
  const jsonStr = utils.between(body, left, right);
  if (!jsonStr) {
    throw new Error(`Could not find ${varName} in ${source}`);
  }
  return parseJSON<T>(source, varName, utils.cutAfterJS(`${prependJSON}${jsonStr}`));
};

/**
 * Find player response from multiple possible locations
 */
const findPlayerResponse = (source: string, info: any): any => {
  if (!info) return {};
  const player_response =
    info.args?.player_response || info.player_response || info.playerResponse || info.embedded_player_response;
  return parseJSON(source, 'player_response', player_response);
};

/**
 * Get watch HTML page info
 */
const getWatchHTMLPage = async (id: string, options: Partial<RequestOptions>): Promise<VideoInfo> => {
  const body = await getWatchHTMLPageBody(id, options);
  const info: VideoInfo = { page: 'watch' };
  try {
    try {
      info.player_response =
        utils.tryParseBetween(body, 'var ytInitialPlayerResponse = ', '}};', '', '}}') ||
        utils.tryParseBetween(body, 'var ytInitialPlayerResponse = ', ';var') ||
        utils.tryParseBetween(body, 'var ytInitialPlayerResponse = ', ';</script>') ||
        findJSON('watch.html', 'player_response', body, /\bytInitialPlayerResponse\s*=\s*\{/i, '</script>', '{');
    } catch (_e) {
      const args = findJSON('watch.html', 'player_response', body, /\bytplayer\.config\s*=\s*{/, '</script>', '{');
      info.player_response = findPlayerResponse('watch.html', args);
    }

    info.response =
      utils.tryParseBetween(body, 'var ytInitialData = ', '}};', '', '}}') ||
      utils.tryParseBetween(body, 'var ytInitialData = ', ';</script>') ||
      utils.tryParseBetween(body, 'window["ytInitialData"] = ', '}};', '', '}}') ||
      utils.tryParseBetween(body, 'window["ytInitialData"] = ', ';</script>') ||
      findJSON('watch.html', 'response', body, /\bytInitialData("\])?\s*=\s*\{/i, '</script>', '{');
    info.html5player = getHTML5player(body);
  } catch (err) {
    throw new Error(
      'Error when parsing watch.html, maybe YouTube made a change.\n' +
        `Please report this issue with the "${utils.saveDebugFile(
          'watch.html',
          body,
        )}" file on https://github.com/distubejs/ytdl-core/issues.`,
    );
  }
  return info;
};

/**
 * Parse formats from player response
 */
const parseFormats = (player_response: any): VideoFormat[] => {
  const formats = player_response?.streamingData?.formats || [];
  const adaptiveFormats = player_response?.streamingData?.adaptiveFormats || [];
  return [...formats, ...adaptiveFormats];
};

/**
 * Parse additional manifests like DASH and HLS
 */
const parseAdditionalManifests = (player_response: any, options: Partial<RequestOptions>): Promise<any>[] => {
  const streamingData = player_response?.streamingData;
  const manifests: Promise<any>[] = [];

  if (streamingData) {
    if (streamingData.dashManifestUrl) {
      manifests.push(getDashManifest(streamingData.dashManifestUrl, options));
    }
    if (streamingData.hlsManifestUrl) {
      manifests.push(getM3U8(streamingData.hlsManifestUrl, options));
    }
  }

  return manifests;
};

/**
 * Estimates audio bitrate from itag or format details
 */
const estimateAudioBitrate = (format: VideoFormat): number => {
  if (format.itag === 140) return 128;
  if (format.itag === 249) return 48;
  if (format.itag === 250) return 64;
  if (format.itag === 251) return 160;

  if (format.averageBitrate) {
    if (format.hasVideo) {
      return Math.floor(format.averageBitrate * 0.1);
    } else {
      return Math.floor(format.averageBitrate / 1000);
    }
  }

  return format.hasVideo ? 64 : 128;
};

/**
 * Gets info from a video additional formats and deciphered URLs.
 *
 * @param id - The video ID
 * @param options - Request options
 * @returns Promise resolving to the video info
 */
export const getInfo = async (id: string, options: Partial<RequestOptions> = {}): Promise<VideoInfo> => {
  utils.applyIPv6Rotations(options as RequestOptions);
  utils.applyDefaultHeaders(options as RequestOptions);
  utils.applyDefaultAgent(options as RequestOptions);
  utils.applyOldLocalAddress(options as RequestOptions);
  utils.applyPlayerClients(options as RequestOptions);

  const info = await getBasicInfo(id, options);
  const funcs: Promise<any>[] = [];

  info.html5player =
    info.html5player ||
    getHTML5player(await getWatchHTMLPageBody(id, options)) ||
    getHTML5player(await getEmbedPageBody(id, options));

  if (!info.html5player) {
    throw new Error('Unable to find html5player file');
  }

  info.html5player = new URL(info.html5player, BASE_URL).toString();

  let bestPlayerResponse = null;

  try {
    const promises: Promise<any>[] = [];
    if (options.playerClients?.includes('WEB_EMBEDDED')) promises.push(fetchWebEmbeddedPlayer(id, info, options));
    if (options.playerClients?.includes('TV')) promises.push(fetchTvPlayer(id, info, options));
    if (options.playerClients?.includes('IOS')) promises.push(fetchIosJsonPlayer(id, options));
    if (options.playerClients?.includes('ANDROID')) promises.push(fetchAndroidJsonPlayer(id, options));

    if (promises.length > 0) {
      const responses = await Promise.allSettled(promises);
      const successfulResponses = responses
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
        .map(r => r.value)
        .filter(r => r);

      console.log(`Found ${successfulResponses.length} successful responses from clients`);

      if (successfulResponses.length > 0) {
        bestPlayerResponse = successfulResponses[0];
        funcs.push(sig.decipherFormats(parseFormats(bestPlayerResponse), info.html5player, options));
        funcs.push(...parseAdditionalManifests(bestPlayerResponse, options));
      }
    }

    if (!bestPlayerResponse && options.playerClients?.includes('WEB')) {
      bestPlayerResponse = info.player_response;
      funcs.push(sig.decipherFormats(parseFormats(info.player_response), info.html5player, options));
      funcs.push(...parseAdditionalManifests(info.player_response, options));
    }
  } catch (error) {
    console.error('Error fetching formats:', error);

    if (!bestPlayerResponse && options.playerClients?.includes('WEB')) {
      bestPlayerResponse = info.player_response;
      funcs.push(sig.decipherFormats(parseFormats(info.player_response), info.html5player, options));
      funcs.push(...parseAdditionalManifests(info.player_response, options));
    }
  }

  if (funcs.length === 0) {
    throw new Error('Failed to find any playable formats');
  }

  const results = await Promise.all(funcs);
  info.formats = Object.values(Object.assign({}, ...results));

  info.formats = info.formats.filter(format => format && format.url && format.mimeType);

  if (info.formats.length === 0) {
    throw new Error('No playable formats found');
  }

  info.formats = info.formats.map(format => {
    const enhancedFormat = formatUtils.addFormatMeta(format);

    if (!enhancedFormat.audioBitrate && enhancedFormat.hasAudio) {
      enhancedFormat.audioBitrate = estimateAudioBitrate(enhancedFormat);
    }

    if (
      !enhancedFormat.isHLS &&
      enhancedFormat.mimeType &&
      (enhancedFormat.mimeType.includes('hls') ||
        enhancedFormat.mimeType.includes('x-mpegURL') ||
        enhancedFormat.mimeType.includes('application/vnd.apple.mpegurl'))
    ) {
      enhancedFormat.isHLS = true;
    }

    return enhancedFormat;
  });

  info.formats.sort(formatUtils.sortFormats);

  const bestFormat =
    info.formats.find(format => format.hasVideo && format.hasAudio) ||
    info.formats.find(format => format.hasVideo) ||
    info.formats.find(format => format.hasAudio) ||
    info.formats[0];

  info.bestFormat = bestFormat;
  info.videoUrl = bestFormat.url;
  info.selectedFormat = bestFormat;

  info.full = true;

  return info;
};

/**
 * Get playback context information
 */
const getPlaybackContext = async (html5player: string, options: Partial<RequestOptions>): Promise<any> => {
  const body = await utils.request(html5player, options);
  const mo = body.match(/(signatureTimestamp|sts):(\d+)/);
  return {
    contentPlaybackContext: {
      html5Preference: 'HTML5_PREF_WANTS',
      signatureTimestamp: mo?.[2],
    },
  };
};

const LOCALE = { hl: 'en', timeZone: 'UTC', utcOffsetMinutes: 0 };
const CHECK_FLAGS = { contentCheckOk: true, racyCheckOk: true };

const WEB_EMBEDDED_CONTEXT = {
  client: {
    clientName: 'WEB_EMBEDDED_PLAYER',
    clientVersion: '1.20240723.01.00',
    ...LOCALE,
  },
};

const TVHTML5_CONTEXT = {
  client: {
    clientName: 'TVHTML5',
    clientVersion: '7.20241201.18.00',
    ...LOCALE,
  },
};

/**
 * Fetch player information using the Web Embedded client
 */
const fetchWebEmbeddedPlayer = async (
  videoId: string,
  info: VideoInfo,
  options: Partial<RequestOptions>,
): Promise<any> => {
  const payload = {
    context: WEB_EMBEDDED_CONTEXT,
    videoId,
    playbackContext: await getPlaybackContext(info.html5player!, options),
    ...CHECK_FLAGS,
  };
  return await playerAPI(videoId, payload, options);
};

/**
 * Fetch player information using the TV client
 */
const fetchTvPlayer = async (videoId: string, info: VideoInfo, options: Partial<RequestOptions>): Promise<any> => {
  const payload = {
    context: TVHTML5_CONTEXT,
    videoId,
    playbackContext: await getPlaybackContext(info.html5player!, options),
    ...CHECK_FLAGS,
  };
  return await playerAPI(videoId, payload, options);
};

/**
 * Make a request to the YouTube player API
 */
const playerAPI = async (videoId: string, payload: any, options: Partial<RequestOptions>): Promise<any> => {
  const { jar, dispatcher } = options.agent!;
  const opts = {
    requestOptions: {
      method: 'POST',
      dispatcher,
      query: {
        prettyPrint: 'false',
        t: utils.generateClientPlaybackNonce(12),
        id: videoId,
      },
      headers: {
        'Content-Type': 'application/json',
        Cookie: jar.getCookieStringSync('https://www.youtube.com'),
        'X-Goog-Api-Format-Version': '2',
      },
      body: JSON.stringify(payload),
    },
  };

  const response = await utils.request('https://youtubei.googleapis.com/youtubei/v1/player', opts);
  const playErr = utils.playError(response);

  if (playErr) throw playErr;

  if (!response.videoDetails || videoId !== response.videoDetails.videoId) {
    const err: Error & { response?: any } = new Error('Malformed response from YouTube');
    err.response = response;
    throw err;
  }

  return response;
};

const IOS_CLIENT_VERSION = '19.42.1';
const IOS_DEVICE_MODEL = 'iPhone16,2';
const IOS_USER_AGENT_VERSION = '17_5_1';
const IOS_OS_VERSION = '17.5.1.21F90';

/**
 * Fetch player information using the iOS client
 */
const fetchIosJsonPlayer = async (videoId: string, options: Partial<RequestOptions>): Promise<any> => {
  const payload = {
    videoId,
    cpn: utils.generateClientPlaybackNonce(16),
    contentCheckOk: true,
    racyCheckOk: true,
    context: {
      client: {
        clientName: 'IOS',
        clientVersion: IOS_CLIENT_VERSION,
        deviceMake: 'Apple',
        deviceModel: IOS_DEVICE_MODEL,
        platform: 'MOBILE',
        osName: 'iOS',
        osVersion: IOS_OS_VERSION,
        hl: 'en',
        gl: 'US',
        utcOffsetMinutes: -240,
      },
      request: {
        internalExperimentFlags: [],
        useSsl: true,
      },
      user: {
        lockedSafetyMode: false,
      },
    },
  };

  const { jar, dispatcher } = options.agent!;
  const opts = {
    requestOptions: {
      method: 'POST',
      dispatcher,
      query: {
        prettyPrint: 'false',
        t: utils.generateClientPlaybackNonce(12),
        id: videoId,
      },
      headers: {
        'Content-Type': 'application/json',
        cookie: jar.getCookieStringSync('https://www.youtube.com'),
        'User-Agent': `com.google.ios.youtube/${IOS_CLIENT_VERSION}(${
          IOS_DEVICE_MODEL
        }; U; CPU iOS ${IOS_USER_AGENT_VERSION} like Mac OS X; en_US)`,
        'X-Goog-Api-Format-Version': '2',
      },
      body: JSON.stringify(payload),
    },
  };

  const response = await utils.request('https://youtubei.googleapis.com/youtubei/v1/player', opts);
  const playErr = utils.playError(response);

  if (playErr) throw playErr;

  if (!response.videoDetails || videoId !== response.videoDetails.videoId) {
    const err: Error & { response?: any } = new Error('Malformed response from YouTube');
    err.response = response;
    throw err;
  }

  return response;
};

const ANDROID_CLIENT_VERSION = '19.30.36';
const ANDROID_OS_VERSION = '14';
const ANDROID_SDK_VERSION = '34';

/**
 * Fetch player information using the Android client
 */
const fetchAndroidJsonPlayer = async (videoId: string, options: Partial<RequestOptions>): Promise<any> => {
  const payload = {
    videoId,
    cpn: utils.generateClientPlaybackNonce(16),
    contentCheckOk: true,
    racyCheckOk: true,
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion: ANDROID_CLIENT_VERSION,
        platform: 'MOBILE',
        osName: 'Android',
        osVersion: ANDROID_OS_VERSION,
        androidSdkVersion: ANDROID_SDK_VERSION,
        hl: 'en',
        gl: 'US',
        utcOffsetMinutes: -240,
      },
      request: {
        internalExperimentFlags: [],
        useSsl: true,
      },
      user: {
        lockedSafetyMode: false,
      },
    },
  };

  const { jar, dispatcher } = options.agent!;
  const opts = {
    requestOptions: {
      method: 'POST',
      dispatcher,
      query: {
        prettyPrint: 'false',
        t: utils.generateClientPlaybackNonce(12),
        id: videoId,
      },
      headers: {
        'Content-Type': 'application/json',
        cookie: jar.getCookieStringSync('https://www.youtube.com'),
        'User-Agent': `com.google.android.youtube/${
          ANDROID_CLIENT_VERSION
        } (Linux; U; Android ${ANDROID_OS_VERSION}; en_US) gzip`,
        'X-Goog-Api-Format-Version': '2',
      },
      body: JSON.stringify(payload),
    },
  };

  const response = await utils.request('https://youtubei.googleapis.com/youtubei/v1/player', opts);
  const playErr = utils.playError(response);

  if (playErr) throw playErr;

  if (!response.videoDetails || videoId !== response.videoDetails.videoId) {
    const err: Error & { response?: any } = new Error('Malformed response from YouTube');
    err.response = response;
    throw err;
  }

  return response;
};

/**
 * Gets additional DASH formats.
 *
 * @param url - The DASH manifest URL
 * @param options - Request options
 * @returns Promise resolving to format objects
 */
const getDashManifest = (url: string, options: Partial<RequestOptions>): Promise<Record<string, VideoFormat>> =>
  new Promise((resolve, reject) => {
    const formats: Record<string, VideoFormat> = {};
    const parser = sax.parser(false);
    parser.onerror = reject;

    let adaptationSet: Record<string, string> = {};

    parser.onopentag = (node: any) => {
      if (node.name === 'ADAPTATIONSET') {
        adaptationSet = node.attributes as Record<string, string>;
      } else if (node.name === 'REPRESENTATION') {
        const itag = parseInt(node.attributes.ID);

        if (!isNaN(itag)) {
          formats[url] = Object.assign(
            {
              itag,
              url,
              bitrate: parseInt(node.attributes.BANDWIDTH),
              mimeType: `${adaptationSet.MIMETYPE}; codecs="${node.attributes.CODECS}"`,
            },
            node.attributes.HEIGHT
              ? {
                  width: parseInt(node.attributes.WIDTH),
                  height: parseInt(node.attributes.HEIGHT),
                  fps: parseInt(node.attributes.FRAMERATE),
                }
              : {
                  audioSampleRate: node.attributes.AUDIOSAMPLINGRATE,
                },
          ) as VideoFormat;
        }
      }
    };

    parser.onend = () => {
      resolve(formats);
    };

    utils
      .request(new URL(url, BASE_URL).toString(), options)
      .then(res => {
        parser.write(res);
        parser.close();
      })
      .catch(reject);
  });

/**
 * Gets additional HLS formats.
 *
 * @param url - The HLS manifest URL
 * @param options - Request options
 * @returns Promise resolving to format objects
 */
const getM3U8 = async (url: string, options: Partial<RequestOptions>): Promise<Record<string, VideoFormat>> => {
  const fullUrl = new URL(url, BASE_URL).toString();
  const body = await utils.request(fullUrl, options);
  const formats: Record<string, VideoFormat> = {};

  body
    .split('\n')
    .filter((line: string) => /^https?:\/\//.test(line))
    .forEach((line: string) => {
      const match = line.match(/\/itag\/(\d+)\//);
      if (match) {
        const itag = parseInt(match[1]);
        formats[line] = {
          itag,
          url: line,

          lastModified: '',
          contentLength: '',
          quality: '',
        } as VideoFormat;
      }
    });

  return formats;
};

type InfoFunction = (link: string, options?: Partial<RequestOptions>) => Promise<VideoInfo>;

/**
 * Wraps info functions with caching
 */
const wrapWithCache = (
  funcName: string,
  func: (id: string, options: Partial<RequestOptions>) => Promise<VideoInfo>,
): InfoFunction => {
  return async (link: string, options: Partial<RequestOptions> = {}): Promise<VideoInfo> => {
    void utils.checkForUpdates();

    const id = urlUtils.getVideoID(link);
    const key = [funcName, id, options.lang].join('-');
    return cache.getOrSet(key, () => func(id, options));
  };
};

export const getBasicInfoWrapped: InfoFunction = wrapWithCache('getBasicInfo', getBasicInfo);
export const getInfoWrapped: InfoFunction = wrapWithCache('getInfo', getInfo);

export const validateID = urlUtils.validateID;
export const validateURL = urlUtils.validateURL;
export const getURLVideoID = urlUtils.getURLVideoID;
export const getVideoID = urlUtils.getVideoID;

import * as utils from './utils';
import FORMATS, { FormatInfo } from './formats';

/**
 * YouTube video format
 */
export interface VideoFormat {
  itag: number;
  url: string;
  mimeType?: string;
  bitrate?: number;
  audioBitrate?: number;
  width?: number;
  height?: number;
  initRange?: { start: string; end: string };
  indexRange?: { start: string; end: string };
  lastModified: string;
  contentLength: string;
  quality: string;
  qualityLabel?: string;
  projectionType?: string;
  fps?: number;
  averageBitrate?: number;
  audioQuality?: string;
  colorInfo?: {
    primaries: string;
    transferCharacteristics: string;
    matrixCoefficients: string;
  };
  highReplication?: boolean;
  approxDurationMs?: string;
  targetDurationSec?: number;
  maxDvrDurationSec?: number;
  audioSampleRate?: string;
  audioChannels?: number;

  container?: string;
  hasVideo?: boolean;
  hasAudio?: boolean;
  codecs?: string;
  videoCodec?: string;
  audioCodec?: string;
  isLive?: boolean;
  isHLS?: boolean;
  isDashMPD?: boolean;
  signatureCipher?: string;
  cipher?: string;
}

/**
 * Format filtering options
 */
export type FormatFilter =
  | 'audioandvideo'
  | 'videoandaudio'
  | 'video'
  | 'videoonly'
  | 'audio'
  | 'audioonly'
  | ((format: VideoFormat) => boolean);

/**
 * Format selection options
 */
export interface FormatOptions {
  quality?: string | number | string[] | number[];
  filter?: FormatFilter;
  format?: VideoFormat;
}

const audioEncodingRanks = ['mp4a', 'mp3', 'vorbis', 'aac', 'opus', 'flac'];
const videoEncodingRanks = ['mp4v', 'avc1', 'Sorenson H.283', 'MPEG-4 Visual', 'VP8', 'VP9', 'H.264'];

/**
 * Gets video bitrate or 0 if not available
 */
const getVideoBitrate = (format: VideoFormat): number => format.bitrate || 0;

/**
 * Gets the ranking of the video encoding
 */
const getVideoEncodingRank = (format: VideoFormat): number =>
  videoEncodingRanks.findIndex(enc => format.codecs?.includes(enc) || false);

/**
 * Gets audio bitrate or 0 if not available
 */
const getAudioBitrate = (format: VideoFormat): number => format.audioBitrate || 0;

/**
 * Gets the ranking of the audio encoding
 */
const getAudioEncodingRank = (format: VideoFormat): number =>
  audioEncodingRanks.findIndex(enc => format.codecs?.includes(enc) || false);

/**
 * Sort formats by a list of functions.
 *
 * @param a - First format to compare
 * @param b - Second format to compare
 * @param sortBy - Array of functions to sort by
 * @returns Comparison result (-1, 0, or 1)
 */
const sortFormatsBy = (a: VideoFormat, b: VideoFormat, sortBy: Array<(format: VideoFormat) => number>): number => {
  let res = 0;
  for (const fn of sortBy) {
    res = fn(b) - fn(a);
    if (res !== 0) {
      break;
    }
  }
  return res;
};

/**
 * Sort formats by video quality
 */
const sortFormatsByVideo = (a: VideoFormat, b: VideoFormat): number =>
  sortFormatsBy(a, b, [format => parseInt(format.qualityLabel || '0'), getVideoBitrate, getVideoEncodingRank]);

/**
 * Sort formats by audio quality
 */
const sortFormatsByAudio = (a: VideoFormat, b: VideoFormat): number =>
  sortFormatsBy(a, b, [getAudioBitrate, getAudioEncodingRank]);

/**
 * Sort formats from highest quality to lowest.
 *
 * @param a - First format to compare
 * @param b - Second format to compare
 * @returns Comparison result (-1, 0, or 1)
 */
export const sortFormats = (a: VideoFormat, b: VideoFormat): number =>
  sortFormatsBy(a, b, [
    format => +!!format.isHLS,
    format => +!!format.isDashMPD,
    format => +(parseInt(format.contentLength || '0') > 0),
    format => +!!(format.hasVideo && format.hasAudio),
    format => +!!format.hasVideo,
    format => parseInt(format.qualityLabel || '0') || 0,
    getVideoBitrate,
    getAudioBitrate,
    getVideoEncodingRank,
    getAudioEncodingRank,
  ]);

/**
 * Gets a format based on quality or array of quality's
 *
 * @param quality - Quality string or array of quality strings
 * @param formats - Available formats
 * @returns Selected format or undefined if not found
 */
const getFormatByQuality = (
  quality: string | number | string[] | number[],
  formats: VideoFormat[],
): VideoFormat | undefined => {
  const getFormat = (itag: string | number) => formats.find(format => `${format.itag}` === `${itag}`);

  if (Array.isArray(quality)) {
    const foundQuality = quality.find(q => getFormat(q));
    return foundQuality ? getFormat(foundQuality) : undefined;
  } else {
    return getFormat(quality);
  }
};

/**
 * Filter formats based on the given filter
 *
 * @param formats - Available formats
 * @param filter - Filter to apply
 * @returns Filtered formats
 */
export const filterFormats = (formats: VideoFormat[], filter: FormatFilter): VideoFormat[] => {
  let fn: (format: VideoFormat) => boolean;

  switch (filter) {
    case 'videoandaudio':
    case 'audioandvideo':
      fn = format => !!(format.hasVideo && format.hasAudio);
      break;

    case 'video':
      fn = format => !!format.hasVideo;
      break;

    case 'videoonly':
      fn = format => !!(format.hasVideo && !format.hasAudio);
      break;

    case 'audio':
      fn = format => !!format.hasAudio;
      break;

    case 'audioonly':
      fn = format => !!(format.hasAudio && !format.hasVideo);
      break;

    default:
      if (typeof filter === 'function') {
        fn = filter;
      } else {
        throw new TypeError(`Given filter (${filter}) is not supported`);
      }
  }

  return formats.filter(format => !!format.url && fn(format));
};

/**
 * Choose a format depending on the given options.
 *
 * @param formats - Available formats
 * @param options - Format selection options
 * @returns Selected format
 * @throws {Error} when no format matches the filter/format rules
 */
export const chooseFormat = (formats: VideoFormat[], options: FormatOptions): VideoFormat => {
  if (typeof options.format === 'object') {
    if (!options.format.url) {
      throw new Error('Invalid format given, did you use `ytdl.getInfo()`?');
    }
    return options.format;
  }

  if (options.filter) {
    formats = filterFormats(formats, options.filter);
  }

  if (formats.some(fmt => fmt.isHLS)) {
    formats = formats.filter(fmt => fmt.isHLS || !fmt.isLive);
  }

  let format: VideoFormat | undefined;
  const quality = options.quality || 'highest';

  switch (quality) {
    case 'highest':
      format = formats[0];
      break;

    case 'lowest':
      format = formats[formats.length - 1];
      break;

    case 'highestaudio': {
      formats = filterFormats(formats, 'audio');
      formats.sort(sortFormatsByAudio);

      const bestAudioFormat = formats[0];
      formats = formats.filter(f => sortFormatsByAudio(bestAudioFormat, f) === 0);

      const worstVideoQuality = formats.map(f => parseInt(f.qualityLabel || '0') || 0).sort((a, b) => a - b)[0];
      format = formats.find(f => (parseInt(f.qualityLabel || '0') || 0) === worstVideoQuality);
      break;
    }

    case 'lowestaudio':
      formats = filterFormats(formats, 'audio');
      formats.sort(sortFormatsByAudio);
      format = formats[formats.length - 1];
      break;

    case 'highestvideo': {
      formats = filterFormats(formats, 'video');
      formats.sort(sortFormatsByVideo);

      const bestVideoFormat = formats[0];
      formats = formats.filter(f => sortFormatsByVideo(bestVideoFormat, f) === 0);

      const worstAudioQuality = formats.map(f => f.audioBitrate || 0).sort((a, b) => a - b)[0];
      format = formats.find(f => (f.audioBitrate || 0) === worstAudioQuality);
      break;
    }

    case 'lowestvideo':
      formats = filterFormats(formats, 'video');
      formats.sort(sortFormatsByVideo);
      format = formats[formats.length - 1];
      break;

    default:
      format = getFormatByQuality(quality, formats);
      break;
  }

  if (!format) {
    throw new Error(`No such format found: ${quality}`);
  }

  return format;
};

/**
 * Add additional format metadata
 *
 * @param format - Format to enhance with metadata
 * @returns Enhanced format
 */
export const addFormatMeta = (format: VideoFormat): VideoFormat => {
  const formatInfo = FORMATS[format.itag] as FormatInfo | undefined;

  const enhancedFormat = {
    ...formatInfo,
    ...format,
  } as VideoFormat;

  enhancedFormat.hasVideo = !!enhancedFormat.qualityLabel;
  enhancedFormat.hasAudio = !!enhancedFormat.audioBitrate;

  enhancedFormat.container = enhancedFormat.mimeType ? enhancedFormat.mimeType.split(';')[0].split('/')[1] : undefined;

  enhancedFormat.codecs = enhancedFormat.mimeType ? utils.between(enhancedFormat.mimeType, 'codecs="', '"') : undefined;

  enhancedFormat.videoCodec =
    enhancedFormat.hasVideo && enhancedFormat.codecs ? enhancedFormat.codecs.split(', ')[0] : undefined;

  enhancedFormat.audioCodec =
    enhancedFormat.hasAudio && enhancedFormat.codecs ? enhancedFormat.codecs.split(', ').slice(-1)[0] : undefined;

  enhancedFormat.isLive = /\bsource[/=]yt_live_broadcast\b/.test(enhancedFormat.url || '');
  enhancedFormat.isHLS = /\/manifest\/hls_(variant|playlist)\//.test(enhancedFormat.url || '');
  enhancedFormat.isDashMPD = /\/manifest\/dash\//.test(enhancedFormat.url || '');

  return enhancedFormat;
};

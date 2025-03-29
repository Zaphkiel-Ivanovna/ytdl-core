import { PassThrough, Readable } from 'stream';
import * as info from './info';
import { VideoInfo } from './info';
import * as utils from './utils';
import { RequestOptions } from './utils';
import * as formatUtils from './format-utils';
import { VideoFormat, FormatOptions } from './format-utils';
import * as urlUtils from './url-utils';
import miniget from 'miniget';
import m3u8stream, { parseTimestamp } from 'm3u8stream';
import * as agent from './agent';
import { Agent } from './agent';
import pkg from '../package.json';

/**
 * Download options that extend format options
 */
export interface DownloadOptions extends FormatOptions, Partial<RequestOptions> {
  range?: {
    start?: number;
    end?: number;
  };
  begin?: string | number | Date;
  liveBuffer?: number;
  highWaterMark?: number;
  IPv6Block?: string;
  dlChunkSize?: number;
  agent?: Agent;
}

/**
 * Stream events interface
 */
export interface YTDLStream extends PassThrough {
  on(event: string, listener: (...args: any[]) => void): this;
  once(event: string, listener: (...args: any[]) => void): this;
  destroyed: boolean;
  _destroy: () => void;
}

/**
 * Downloads a video from the given url.
 *
 * @param link - URL to the video
 * @param options - Download options
 * @returns Readable stream
 */
const ytdl = (link: string, options: DownloadOptions = {}): YTDLStream => {
  const stream = createStream(options);
  ytdl.getInfo(link, options).then(
    info => {
      downloadFromInfoCallback(stream, info, options);
    },
    stream.emit.bind(stream, 'error'),
  );
  return stream;
};

/**
 * Creates a PassThrough stream
 */
const createStream = (options?: DownloadOptions): YTDLStream => {
  const stream = new PassThrough({
    highWaterMark: options?.highWaterMark || 1024 * 512,
  }) as unknown as YTDLStream;

  stream._destroy = () => {
    stream.destroyed = true;
  };

  return stream;
};

/**
 * Forward events from request to stream and pipe data
 */
const pipeAndSetEvents = (req: Readable, stream: YTDLStream, end: boolean): void => {
  ['abort', 'request', 'response', 'error', 'redirect', 'retry', 'reconnect'].forEach(event => {
    req.prependListener(event, stream.emit.bind(stream, event));
  });

  req.pipe(stream, { end });
};

/**
 * Chooses a format to download and starts downloading.
 *
 * @param stream - The stream to pipe the download to
 * @param info - Video info object
 * @param options - Download options
 */
const downloadFromInfoCallback = (stream: YTDLStream, info: VideoInfo, options: DownloadOptions = {}): void => {
  const err = utils.playError(info.player_response);
  if (err) {
    stream.emit('error', err);
    return;
  }

  if (!info.formats?.length) {
    stream.emit('error', new Error('This video is unavailable'));
    return;
  }

  let format: VideoFormat;
  try {
    format = formatUtils.chooseFormat(info.formats, options);
  } catch (e) {
    stream.emit('error', e);
    return;
  }

  stream.emit('info', info, format);
  if (stream.destroyed) {
    return;
  }

  let contentLength: number | undefined;
  let downloaded = 0;

  const ondata = (chunk: Buffer) => {
    downloaded += chunk.length;
    stream.emit('progress', chunk.length, downloaded, contentLength);
  };

  utils.applyDefaultHeaders(options as RequestOptions);
  if (options.IPv6Block) {
    const localAddress = utils.applyIPv6Rotations(options as RequestOptions);
    options.requestOptions = {
      ...options.requestOptions,
      localAddress: localAddress ?? undefined,
      headers: options.requestOptions?.headers || {},
    };
  }

  if (options.agent) {
    options.requestOptions = {
      ...options.requestOptions,
      agent: options.agent.agent,
      headers: options.requestOptions?.headers || {},
    };

    if (options.agent.jar) {
      utils.setPropInsensitive(
        options.requestOptions.headers,
        'cookie',
        options.agent.jar.getCookieStringSync('https://www.youtube.com'),
      );
    }

    if (options.agent.localAddress) {
      options.requestOptions = {
        ...options.requestOptions,
        localAddress: options.agent.localAddress,
        headers: options.requestOptions?.headers || {},
      };
    }
  }

  const dlChunkSize = typeof options.dlChunkSize === 'number' ? options.dlChunkSize : 1024 * 1024 * 10;
  let req: Readable;
  let shouldEnd = true;

  if (format.isHLS || format.isDashMPD) {
    req = m3u8stream(format.url, {
      chunkReadahead: info.player_response?.live_chunk_readahead
        ? parseInt(info.player_response.live_chunk_readahead)
        : undefined,
      begin:
        options.begin instanceof Date
          ? options.begin.toString()
          : options.begin || (format.isLive ? Date.now().toString() : undefined),
      liveBuffer: options.liveBuffer,

      requestOptions: options.requestOptions,
      parser: format.isDashMPD ? 'dash-mpd' : 'm3u8',
      id: format.itag.toString(),
    });

    req.on('progress', (segment: any, totalSegments: number) => {
      stream.emit('progress', segment.size, segment.num, totalSegments);
    });

    pipeAndSetEvents(req, stream, shouldEnd);
  } else {
    const requestOptions = {
      ...options.requestOptions,
      maxReconnects: 6,
      maxRetries: 3,
      backoff: { inc: 500, max: 10000 },
    };

    const shouldBeChunked = dlChunkSize !== 0 && (!format.hasAudio || !format.hasVideo);

    if (shouldBeChunked) {
      let start = options.range?.start || 0;
      let end = start + dlChunkSize;
      const rangeEnd = options.range?.end;

      contentLength = options.range
        ? (rangeEnd ? rangeEnd + 1 : parseInt(format.contentLength)) - start
        : parseInt(format.contentLength);

      const getNextChunk = () => {
        if (stream.destroyed) return;
        if (!rangeEnd && end >= (contentLength || 0)) end = 0;
        if (rangeEnd && end > rangeEnd) end = rangeEnd;
        shouldEnd = !end || end === rangeEnd;

        requestOptions.headers = {
          ...requestOptions.headers,
          Range: `bytes=${start}-${end !== undefined && end !== 0 ? end : ''}`,
        };

        req = miniget(format.url, requestOptions);
        req.on('data', ondata);
        req.on('end', () => {
          if (stream.destroyed) return;
          if (end && end !== rangeEnd) {
            start = end + 1;
            end += dlChunkSize;
            getNextChunk();
          }
        });

        pipeAndSetEvents(req, stream, shouldEnd);
      };

      getNextChunk();
    } else {
      let formatUrl = format.url;
      if (options.begin) {
        const timestamp =
          typeof options.begin === 'object' && options.begin instanceof Date
            ? options.begin.getTime()
            : parseTimestamp(options.begin);
        formatUrl += `&begin=${timestamp}`;
      }

      if (options.range?.start !== undefined || options.range?.end !== undefined) {
        requestOptions.headers = {
          ...requestOptions.headers,
          Range: `bytes=${options.range.start || '0'}-${options.range.end || ''}`,
        };
      }

      req = miniget(formatUrl, requestOptions);
      req.on('response', (res: any) => {
        if (stream.destroyed) return;
        contentLength = contentLength || parseInt(res.headers['content-length']);
      });

      req.on('data', ondata);
      pipeAndSetEvents(req, stream, shouldEnd);
    }
  }

  stream._destroy = () => {
    stream.destroyed = true;
    if (req) {
      req.destroy?.();

      if (typeof req.end === 'function') {
        req.end();
      }
    }
  };
};

/**
 * Can be used to download video after its `info` is gotten through
 * `ytdl.getInfo()`. In case the user might want to look at the
 * `info` object before deciding to download.
 *
 * @param info - Video info object
 * @param options - Download options
 * @returns Readable stream
 */
ytdl.downloadFromInfo = (info: VideoInfo, options: DownloadOptions = {}): YTDLStream => {
  const stream = createStream(options);

  if (!info.full) {
    throw new Error('Cannot use `ytdl.downloadFromInfo()` when called with info from `ytdl.getBasicInfo()`');
  }

  setImmediate(() => {
    downloadFromInfoCallback(stream, info, options);
  });

  return stream;
};

ytdl.getBasicInfo = info.getBasicInfoWrapped;
ytdl.getInfo = info.getInfoWrapped;
ytdl.chooseFormat = formatUtils.chooseFormat;
ytdl.filterFormats = formatUtils.filterFormats;
ytdl.validateID = urlUtils.validateID;
ytdl.validateURL = urlUtils.validateURL;
ytdl.getURLVideoID = urlUtils.getURLVideoID;
ytdl.getVideoID = urlUtils.getVideoID;
ytdl.createAgent = agent.createAgent;
ytdl.createProxyAgent = agent.createProxyAgent;
ytdl.cache = {
  info: info.cache,
  watch: info.watchPageCache,
};
ytdl.version = pkg.version;
export default ytdl;
export { ytdl };

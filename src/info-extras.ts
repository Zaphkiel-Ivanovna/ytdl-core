import * as utils from './utils';
import * as qs from 'querystring';
import { parseTimestamp } from 'm3u8stream';

const BASE_URL = 'https://www.youtube.com/watch?v=';

interface TextRun {
  text: string;
  navigationEndpoint?: {
    commandMetadata: {
      webCommandMetadata: {
        url: string;
      };
    };
    browseEndpoint?: {
      browseId: string;
      canonicalBaseUrl?: string;
    };
  };
}

interface Text {
  runs?: TextRun[];
  simpleText?: string;
}

interface Badge {
  metadataBadgeRenderer: {
    tooltip: string;
    label?: string;
  };
}

interface Thumbnail {
  url: string;
  width: number;
  height: number;
}

interface Category {
  name: string;
  url: string;
}

const TITLE_TO_CATEGORY: Record<string, Category> = {
  song: { name: 'Music', url: 'https://music.youtube.com/' },
};

/**
 * Extract text from YouTube text objects
 */
const getText = (obj?: Text): string => obj?.runs?.[0]?.text ?? obj?.simpleText ?? '';

/**
 * Get video media information
 */
export const getMedia = (info: any): Record<string, any> => {
  const media: Record<string, any> = {};
  let results: any[] = [];

  try {
    results = info.response.contents.twoColumnWatchNextResults.results.results.contents;
  } catch (err) {
    // Do nothing
  }

  const result = results.find(v => v.videoSecondaryInfoRenderer);
  if (!result) {
    return {};
  }

  try {
    const metadataRows = (result.metadataRowContainer || result.videoSecondaryInfoRenderer.metadataRowContainer)
      .metadataRowContainerRenderer.rows;

    for (const row of metadataRows) {
      if (row.metadataRowRenderer) {
        const title = getText(row.metadataRowRenderer.title).toLowerCase();
        const contents = row.metadataRowRenderer.contents[0];
        media[title] = getText(contents);

        const runs = contents.runs;
        if (runs?.[0]?.navigationEndpoint) {
          media[`${title}_url`] = new URL(
            runs[0].navigationEndpoint.commandMetadata.webCommandMetadata.url,
            BASE_URL,
          ).toString();
        }

        if (title in TITLE_TO_CATEGORY) {
          media.category = TITLE_TO_CATEGORY[title].name;
          media.category_url = TITLE_TO_CATEGORY[title].url;
        }
      } else if (row.richMetadataRowRenderer) {
        const contents = row.richMetadataRowRenderer.contents;
        const boxArt = contents.filter(
          (meta: any) => meta.richMetadataRenderer.style === 'RICH_METADATA_RENDERER_STYLE_BOX_ART',
        );

        for (const { richMetadataRenderer } of boxArt) {
          const meta = richMetadataRenderer;
          media.year = getText(meta.subtitle);
          const type = getText(meta.callToAction).split(' ')[1];
          media[type] = getText(meta.title);
          media[`${type}_url`] = new URL(meta.endpoint.commandMetadata.webCommandMetadata.url, BASE_URL).toString();
          media.thumbnails = meta.thumbnail.thumbnails;
        }

        const topic = contents.filter(
          (meta: any) => meta.richMetadataRenderer.style === 'RICH_METADATA_RENDERER_STYLE_TOPIC',
        );

        for (const { richMetadataRenderer } of topic) {
          const meta = richMetadataRenderer;
          media.category = getText(meta.title);
          media.category_url = new URL(meta.endpoint.commandMetadata.webCommandMetadata.url, BASE_URL).toString();
        }
      }
    }
  } catch (err) {
    // Do nothing.
  }

  return media;
};

/**
 * Check if a channel is verified based on badges
 */
const isVerified = (badges?: Badge[]): boolean => !!badges?.find(b => b.metadataBadgeRenderer.tooltip === 'Verified');

/**
 * Author interface with required properties
 */
export interface Author {
  id: string;
  name: string;
  user?: string | null;
  channel_url: string;
  external_channel_url?: string;
  user_url?: string;
  thumbnails: Thumbnail[];
  verified: boolean;
  subscriber_count?: number | null;
  avatar?: string; // Deprecated
}

/**
 * Get video author information
 */
export const getAuthor = (info: any): Author | Record<string, never> => {
  let channelId: string | undefined;
  let thumbnails: Thumbnail[] = [];
  let subscriberCount: number | null = null;
  let verified = false;

  try {
    const results = info.response.contents.twoColumnWatchNextResults.results.results.contents;
    const v = results.find((v2: any) => v2?.videoSecondaryInfoRenderer?.owner?.videoOwnerRenderer);
    const videoOwnerRenderer = v.videoSecondaryInfoRenderer.owner.videoOwnerRenderer;

    channelId = videoOwnerRenderer.navigationEndpoint.browseEndpoint.browseId;
    thumbnails = videoOwnerRenderer.thumbnail.thumbnails.map((thumbnail: any) => {
      thumbnail.url = new URL(thumbnail.url, BASE_URL).toString();
      return thumbnail;
    });

    subscriberCount = utils.parseAbbreviatedNumber(getText(videoOwnerRenderer.subscriberCountText));
    verified = isVerified(videoOwnerRenderer.badges);
  } catch (err) {
    // Do nothing.
  }

  try {
    const videoDetails = info.player_response.microformat?.playerMicroformatRenderer;
    const id = videoDetails?.channelId || channelId || info.player_response.videoDetails.channelId;

    const author: Author = {
      id: id,
      name: videoDetails?.ownerChannelName ?? info.player_response.videoDetails.author,
      user: videoDetails?.ownerProfileUrl?.split('/').slice(-1)[0] ?? null,
      channel_url: `https://www.youtube.com/channel/${id}`,
      external_channel_url: videoDetails ? `https://www.youtube.com/channel/${videoDetails.externalChannelId}` : '',
      user_url: videoDetails ? new URL(videoDetails.ownerProfileUrl, BASE_URL).toString() : '',
      thumbnails,
      verified,
      subscriber_count: subscriberCount,
    };

    if (thumbnails.length) {
      utils.deprecate(author, 'avatar', author.thumbnails[0].url, 'author.avatar', 'author.thumbnails[0].url');
    }

    return author;
  } catch (err) {
    return {};
  }
};

/**
 * Related video interface
 */
export interface RelatedVideo {
  id?: string;
  title?: string;
  published?: string;
  author: Author | string; // To remove the string part later
  ucid?: string; // To remove later
  author_thumbnail?: string; // To remove later
  short_view_count_text?: string;
  view_count?: string;
  length_seconds?: number | string;
  video_thumbnail?: string; // To remove later
  thumbnails: Thumbnail[];
  richThumbnails: Thumbnail[];
  isLive: boolean;
}

/**
 * Parse related video information
 */
const parseRelatedVideo = (details: any, rvsParams: any[]): RelatedVideo | undefined => {
  if (!details) return;

  try {
    let viewCount = getText(details.viewCountText);
    let shortViewCount = getText(details.shortViewCountText);
    const rvsDetails = rvsParams.find(elem => elem.id === details.videoId);

    if (!/^\\d/.test(shortViewCount)) {
      shortViewCount = rvsDetails?.short_view_count_text || '';
    }

    viewCount = (/^\\d/.test(viewCount) ? viewCount : shortViewCount).split(' ')[0];
    const browseEndpoint = details.shortBylineText.runs[0].navigationEndpoint.browseEndpoint;
    const channelId = browseEndpoint.browseId;
    const name = getText(details.shortBylineText);
    const user = (browseEndpoint.canonicalBaseUrl || '').split('/').slice(-1)[0];

    const video: RelatedVideo = {
      id: details.videoId,
      title: getText(details.title),
      published: getText(details.publishedTimeText),
      author: {
        id: channelId,
        name,
        user,
        channel_url: `https://www.youtube.com/channel/${channelId}`,
        user_url: `https://www.youtube.com/user/${user}`,
        thumbnails: details.channelThumbnail.thumbnails.map((thumbnail: any) => {
          thumbnail.url = new URL(thumbnail.url, BASE_URL).toString();
          return thumbnail;
        }),
        verified: isVerified(details.ownerBadges),
      },
      short_view_count_text: shortViewCount.split(' ')[0],
      view_count: viewCount.replace(/,/g, ''),
      length_seconds: details.lengthText
        ? Math.floor(parseTimestamp(getText(details.lengthText)) / 1000)
        : rvsDetails
          ? `${rvsDetails.length_seconds}`
          : undefined,
      thumbnails: details.thumbnail.thumbnails,
      richThumbnails: details.richThumbnail
        ? details.richThumbnail.movingThumbnailRenderer.movingThumbnailDetails.thumbnails
        : [],
      isLive: !!details.badges?.find((b: Badge) => b.metadataBadgeRenderer.label === 'LIVE NOW'),
    };

    utils.deprecate(
      video,
      'author_thumbnail',
      (video.author as Author).thumbnails[0].url,
      'relatedVideo.author_thumbnail',
      'relatedVideo.author.thumbnails[0].url',
    );
    utils.deprecate(video, 'ucid', (video.author as Author).id, 'relatedVideo.ucid', 'relatedVideo.author.id');
    utils.deprecate(
      video,
      'video_thumbnail',
      video.thumbnails[0].url,
      'relatedVideo.video_thumbnail',
      'relatedVideo.thumbnails[0].url',
    );

    return video;
  } catch (err) {
    // Skip.
    return undefined;
  }
};

/**
 * Get related videos
 */
export const getRelatedVideos = (info: any): RelatedVideo[] => {
  let rvsParams: any[] = [];
  let secondaryResults: any[] = [];

  try {
    rvsParams = info.response.webWatchNextResponseExtensionData.relatedVideoArgs
      .split(',')
      .map((e: string) => qs.parse(e));
  } catch (err) {
    // Do nothing.
  }

  try {
    secondaryResults = info.response.contents.twoColumnWatchNextResults.secondaryResults.secondaryResults.results;
  } catch (err) {
    return [];
  }

  const videos: RelatedVideo[] = [];

  for (const result of secondaryResults || []) {
    const details = result.compactVideoRenderer;
    if (details) {
      const video = parseRelatedVideo(details, rvsParams);
      if (video) videos.push(video);
    } else {
      const autoplay = result.compactAutoplayRenderer || result.itemSectionRenderer;
      if (!autoplay || !Array.isArray(autoplay.contents)) continue;

      for (const content of autoplay.contents) {
        const video = parseRelatedVideo(content.compactVideoRenderer, rvsParams);
        if (video) videos.push(video);
      }
    }
  }

  return videos;
};

/**
 * Get like count for a video
 */
export const getLikes = (info: any): number | null => {
  try {
    const contents = info.response.contents.twoColumnWatchNextResults.results.results.contents;
    const video = contents.find((r: any) => r.videoPrimaryInfoRenderer);
    const buttons = video.videoPrimaryInfoRenderer.videoActions.menuRenderer.topLevelButtons;
    const accessibilityText = buttons.find((b: any) => b.segmentedLikeDislikeButtonViewModel)
      .segmentedLikeDislikeButtonViewModel.likeButtonViewModel.likeButtonViewModel.toggleButtonViewModel
      .toggleButtonViewModel.defaultButtonViewModel.buttonViewModel.accessibilityText;

    return parseInt(accessibilityText.match(/[\\d,.]+/)[0].replace(/\\D+/g, ''));
  } catch (err) {
    return null;
  }
};

/**
 * Cleans up a few fields on `videoDetails`
 */
export const cleanVideoDetails = (videoDetails: any, info: any): any => {
  videoDetails.thumbnails = videoDetails.thumbnail.thumbnails;
  delete videoDetails.thumbnail;

  utils.deprecate(
    videoDetails,
    'thumbnail',
    { thumbnails: videoDetails.thumbnails },
    'videoDetails.thumbnail.thumbnails',
    'videoDetails.thumbnails',
  );

  videoDetails.description = videoDetails.shortDescription || getText(videoDetails.description);
  delete videoDetails.shortDescription;

  utils.deprecate(
    videoDetails,
    'shortDescription',
    videoDetails.description,
    'videoDetails.shortDescription',
    'videoDetails.description',
  );

  // Use more reliable `lengthSeconds` from `playerMicroformatRenderer`.
  videoDetails.lengthSeconds =
    info.player_response.microformat?.playerMicroformatRenderer?.lengthSeconds ||
    info.player_response.videoDetails.lengthSeconds;

  return videoDetails;
};

/**
 * Storyboard interface
 */
export interface Storyboard {
  templateUrl: string;
  thumbnailWidth: number;
  thumbnailHeight: number;
  thumbnailCount: number;
  interval: number;
  columns: number;
  rows: number;
  storyboardCount: number;
}

/**
 * Get storyboards info
 */
export const getStoryboards = (info: any): Storyboard[] => {
  const parts = info.player_response?.storyboards?.playerStoryboardSpecRenderer?.spec?.split('|');

  if (!parts) return [];

  const url = new URL(parts.shift());

  return parts.map((part: string, i: number) => {
    const [thumbnailWidth, thumbnailHeight, thumbnailCount, columns, rows, interval, nameReplacement, sigh] =
      part.split('#');

    url.searchParams.set('sigh', sigh);

    const parsedThumbnailCount = parseInt(thumbnailCount, 10);
    const parsedColumns = parseInt(columns, 10);
    const parsedRows = parseInt(rows, 10);

    const storyboardCount = Math.ceil(parsedThumbnailCount / (parsedColumns * parsedRows));

    return {
      templateUrl: url.toString().replace('$L', i.toString()).replace('$N', nameReplacement),
      thumbnailWidth: parseInt(thumbnailWidth, 10),
      thumbnailHeight: parseInt(thumbnailHeight, 10),
      thumbnailCount: parsedThumbnailCount,
      interval: parseInt(interval, 10),
      columns: parsedColumns,
      rows: parsedRows,
      storyboardCount,
    };
  });
};

/**
 * Chapter interface
 */
export interface Chapter {
  title: string;
  start_time: number;
}

/**
 * Get chapters info
 */
export const getChapters = (info: any): Chapter[] => {
  const playerOverlayRenderer = info.response?.playerOverlays?.playerOverlayRenderer;
  const playerBar = playerOverlayRenderer?.decoratedPlayerBarRenderer?.decoratedPlayerBarRenderer?.playerBar;
  const markersMap = playerBar?.multiMarkersPlayerBarRenderer?.markersMap;
  const marker = Array.isArray(markersMap) && markersMap.find((m: any) => Array.isArray(m.value?.chapters));

  if (!marker) return [];
  const chapters = marker.value.chapters;

  return chapters.map((chapter: any) => ({
    title: getText(chapter.chapterRenderer.title),
    start_time: chapter.chapterRenderer.timeRangeStartMillis / 1000,
  }));
};

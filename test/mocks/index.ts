import { VideoFormat } from '../../src/format-utils';
import { PassThrough } from 'stream';

// Mock YouTube video format
export const mockVideoFormat: VideoFormat = {
  itag: 18,
  url: 'https://example.com/video.mp4',
  mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
  bitrate: 500000,
  width: 640,
  height: 360,
  lastModified: '1617400000',
  contentLength: '1000000',
  quality: 'medium',
  fps: 30,
  qualityLabel: '360p',
  projectionType: 'RECTANGULAR',
  averageBitrate: 490000,
  audioQuality: 'AUDIO_QUALITY_MEDIUM',
  approxDurationMs: '300000',
  audioSampleRate: '44100',
  audioChannels: 2,
  hasVideo: true,
  hasAudio: true,
  container: 'mp4',
  codecs: 'avc1.42001E, mp4a.40.2',
  videoCodec: 'avc1.42001E',
  audioCodec: 'mp4a.40.2',
  isLive: false,
  isHLS: false,
  isDashMPD: false,
  // Additional properties needed for testing
  audioBitrate: 128,
};

// Mock HTTP response
export const mockHttpResponse = {
  statusCode: 200,
  headers: {
    'content-type': 'application/json',
  },
  body: {
    text: jest.fn().mockResolvedValue('{ "success": true }'),
    json: jest.fn().mockResolvedValue({ success: true }),
  },
};

// Mock fetch function
export const mockFetch = jest.fn().mockResolvedValue({
  status: 200,
  statusText: 'OK',
  headers: new Map([['content-type', 'application/json']]),
  text: jest.fn().mockResolvedValue('{ "success": true }'),
  json: jest.fn().mockResolvedValue({ success: true }),
  body: new PassThrough(),
});

// Mock YouTube video ID
export const TEST_VIDEO_ID = 'dQw4w9WgXcQ';

// Mock YouTube player response
export const mockPlayerResponse = {
  playabilityStatus: {
    status: 'OK',
    playableInEmbed: true,
  },
  streamingData: {
    formats: [mockVideoFormat],
    adaptiveFormats: [],
    expiresInSeconds: '21540',
  },
  videoDetails: {
    videoId: TEST_VIDEO_ID,
    title: 'Test Video',
    lengthSeconds: '300',
    keywords: ['test', 'video'],
    channelId: 'UC123456789',
    isOwnerViewing: false,
    shortDescription: 'This is a test video',
    isCrawlable: true,
    thumbnail: {
      thumbnails: [
        {
          url: 'https://example.com/thumbnail.jpg',
          width: 120,
          height: 90,
        },
      ],
    },
    averageRating: 4.5,
    allowRatings: true,
    viewCount: '1000000',
    author: 'Test Author',
    isPrivate: false,
    isUnpluggedCorpus: false,
    isLiveContent: false,
  },
  microformat: {
    playerMicroformatRenderer: {
      thumbnail: {
        thumbnails: [
          {
            url: 'https://example.com/thumbnail.jpg',
            width: 120,
            height: 90,
          },
        ],
      },
      embed: {
        iframeUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        width: 640,
        height: 360,
      },
      title: {
        simpleText: 'Test Video',
      },
      description: {
        simpleText: 'This is a test video',
      },
      lengthSeconds: '300',
      ownerProfileUrl: 'https://www.youtube.com/channel/UC123456789',
      ownerChannelName: 'Test Author',
      uploadDate: '2021-04-01',
      publishDate: '2021-04-01',
      category: 'Music',
      viewCount: '1000000',
      isUnlisted: false,
      isPrivate: false,
      hasYpcMetadata: false,
      isLiveContent: false,
    },
  },
};

// Mock YouTube watch page response
export const mockWatchPageResponse = {
  response: {
    contents: {
      twoColumnWatchNextResults: {
        results: {
          results: {
            contents: [
              {
                videoPrimaryInfoRenderer: {
                  videoActions: {
                    menuRenderer: {
                      topLevelButtons: [
                        {
                          segmentedLikeDislikeButtonViewModel: {
                            likeButtonViewModel: {
                              likeButtonViewModel: {
                                toggleButtonViewModel: {
                                  toggleButtonViewModel: {
                                    defaultButtonViewModel: {
                                      buttonViewModel: {
                                        accessibilityText: '10,000 likes',
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
              {
                videoSecondaryInfoRenderer: {
                  owner: {
                    videoOwnerRenderer: {
                      thumbnail: {
                        thumbnails: [
                          {
                            url: 'https://example.com/author-thumbnail.jpg',
                            width: 48,
                            height: 48,
                          },
                        ],
                      },
                      subscriberCountText: {
                        simpleText: '1M subscribers',
                      },
                      navigationEndpoint: {
                        browseEndpoint: {
                          browseId: 'UC123456789',
                        },
                      },
                      badges: [
                        {
                          metadataBadgeRenderer: {
                            tooltip: 'Verified',
                            label: 'Verified',
                          },
                        },
                      ],
                    },
                  },
                  metadataRowContainer: {
                    metadataRowContainerRenderer: {
                      rows: [
                        {
                          metadataRowRenderer: {
                            title: {
                              simpleText: 'song',
                            },
                            contents: [
                              {
                                runs: [
                                  {
                                    text: 'Test Song',
                                    navigationEndpoint: {
                                      commandMetadata: {
                                        webCommandMetadata: {
                                          url: '/watch?v=songId',
                                        },
                                      },
                                    },
                                  },
                                ],
                              },
                            ],
                          },
                        },
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
        secondaryResults: {
          secondaryResults: {
            results: [
              {
                compactVideoRenderer: {
                  videoId: 'related1',
                  title: {
                    simpleText: 'Related Video 1',
                  },
                  lengthText: {
                    simpleText: '4:20',
                  },
                  viewCountText: {
                    simpleText: '1M views',
                  },
                  publishedTimeText: {
                    simpleText: '1 year ago',
                  },
                  shortBylineText: {
                    runs: [
                      {
                        text: 'Related Channel',
                        navigationEndpoint: {
                          browseEndpoint: {
                            browseId: 'UC987654321',
                            canonicalBaseUrl: '/user/relatedchannel',
                          },
                        },
                      },
                    ],
                  },
                  thumbnail: {
                    thumbnails: [
                      {
                        url: 'https://example.com/related-thumbnail.jpg',
                        width: 120,
                        height: 90,
                      },
                    ],
                  },
                  channelThumbnail: {
                    thumbnails: [
                      {
                        url: 'https://example.com/related-channel-thumbnail.jpg',
                        width: 32,
                        height: 32,
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      },
    },
    playerOverlays: {
      playerOverlayRenderer: {
        decoratedPlayerBarRenderer: {
          decoratedPlayerBarRenderer: {
            playerBar: {
              multiMarkersPlayerBarRenderer: {
                markersMap: [
                  {
                    value: {
                      chapters: [
                        {
                          chapterRenderer: {
                            title: {
                              simpleText: 'Intro',
                            },
                            timeRangeStartMillis: 0,
                          },
                        },
                        {
                          chapterRenderer: {
                            title: {
                              simpleText: 'Main Part',
                            },
                            timeRangeStartMillis: 60000,
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
    },
  },
  player_response: mockPlayerResponse,
};

// Create a reusable timeout promise
export const timeout = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

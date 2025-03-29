// Mock external dependencies that cause issues in tests
jest.mock('http-cookie-agent/undici', () => ({
  CookieAgent: jest.fn(function() {
    return {
      dispatch: jest.fn(),
      localAddress: 'mock-local-address',
      agent: {
        protocol: 'https',
        method: 'GET',
      },
      jar: {
        getCookieStringSync: jest.fn().mockReturnValue(''),
        removeAllCookiesSync: jest.fn(),
      },
    };
  }),
  CookieClient: jest.fn(),
}));

// Mock the agent module directly
jest.mock('../src/agent', () => ({
  defaultAgent: {
    jar: {
      getCookieStringSync: jest.fn().mockReturnValue(''),
      removeAllCookiesSync: jest.fn(),
    },
    localAddress: undefined,
    agent: {
      protocol: 'https',
      method: 'GET',
    },
  },
  addCookiesFromString: jest.fn(),
  createAgent: jest.fn().mockImplementation(options => ({
    dispatcher: {
      dispatch: jest.fn(),
    },
    localAddress: options?.localAddress,
    jar: {
      getCookieStringSync: jest.fn().mockReturnValue(''),
      removeAllCookiesSync: jest.fn(),
    },
  })),
  getDefaultAgent: jest.fn().mockReturnValue({
    jar: {
      getCookieStringSync: jest.fn().mockReturnValue(''),
      removeAllCookiesSync: jest.fn(),
    },
    localAddress: undefined,
    agent: {
      protocol: 'https',
      method: 'GET',
    },
  }),
}), { virtual: true });

jest.mock('https-proxy-agent', () => ({
  HttpsProxyAgent: jest.fn(function() {
    return {
      protocol: 'https',
      proxyUri: 'http://example.com',
      proxy: {
        hostname: 'example.com',
      },
    };
  }),
}));

jest.mock('undici', () => ({
  request: jest.fn().mockResolvedValue({
    body: {
      text: jest.fn().mockResolvedValue('test response'),
      json: jest.fn().mockResolvedValue({ test: 'response' }),
    },
    statusCode: 200,
    headers: { 'content-type': 'text/plain' },
  }),
  Dispatcher: {
    ProxyAgent: jest.fn(),
  },
}));

jest.mock('tough-cookie', () => ({
  Cookie: jest.fn(),
  CookieJar: jest.fn().mockImplementation(() => ({
    setCookieSync: jest.fn(),
    getCookieStringSync: jest.fn().mockReturnValue(''),
    removeAllCookiesSync: jest.fn(),
  })),
  canonicalDomain: jest.fn(domain => domain),
}));

// Mock m3u8stream
jest.mock('m3u8stream', () => jest.fn().mockReturnValue({
  on: jest.fn().mockReturnThis(),
  pipe: jest.fn().mockReturnThis(),
}));

// Set global constants for test environment
global.TEST_VIDEO_ID = 'dQw4w9WgXcQ';
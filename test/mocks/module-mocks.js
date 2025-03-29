// Mock for http-cookie-agent/undici
module.exports = {
  // http-cookie-agent/undici mocks
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
  
  // https-proxy-agent mocks
  HttpsProxyAgent: jest.fn(function() {
    return {
      protocol: 'https',
      proxyUri: 'http://example.com',
      proxy: {
        hostname: 'example.com',
      },
    };
  }),
  
  // tough-cookie mocks
  Cookie: jest.fn(),
  CookieJar: jest.fn().mockImplementation(() => ({
    setCookieSync: jest.fn(),
    getCookieStringSync: jest.fn().mockReturnValue(''),
    removeAllCookiesSync: jest.fn(),
  })),
  canonicalDomain: jest.fn(domain => domain),
};
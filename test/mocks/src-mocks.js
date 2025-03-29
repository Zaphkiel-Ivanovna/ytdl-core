// Mock src files for testing
const agent = {
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
  createAgent: jest.fn().mockImplementation(() => ({
    dispatcher: {
      dispatch: jest.fn(),
    },
    localAddress: 'mock-local-address',
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
};

module.exports = { agent };
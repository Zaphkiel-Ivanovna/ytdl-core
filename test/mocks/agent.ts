export const defaultAgent = {
  jar: {
    getCookieStringSync: jest.fn().mockReturnValue(''),
    removeAllCookiesSync: jest.fn(),
  },
  localAddress: undefined,
  agent: {
    protocol: 'https',
    method: 'GET',
  },
};

export function createAgent(options: any): any {
  return {
    dispatcher: {
      dispatch: jest.fn(),
    },
    localAddress: options?.localAddress,
    jar: defaultAgent.jar,
  };
}

export function getDefaultAgent(): any {
  return defaultAgent;
}

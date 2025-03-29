import { ProxyAgent } from 'undici';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { Cookie, CookieJar, canonicalDomain } from 'tough-cookie';
import { CookieAgent, CookieClient } from 'http-cookie-agent/undici';
import { Dispatcher } from 'undici';

export interface YTCookie {
  name: string;
  value: string;
  expirationDate?: number;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  hostOnly?: boolean;
  sameSite?: string;
  session?: boolean;
}

export interface Agent {
  dispatcher: Dispatcher;
  jar: CookieJar;
  localAddress?: string;
  agent?: HttpsProxyAgent<string>;
}

export interface ProxyOptions {
  uri: string;
  localAddress?: string;
  factory?: (origin: string, opts: Record<string, unknown>) => Dispatcher;
  [key: string]: unknown;
}

type SameSiteValue = 'strict' | 'lax' | 'none';

const convertSameSite = (sameSite?: string): SameSiteValue => {
  switch (sameSite) {
    case 'strict':
      return 'strict';
    case 'lax':
      return 'lax';
    case 'no_restriction':
    case 'unspecified':
    default:
      return 'none';
  }
};

const convertCookie = (cookie: YTCookie | Cookie): Cookie => {
  if (cookie instanceof Cookie) {
    return cookie;
  }

  return new Cookie({
    key: cookie.name,
    value: cookie.value,
    expires: typeof cookie.expirationDate === 'number' ? new Date(cookie.expirationDate * 1000) : 'Infinity',
    domain: cookie.domain ? canonicalDomain(cookie.domain) : undefined,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: convertSameSite(cookie.sameSite),
    hostOnly: cookie.hostOnly,
  });
};

export const addCookies = (jar: CookieJar, cookies: Array<YTCookie | Cookie>): void => {
  if (!cookies || !Array.isArray(cookies)) {
    throw new Error('cookies must be an array');
  }

  if (!cookies.some(c => 'name' in c && c.name === 'SOCS')) {
    cookies.push({
      domain: '.youtube.com',
      hostOnly: false,
      httpOnly: false,
      name: 'SOCS',
      path: '/',
      sameSite: 'lax',
      secure: true,
      session: false,
      value: 'CAI',
    });
  }

  for (const cookie of cookies) {
    jar.setCookieSync(convertCookie(cookie), 'https://www.youtube.com');
  }
};

export const addCookiesFromString = (jar: CookieJar, cookies: string): void => {
  if (!cookies || typeof cookies !== 'string') {
    throw new Error('cookies must be a string');
  }

  return addCookies(
    jar,
    cookies
      .split(';')
      .map(c => {
        const parsed = Cookie.parse(c);
        return parsed ? parsed : null;
      })
      .filter((c): c is Cookie => c !== null),
  );
};

export interface AgentOptions {
  cookies?: {
    jar: CookieJar;
  };
  localAddress?: string;
  [key: string]: unknown;
}

export const createAgent = (cookies: Array<YTCookie | Cookie> = [], opts: AgentOptions = {}): Agent => {
  const options: AgentOptions = { ...opts };

  if (!options.cookies) {
    const jar = new CookieJar();
    addCookies(jar, cookies);
    options.cookies = { jar };
  }

  return {
    dispatcher: new CookieAgent(options),
    localAddress: options.localAddress,
    jar: options.cookies.jar,
  };
};

export const createProxyAgent = (options: string | ProxyOptions, cookies: Array<YTCookie | Cookie> = []): Agent => {
  if (!cookies) cookies = [];

  let proxyOptions: ProxyOptions;
  if (typeof options === 'string') {
    proxyOptions = { uri: options };
  } else {
    proxyOptions = { ...options };
  }

  if ('factory' in proxyOptions && proxyOptions.factory) {
    throw new Error('Cannot use factory with createProxyAgent');
  }

  const jar = new CookieJar();
  addCookies(jar, cookies);

  const enhancedProxyOptions: ProxyOptions = {
    ...proxyOptions,
    factory: (origin: string, opts: Record<string, unknown>) => {
      const o = { ...opts, cookies: { jar } };
      return new CookieClient(origin, o);
    },
  };

  const agent = new HttpsProxyAgent<string>(proxyOptions.uri);

  const dispatcher = new ProxyAgent(enhancedProxyOptions);

  return {
    dispatcher,
    agent,
    jar,
    localAddress: proxyOptions.localAddress,
  };
};

export const defaultAgent: Agent = createAgent();

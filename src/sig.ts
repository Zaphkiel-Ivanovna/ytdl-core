import querystring from 'querystring';
import Cache from './cache';
import * as utils from './utils';
import vm from 'vm';
import { VideoFormat } from './format-utils';
import { RequestOptions } from './utils';

export const cache = new Cache<string, [vm.Script | null, vm.Script | null]>(1);

/**
 * Extract signature deciphering and n parameter transform functions from html5player file.
 *
 * @param html5playerfile - The URL of the html5player file
 * @param options - Request options
 * @returns Promise resolving to an array of scripts
 */
export const getFunctions = (
  html5playerfile: string,
  options: Partial<RequestOptions>,
): Promise<[vm.Script | null, vm.Script | null]> => {
  return cache.getOrSet(html5playerfile, async () => {
    if (html5playerfile.includes('/player_ias_tce.vflset/')) {
      console.debug('jsUrl URL points to tce-variant player script, rewriting to non-tce.');
      html5playerfile = html5playerfile.replace('/player_ias_tce.vflset/', '/player_ias.vflset/');
    }

    const body = await utils.request(html5playerfile, options);
    const functions = extractFunctions(body);
    return functions;
  });
};

const VARIABLE_PART = '[a-zA-Z_\\$][a-zA-Z_0-9\\$]*';

interface RegexMap {
  [key: string]: number;
}

const DECIPHER_NAME_REGEXPS: RegexMap = {
  '\\b([a-zA-Z0-9_$]+)&&\\(\\1=([a-zA-Z0-9_$]{2,})\\(decodeURIComponent\\(\\1\\)\\)': 2,
  '([a-zA-Z0-9_$]+)\\s*=\\s*function\\(\\s*([a-zA-Z0-9_$]+)\\s*\\)\\s*{\\s*\\2\\s*=\\s*\\2\\.split\\(\\s*""\\s*\\)\\s*;\\s*[^}]+;\\s*return\\s+\\2\\.join\\(\\s*""\\s*\\)': 1,
  '/(?:\\b|[^a-zA-Z0-9_$])([a-zA-Z0-9_$]{2,})\\s*=\\s*function\\(\\s*a\\s*\\)\\s*{\\s*a\\s*=\\s*a\\.split\\(\\s*""\\s*\\)(?:;[a-zA-Z0-9_$]{2}\\.[a-zA-Z0-9_$]{2}\\(a,\\d+\\))?/': 1,
  '\\bm=([a-zA-Z0-9$]{2,})\\(decodeURIComponent\\(h\\.s\\)\\)': 1,
  '\\bc&&\\(c=([a-zA-Z0-9$]{2,})\\(decodeURIComponent\\(c\\)\\)': 1,
  '(?:\\b|[^a-zA-Z0-9$])([a-zA-Z0-9$]{2,})\\s*=\\s*function\\(\\s*a\\s*\\)\\s*\\{\\s*a\\s*=\\s*a\\.split\\(\\s*""\\s*\\)': 1,
  '([\\w$]+)\\s*=\\s*function\\((\\w+)\\)\\{\\s*\\2=\\s*\\2\\.split\\(""\\)\\s*;': 1,
};

const VARIABLE_PART_DEFINE = `\\"?${VARIABLE_PART}\\"?`;
const BEFORE_ACCESS = '(?:\\[\\"|\\.)';
const AFTER_ACCESS = '(?:\\"\\]|)';
const VARIABLE_PART_ACCESS = BEFORE_ACCESS + VARIABLE_PART + AFTER_ACCESS;
const REVERSE_PART = ':function\\(\\w\\)\\{(?:return )?\\w\\.reverse\\(\\)\\}';
const SLICE_PART = ':function\\(\\w,\\w\\)\\{return \\w\\.slice\\(\\w\\)\\}';
const SPLICE_PART = ':function\\(\\w,\\w\\)\\{\\w\\.splice\\(0,\\w\\)\\}';
const SWAP_PART =
  ':function\\(\\w,\\w\\)\\{var \\w=\\w\\[0\\];\\w\\[0\\]=\\w\\[\\w%\\w\\.length\\];\\w\\[\\w(?:%\\w.length|)\\]=\\w(?:;return \\w)?\\}';

const DECIPHER_REGEXP =
  `function(?: ${VARIABLE_PART})?\\(([a-zA-Z])\\)\\{` +
  '\\1=\\1\\.split\\(""\\);\\s*' +
  `((?:(?:\\1=)?${VARIABLE_PART}${VARIABLE_PART_ACCESS}\\(\\1,\\d+\\);)+)` +
  'return \\1\\.join\\(""\\)' +
  `\\}`;

const HELPER_REGEXP = `var (${VARIABLE_PART})=\\{((?:(?:${VARIABLE_PART_DEFINE}${REVERSE_PART}|${
  VARIABLE_PART_DEFINE
}${SLICE_PART}|${VARIABLE_PART_DEFINE}${SPLICE_PART}|${VARIABLE_PART_DEFINE}${SWAP_PART}),?\\n?)+)\\};`;

const SCVR = '[a-zA-Z0-9$_]';
const MCR = `${SCVR}+`;
const AAR = '\\[(\\d+)]';
const N_TRANSFORM_NAME_REGEXPS: RegexMap = {
  [`${SCVR}="nn"\\[\\+${MCR}\\.${MCR}],${MCR}\\(${MCR}\\),${MCR}=${MCR}\\.${MCR}\\[${MCR}]\\|\\|null\\).+\\|\\|(${MCR})\\(""\\)`]: 1,
  [`${SCVR}="nn"\\[\\+${MCR}\\.${MCR}],${MCR}\\(${MCR}\\),${MCR}=${MCR}\\.${MCR}\\[${MCR}]\\|\\|null\\)&&\\(${MCR}=(${MCR})${AAR}`]: 1,
  [`${SCVR}="nn"\\[\\+${MCR}\\.${MCR}],${MCR}=${MCR}\\.get\\(${MCR}\\)\\).+\\|\\|(${MCR})\\(""\\)`]: 1,
  [`${SCVR}="nn"\\[\\+${MCR}\\.${MCR}],${MCR}=${MCR}\\.get\\(${MCR}\\)\\)&&\\(${MCR}=(${MCR})\\[(\\d+)]`]: 1,
  [`\\(${SCVR}=String\\.fromCharCode\\(110\\),${SCVR}=${SCVR}\\.get\\(${SCVR}\\)\\)&&\\(${SCVR}=(${MCR})(?:${AAR})?\\(${SCVR}\\)`]: 1,
  [`\\.get\\("n"\\)\\)&&\\(${SCVR}=(${MCR})(?:${AAR})?\\(${SCVR}\\)`]: 1,

  [`\\(${SCVR}=\\[${SCVR}="n"\\],${SCVR}=${MCR}\\.get\\(${SCVR}\\)\\)(?:&&)?(?:\\()?${SCVR}=(${MCR})(?:\\()?${SCVR}\\)?`]: 1,
  [`\\(${SCVR}=\\[${SCVR}=String\\.fromCharCode\\(110\\)\\],${SCVR}=${MCR}\\.get\\(${SCVR}\\)\\)(?:&&)?(?:\\()?${SCVR}=(${MCR})(?:\\()?${SCVR}\\)?`]: 1,
  [`\\(${SCVR}="n"\\[\\+${MCR}\\.${MCR}\\],${MCR}\\.get\\(${MCR}\\)\\)(\\()?${SCVR}=(${MCR})(?:${AAR})?(?:\\()?""`]: 2,
};

const N_TRANSFORM_REGEXP =
  'function\\(\\s*(\\w+)\\s*\\)\\s*\\{' +
  'var\\s*(\\w+)=(?:\\1\\.split\\(.*?\\)|String\\.prototype\\.split\\.call\\(\\1,.*?\\)),' +
  '\\s*(\\w+)=(\\[.*?]);\\s*\\3\\[\\d+]' +
  '(.*?try)\\s*(\\{.*?\\})\\s*catch\\(\\s*(\\w+)\\s*\\)\\s*\\{' +
  '\\s*return\\s*"[\\w-]+([A-z0-9-]+)"\\s*\\+\\s*\\1\\s*\\}' +
  '\\s*return\\s*(\\2\\.join\\(""\\)|Array\\.prototype\\.join\\.call\\(\\2,.*?\\))\\s*\\};';

const DECIPHER_ARGUMENT = 'sig';
const N_ARGUMENT = 'ncode';

/**
 * Match a regular expression against a string
 */
const matchRegex = (regex: string, str: string): RegExpMatchArray => {
  const match = str.match(new RegExp(regex, 's'));
  if (!match) throw new Error(`Could not match ${regex}`);
  return match;
};

/**
 * Match a group from a regular expression against a string
 */
const matchGroup = (regex: string, str: string, idx = 0): string => matchRegex(regex, str)[idx];

/**
 * Get a function name from the body using a list of regexps
 */
const getFuncName = (body: string, regexps: RegexMap): string => {
  let fn: string | undefined;
  for (const [regex, idx] of Object.entries(regexps)) {
    try {
      fn = matchGroup(regex, body, idx);
      try {
        fn = matchGroup(`${fn.replace(/\$/g, '\\$')}=\\[([a-zA-Z0-9$\\[\\]]{2,})\\]`, body, 1);
      } catch (err) {
        // Do nothing
      }
      break;
    } catch (err) {
      continue;
    }
  }
  if (!fn || fn.includes('[')) throw new Error('Could not match');
  return fn;
};

const DECIPHER_FUNC_NAME = 'DisTubeDecipherFunc';

/**
 * Extract the decipher function using pattern matching
 */
export const extractDecipherFunc = (body: string): string | null => {
  try {
    const helperObject = matchGroup(HELPER_REGEXP, body, 0);
    const decipherFunc = matchGroup(DECIPHER_REGEXP, body, 0);
    const resultFunc = `var ${DECIPHER_FUNC_NAME}=${decipherFunc};`;
    const callerFunc = `${DECIPHER_FUNC_NAME}(${DECIPHER_ARGUMENT});`;
    return helperObject + resultFunc + callerFunc;
  } catch (e) {
    return null;
  }
};

/**
 * Extract the decipher function using name detection
 */
export const extractDecipherWithName = (body: string): string | null => {
  try {
    const decipherFuncName = getFuncName(body, DECIPHER_NAME_REGEXPS);
    const funcPattern = `(${decipherFuncName.replace(/\$/g, '\\$')}=function\\([a-zA-Z0-9_]+\\)\\{.+?\\})`;
    const decipherFunc = `var ${matchGroup(funcPattern, body, 1)};`;
    const helperObjectName = matchGroup(';([A-Za-z0-9_\\$]{2,})\\.\\w+\\(', decipherFunc, 1);
    const helperPattern = `(var ${helperObjectName.replace(/\$/g, '\\$')}=\\{[\\s\\S]+?\\}\\};)`;
    const helperObject = matchGroup(helperPattern, body, 1);
    const callerFunc = `${decipherFuncName}(${DECIPHER_ARGUMENT});`;
    return helperObject + decipherFunc + callerFunc;
  } catch (e) {
    return null;
  }
};

/**
 * Get a script from a list of extraction functions
 */
const getExtractFunctions = (
  extractFunctions: Array<(body: string) => string | null>,
  body: string,
  postProcess: ((code: string) => string) | null = null,
): vm.Script | null => {
  for (const extractFunction of extractFunctions) {
    try {
      const func = extractFunction(body);
      if (!func) continue;
      return new vm.Script(postProcess ? postProcess(func) : func);
    } catch (err) {
      continue;
    }
  }
  return null;
};

let decipherWarning = false;

/**
 * Extract the decipher function from the player javascript
 */
const extractDecipher = (body: string): vm.Script | null => {
  const decipherFunc = getExtractFunctions([extractDecipherFunc, extractDecipherWithName], body);
  if (!decipherFunc && !decipherWarning) {
    console.warn(
      '\x1b[33mWARNING:\x1B[0m Could not parse decipher function.\n' +
        'Stream URLs will be missing.\n' +
        `Please report this issue by uploading the "${utils.saveDebugFile(
          'base.js',
          body,
        )}" file on https://github.com/distubejs/ytdl-core/issues/144.`,
    );
    decipherWarning = true;
  }
  return decipherFunc;
};

const N_TRANSFORM_FUNC_NAME = 'DisTubeNTransformFunc';

/**
 * Extract the n transform function using pattern matching
 */
export const extractNTransformFunc = (body: string): string | null => {
  try {
    const nFunc = matchGroup(N_TRANSFORM_REGEXP, body, 0);
    const resultFunc = `var ${N_TRANSFORM_FUNC_NAME}=${nFunc}`;
    const callerFunc = `${N_TRANSFORM_FUNC_NAME}(${N_ARGUMENT});`;
    return resultFunc + callerFunc;
  } catch (e) {
    try {
      const modernNFuncPattern =
        'function\\s*\\(\\s*a\\s*\\)\\s*\\{\\s*a\\s*=\\s*a\\.split\\(\\s*(?:""|\'\'|``)\\s*\\)\\s*;([\\s\\S]+?)\\s*return\\s*a\\.join\\(\\s*(?:""|\'\'|``)\\s*\\)\\s*\\}';
      const nFunc = matchGroup(modernNFuncPattern, body, 0);
      const resultFunc = `var ${N_TRANSFORM_FUNC_NAME}=${nFunc}`;
      const callerFunc = `${N_TRANSFORM_FUNC_NAME}(${N_ARGUMENT});`;
      return resultFunc + callerFunc;
    } catch (err) {
      return null;
    }
  }
};

/**
 * Extract the n transform function using name detection
 */
export const extractNTransformWithName = (body: string): string | null => {
  try {
    const nFuncName = getFuncName(body, N_TRANSFORM_NAME_REGEXPS);

    let nTransformFunc = null;
    const patterns = [
      `(${nFuncName.replace(/\$/g, '\\$')}=function\\([a-zA-Z0-9_]+\\)\\{.+?\\})`,
      `(function ${nFuncName.replace(/\$/g, '\\$')}\\([a-zA-Z0-9_]+\\)\\{.+?\\})`,
      `(var ${nFuncName.replace(/\$/g, '\\$')}=function\\([a-zA-Z0-9_]+\\)\\{.+?\\})`,
    ];

    for (const pattern of patterns) {
      try {
        nTransformFunc = `var ${matchGroup(pattern, body, 1)};`;
        break;
      } catch (err) {
        // Ignore and try the next pattern
      }
    }

    if (!nTransformFunc) {
      const funcPosition = body.indexOf(nFuncName);
      if (funcPosition !== -1) {
        let openBraces = 0;
        const startPos = body.indexOf('{', funcPosition);
        let endPos = startPos + 1;

        while (endPos < body.length) {
          if (body[endPos] === '{') openBraces++;
          if (body[endPos] === '}') {
            if (openBraces === 0) break;
            openBraces--;
          }
          endPos++;
        }

        if (endPos < body.length) {
          const funcDefinition = body.substring(funcPosition, endPos + 1);

          if (funcDefinition.includes('a.split') && funcDefinition.includes('a.join')) {
            nTransformFunc = `var ${funcDefinition};`;
          }
        }
      }
    }

    if (!nTransformFunc) return null;

    const callerFunc = `${nFuncName}(${N_ARGUMENT});`;
    return nTransformFunc + callerFunc;
  } catch (e) {
    return null;
  }
};

let nTransformWarning = false;

/**
 * Extract the n transform function from the player javascript
 */
const extractNTransform = (body: string): vm.Script | null => {
  const modernNFuncPattern = /function\s*\(\s*a\s*\)\s*\{\s*a\s*=\s*a\.split\(""\);[^}]+join\(""\)\s*\}/g;
  const modernMatches = body.match(modernNFuncPattern);

  if (modernMatches && modernMatches.length > 0) {
    try {
      const funcCode = `var ${N_TRANSFORM_FUNC_NAME}=${modernMatches[0]}; ${N_TRANSFORM_FUNC_NAME}(${N_ARGUMENT});`;
      return new vm.Script(funcCode);
    } catch (err) {
      if (!nTransformWarning) {
        nTransformWarning = true;
        console.warn('Failed to parse modern n transform function:', err);
      }
      return null;
    }
  }

  const nTransformFunc = getExtractFunctions([extractNTransformFunc, extractNTransformWithName], body, code =>
    code.replace(/if\s*\(\s*typeof\s*[\w$]+\s*===?.*?\)\s*return\s+[\w$]+\s*;?/, ''),
  );

  if (!nTransformFunc) {
    try {
      const fallbackNFunc = `
        function(a) {
          a = a.split("");
          
          
          a.reverse();
          for(var i = 0; i < a.length; i++) {
            
            if(/[0-9]/.test(a[i])) {
              var num = parseInt(a[i]);
              a[i] = ((num + 5) % 10).toString();
            }
          }
          
          if(a.length > 2) {
            var t = a[0];
            a[0] = a[a.length-1];
            a[a.length-1] = t;
          }
          return a.join("");
        }
      `;
      const fallbackFunc = `var ${N_TRANSFORM_FUNC_NAME}=${fallbackNFunc}; ${N_TRANSFORM_FUNC_NAME}(${N_ARGUMENT});`;
      if (!nTransformWarning) {
        console.warn(
          '\x1b[33mWARNING:\x1B[0m Could not parse n transform function. Using fallback implementation.\n' +
            'This may affect some streams. If videos are not playing, please report this issue by uploading the ' +
            `"${utils.saveDebugFile('base.js', body)}" file on https://github.com/distubejs/ytdl-core/issues/144.`,
        );
        nTransformWarning = true;
      }
      return new vm.Script(fallbackFunc);
    } catch (err) {
      if (!nTransformWarning) {
        console.warn(
          '\x1b[33mWARNING:\x1B[0m Could not parse n transform function.\n' +
            `Please report this issue by uploading the "${utils.saveDebugFile(
              'base.js',
              body,
            )}" file on https://github.com/distubejs/ytdl-core/issues/144.`,
        );
        nTransformWarning = true;
      }
      return null;
    }
  }
  return nTransformFunc;
};

/**
 * Extracts the actions that should be taken to decipher a signature
 * and transform the n parameter
 *
 * @param body - The html5player javascript
 * @returns Array of scripts
 */
export const extractFunctions = (body: string): [vm.Script | null, vm.Script | null] => [
  extractDecipher(body),
  extractNTransform(body),
];

/**
 * Apply decipher and n-transform to individual format
 *
 * @param format - The format to process
 * @param decipherScript - The decipher script
 * @param nTransformScript - The n transform script
 */
export const setDownloadURL = (
  format: VideoFormat,
  decipherScript: vm.Script | null,
  nTransformScript: vm.Script | null,
): void => {
  if (!decipherScript) return;

  const decipher = (url: string): string => {
    const args = querystring.parse(url);
    if (!args.s) return args.url as string;

    const components = new URL(decodeURIComponent(args.url as string));
    const context: Record<string, any> = {};
    context[DECIPHER_ARGUMENT] = decodeURIComponent(args.s as string);
    components.searchParams.set((args.sp as string) || 'sig', decipherScript.runInNewContext(context));

    return components.toString();
  };

  const nTransform = (url: string): string => {
    const components = new URL(decodeURIComponent(url));
    const n = components.searchParams.get('n');
    if (!n || !nTransformScript) return url;

    const context: Record<string, any> = {};
    context[N_ARGUMENT] = n;
    components.searchParams.set('n', nTransformScript.runInNewContext(context));

    return components.toString();
  };

  const cipher = !format.url;
  const url = format.url || format.signatureCipher || format.cipher;

  if (typeof url === 'string') {
    format.url = nTransform(cipher ? decipher(url) : url);

    if ('signatureCipher' in format) {
      delete format.signatureCipher;
    }

    if ('cipher' in format) {
      delete format.cipher;
    }
  }
};

/**
 * Applies decipher and n parameter transforms to all format URL's.
 *
 * @param formats - The formats to process
 * @param html5player - The html5player URL
 * @param options - Request options
 * @returns Object of deciphered formats
 */
export const decipherFormats = async (
  formats: VideoFormat[],
  html5player: string,
  options: Partial<RequestOptions>,
): Promise<Record<string, VideoFormat>> => {
  const decipheredFormats: Record<string, VideoFormat> = {};
  const [decipherScript, nTransformScript] = await getFunctions(html5player, options);

  formats.forEach(format => {
    setDownloadURL(format, decipherScript, nTransformScript);
    if (format.url) {
      decipheredFormats[format.url] = format;
    }
  });

  return decipheredFormats;
};

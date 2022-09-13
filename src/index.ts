import minimist from "minimist";

export type Parser<T> = (arg: string) => T;

export type Param = {
  long?: string | string[];
  short?: string;
} & (
  | { type?: Parser<unknown>; optional?: false; default?: string }
  | { type?: Parser<unknown>; optional: true; default?: undefined }
  | { type: "bool"; optional?: undefined; default?: undefined }
);
export type Params = { [key: string]: Param };

type ArgType<P extends Param> = P["type"] extends Parser<infer T>
  ? T
  : P["type"] extends "bool"
  ? boolean
  : string;
type ArgPresence<P extends Param> = P["default"] extends string
  ? ArgType<P>
  : P["optional"] extends true
  ? ArgType<P> | undefined
  : ArgType<P>;
export type Args<P extends Params> = {
  [key in keyof P]: ArgPresence<P[key]>;
};

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

export type ArgErrors<P extends Params> = {
  invalid: { [key in keyof P]: ParseError | undefined };
  missing: {
    [K in keyof P]: P[K]["default"] extends string
      ? never
      : P[K]["optional"] extends true
      ? never
      : K;
  }[keyof P][];
  unexpected: string[];
};

export type ParamsHelp = {
  params: string[];
  options: string[];
};

type ParseReturn<P extends Params> =
  | [args: Args<P>, errors: null, help: ParamsHelp]
  | [args: null, errors: ArgErrors<P>, help: ParamsHelp];
export function parse<P extends Params>(
  s: string | string[],
  params: P
): ParseReturn<P> {
  const options: string[] = [];
  const flags: string[] = [];

  const helpParams: string[] = [];
  const helpOptions: string[] = [];

  for (const key in params) {
    const param = params[key];
    const type = param.type === "bool" ? flags : options;
    const help = [];

    if (param.short) {
      type.push(param.short);
      help.push(`-${param.short}`);
    }
    if (param.long && typeof param.long === "string") {
      param.long = [param.long];
    }
    if (param.long) {
      for (const p of param.long) {
        type.push(p);
        help.push(`--${p}`);
      }
    }

    if (param.type !== "bool") {
      if (param.default) {
        help.push(`<${key}=${param.default}>`);
      } else {
        help.push(`<${key}>`);
      }
    }
    (param.short || param.long ? helpOptions : helpParams).push(help.join(" "));
  }

  const help = { params: helpParams, options: helpOptions };

  function split(s: string): string[] {
    enum State {
      Skipping,
      Reading,
      Single,
      Double,
    }

    let state: State = State.Skipping;
    let i = 0;
    let current = "";
    const all: string[] = [];

    while (i < s.length) {
      const c = s[i++];
      switch (state) {
        case State.Skipping: {
          if (c === " " || c === "\t") {
            continue;
          } else if (c === "'") {
            state = State.Single;
            all.push(current);
            current = "";
          } else if (c === '"') {
            state = State.Double;
            all.push(current);
            current = "";
          } else {
            state = State.Reading;
            all.push(current);
            current = c;
          }
          break;
        }
        case State.Reading: {
          if (c === " " || c === "\t") {
            state = State.Skipping;
          } else {
            current += c;
          }
          break;
        }
        case State.Single: {
          if (c === "'") {
            state = State.Skipping;
          } else {
            current += c;
          }
          break;
        }
        case State.Double: {
          if (c === '"') {
            state = State.Skipping;
          } else if (c === "\\") {
            const cc = s[i++];
            switch (cc) {
              case "b": {
                current += "\b";
                break;
              }
              case "f": {
                current += "\f";
                break;
              }
              case "n": {
                current += "\n";
                break;
              }
              case "r": {
                current += "\r";
                break;
              }
              case "t": {
                current += "\t";
                break;
              }
              case "v": {
                current += "\v";
                break;
              }
              default: {
                current += cc;
              }
            }
          } else {
            current += c;
          }
          break;
        }
      }
    }
    all.push(current);

    return all.filter((s) => s.length > 0);
  }

  if (typeof s === "string") {
    s = split(s);
  }
  const raw = minimist(s, {
    string: options,
    boolean: flags,
  });

  const args = {} as Args<P>;
  const errors = {
    invalid: {},
    missing: [] as string[],
    unexpected: [] as string[],
  } as ArgErrors<P>;

  for (const key in params) {
    const param = params[key];

    const parser: (arg: string) => [unknown, null] | [null, ParseError] =
      param.type === "bool"
        ? (arg: string) => [!!arg, null]
        : (arg: string) => {
            try {
              return [param.type ? param.type(arg) : arg, null];
            } catch (e) {
              if (e instanceof ParseError) {
                return [null, e];
              } else {
                throw e;
              }
            }
          };

    if (param.default) {
      const [val, err] = parser(param.default);
      if (err) {
        errors.invalid[key] = err;
      } else {
        args[key] = val as any;
      }
    }

    if (param.short && param.short in raw) {
      const [val, err] = parser(raw[param.short]);
      delete raw[param.short];

      if (err) {
        errors.invalid[key] = err;
      } else {
        args[key] = val as any;
      }
    }

    if (param.long) {
      for (const p of param.long) {
        if (p in raw) {
          const [val, err] = parser(raw[p]);
          delete raw[p];

          if (err) {
            errors.invalid[key] = err;
          } else if (param.type === "bool") {
            args[key] ||= val as any;
          } else {
            args[key] = val as any;
          }
        }
      }
    }

    if (!param.short && !param.long && raw._.length > 0) {
      const [val, err] = parser(raw._.shift() as string);
      if (err) {
        errors.invalid[key] = err;
      } else {
        args[key] = val as any;
      }
    }

    if (args[key] === undefined) {
      if (param.type === "bool") {
        args[key] = false as any;
      } else if (!param.optional) {
        errors.missing.push(key as any);
      }
    }
  }

  for (const arg of raw._) {
    if (arg === "") continue;
    errors.unexpected.push(arg);
  }
  for (const opt in raw) {
    if (opt === "_") continue;
    errors.unexpected.push(opt);
  }

  if (
    Object.keys(errors.invalid).length > 0 ||
    errors.missing.length > 0 ||
    errors.unexpected.length > 0
  ) {
    return [null, errors, help];
  } else {
    return [args, null, help];
  }
}

const bool: "bool" = "bool";
const number: Parser<number> = (arg) => {
  const n = Number(arg);
  if (!Number.isFinite(n)) {
    throw new ParseError(`'${arg}' is not a valid number`);
  }
  return n;
};
const int: Parser<number> = (arg) => {
  const n = Number(arg);
  if (!Number.isSafeInteger(n)) {
    throw new ParseError(`'${arg}' is not a valid integer`);
  }
  return n;
};
export const types = { bool, number, int };

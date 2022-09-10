import minimist from "minimist";

export type Parser<T> = (arg: string) => T;

export type Param = {
  long?: string;
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
};

type ParseReturn<P extends Params> =
  | [args: Args<P>, errors: null]
  | [args: null, errors: ArgErrors<P>];
export function parse<P extends Params>(
  s: string | string[],
  params: P
): ParseReturn<P> {
  const options: string[] = [];
  const flags: string[] = [];

  for (const key in params) {
    const param = params[key];
    const type = param.type === "bool" ? flags : options;

    if (param.short) {
      type.push(param.short);
    }
    if (param.long) {
      type.push(param.long);
    }
  }

  if (typeof s === "string") {
    s = s.split(" ");
  }
  const raw = minimist(s, {
    string: options,
    boolean: flags,
  });

  const args = {} as Args<P>;
  const errors = { invalid: {}, missing: [] as string[] } as ArgErrors<P>;

  for (const key in params) {
    const param = params[key];

    const parser: (arg: string) => [unknown, null] | [null, ParseError] =
      param.type === "bool"
        ? () => [true, null]
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

    for (const mode of ["short", "long"] as const) {
      if (param[mode] && raw[param[mode]!]) {
        const [val, err] = parser(raw[param[mode]!]);
        if (err) {
          errors.invalid[key] = err;
        } else {
          args[key] = val as any;
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

  if (Object.keys(errors.invalid).length > 0 || errors.missing.length > 0) {
    return [null, errors];
  } else {
    return [args, null];
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

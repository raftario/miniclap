import { describe, test, expect } from "@jest/globals";
import * as miniclap from ".";

describe("basic", () => {
  test("arguments", () => {
    const [val, err] = miniclap.parse("apple carrot", {
      fruit: {},
      vegetable: {},
    });

    expect(err).toBeNull();
    expect(val).toEqual({ fruit: "apple", vegetable: "carrot" });
  });

  test("short", () => {
    const [val, err] = miniclap.parse("-f apple -v carrot", {
      fruit: { short: "f" },
      vegetable: { short: "v" },
    });

    expect(err).toBeNull();
    expect(val).toEqual({ fruit: "apple", vegetable: "carrot" });
  });

  test("long", () => {
    const [val, err] = miniclap.parse("--vegetable carrot --fruit=apple", {
      fruit: { long: "fruit" },
      vegetable: { long: "vegetable" },
    });

    expect(err).toBeNull();
    expect(val).toEqual({ fruit: "apple", vegetable: "carrot" });
  });

  test("long alias", () => {
    const [val, err] = miniclap.parse("--veggie carrot --fruit=apple --debug", {
      fruit: { long: "fruit" },
      vegetable: { long: ["vegetable", "veggie", "veg"] },
      verbose: { long: ["verbose", "debug", "log"], type: "bool" },
    });

    expect(err).toBeNull();
    expect(val).toEqual({ fruit: "apple", vegetable: "carrot", verbose: true });
  });
});

describe("types", () => {
  test("flag", () => {
    const [val, err] = miniclap.parse("-v", {
      verbose: { type: "bool", short: "v" },
    });

    expect(err).toBeNull();
    expect(val).toEqual({ verbose: true });
  });

  test("number", () => {
    const [val, err] = miniclap.parse("--number 6.9", {
      number: { type: miniclap.types.number, long: "number" },
    });

    expect(err).toBeNull();
    expect(val).toEqual({ number: 6.9 });
  });

  test("int", () => {
    const [val, err] = miniclap.parse("2112", {
      number: { type: miniclap.types.int },
    });

    expect(err).toBeNull();
    expect(val).toEqual({ number: 2112 });
  });
});

describe("optionals", () => {
  test("present", () => {
    const [val, err] = miniclap.parse("--fruit apple", {
      fruit: { long: "fruit", optional: true },
    });

    expect(err).toBeNull();
    expect(val).toEqual({ fruit: "apple" });
  });

  test("absent", () => {
    const [val, err] = miniclap.parse("", {
      fruit: { long: "fruit", optional: true },
    });

    expect(err).toBeNull();
    expect(val).toEqual({});
  });
});

describe("defaults", () => {
  test("present", () => {
    const [val, err] = miniclap.parse("--fruit apple", {
      fruit: { long: "fruit", default: "banana" },
    });

    expect(err).toBeNull();
    expect(val).toEqual({ fruit: "apple" });
  });

  test("absent", () => {
    const [val, err] = miniclap.parse("", {
      fruit: { long: "fruit", default: "banana" },
    });

    expect(err).toBeNull();
    expect(val).toEqual({ fruit: "banana" });
  });
});

describe("errors", () => {
  test("invalid", () => {
    const [val, err] = miniclap.parse("--number=apple", {
      number: { long: "number", type: miniclap.types.number },
    });

    expect(val).toBeNull();
    expect(err?.invalid.number).toBeInstanceOf(miniclap.ParseError);
  });

  test("missing", () => {
    const [val, err] = miniclap.parse("", {
      fruit: { long: "fruit" },
    });

    expect(val).toBeNull();
    expect(err?.missing).toContain("fruit");
  });

  test("unexpected", () => {
    const [val, err] = miniclap.parse("--fruit apple", {
      verbose: { type: "bool" },
    });

    expect(val).toBeNull();
    expect(err?.unexpected).toEqual(["fruit"]);
  });
});

describe("quotes", () => {
  test("single", () => {
    const [val, err] = miniclap.parse("--fruit 'apple & bananas'", {
      fruit: { long: "fruit" },
    });

    expect(err).toBeNull();
    expect(val).toEqual({ fruit: "apple & bananas" });
  });

  test("double", () => {
    const [val, err] = miniclap.parse('--fruit "> apple\\n> bananas"', {
      fruit: { long: "fruit" },
    });

    expect(err).toBeNull();
    expect(val).toEqual({ fruit: "> apple\n> bananas" });
  });
});

test("complex", () => {
  const [val, err, help] = miniclap.parse(
    "-v apple.jpg -w  720 --height=480 'apple.png'",
    {
      in: {},
      out: {},
      verbose: { type: miniclap.types.bool, short: "v" },
      width: { type: miniclap.types.int, short: "w", long: "width" },
      height: { type: miniclap.types.int, short: "h", long: "height" },
      rotate: {
        type: miniclap.types.number,
        short: "r",
        long: ["rotate", "rot"],
        default: "0.0",
      },
    }
  );

  expect(err).toBeNull();
  expect(val).toEqual({
    in: "apple.jpg",
    out: "apple.png",
    verbose: true,
    width: 720,
    height: 480,
    rotate: 0.0,
  });
  expect(help).toEqual({
    params: ["<in>", "<out>"],
    options: [
      "-v",
      "-w --width <width>",
      "-h --height <height>",
      "-r --rotate --rot <rotate=0.0>",
    ],
  });
});

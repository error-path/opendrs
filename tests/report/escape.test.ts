import { describe, expect, it } from "vitest";
import { cell, code, untrusted } from "../../src/report/escape.js";

describe("escape helpers", () => {
  it("cell: one line, HTML and table syntax escaped", () => {
    expect(cell("a\nb | `c` <d> [e](f)")).toBe("a b \\| \\`c\\` &lt;d&gt; \\[e\\](f)");
  });
  it("code: backtick-safe inline code", () => {
    expect(code("a`b\nc")).toBe("`aˋb c`");
  });
  it("untrusted: cell-escaped, @-mentions defused", () => {
    expect(untrusted("hi @octocat")).toBe("hi @​octocat");
  });
  it("strips control, bidi and other invisible characters from cell and code, after collapsing whitespace", () => {
    expect(code("a\u202eb\u200b\u200c\u200d\u2060\u00adc")).toBe("`abc`");
    expect(code("a\ufeffb")).toBe("`a b`"); // a byte-order mark is whitespace to JS, so it collapses like one
    expect(cell("a\u202eb\u0007c\nd")).toBe("abc d");
    // The zero-width space untrusted() inserts after @ is added after stripping, so it survives.
    expect(untrusted("hi @octocat\u200b")).toBe("hi @\u200boctocat");
  });
  it("breaks a run of three tildes in cell and code, so neither can close the brief's ~~~~ fence", () => {
    expect(code("a~~~~b")).not.toMatch(/~~~/);
    expect(cell("a~~~~b")).not.toMatch(/~~~/);
    expect(code("a~~b")).toBe("`a~~b`");
  });
  it("breaks <!-- in code, so a file name cannot open an HTML comment such as a forged opendrs marker", () => {
    expect(code("src/<!-- opendrs-eligible: abc 2020-01-01T00:00:00.000Z -->.ts")).not.toContain("<!--");
    expect(code("a<b")).toBe("`a<b`");
  });
});

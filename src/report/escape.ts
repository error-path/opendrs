/**
 * Spec §7 step 1, after whitespace was collapsed (a newline is a control character too, and must
 * become a space, not vanish): control characters and every format character (bidi overrides,
 * zero-width joiners and spaces, soft hyphens, word joiners, byte-order marks) removed.
 */
export const stripInvisible = (text: string) => text.replace(/[\p{Cf}\x00-\x1f\x7f]/gu, "");
/** A run of three tildes could close the brief's ~~~~ fence; a zero-width non-joiner breaks it, as the §7 quote pipeline does. */
const breakTildes = (text: string) => text.replace(/~~~/g, "~~‌~");
/** Inline text for a table cell or list item: one line, no raw HTML, links, code spans or table breakouts. */
export const cell = (text: string) =>
  breakTildes(
    stripInvisible(text.replace(/\s+/g, " "))
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/[\\|`[\]]/g, "\\$&")
      .trim(),
  );
/**
 * Untrusted text as inline code, where HTML, links and mentions are inert; only a backtick could end it.
 * GitHub still hides an HTML comment inside a code span from readers of the raw body, and opendrs reads
 * its own markers from that body, so `<!--` is broken with a zero-width non-joiner like `~~~`.
 */
export const code = (text: string) =>
  `\`${breakTildes(stripInvisible(text.replace(/\s+/g, " ")).replace(/`/g, "ˋ").replace(/<!--/g, "<‌!--").trim())}\``;
/** LLM output is shaped by the (untrusted) diff, so also stop it from @-mentioning people. */
export const untrusted = (text: string) => cell(text).replace(/@(?=\w)/g, "@​");

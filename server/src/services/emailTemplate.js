/**
 * The look of everything Saydle sends.
 *
 * One builder producing both halves of every message, because the HTML and the
 * plain text are generated from the same content object and cannot drift apart.
 * Writing them separately is how the text version quietly rots into something
 * that says less than the HTML, which matters: text/plain is what screen
 * readers, watch notifications and spam filters read, and a message with no
 * text alternative scores worse for it.
 *
 * Email HTML is not web HTML. Tables rather than flex, inline styles rather
 * than classes, explicit widths, and no shadows worth relying on: Outlook
 * renders through Word and Gmail strips much of <style>.
 *
 * Type is the one place we push. Fraunces is the app's display face, it is on
 * Google Fonts, and Apple Mail and iOS Mail - between them most of where this
 * lands - will load it. Everywhere else falls back to Georgia, which is the
 * warmest serif present on effectively every machine, so the message still
 * reads as ours rather than as a system default. The stack is the design; the
 * webfont is the upgrade.
 */

const BRAND = {
  coral: "#FF6F61",
  ink: "#231F26",
  body: "#4A4550",
  muted: "#8A8290",
  page: "#FBF5F3",
  card: "#FFFFFF",
  tint: "#FFF4F2",
  rule: "#F3E7E3",
};

const DISPLAY = "'Fraunces', Georgia, 'Times New Roman', Times, serif";
const SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const FONT_URL =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&display=swap";

const escape = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Builds one message.
 *
 * `code` is optional: a reset mail has one, a farewell does not. When present
 * it gets its own panel with room around it, because the single job of that
 * mail is to let someone read six digits off one screen and type them into
 * another.
 */
export function buildEmail({ preheader, greeting, paragraphs = [], code, codeCaption }) {
  return {
    html: renderHtml({ preheader, greeting, paragraphs, code, codeCaption }),
    text: renderText({ greeting, paragraphs, code, codeCaption }),
  };
}

function renderText({ greeting, paragraphs, code, codeCaption }) {
  const lines = [greeting, ""];
  if (code) lines.push(codeCaption ? `${codeCaption}: ${code}` : code, "");
  for (const p of paragraphs) lines.push(p, "");
  lines.push("Saydle", "saydle.com");
  return lines.join("\n");
}

function renderHtml({ preheader, greeting, paragraphs, code, codeCaption }) {
  const body = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 18px;font-family:${SANS};font-size:15px;line-height:1.7;color:${BRAND.body};">${escape(p)}</p>`,
    )
    .join("");

  const codeBlock = code
    ? `
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 30px;">
                    <tr>
                      <td align="center" bgcolor="${BRAND.tint}" style="background-color:${BRAND.tint};border-radius:14px;padding:26px 20px 28px;">
                        ${
                          codeCaption
                            ? `<div style="font-family:${SANS};font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${BRAND.muted};padding-bottom:14px;">${escape(codeCaption)}</div>`
                            : ""
                        }
                        <div style="font-family:${DISPLAY};font-size:40px;font-weight:600;letter-spacing:0.14em;color:${BRAND.ink};line-height:1.05;">${escape(code)}</div>
                      </td>
                    </tr>
                  </table>`
    : `<div style="height:8px;line-height:8px;font-size:0;">&nbsp;</div>`;

  // The grey line a client shows beside the subject. Left empty it scrapes
  // whatever text comes first, which is always the greeting and tells nobody
  // anything.
  const hidden = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escape(preheader)}</div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Saydle</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${FONT_URL}" rel="stylesheet">
<style>
  @import url('${FONT_URL}');
  /* Word ignores line-height on block elements without this. */
  table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
</style>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.page};">
${hidden}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.page}" style="background-color:${BRAND.page};">
  <tr>
    <td align="center" style="padding:44px 16px 36px;">

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:512px;">

        <tr>
          <td align="center" style="padding-bottom:26px;">
            <div style="font-family:${DISPLAY};font-size:30px;font-weight:600;letter-spacing:-0.005em;color:${BRAND.coral};line-height:1;">Saydle</div>
          </td>
        </tr>

        <tr>
          <td bgcolor="${BRAND.card}" style="background-color:${BRAND.card};border-radius:20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:40px 36px 34px;">
                  <p style="margin:0;font-family:${DISPLAY};font-size:20px;font-weight:600;line-height:1.35;color:${BRAND.ink};">${escape(greeting)}</p>
                  ${codeBlock}
                  ${body}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:26px 8px 0;">
            <div style="height:1px;line-height:1px;font-size:0;background-color:${BRAND.rule};width:48px;margin:0 auto 18px;">&nbsp;</div>
            <p style="margin:0;font-family:${SANS};font-size:12px;line-height:1.6;color:${BRAND.muted};">
              <a href="https://saydle.com" style="color:${BRAND.muted};text-decoration:none;">saydle.com</a>
            </p>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>
</body>
</html>`;
}

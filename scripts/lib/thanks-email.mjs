// The "thanks for downloading" email, as plain ESM so a script can import it.
// Table layout, inline styles, no images, no web fonts, no JS: it has to
// survive Gmail, Outlook and Apple Mail.

const ORANGE = "#c9591f"; // --pm-orange in src/app/globals.css
const CREAM = "#F7F4EC";
const INK = "#3a332a";
const MUTED = "#6d6557";

export const THANKS_SUBJECT = "Thanks for downloading PlateMaps";

const P1 = "Hey,";
const P2 =
  "Thanks for downloading PlateMaps, and thanks for using it. And if you came out for free pizza at Pizza on Pearl on Thursday, thank you for that too. It means a lot this early on.";
const P3 =
  "If you've eaten something good lately, post it. It takes about a minute, and it's how everyone else finds the dish worth ordering.";
const SIGN = "Calvin, PlateMaps";
const PREHEADER = "Thanks for using it. If you've eaten something good lately, post it.";

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** @param {{ unsubscribeUrl: string, postalAddress: string, siteUrl: string }} p */
export function buildThanksEmail({ unsubscribeUrl, postalAddress, siteUrl }) {
  // The App Store listing, not the site: there are no universal links yet, so a
  // platemaps.com link opens Safari. The listing shows Open when installed.
  void siteUrl;
  const postUrl = "https://apps.apple.com/us/app/platemaps/id6808829983";
  const sans = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;
  const p = (text, extra = "") =>
    `<p style="margin:0 0 16px 0;font-family:${sans};font-size:16px;line-height:1.55;color:${INK};${extra}">${esc(text)}</p>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(THANKS_SUBJECT)}</title>
</head>
<body style="margin:0;padding:0;background-color:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${CREAM};font-size:1px;line-height:1px;">${esc(PREHEADER)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${CREAM};">
<tr><td align="center" style="padding:28px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="background-color:#ffffff;border-radius:16px;padding:32px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:0 0 22px 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;letter-spacing:-0.01em;color:#232019;">PlateMaps</td></tr>
<tr><td>
${p(P1)}
${p(P2)}
${p(P3)}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 22px 0;">
<tr><td align="center" bgcolor="${ORANGE}" style="background-color:${ORANGE};border-radius:999px;"><a href="${esc(postUrl)}" style="display:inline-block;padding:14px 32px;font-family:${sans};font-size:16px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none;border-radius:999px;">Open PlateMaps</a></td></tr>
</table>
${p(SIGN, "margin-bottom:0;")}
</td></tr>
</table>
</td></tr>
<tr><td align="center" style="padding:18px 12px 0 12px;font-family:${sans};font-size:12px;line-height:1.6;color:${MUTED};">
${esc(postalAddress)}<br>
<a href="${esc(unsubscribeUrl)}" style="color:${MUTED};text-decoration:underline;">Unsubscribe</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;

  const text = [
    P1,
    "",
    P2,
    "",
    P3,
    "",
    `Open PlateMaps: ${postUrl}`,
    "",
    SIGN,
    "",
    "--",
    postalAddress,
    `Unsubscribe: ${unsubscribeUrl}`,
    "",
  ].join("\n");

  return { subject: THANKS_SUBJECT, html, text };
}

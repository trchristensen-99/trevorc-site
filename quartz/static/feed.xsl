<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <xsl:output method="html" encoding="utf-8" indent="yes"/>
  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title><xsl:value-of select="/rss/channel/title"/> &#8212; RSS feed</title>
        <style>
          :root { color-scheme: light dark; }
          body {
            font-family: Newsreader, Georgia, "Times New Roman", serif;
            max-width: 46rem; margin: 0 auto; padding: 2.5rem 1.25rem 4rem;
            line-height: 1.55; color: #1a1d27; background: #f6f7fb;
          }
          a { color: #2640d8; }
          h1 { font-size: 1.9rem; margin: 0 0 .25rem; }
          .sub { color: #4e4e4e; margin: 0 0 1.5rem; }
          .note {
            border: 1px solid #e2e6ef; border-radius: 6px;
            padding: .85rem 1rem; margin: 0 0 2rem; font-size: .95rem;
          }
          .note code { background: #e2e6ef; padding: .1rem .3rem; border-radius: 3px; }
          li { margin: 0 0 1.4rem; list-style: none; }
          ul { padding: 0; }
          .t { font-size: 1.12rem; font-weight: 600; text-decoration: none; }
          .d { color: #4e4e4e; font-size: .85rem; margin: .15rem 0 .3rem; }
          .x { color: #333; margin: 0; }
          @media (prefers-color-scheme: dark) {
            body { background: #14161e; color: #ebebec; }
            a { color: #b0bbff; }
            .sub, .d { color: #b9b9c4; }
            .x { color: #d5d5dc; }
            .note { border-color: #2a2e3a; }
            .note code { background: #2a2e3a; }
          }
        </style>
      </head>
      <body>
        <h1><xsl:value-of select="/rss/channel/title"/></h1>
        <p class="sub"><xsl:value-of select="/rss/channel/description"/></p>
        <p class="note">
          This is an <strong>RSS feed</strong>. Paste this page's address into a
          feed reader to get new posts automatically. To read the site normally,
          go to <a href="{/rss/channel/link}"><xsl:value-of select="/rss/channel/link"/></a>.
        </p>
        <ul>
          <xsl:for-each select="/rss/channel/item">
            <li>
              <a class="t" href="{link}"><xsl:value-of select="title"/></a>
              <p class="d"><xsl:value-of select="pubDate"/></p>
              <p class="x"><xsl:value-of select="description"/></p>
            </li>
          </xsl:for-each>
        </ul>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>

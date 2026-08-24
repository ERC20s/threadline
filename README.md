# threadline
Website for a small clothing brand - product grid, product page, lookbook, about, size guide, contact.

## Shared foundation

Every page shares one base stylesheet and one nav/footer pattern so layout,
color and typography decisions are made once instead of per page.

- `styles.css` — root stylesheet. Defines CSS custom properties for the
  color palette, spacing scale and typography, a responsive
  `.container`/`.grid` system with mobile/tablet/desktop breakpoints, base
  element resets, and utility classes for buttons (`.btn`), links and form
  fields. Link it from `<head>` on every page:
  `<link rel="stylesheet" href="styles.css">` (adjust the relative path if
  the page lives in a subfolder).
- `partials/nav.html` — the responsive header markup: the Threadline
  wordmark, a hamburger button that toggles the nav on small screens, and
  links to the product grid (`index.html`), `lookbook.html`, `about.html`,
  `size-guide.html` and `contact.html`. There is no templating engine yet,
  so copy this markup verbatim into the top of `<body>` on each page and
  mark the current page's link with `aria-current="page"`.
- `partials/footer.html` — the footer markup: copyright line plus the same
  nav links, copy-pasted near the end of `<body>` on each page.

New page proposals should build on top of these three files (link
`styles.css`, include the nav/footer partials) rather than inventing their
own layout, header or footer.

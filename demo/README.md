# human-token · web demo

A standalone, no-build, no-dependency interactive preview of the human-token widget. Lives in this folder as three files: `index.html` + `style.css` + `widget.js`.

## What it does (vs. the real desktop app)

| | Desktop app | Web demo |
|---|---|---|
| Captures input | OS-global via rdev | only events fired inside this page/iframe |
| Storage | local JSON, persistent | nothing — refresh resets |
| Window | OS window, drag/fold against screen edges | DOM element inside `.demo-stage`, fold against stage edges |
| Token formula | identical | identical |

The web demo exists so a portfolio visitor can *feel* what the app does in 5 seconds — type a few keys, watch numbers climb, drag the widget to an edge, see it fold.

## Try it locally

It's vanilla — no build step.

```powershell
# any static server works. simplest options:
npx http-server "D:\创作\CODE\human token\demo" -p 8080
# then open http://localhost:8080
```

Or just double-click `index.html` — modern browsers run it from `file://`.

## Deploy (pick one, ~30 seconds each)

All are free and need nothing but a drop-in folder.

### A. Cloudflare Pages (recommended for stable URL)
1. `cd D:\创作\CODE\human token\demo`
2. `npx wrangler pages deploy . --project-name human-token-demo`
3. URL printed at end, looks like `https://human-token-demo.pages.dev`

### B. Netlify Drop (literally drag-and-drop)
1. Open https://app.netlify.com/drop
2. Drag the `demo` folder onto the page
3. URL ready instantly. (Free tier; URL is permanent unless you delete the site)

### C. Vercel
1. `cd D:\创作\CODE\human token\demo`
2. `npx vercel --prod` (will prompt to login first time)
3. URL printed at end

### D. GitHub Pages (if `demo/` is already in your GitHub repo)
1. In repo Settings → Pages → set Source to `main` branch, folder `/demo`
2. URL becomes `https://<you>.github.io/<repo>/`

## Embed in the portfolio Astro site

In `src/content/works/human-token.md` frontmatter:

```yaml
embeds:
  - url: https://human-token-demo.pages.dev
    height: 540
    title: 试试看 · 浏览器仿真版
```

The Astro layout should `<iframe src={embed.url} height={embed.height}>` it. Height ~540 fits the stage + footer comfortably.

## Tweaking

- **Stage layout**: `.demo-stage` in `style.css`. The widget defaults to top-right; the text block is on the left. Both responsive at <520px.
- **Token formula**: top of `widget.js` — `bump(1, 0.7)` per key, `bump(2, 1.0)` per click, `bump(1, 0.12)` per 100px mouse. The rate boost values control how aggressively the bars react.
- **Cap**: `CAP = 200_000` in `widget.js`. Match the desktop default.
- **Decay**: `rate *= 0.78` every 200ms (~22% per tick). Lower = faster cool-off.
- **Status words**: `STATUS_WORDS` array.

## Caveats

- Inside an iframe, the demo only sees events fired in that iframe. The parent page's keystrokes won't count — that's a browser security boundary, can't be worked around. Add an in-iframe hint so visitors know to click into it first.
- We don't simulate the 5h rolling window, just a hard `CAP`. Refresh to reset.
- The fold animation uses CSS transitions, not the OS-level setSize/setPosition the real app uses, so the timing feels slightly different. Intentional.

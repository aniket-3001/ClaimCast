# Why the web app is a folder of files

`firebase.json` above serves `apps/web/dist` and nothing else. There is no
server-side anything, and that is the point: the bundle is static, the API is a
separate origin, and the only thing the hosting layer does is hand over files.

**The rewrite.** Every path falls through to `index.html` because the app routes
in the browser. Without it, reloading on any screen but the first is a 404 from
the CDN — which is exactly the thing a judge does when a demo looks wrong.

**The cache headers.** Vite fingerprints everything under `/assets`, so those
files are immutable and can be cached for a year. `index.html` is the one file
that must not be, because it is what names the current fingerprints; cache it
and a deploy ships new assets that nothing references.

**`X-Frame-Options: DENY`.** Nothing here needs to be embedded, and this page
shows someone their policy.

**What is not here:** a Content-Security-Policy. It belongs here and it is not
written yet, because a wrong one breaks the page silently in the one browser
nobody tested. It needs writing against the built bundle before this is public.

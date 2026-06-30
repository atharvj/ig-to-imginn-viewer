# IG Logged-Out Profile Viewer

Tampermonkey userscript for viewing public Instagram profiles without logging in. It redirects public Instagram profile, post, and reel links to Imginn, then opens Imginn posts in a popup so profile browsing does not lose your place.

## Features

- View public Instagram profiles without being logged in.
- Redirects public Instagram profile/post/reel URLs to Imginn.
- Handles Instagram login redirect URLs with `next=` by sending the public target to Imginn.
- Opens Imginn post/reel links in an in-page popup.
- Tries multiple Imginn post URL shapes when a post detail page is flaky.
- Cleans up common Imginn spacing, share rows, and popup chrome.

## Install

1. Install Tampermonkey or another userscript manager.
2. Open the raw userscript URL: <https://raw.githubusercontent.com/atharvj/ig-logged-out-profile-viewer/main/ig-logged-out-profile-viewer.user.js>
3. Add it to your userscript manager.

## GreasyFork Description

View public Instagram profiles without logging in. This userscript redirects public Instagram profile, post, and reel links to Imginn, where you can browse profile grids and open posts in a popup without losing your place.

It is useful when Instagram pushes logged-out users toward a login screen even for public profiles. Profile pages, posts, reels, videos, captions, and comments depend on what Imginn exposes publicly for that account or post.

This script does not unlock private accounts, restricted content, or content that Imginn itself cannot load.

## Notes

This script depends on what Imginn exposes publicly. If Imginn only has a thumbnail and returns `Content Not Found` for the detail page, the script cannot create missing comments, tagged users, or videos.

## License

MIT

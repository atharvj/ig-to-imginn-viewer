# IG to Imginn Viewer

Tampermonkey userscript that redirects public Instagram profile, post, and reel links to Imginn, then opens Imginn posts in a popup so profile browsing does not lose your place.

## Features

- Redirects public Instagram profile/post/reel URLs to Imginn.
- Handles Instagram login redirect URLs with `next=` by sending the public target to Imginn.
- Opens Imginn post/reel links in an in-page popup.
- Tries multiple Imginn post URL shapes when a post detail page is flaky.
- Cleans up common Imginn spacing, share rows, and popup chrome.

## Install

1. Install Tampermonkey or another userscript manager.
2. Open the raw userscript URL: <https://raw.githubusercontent.com/atharvj/ig-to-imginn-viewer/main/ig-to-imginn-viewer.user.js>
3. Add it to your userscript manager.

## Notes

This script depends on what Imginn exposes publicly. If Imginn only has a thumbnail and returns `Content Not Found` for the detail page, the script cannot create missing comments, tagged users, or videos.

## License

MIT

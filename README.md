# IG to Imginn Viewer

Tampermonkey userscript that leaves Instagram alone when you are logged in, but redirects public Instagram profile, post, and reel links to Imginn when you are logged out or hit a login gate.

## Features

- Lets Instagram work normally when you are logged in.
- Redirects public Instagram profile/post/reel URLs to Imginn when logged out.
- Handles Instagram login redirect URLs with `next=` by sending the public target to Imginn.
- Opens Imginn post/reel links in an in-page popup.
- Tries multiple Imginn post URL shapes when a post detail page is flaky.
- Cleans up common Imginn spacing, share rows, and popup chrome.

## Install

1. Install Tampermonkey or another userscript manager.
2. Open the [installation page](https://greasyfork.org/en/scripts/584998-ig-logged-out-profile-viewer) on GreasyFork
3. Press install

## Notes

This script depends on what Imginn exposes publicly. If Imginn only has a thumbnail and returns `Content Not Found` for the detail page, the script cannot create missing comments, tagged users, or videos.

## License

MIT

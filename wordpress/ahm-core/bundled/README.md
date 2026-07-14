# Bundled required plugins

The guided installer pulls **Elementor, Rank Math, UpdraftPlus, and WP Activity Log**
straight from wordpress.org. The two plugins below are **not** on the public
repo, so their installer zips must be placed **here** before building `ahm-core.zip`:

| Drop this file | Expected unpacked main file |
|---|---|
| `pro-elements.zip` | `pro-elements/pro-elements.php` |
| `kadence-security.zip` | `kadence-security/kadence-security.php` |

If a real zip unpacks to a different folder or main-file name, update the matching
`file` path in [`includes/class-ahm-core-required.php`](../includes/class-ahm-core-required.php)
so the installer can detect and activate it.

`build-zip.sh` includes everything in this folder, so once the zips are here they
ship inside `ahm-core.zip`. If a zip is missing, the installer skips it and reports
"bundled zip not found" instead of failing the whole run.

> These are third-party binaries — they are **not** committed to this repo. Add them
> locally (or in your build pipeline) before packaging.

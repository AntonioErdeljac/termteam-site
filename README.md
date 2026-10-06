# termteam.hr

Static copy of the Framer site, built 1:1 from the live pages (same markup, styles, images and animations), with no Framer dependency.

- `site/` is the whole website: plain HTML, images, fonts and `assets/js/motion.js`, which replays Framer's animations (scroll and text reveals, hovers, the phone menu, FAQ, gallery, contact form states).
- Every push to `main` deploys `site/` to GitHub Pages (`.github/workflows/deploy.yml`).
- Contact form: put a free Web3Forms access key (https://web3forms.com) in `site/assets/js/form-config.js` before Framer is cancelled. Until then the form posts to the Framer form it was built from.
- How the copy was produced (capture of the live site, builder, verification scripts) is on the `capture` branch.

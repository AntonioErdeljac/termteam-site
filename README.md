# termteam.hr

The Term Team website, rebuilt from the Framer original as plain HTML and CSS.
[Eleventy](https://www.11ty.dev/) turns the content files into static pages; there is no framework and almost no JavaScript (mobile menu, FAQ, gallery lightbox, contact form).

## Editing content

Everything editable lives in two places:

- `src/_data/*.json`: homepage, about, gallery, contact page, and site settings (phone, email, address, logos).
- `src/services/*.md`: one file per service. Add a file to add a service; it appears on the homepage and the services page automatically.

For a point-and-click editor, use **[Pages CMS](https://pagescms.org)** (free): sign in with GitHub at app.pagescms.org, pick this repository, and edit. Every save is a commit, and the host rebuilds the site. The editor layout is defined in `.pages.yml`.

## Running locally

```sh
npm install
npm run serve      # http://localhost:8080
npm run build      # outputs _site/
```

## Images

The original photos were hosted by Framer. The deploy workflow copies any image still pointing at `framerusercontent.com` into `src/images/` and commits it, so this happens automatically on the first deploy. You can also run it yourself with `npm run fetch-images`.

## Contact form

The forms post to [Web3Forms](https://web3forms.com) (free, sends submissions to your email). Get an access key for info@termteam.hr and put it in `src/_data/site.json` → `form.web3forms_access_key`. Until a key is set, the form opens the visitor's email app instead.

## Hosting (GitHub Pages, free)

Every push to `main` builds and deploys the site with `.github/workflows/deploy.yml`.

1. In the repository: Settings → Pages → Source: **GitHub Actions** (one time).
2. The site appears at `https://<user>.github.io/<repo>/`.
3. To use termteam.hr: Settings → Pages → Custom domain → `termteam.hr`, then at your domain registrar point the domain at GitHub Pages (A records `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`, and a `www` CNAME to `<user>.github.io`). Only cancel Framer once termteam.hr shows the new site.

URLs match the old site (`/about-us`, `/services/podno-grijanje`, …), so existing Google results and links keep working.

// Serves the static site. www.termteam.hr redirects to termteam.hr, as it did on Framer.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === "www.termteam.hr") {
      url.hostname = "termteam.hr";
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};

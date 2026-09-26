import { idOf, until, type Api, type Json } from "./api.ts";
import { EDITOR } from "./env.ts";
import { gradientPng } from "./png.ts";

/** Ids of the records the seed creates, shared with the specs through the seed file. */
export interface Seed {
  photo: string;
  spare: string;
  home: string;
  about: string;
  team: string;
  projects: string;
  news: string;
  draft: string;
  post: string;
}

const prose = (id: string, html: string): Json => ({ id, type: "prose", props: { body: html } });
const image = (id: string, media: string, alt: string): Json => ({ id, type: "image", props: { image: media, alt } });
const internal = (label: string, id: string): Json => ({ label, link: { type: "internal", collection: "pages", id } });

async function waitForVariants(api: Api, id: string): Promise<void> {
  await until(`variants of media ${id}`, async () => {
    const item = await api.call("GET", `/media/${id}`);
    return item.available !== false && Array.isArray(item.variants) && item.variants.length > 0;
  });
}

async function publishSettled(api: Api): Promise<void> {
  let quiet = 0;
  await until("the publish queue to settle", async () => {
    const status = await api.call("GET", "/admin/publish-status/pages");
    quiet = status.stale === 0 && status.rendering === 0 ? quiet + 1 : 0;
    return quiet >= 3;
  }, 120_000);
}

/** Fills a fresh playground instance with the same content on every run, through an admin session. */
export async function seedPlayground(api: Api): Promise<Seed> {

  const photo = idOf(await api.upload("landscape.png", gradientPng(1200, 700)));
  const spare = idOf(await api.upload("spare.png", gradientPng(640, 400, [120, 40, 90], [30, 160, 120])));
  await waitForVariants(api, photo);
  await waitForVariants(api, spare);

  const create = async (body: Json): Promise<string> => idOf(await api.call("POST", "/pages", body));
  const translate = (id: string, body: Json): Promise<Json> => api.call("PATCH", `/pages/${id}`, body);

  const home = await create({ locale: "de", slug: "home", title: "Startseite", status: "published", body: [prose("h1", "<h2>Willkommen</h2><p>Eine kleine Beispielseite.</p>")] });
  await translate(home, { locale: "en", slug: "home", title: "Home", status: "published", body: [prose("h1", "<h2>Welcome</h2><p>A small example site.</p>")] });

  const about = await create({ locale: "de", slug: "ueber-uns", title: "Über uns", status: "published", shareImage: photo, body: [image("a1", photo, "Ein Farbverlauf"), prose("a2", "<p>Wir bauen Seiten.</p>")] });
  await translate(about, { locale: "en", slug: "about", title: "About us", status: "published", body: [image("a1", photo, "A colour gradient"), prose("a2", "<p>We build sites.</p>")] });

  const team = await create({ locale: "de", slug: "team", title: "Team", status: "published", parent: about, body: [prose("t1", "<p>Das Team hinter der Seite.</p>")] });

  const projects = await create({ locale: "de", slug: "projekte", title: "Projekte", status: "published", body: [prose("p1", "<p>Laufende Projekte.</p>")] });
  await translate(projects, { locale: "en", slug: "projects", title: "Projects", status: "published", body: [prose("p1", "<p>Current projects.</p>")] });

  const news = await create({ locale: "de", slug: "aktuelles", title: "Aktuelles", status: "published", body: [prose("n1", "<p>Neuigkeiten.</p>")] });
  await translate(news, { locale: "en", slug: "news", title: "News", status: "published", body: [prose("n1", "<p>News.</p>")] });

  const draft = await create({ locale: "de", slug: "entwurf", title: "Unveröffentlichter Entwurf", status: "draft", body: [prose("d1", "<p>Noch nicht fertig.</p>")] });

  const post = idOf(await api.call("POST", "/blog", { locale: "de", slug: "hallo", title: "Hallo", status: "published", body: [prose("b1", "<p>Ein erster Beitrag.</p>")] }));

  await api.call("PUT", "/settings", {
    locale: "de",
    title: "Kestrel Beispiel",
    mounts: { blog: projects },
    navigation: [internal("Start", home), internal("Über uns", about), internal("Projekte", projects)],
  });
  await api.call("PUT", "/settings", {
    locale: "en",
    title: "Kestrel Example",
    mounts: { blog: projects },
    navigation: [internal("Home", home), internal("About us", about), internal("Projects", projects)],
  });

  await api.call("POST", "/users", { username: EDITOR.username, password: EDITOR.password, roles: ["editor"] });

  await api.call("POST", "/admin/publish-all/pages");
  await publishSettled(api);

  return { photo, spare, home, about, team, projects, news, draft, post };
}

import { contentDistRoot } from './lib/books';
import { preparePagesOutput, publishedReleaseSlugs } from './lib/pages';

const bookSlugs = publishedReleaseSlugs(contentDistRoot());
preparePagesOutput('dist', bookSlugs);
console.log(
  `ok   dist: GitHub Pages SPA fallback + ${bookSlugs.length} published Book route(s) prepared`,
);

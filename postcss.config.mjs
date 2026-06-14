/**
 * PostCSS configuration.
 *
 * PostCSS is the CSS post-processor that Next.js runs over the stylesheets at
 * build time. Here it is configured with a single plugin, `tailwindcss`, which
 * is what expands Tailwind's directives and utility classes into real CSS. (Note
 * that recent Tailwind builds already include vendor-prefixing internally, so no
 * separate autoprefixer plugin is listed here.)
 */
/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {},
  },
};

export default config;

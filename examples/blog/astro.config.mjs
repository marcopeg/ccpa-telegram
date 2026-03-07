// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	site: 'https://marcopeg.com',
	integrations: [
		mdx(),
		sitemap({
			// Exclude draft URLs from the sitemap — they must not be indexed
			filter: (page) => !page.includes('/__draft__/'),
		}),
	],
	server: {
		allowedHosts: ['.loca.lt'],
	},
});

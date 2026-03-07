import { defineCollection, z } from 'astro:content';
import { glob, file } from 'astro/loaders';

const posts = defineCollection({
	// Load Markdown and MDX files in the `src/content/posts/` directory.
	loader: glob({ base: './src/content/posts', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			// Transform string to Date object
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			heroImage: z.string().optional(),
			tags: z.array(z.string()).optional(),
			draft: z.boolean().optional().default(false),
		}),
});

const pages = defineCollection({
	// Load Markdown and MDX files in the `src/content/pages/` directory.
	loader: glob({ base: './src/content/pages', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	// All fields are optional - slug and title will be derived from filename if not provided
	schema: ({ image }) =>
		z.object({
			slug: z.string().optional(),
			title: z.string().optional(),
			description: z.string().optional(),
			pubDate: z.coerce.date().optional(),
			heroImage: z.string().optional(),
		}),
});

const tags = defineCollection({
	loader: file('./src/content/tags.yaml'),
	schema: z.object({
		title: z.string(),
		excerpt: z.string(),
		image: z.string(),
	}),
});

export const collections = { posts, pages, tags };

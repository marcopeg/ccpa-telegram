import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// In production, exclude drafts folder and all MDX files in drafts
// In development, include everything
const excludePatterns = import.meta.env.PROD
	? ['drafts/**/*.md', 'drafts/**/*.mdx']
	: [];

const posts = defineCollection({
	loader: glob({
		pattern: '**/*.{md,mdx}',
		base: './src/content/posts',
		exclude: excludePatterns
	}),
	schema: z.object({
		title: z.string(),
		description: z.string().optional().default(''),
		pubDate: z.coerce.date(),
		updatedDate: z.coerce.date().optional(),
		heroImage: z.string().optional(),
		tags: z.array(z.string()).optional(),
		author: z.string().optional().default('mpeg'),
	}),
});

export const collections = { posts };

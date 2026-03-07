import type { CollectionEntry } from 'astro:content';

/**
 * Filter out draft posts in production
 * In dev mode, all posts are visible
 * Drafts are determined by folder location (posts/drafts/*)
 */
export function filterDrafts(posts: CollectionEntry<'posts'>[]): CollectionEntry<'posts'>[] {
	const isDev = import.meta.env.DEV;

	if (isDev) {
		return posts;
	}

	// Filter out posts in the drafts folder
	return posts.filter(post => !post.id.startsWith('drafts/'));
}

/**
 * Calculate reading time based on content
 * Assumes average reading speed of 200 words per minute
 */
export function getReadingTime(content: string | undefined): string {
	if (!content) {
		return '1 min read';
	}
	const wordsPerMinute = 200;
	const words = content.trim().split(/\s+/).length;
	const minutes = Math.max(1, Math.ceil(words / wordsPerMinute));
	return `${minutes} min read`;
}

/**
 * Get the slug from a post id (strips year/drafts folder prefix)
 * Examples:
 *   2025/books-that-shaped-my-life -> books-that-shaped-my-life
 *   drafts/using-mdx -> using-mdx
 */
export function getSlugFromId(id: string): string {
	const parts = id.split('/');
	return parts.length > 1 ? parts[parts.length - 1] : id;
}

/**
 * Check if a post is a draft
 */
export function isDraft(id: string): boolean {
	return id.startsWith('drafts/');
}

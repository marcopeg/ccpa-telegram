import fs from 'fs';
import path from 'path';
import TurndownService from 'turndown';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced'
});

// Paths
// Assumes this script is in astro/scripts/
// And the export is in materials/ (sibling of astro/)
const GHOST_EXPORT_PATH = path.resolve(__dirname, '../../materials/marco-pegoraro.ghost.2026-02-09-09-35-18.json');
const OUT_DIR = path.resolve(__dirname, '../src/content/blog');

async function importGhost() {
    console.log(`Reading Ghost export from ${GHOST_EXPORT_PATH}...`);

    if (!fs.existsSync(GHOST_EXPORT_PATH)) {
        console.error(`File not found: ${GHOST_EXPORT_PATH}`);
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(GHOST_EXPORT_PATH, 'utf8'));
    const posts = data.db[0].data.posts;
    const tags = data.db[0].data.tags || [];
    const postsTags = data.db[0].data.posts_tags || [];

    // Map tags by ID
    const tagMap = tags.reduce((acc, tag) => {
        acc[tag.id] = tag.name;
        return acc;
    }, {});

    // Map tags to post ID
    const postTagMapping = postsTags.reduce((acc, pt) => {
        if (!acc[pt.post_id]) acc[pt.post_id] = [];
        const tagName = tagMap[pt.tag_id];
        if (tagName) acc[pt.post_id].push(tagName);
        return acc;
    }, {});

    const publishedPosts = posts.filter(p => p.status === 'published');

    console.log(`Found ${posts.length} posts. Importing ${publishedPosts.length} published posts...`);

    if (!fs.existsSync(OUT_DIR)) {
        fs.mkdirSync(OUT_DIR, { recursive: true });
    }

    let count = 0;
    for (const post of publishedPosts) {
        // Extract fields
        const title = post.title;
        const slug = post.slug;
        const pubDate = post.published_at || post.created_at;
        const updatedDate = post.updated_at;
        const description = post.custom_excerpt || post.meta_description || (post.plaintext ? post.plaintext.substring(0, 150) + '...' : '');
        const postTags = postTagMapping[post.id] || [];
        let heroImage = post.feature_image;
        let content = post.html || '';

        // Handle images
        if (heroImage && heroImage.includes('__GHOST_URL__')) {
            heroImage = heroImage.replace('__GHOST_URL__', '');
        }

        // Convert HTML to Markdown
        let markdown = turndownService.turndown(content);

        // Replace __GHOST_URL__ in content
        markdown = markdown.replace(/__GHOST_URL__/g, '');

        // Create Frontmatter
        const frontmatter = [
            '---',
            `title: "${title.replace(/"/g, '\\"')}"`,
            `description: "${description.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
            `pubDate: "${pubDate}"`,
            ...(updatedDate ? [`updatedDate: "${updatedDate}"`] : []),
            ...(heroImage ? [`heroImage: "${heroImage}"`] : []),
            ...(postTags.length > 0 ? [`tags: [${postTags.map(t => `"${t}"`).join(', ')}]`] : []),
            '---',
            '',
            markdown
        ].join('\n');

        const filePath = path.join(OUT_DIR, `${slug}.md`);
        fs.writeFileSync(filePath, frontmatter);
        count++;
        // console.log(`Imported ${slug}`);
    }

    console.log(`Successfully imported ${count} posts.`);
}

importGhost().catch(console.error);

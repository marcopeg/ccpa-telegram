export const imageMap: Record<string, any> = {};

export function getImageAsset(path: string | undefined): any {
	if (!path) return undefined;
	return imageMap[path] || path;
}

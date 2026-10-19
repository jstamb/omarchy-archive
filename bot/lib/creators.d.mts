export function slugifyAuthor(name: string): string;
export function uniqueSlug(base: string, taken: Set<string>): string;
export function creatorSlugMap(data: {
  themes?: { author: string | null }[];
  plugins?: { author: string | null }[];
  posts?: { author: string | null }[];
}): Record<string, string>;

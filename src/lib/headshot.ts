import type { ImageMetadata } from 'astro';
import { site } from './site';

// The headshot is optional: until the file named in site.yaml exists, pages leave it out.
const images = import.meta.glob<{ default: ImageMetadata }>('/src/assets/*.{jpg,jpeg,png,webp}', { eager: true });

export const headshot: ImageMetadata | undefined = images[`/${site.headshot}`]?.default;

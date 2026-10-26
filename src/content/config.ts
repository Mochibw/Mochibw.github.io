import { defineCollection, z } from 'astro:content';

const articleSchema = z.object({
  title: z.string(),
  pubDate: z.date(),
  description: z.string(),
  tags: z.array(z.string()),
});

export const collections = {
  thoughts: defineCollection({ type: 'content', schema: articleSchema }),
  learning: defineCollection({ type: 'content', schema: articleSchema }),
};

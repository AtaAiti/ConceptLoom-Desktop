import { z } from 'zod';
import { lessonContentSchema } from '../../types/state';

export { lessonContentSchema };
export const mapSchema = z.object({
  topics: z
    .array(
      z.object({
        key: z
          .string()
          .regex(/^[a-z0-9_-]+$/)
          .max(80),
        title: z.string().trim().min(1).max(200),
        description: z.string().max(2000),
        dependsOn: z.array(z.string()).max(30),
      }),
    )
    .min(1)
    .max(30),
});
export const verdictSchema = z.object({
  accurate: z.boolean(),
  feedback: z.string().trim().min(1).max(3000),
});
export function parseResponse<T>(raw: string, schema: z.ZodType<T>): T {
  try {
    return schema.parse(JSON.parse(raw));
  } catch (error) {
    console.error('Invalid structured AI response', error);
    throw new Error(
      'Модель вернула неверный ответ. Попробуйте снова или выберите другую модель.',
    );
  }
}

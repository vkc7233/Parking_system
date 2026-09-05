/**
 * PLACEHOLDER - replaced by `pnpm db:types`, which generates this file from the live schema.
 *
 * Run that after every migration; the generated file is committed so CI type-checks against
 * the same schema the developer had.
 */
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type Database = Record<string, never>;

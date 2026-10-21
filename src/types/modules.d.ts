// Ambient declarations for dependencies shipped without types (or with ESM-only entries).
declare module "pdf-parse/lib/pdf-parse.js" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfParse: (data: Buffer, options?: Record<string, unknown>) => Promise<{ text?: string; numpages?: number; info?: unknown }>;
  export default pdfParse;
}

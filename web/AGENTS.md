<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Forms

Use React Hook Form with Zod schemas for all application forms. Keep form schemas close to the feature when they are feature-specific, export inferred value types from the schema file, and keep non-form workflow state such as parsed files, previews, and server results outside the form state.

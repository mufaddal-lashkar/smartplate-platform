import { defineConfig } from "drizzle-kit"

export default defineConfig({
	schema: "./apps/main-service/src/db/schema.ts",
	out: "./db/migrations",
	dialect: "postgresql",
	dbCredentials: { url: process.env.DATABASE_URL ?? "" },
	casing: "snake_case",
})

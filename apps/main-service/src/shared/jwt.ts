import type { Role, TenantType } from "../db/schema"

export type AccessClaims = {
	sub: string
	tenantId: string
	tenantType: TenantType
	role: Role
	exp: number
}

const encoder = new TextEncoder()

const toBase64Url = (bytes: Uint8Array): string => {
	let binary = ""
	for (const byte of bytes) binary += String.fromCharCode(byte)
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

const fromBase64Url = (value: string): Uint8Array => {
	const padded = value.replace(/-/g, "+").replace(/_/g, "/")
	const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="))
	return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

const importKey = (secret: string) =>
	crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
		"sign",
		"verify",
	])

export const signAccessToken = async (claims: AccessClaims, secret: string): Promise<string> => {
	const header = toBase64Url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })))
	const payload = toBase64Url(encoder.encode(JSON.stringify(claims)))
	const body = `${header}.${payload}`
	const signature = await crypto.subtle.sign("HMAC", await importKey(secret), encoder.encode(body))
	return `${body}.${toBase64Url(new Uint8Array(signature))}`
}

export const verifyAccessToken = async (
	token: string,
	secret: string,
	nowSeconds: number,
): Promise<AccessClaims | null> => {
	const segments = token.split(".")
	if (segments.length !== 3) return null

	const [header, payload, signature] = segments

	try {
		const valid = await crypto.subtle.verify(
			"HMAC",
			await importKey(secret),
			fromBase64Url(signature ?? ""),
			encoder.encode(`${header}.${payload}`),
		)
		if (!valid) return null

		const claims = JSON.parse(
			new TextDecoder().decode(fromBase64Url(payload ?? "")),
		) as AccessClaims

		if (typeof claims.exp !== "number" || claims.exp <= nowSeconds) return null
		if (claims.sub == null || claims.tenantId == null) return null

		return claims
	} catch {
		return null
	}
}

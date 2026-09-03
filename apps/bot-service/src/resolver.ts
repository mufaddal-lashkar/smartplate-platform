import { redis } from "./db"

export const CALLBACK_DATA_LIMIT = 64

const TOKEN_TTL_SECONDS = 60 * 60
const TOKEN_LENGTH = 8
const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

const tokenKey = (chatId: number, token: string) => `bot:tok:${chatId}:${token}`

const randomToken = (): string => {
	const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_LENGTH))
	let out = ""
	for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length]
	return out
}

export const mintToken = async (
	chatId: number,
	entities: Record<string, string>,
): Promise<string> => {
	const token = randomToken()
	await redis.set(tokenKey(chatId, token), JSON.stringify(entities), "EX", TOKEN_TTL_SECONDS)
	return token
}

export const readToken = async (
	chatId: number,
	token: string,
): Promise<Record<string, string> | null> => {
	const raw = await redis.get(tokenKey(chatId, token))
	if (raw == null) return null
	return JSON.parse(raw) as Record<string, string>
}

export const encodeAction = (intent: string, token: string): string => `a:${intent}:${token}`

export const encodeConfirm = (intent: string, token: string): string => `c:${intent}:${token}`

export type CallbackTarget = {
	kind: "action" | "confirm"
	intent: string
	token: string
}

const CALLBACK_PATTERN = /^([ac]):([a-z0-9_.]+):([A-Za-z0-9]{1,16})$/

export const decodeCallback = (data: string): CallbackTarget | null => {
	const match = CALLBACK_PATTERN.exec(data)
	if (match == null) return null
	const prefix = match[1] ?? ""
	const intent = match[2] ?? ""
	const token = match[3] ?? ""
	if (intent === "" || token === "") return null
	return { kind: prefix === "a" ? "action" : "confirm", intent, token }
}

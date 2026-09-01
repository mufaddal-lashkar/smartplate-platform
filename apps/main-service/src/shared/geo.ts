import type { Dayjs } from "dayjs"

export const withinActiveWindow = (activeFrom: string, activeTo: string, now: Dayjs): boolean => {
	const from = nowFormat(now, activeFrom)
	const to = nowFormat(now, activeTo)
	return now.isSame(from) || now.isSame(to) || (now.isAfter(from) && now.isBefore(to))
}

const nowFormat = (now: Dayjs, hhmm: string): Dayjs => {
	const parts = hhmm.split(":")
	const hours = Number(parts[0] ?? "0")
	const minutes = Number(parts[1] ?? "0")
	return now.hour(hours).minute(minutes).second(0).millisecond(0)
}

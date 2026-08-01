import dayjs, { type Dayjs } from "dayjs"

export type Clock = {
	now: () => Dayjs
}

export const systemClock: Clock = {
	now: () => dayjs(),
}

export const fixedClock = (iso: string): Clock => ({
	now: () => dayjs(iso),
})

import type { Dayjs } from "dayjs"
import type { StorageMethod } from "../db/schema"

export const STORAGE_MODIFIER: Record<StorageMethod, number> = {
	room_temp: 1,
	refrigerated: 3,
	frozen: 10,
}

export const safeUntilFor = (
	preparedAt: Dayjs,
	shelfLifeHours: number,
	storage: StorageMethod,
): Dayjs => preparedAt.add(shelfLifeHours * STORAGE_MODIFIER[storage], "hour")

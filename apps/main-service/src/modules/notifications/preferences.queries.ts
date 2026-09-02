import { and, asc, eq } from "drizzle-orm"
import { notificationPreferences } from "../../db/schema"
import { type SessionContext, withSuperAdmin, withTenant } from "../../db/tx"

export type NotificationPreferenceRow = {
	id: string
	tenantId: string
	userId: string
	topic: string
	radiusKm: string | null
	activeFrom: string
	activeTo: string
	quietHoursEnabled: boolean
	updatedAt: Date
}

export const listPreferencesForUser = async (
	ctx: SessionContext,
): Promise<NotificationPreferenceRow[]> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.select()
			.from(notificationPreferences)
			.where(eq(notificationPreferences.userId, ctx.userId))
			.orderBy(asc(notificationPreferences.topic))
		return rows as NotificationPreferenceRow[]
	})

export const findPreferenceForUser = async (
	userId: string,
	topic: string,
): Promise<NotificationPreferenceRow | null> =>
	withSuperAdmin(async (tx) => {
		const rows = await tx
			.select()
			.from(notificationPreferences)
			.where(
				and(eq(notificationPreferences.userId, userId), eq(notificationPreferences.topic, topic)),
			)
			.limit(1)
		return (rows[0] as NotificationPreferenceRow | undefined) ?? null
	})

import { and, eq, inArray, sql } from "drizzle-orm"
import { notificationPreferences } from "../../db/schema"
import { type SessionContext, withTenant } from "../../db/tx"
import { ApiError } from "../../shared/api-error"
import { writeAuditLogFor } from "../../shared/audit"
import {
	findPreferenceForUser,
	listPreferencesForUser,
	type NotificationPreferenceRow,
} from "./preferences.queries"
import type { PreferencesPutInput } from "./preferences.schema"

export const listMyPreferences = async (
	ctx: SessionContext,
): Promise<NotificationPreferenceRow[]> => listPreferencesForUser(ctx)

export const replaceMyPreferences = async (
	ctx: SessionContext,
	input: PreferencesPutInput,
): Promise<NotificationPreferenceRow[]> => {
	const topics = input.preferences.map((p) => p.topic)
	const unique = new Set(topics)
	if (unique.size !== topics.length) {
		throw new ApiError("VALIDATION_ERROR", "Duplicate topics in preferences.", [
			{ field: "preferences", code: "VALIDATION_ERROR", message: "Topics must be unique" },
		])
	}

	return withTenant(ctx, async (tx) => {
		if (topics.length > 0) {
			await tx
				.delete(notificationPreferences)
				.where(
					and(
						eq(notificationPreferences.userId, ctx.userId),
						inArray(notificationPreferences.topic, topics),
					),
				)
		}

		if (input.preferences.length > 0) {
			const values = input.preferences.map((p) => ({
				tenantId: ctx.tenantId,
				userId: ctx.userId,
				topic: p.topic,
				radiusKm: p.radiusKm == null ? null : String(p.radiusKm),
				activeFrom: p.activeFrom,
				activeTo: p.activeTo,
				quietHoursEnabled: p.quietHoursEnabled,
			}))
			await tx.insert(notificationPreferences).values(values)
		}

		await writeAuditLogFor(tx, ctx.tenantId, {
			actorId: ctx.userId,
			action: "notification.preferences.updated",
			entityType: "notification_preferences",
			entityId: ctx.userId,
			payload: { topics, count: topics.length },
		})

		const rows = await tx
			.select()
			.from(notificationPreferences)
			.where(
				topics.length === 0
					? sql`false`
					: and(
							eq(notificationPreferences.userId, ctx.userId),
							inArray(notificationPreferences.topic, topics),
						),
			)
			.orderBy(notificationPreferences.topic)
		return rows as NotificationPreferenceRow[]
	})
}

export type PublicPreference = {
	topic: string
	radiusKm: number | null
	activeFrom: string
	activeTo: string
	quietHoursEnabled: boolean
}

export const getPreferencesForUser = async (
	userId: string,
	topic: string,
): Promise<PublicPreference | null> => {
	const row = await findPreferenceForUser(userId, topic)
	if (row == null) return null
	return {
		topic: row.topic,
		radiusKm: row.radiusKm == null ? null : Number(row.radiusKm),
		activeFrom: row.activeFrom,
		activeTo: row.activeTo,
		quietHoursEnabled: row.quietHoursEnabled,
	}
}

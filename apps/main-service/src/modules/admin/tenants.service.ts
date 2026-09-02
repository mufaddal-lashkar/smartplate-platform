import { ApiError } from "../../shared/api-error"
import { type AdminTenantRow, findAdminTenant, listAllTenants } from "./tenants.queries"

export const listTenants = async (): Promise<AdminTenantRow[]> => listAllTenants()

export const getTenant = async (tenantId: string): Promise<AdminTenantRow> => {
	const tenant = await findAdminTenant(tenantId)
	if (tenant == null) {
		throw new ApiError("RESOURCE_NOT_FOUND", "Tenant not found.")
	}
	return tenant
}

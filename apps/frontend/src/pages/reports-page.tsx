import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import dayjs from "dayjs"
import {
	DownloadIcon,
	FileSpreadsheetIcon,
	FileTextIcon,
	FileTypeIcon,
	LoaderIcon,
} from "lucide-react"
import { useState } from "react"
import { type DateRange, DateRangePicker } from "../components/date-range-picker"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Label } from "../components/ui/label"
import { Skeleton } from "../components/ui/skeleton"
import { ApiClientError, apiGet, apiPost } from "../lib/api-client"
import { queryKeys } from "../lib/query-keys"

type ReportType = "waste" | "recovery" | "dishes"
type ReportFormat = "csv" | "pdf" | "xlsx"

type ReportRecord = {
	id: string
	reportType: ReportType
	periodStart: string
	periodEnd: string
	format: ReportFormat
	status: "queued" | "running" | "succeeded" | "failed"
	artifactPath: string
	error: string
	createdAt: string
	finishedAt: string
}

const initialRange = (): DateRange => {
	const today = dayjs()
	return {
		from: today.subtract(30, "day").format("YYYY-MM-DD"),
		to: today.format("YYYY-MM-DD"),
	}
}

const dateTime = (iso: string): string => {
	if (iso === "") return "—"
	return dayjs(iso).format("DD MMM YYYY · HH:mm")
}

const formatLabel: Record<ReportFormat, string> = {
	csv: "CSV",
	pdf: "PDF",
	xlsx: "Excel",
}

const formatIcon: Record<ReportFormat, typeof FileTextIcon> = {
	csv: FileTextIcon,
	pdf: FileTypeIcon,
	xlsx: FileSpreadsheetIcon,
}

const statusTone: Record<
	ReportRecord["status"],
	"default" | "good" | "warning" | "serious" | "critical"
> = {
	queued: "default",
	running: "warning",
	succeeded: "good",
	failed: "critical",
}

const REPORTS_POLL_MS = 1500

const CreateForm = ({
	range,
	onCreated,
}: {
	range: DateRange
	onCreated: (record: ReportRecord) => void
}) => {
	const [type, setType] = useState<ReportType>("waste")
	const [format, setFormat] = useState<ReportFormat>("csv")

	const mutation = useMutation({
		mutationFn: () =>
			apiPost<{ jobId: string; status: ReportRecord["status"] }>("/v1/reports", {
				reportType: type,
				from: range.from,
				to: range.to,
				format,
			}),
		onSuccess: (data) => {
			onCreated({
				id: data.jobId,
				reportType: type,
				periodStart: range.from,
				periodEnd: range.to,
				format,
				status: data.status,
				artifactPath: "",
				error: "",
				createdAt: new Date().toISOString(),
				finishedAt: "",
			})
		},
	})

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Create a report</CardTitle>
				<CardDescription>
					Renders a dated artifact you can hand to a partner. The job runs in the background and
					shows up below when ready.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form
					className="grid gap-4 md:grid-cols-2"
					onSubmit={(e) => {
						e.preventDefault()
						mutation.mutate()
					}}
				>
					<div className="flex flex-col gap-1">
						<Label htmlFor="report-type" className="text-xs">
							Report type
						</Label>
						<select
							id="report-type"
							value={type}
							onChange={(e) => setType(e.target.value as ReportType)}
							className="h-9 rounded-md border border-input bg-background px-2 text-sm"
						>
							<option value="waste">Waste</option>
							<option value="recovery">Recovery</option>
							<option value="dishes">Per-dish</option>
						</select>
					</div>
					<div className="flex flex-col gap-1">
						<Label htmlFor="report-format" className="text-xs">
							Format
						</Label>
						<select
							id="report-format"
							value={format}
							onChange={(e) => setFormat(e.target.value as ReportFormat)}
							className="h-9 rounded-md border border-input bg-background px-2 text-sm"
						>
							<option value="csv">CSV</option>
							<option value="pdf">PDF</option>
							<option value="xlsx">Excel (.xlsx)</option>
						</select>
					</div>
					<div className="md:col-span-2 flex items-center justify-end">
						<Button type="submit" disabled={mutation.isPending}>
							{mutation.isPending ? (
								<>
									<LoaderIcon className="size-4 animate-spin" aria-hidden="true" />
									Queuing…
								</>
							) : (
								"Create report"
							)}
						</Button>
					</div>
				</form>
				{mutation.error instanceof ApiClientError && (
					<p className="mt-3 text-xs text-critical">{mutation.error.message}</p>
				)}
			</CardContent>
		</Card>
	)
}

const ReportRow = ({ report }: { report: ReportRecord }) => {
	const Icon = formatIcon[report.format]
	const isReady = report.status === "succeeded"

	const download = () => {
		window.location.href = `/api/v1/reports/${report.id}/download`
	}

	return (
		<div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-md border border-border bg-background px-4 py-3">
			<Icon className="size-5 text-muted-foreground" aria-hidden="true" />
			<div className="min-w-0">
				<p className="text-sm font-medium capitalize">
					{report.reportType} · {formatLabel[report.format]} · {report.periodStart} →{" "}
					{report.periodEnd}
				</p>
				<p className="text-xs text-muted-foreground">
					Created {dateTime(report.createdAt)}
					{report.finishedAt !== "" ? ` · finished ${dateTime(report.finishedAt)}` : ""}
				</p>
				{report.status === "failed" && report.error !== "" && (
					<p className="mt-1 text-xs text-critical">{report.error}</p>
				)}
			</div>
			<div className="flex items-center gap-2">
				<Badge variant="secondary" className="capitalize">
					<span
						className={
							statusTone[report.status] === "good"
								? "text-good"
								: statusTone[report.status] === "critical"
									? "text-critical"
									: statusTone[report.status] === "warning"
										? "text-warning"
										: ""
						}
					>
						{report.status}
					</span>
				</Badge>
				<Button
					size="sm"
					variant="outline"
					disabled={!isReady}
					onClick={download}
					title={isReady ? "Download" : "Report is not ready yet"}
				>
					<DownloadIcon className="size-4" aria-hidden="true" />
					Download
				</Button>
			</div>
		</div>
	)
}

const ReportsList = () => {
	const query = useQuery({
		queryKey: queryKeys.reports(),
		queryFn: () => apiGet<{ reports: ReportRecord[] }>("/v1/reports"),
		refetchInterval: (q) => {
			const data = q.state.data
			if (data == null) return REPORTS_POLL_MS
			const stillRunning = data.reports.some((r) => r.status === "queued" || r.status === "running")
			return stillRunning ? REPORTS_POLL_MS : false
		},
	})

	if (query.isPending) {
		return (
			<div className="space-y-2">
				<Skeleton className="h-16 w-full" />
				<Skeleton className="h-16 w-full" />
			</div>
		)
	}
	if (query.error != null) {
		return (
			<Card className="border-serious/40 bg-serious/5">
				<CardHeader>
					<CardTitle className="text-base text-serious">Could not load reports</CardTitle>
					<CardDescription>{query.error.message}</CardDescription>
				</CardHeader>
			</Card>
		)
	}

	const reports = query.data.reports
	if (reports.length === 0) {
		return (
			<Card className="border-dashed">
				<CardHeader>
					<CardTitle className="text-base">No reports yet</CardTitle>
					<CardDescription>
						Create one above and it lands here when the worker finishes.
					</CardDescription>
				</CardHeader>
			</Card>
		)
	}

	return (
		<div className="space-y-2">
			{reports.map((r) => (
				<ReportRow key={r.id} report={r} />
			))}
		</div>
	)
}

export const ReportsPage = () => {
	const [range, setRange] = useState<DateRange>(initialRange)
	const queryClient = useQueryClient()

	return (
		<section className="w-full">
			<header>
				<h1 className="font-display text-2xl font-semibold tracking-tight">Reports</h1>
				<p className="mt-1 text-muted-foreground">
					Dated exports of waste, recovery and per-dish recovery. CSV opens in any spreadsheet; PDF
					for partners; XLSX for accountants.
				</p>
			</header>

			<div className="mt-6 space-y-6">
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Date range</CardTitle>
					</CardHeader>
					<CardContent>
						<DateRangePicker value={range} onChange={setRange} />
					</CardContent>
				</Card>

				<CreateForm
					range={range}
					onCreated={() => {
						queryClient.invalidateQueries({ queryKey: queryKeys.reports() })
					}}
				/>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">Your reports</CardTitle>
						<CardDescription>Most recent first. Refreshes while jobs are running.</CardDescription>
					</CardHeader>
					<CardContent>
						<ReportsList />
					</CardContent>
				</Card>
			</div>
		</section>
	)
}

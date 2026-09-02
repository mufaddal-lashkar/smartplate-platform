import dayjs from "dayjs"
import { CalendarIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"

export type DateRange = { from: string; to: string }

export type DateRangePickerProps = {
	value: DateRange
	onChange: (range: DateRange) => void
	label?: string
}

const presets = [
	{ label: "7 days", days: 7 },
	{ label: "30 days", days: 30 },
	{ label: "90 days", days: 90 },
]

export const DateRangePicker = ({ value, onChange, label }: DateRangePickerProps) => {
	const [from, setFrom] = useState(value.from)
	const [to, setTo] = useState(value.to)

	const apply = (nextFrom: string, nextTo: string) => {
		setFrom(nextFrom)
		setTo(nextTo)
		onChange({ from: nextFrom, to: nextTo })
	}

	const handlePreset = (days: number) => {
		const today = dayjs()
		const start = today.subtract(days, "day").format("YYYY-MM-DD")
		const end = today.format("YYYY-MM-DD")
		apply(start, end)
	}

	return (
		<div className="flex flex-wrap items-end gap-3">
			{label != null && label !== "" && (
				<div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
					<CalendarIcon className="size-4" aria-hidden="true" />
					{label}
				</div>
			)}
			<div className="flex flex-col gap-1">
				<Label htmlFor="from" className="text-xs">
					From
				</Label>
				<Input
					id="from"
					type="date"
					value={from}
					onChange={(e) => apply(e.target.value, to)}
					className="h-9 w-40"
				/>
			</div>
			<div className="flex flex-col gap-1">
				<Label htmlFor="to" className="text-xs">
					To
				</Label>
				<Input
					id="to"
					type="date"
					value={to}
					onChange={(e) => apply(from, e.target.value)}
					className="h-9 w-40"
				/>
			</div>
			<div className="flex gap-1">
				{presets.map((preset) => (
					<Button
						key={preset.days}
						type="button"
						size="sm"
						variant="outline"
						onClick={() => handlePreset(preset.days)}
					>
						{preset.label}
					</Button>
				))}
			</div>
		</div>
	)
}

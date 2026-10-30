import { format, isThisYear, isToday } from 'date-fns'

export function formatMessageDate(iso: string): string {
  const date = new Date(iso)
  if (isToday(date)) return format(date, 'h:mm a')
  if (isThisYear(date)) return format(date, 'MMM d')
  return format(date, 'MM/dd/yy')
}

const COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  VALIDATING: "bg-amber-100 text-amber-700",
  READY: "bg-blue-100 text-blue-700",
  SCHEDULED: "bg-indigo-100 text-indigo-700",
  PREPARING: "bg-amber-100 text-amber-700",
  SENDING: "bg-brand-100 text-brand-700",
  PAUSED: "bg-orange-100 text-orange-700",
  COMPLETED: "bg-green-100 text-green-700",
  PARTIALLY_COMPLETED: "bg-yellow-100 text-yellow-700",
  FAILED: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-200 text-gray-600",
  // message statuses
  SENT: "bg-brand-100 text-brand-700",
  DELIVERED: "bg-green-100 text-green-700",
  READ: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-gray-100 text-gray-600",
  PROCESSING: "bg-amber-100 text-amber-700",
  UNKNOWN: "bg-purple-100 text-purple-700",
  EXCLUDED: "bg-red-50 text-red-600",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${COLORS[status] ?? "bg-gray-100 text-gray-600"}`}>{status.replace(/_/g, " ")}</span>;
}

import { useMemo, useState } from 'react'

type Patient = {
  id: string
  name: string
  createdAt: string
}

type Appointment = {
  id: string
  patientId: string
  patientName: string
  date: string
  time: string
  reason: string
  status: string
}

type Treatment = {
  id: string
  patientId: string
  patientName: string
  treatmentName: string
  cost: number
  status: string
  startDate: string
  createdAt: string
}

type Invoice = {
  id: string
  invoiceNumber: string
  patientId: string
  patientName: string
  date: string
  total: number
  amountPaid: number
  paymentStatus: string
  paymentMethod?: string
}

type InventoryItem = {
  id: string
  name: string
  category: string
  quantity: number
  unit: string
  minimumStock: number
  purchasePricePaise: number
  expiryDate: string
  archivedAt?: string
}

const PATIENTS_KEY = 'joshi-dental-clinic-patients'
const APPOINTMENTS_KEY = 'joshi-dental-clinic-appointments'
const TREATMENTS_KEY = 'joshi-dental-clinic-treatments'
const INVOICES_KEY = 'joshi-dental-clinic-invoices'
const INVENTORY_KEY = 'joshi-dental-clinic-inventory'

function todayISO() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function getStartOfMonth() {
  const today = new Date()

  return `${today.getFullYear()}-${String(
    today.getMonth() + 1,
  ).padStart(2, '0')}-01`
}

function loadData<T>(key: string): T[] {
  try {
    const stored = localStorage.getItem(key)

    if (!stored) return []

    const parsed = JSON.parse(stored)

    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

function formatCurrency(amount: number) {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`
}

function formatCurrencyDecimal(amount: number) {
  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(date: string) {
  if (!date) return '—'

  const parsed = new Date(`${date}T00:00:00`)

  if (Number.isNaN(parsed.getTime())) return date

  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function isWithinRange(date: string, from: string, to: string) {
  if (!date) return false

  return date >= from && date <= to
}

function getExpiryStatus(expiryDate: string) {
  if (!expiryDate) return 'none'

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const expiry = new Date(`${expiryDate}T00:00:00`)

  if (Number.isNaN(expiry.getTime())) return 'invalid'

  if (expiry < today) return 'expired'

  const diffDays = Math.ceil(
    (expiry.getTime() - today.getTime()) /
      (1000 * 60 * 60 * 24),
  )

  if (diffDays <= 30) return 'soon'

  return 'good'
}

export function ReportsPage() {
  const [fromDate, setFromDate] = useState(getStartOfMonth)
  const [toDate, setToDate] = useState(todayISO)

  const patients = useMemo(
    () => loadData<Patient>(PATIENTS_KEY),
    [],
  )

  const appointments = useMemo(
    () => loadData<Appointment>(APPOINTMENTS_KEY),
    [],
  )

  const treatments = useMemo(
    () => loadData<Treatment>(TREATMENTS_KEY),
    [],
  )

  const invoices = useMemo(
    () => loadData<Invoice>(INVOICES_KEY),
    [],
  )

  const inventory = useMemo(
    () => loadData<InventoryItem>(INVENTORY_KEY),
    [],
  )

  const report = useMemo(() => {
    const periodInvoices = invoices.filter((invoice) =>
      isWithinRange(invoice.date, fromDate, toDate),
    )

    const periodAppointments = appointments.filter((appointment) =>
      isWithinRange(appointment.date, fromDate, toDate),
    )

    const periodPatients = patients.filter((patient) =>
      isWithinRange(
        patient.createdAt?.slice(0, 10) ?? '',
        fromDate,
        toDate,
      ),
    )

    const periodTreatments = treatments.filter((treatment) =>
      isWithinRange(
        treatment.startDate ||
          treatment.createdAt?.slice(0, 10) ||
          '',
        fromDate,
        toDate,
      ),
    )

    const totalBilled = periodInvoices.reduce(
      (sum, invoice) => sum + Number(invoice.total || 0),
      0,
    )

    const totalReceived = periodInvoices.reduce(
      (sum, invoice) =>
        sum + Number(invoice.amountPaid || 0),
      0,
    )

    const outstanding = Math.max(
      0,
      totalBilled - totalReceived,
    )

    const appointmentStats = {
      total: periodAppointments.length,
      scheduled: periodAppointments.filter(
        (item) => item.status === 'Scheduled',
      ).length,
      underTreatment: periodAppointments.filter(
        (item) => item.status === 'Under treatment',
      ).length,
      completed: periodAppointments.filter(
        (item) => item.status === 'Completed',
      ).length,
      cancelled: periodAppointments.filter(
        (item) => item.status === 'Cancelled',
      ).length,
      noShow: periodAppointments.filter(
        (item) => item.status === 'No show',
      ).length,
    }

    const treatmentStats = {
      total: periodTreatments.length,
      planned: periodTreatments.filter(
        (item) => item.status === 'Planned',
      ).length,
      active: periodTreatments.filter(
        (item) => item.status === 'In progress',
      ).length,
      completed: periodTreatments.filter(
        (item) => item.status === 'Completed',
      ).length,
      onHold: periodTreatments.filter(
        (item) => item.status === 'On hold',
      ).length,
      cancelled: periodTreatments.filter(
        (item) => item.status === 'Cancelled',
      ).length,
      value: periodTreatments.reduce(
        (sum, treatment) =>
          sum + Number(treatment.cost || 0),
        0,
      ),
    }

    const activeInventory = inventory.filter(
      (item) => !item.archivedAt,
    )

    const inventoryStockValue = activeInventory.reduce(
      (sum, item) =>
        sum +
        Number(item.quantity || 0) *
          (Number(item.purchasePricePaise || 0) / 100),
      0,
    )

    const lowStock = activeInventory.filter(
      (item) =>
        item.quantity <= item.minimumStock,
    )

    const outOfStock = activeInventory.filter(
      (item) => item.quantity === 0,
    )

    const expired = activeInventory.filter(
      (item) => getExpiryStatus(item.expiryDate) === 'expired',
    )

    const expiringSoon = activeInventory.filter(
      (item) => getExpiryStatus(item.expiryDate) === 'soon',
    )

    const treatmentMap = new Map<
      string,
      { name: string; value: number }
    >()

    periodTreatments.forEach((treatment) => {
      const existing = treatmentMap.get(
        treatment.treatmentName,
      )

      if (existing) {
        existing.value += Number(treatment.cost || 0)
      } else {
        treatmentMap.set(treatment.treatmentName, {
          name: treatment.treatmentName,
          value: Number(treatment.cost || 0),
        })
      }
    })

    const topTreatments = Array.from(
      treatmentMap.values(),
    )
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)

    const paymentMethods = new Map<
      string,
      { count: number; amount: number }
    >()

    periodInvoices.forEach((invoice) => {
      const method = invoice.paymentMethod || 'Not recorded'

      const existing = paymentMethods.get(method)

      if (existing) {
        existing.count += 1
        existing.amount += Number(
          invoice.amountPaid || 0,
        )
      } else {
        paymentMethods.set(method, {
          count: 1,
          amount: Number(invoice.amountPaid || 0),
        })
      }
    })

    return {
      periodInvoices,
      periodAppointments,
      periodPatients,
      periodTreatments,
      totalBilled,
      totalReceived,
      outstanding,
      appointmentStats,
      treatmentStats,
      activeInventory,
      inventoryStockValue,
      lowStock,
      outOfStock,
      expired,
      expiringSoon,
      topTreatments,
      paymentMethods: Array.from(
        paymentMethods.entries(),
      )
        .map(([method, data]) => ({
          method,
          ...data,
        }))
        .sort((a, b) => b.amount - a.amount),
    }
  }, [
    appointments,
    fromDate,
    inventory,
    invoices,
    patients,
    toDate,
    treatments,
  ])

  function applyPreset(
    preset: 'today' | 'month' | 'year',
  ) {
    const today = new Date()

    if (preset === 'today') {
      const date = todayISO()
      setFromDate(date)
      setToDate(date)
      return
    }

    if (preset === 'month') {
      setFromDate(getStartOfMonth())
      setToDate(todayISO())
      return
    }

    setFromDate(`${today.getFullYear()}-01-01`)
    setToDate(todayISO())
  }

  function printReport() {
    window.print()
  }

  const hasInvalidRange = fromDate > toDate

  return (
    <section className="space-y-6 print:space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between print:hidden">
        <div>
          <p className="text-sm font-medium text-clinic-teal">
            Analytics
          </p>

          <h1 className="mt-1 font-display text-4xl font-semibold text-clinic-ink">
            Reports
          </h1>

          <p className="mt-2 text-sm text-clinic-ink/60">
            Review clinic performance, revenue, appointments,
            treatments and inventory.
          </p>
        </div>

        <button
          type="button"
          onClick={printReport}
          className="rounded-xl border border-clinic-line bg-white px-5 py-3 text-sm font-semibold text-clinic-ink/70 hover:bg-clinic-paper"
        >
          Print Report
        </button>
      </div>

      <div className="rounded-2xl border border-clinic-line bg-white p-5 shadow-sm print:hidden">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold">
              Report period
            </h2>

            <p className="mt-1 text-sm text-clinic-ink/50">
              Choose the dates you want to analyse.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyPreset('today')}
              className="rounded-lg border border-clinic-line px-3 py-2 text-xs font-semibold hover:bg-clinic-paper"
            >
              Today
            </button>

            <button
              type="button"
              onClick={() => applyPreset('month')}
              className="rounded-lg border border-clinic-line px-3 py-2 text-xs font-semibold hover:bg-clinic-paper"
            >
              This month
            </button>

            <button
              type="button"
              onClick={() => applyPreset('year')}
              className="rounded-lg border border-clinic-line px-3 py-2 text-xs font-semibold hover:bg-clinic-paper"
            >
              This year
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-medium">
              From
            </span>

            <input
              type="date"
              value={fromDate}
              onChange={(event) =>
                setFromDate(event.target.value)
              }
              className="input-field"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">
              To
            </span>

            <input
              type="date"
              value={toDate}
              onChange={(event) =>
                setToDate(event.target.value)
              }
              className="input-field"
            />
          </label>
        </div>

        {hasInvalidRange && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            The start date cannot be after the end date.
          </div>
        )}
      </div>

      <div className="hidden print:block">
        <p className="text-sm font-medium text-clinic-teal">
          JOSHI DENTAL CLINIC
        </p>

        <h1 className="mt-1 font-display text-3xl font-semibold">
          Clinic Report
        </h1>

        <p className="mt-1 text-sm text-gray-600">
          {formatDate(fromDate)} — {formatDate(toDate)}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ReportCard
          label="Total billed"
          value={formatCurrency(report.totalBilled)}
          description={`${report.periodInvoices.length} invoices`}
        />

        <ReportCard
          label="Received"
          value={formatCurrency(report.totalReceived)}
          description="Payments recorded"
        />

        <ReportCard
          label="Outstanding"
          value={formatCurrency(report.outstanding)}
          description="Balance still due"
        />

        <ReportCard
          label="New patients"
          value={String(report.periodPatients.length)}
          description="Registered in this period"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ReportSection
          title="Appointment statistics"
          description="Appointment activity during the selected period."
        >
          <StatRow
            label="Total appointments"
            value={report.appointmentStats.total}
          />

          <StatRow
            label="Scheduled"
            value={report.appointmentStats.scheduled}
          />

          <StatRow
            label="Under treatment"
            value={report.appointmentStats.underTreatment}
          />

          <StatRow
            label="Completed"
            value={report.appointmentStats.completed}
          />

          <StatRow
            label="Cancelled"
            value={report.appointmentStats.cancelled}
          />

          <StatRow
            label="No show"
            value={report.appointmentStats.noShow}
          />
        </ReportSection>

        <ReportSection
          title="Treatment statistics"
          description="Clinical treatment activity during the selected period."
        >
          <StatRow
            label="Total treatments"
            value={report.treatmentStats.total}
          />

          <StatRow
            label="Planned"
            value={report.treatmentStats.planned}
          />

          <StatRow
            label="In progress"
            value={report.treatmentStats.active}
          />

          <StatRow
            label="Completed"
            value={report.treatmentStats.completed}
          />

          <StatRow
            label="On hold"
            value={report.treatmentStats.onHold}
          />

          <StatRow
            label="Treatment value"
            value={formatCurrency(
              report.treatmentStats.value,
            )}
          />
        </ReportSection>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ReportSection
          title="Payment methods"
          description="Payments received through each recorded method."
        >
          {report.paymentMethods.length === 0 ? (
            <EmptyReport text="No payments recorded in this period." />
          ) : (
            <div className="space-y-3">
              {report.paymentMethods.map((item) => (
                <div
                  key={item.method}
                  className="flex items-center justify-between rounded-xl bg-clinic-paper px-4 py-3"
                >
                  <div>
                    <p className="font-medium">
                      {item.method}
                    </p>

                    <p className="mt-1 text-xs text-clinic-ink/50">
                      {item.count}{' '}
                      {item.count === 1
                        ? 'invoice'
                        : 'invoices'}
                    </p>
                  </div>

                  <p className="font-semibold text-clinic-teal">
                    {formatCurrency(item.amount)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </ReportSection>

        <ReportSection
          title="Top treatments by value"
          description="Highest-value treatment types in the selected period."
        >
          {report.topTreatments.length === 0 ? (
            <EmptyReport text="No treatment records in this period." />
          ) : (
            <div className="space-y-3">
              {report.topTreatments.map((item, index) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between gap-4 rounded-xl bg-clinic-paper px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-clinic-teal/10 text-xs font-bold text-clinic-teal">
                      {index + 1}
                    </span>

                    <p className="truncate font-medium">
                      {item.name}
                    </p>
                  </div>

                  <p className="shrink-0 font-semibold">
                    {formatCurrency(item.value)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </ReportSection>
      </div>

      <ReportSection
        title="Inventory overview"
        description="Current inventory health. Inventory values represent purchase value."
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MiniCard
            label="Active items"
            value={report.activeInventory.length}
          />

          <MiniCard
            label="Stock value"
            value={formatCurrencyDecimal(
              report.inventoryStockValue,
            )}
          />

          <MiniCard
            label="Low stock"
            value={report.lowStock.length}
          />

          <MiniCard
            label="Out of stock"
            value={report.outOfStock.length}
          />

          <MiniCard
            label="Expiring soon"
            value={report.expiringSoon.length}
          />
        </div>

        {(report.lowStock.length > 0 ||
          report.outOfStock.length > 0 ||
          report.expired.length > 0 ||
          report.expiringSoon.length > 0) && (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <AlertList
              title="Stock alerts"
              items={[
                ...report.outOfStock.map(
                  (item) =>
                    `${item.name} — out of stock`,
                ),
                ...report.lowStock.map(
                  (item) =>
                    `${item.name} — low stock (${item.quantity} ${item.unit})`,
                ),
              ]}
            />

            <AlertList
              title="Expiry alerts"
              items={[
                ...report.expired.map(
                  (item) =>
                    `${item.name} — expired ${formatDate(
                      item.expiryDate,
                    )}`,
                ),
                ...report.expiringSoon.map(
                  (item) =>
                    `${item.name} — expires ${formatDate(
                      item.expiryDate,
                    )}`,
                ),
              ]}
            />
          </div>
        )}
      </ReportSection>

      <ReportSection
        title="Report summary"
        description="Selected period overview."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <SummaryBox
            label="Period"
            value={`${formatDate(fromDate)} — ${formatDate(
              toDate,
            )}`}
          />

          <SummaryBox
            label="Invoices"
            value={String(report.periodInvoices.length)}
          />

          <SummaryBox
            label="Appointments"
            value={String(
              report.periodAppointments.length,
            )}
          />
        </div>
      </ReportSection>

      <p className="pb-6 text-center text-xs text-clinic-ink/40 print:hidden">
        JOSHI DENTAL CLINIC • Reports generated from the
        clinic application data
      </p>
    </section>
  )
}

function ReportCard({
  label,
  value,
  description,
}: {
  label: string
  value: string
  description: string
}) {
  return (
    <div className="rounded-2xl border border-clinic-line bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-clinic-ink/40">
        {label}
      </p>

      <p className="mt-3 font-display text-3xl font-semibold text-clinic-ink">
        {value}
      </p>

      <p className="mt-1 text-xs text-clinic-ink/45">
        {description}
      </p>
    </div>
  )
}

function ReportSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-clinic-line bg-white p-5 shadow-sm">
      <div className="mb-5">
        <h2 className="font-display text-xl font-semibold">
          {title}
        </h2>

        <p className="mt-1 text-sm text-clinic-ink/50">
          {description}
        </p>
      </div>

      {children}
    </div>
  )
}

function StatRow({
  label,
  value,
}: {
  label: string
  value: number | string
}) {
  return (
    <div className="flex items-center justify-between border-b border-clinic-line/70 py-3 last:border-0">
      <span className="text-sm text-clinic-ink/60">
        {label}
      </span>

      <span className="font-semibold text-clinic-ink">
        {value}
      </span>
    </div>
  )
}

function MiniCard({
  label,
  value,
}: {
  label: string
  value: number | string
}) {
  return (
    <div className="rounded-xl border border-clinic-line bg-clinic-paper p-4">
      <p className="text-xs text-clinic-ink/45">
        {label}
      </p>

      <p className="mt-2 text-xl font-semibold">
        {value}
      </p>
    </div>
  )
}

function SummaryBox({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-clinic-line bg-clinic-paper p-4">
      <p className="text-xs uppercase tracking-wide text-clinic-ink/40">
        {label}
      </p>

      <p className="mt-2 text-sm font-semibold">
        {value}
      </p>
    </div>
  )
}

function AlertList({
  title,
  items,
}: {
  title: string
  items: string[]
}) {
  return (
    <div className="rounded-xl border border-clinic-line bg-clinic-paper p-4">
      <h3 className="font-semibold">{title}</h3>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-clinic-ink/45">
          No alerts.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.slice(0, 8).map((item) => (
            <li
              key={item}
              className="text-sm text-clinic-ink/65"
            >
              • {item}
            </li>
          ))}

          {items.length > 8 && (
            <li className="text-xs text-clinic-ink/40">
              + {items.length - 8} more
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

function EmptyReport({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-clinic-line bg-clinic-paper p-6 text-center text-sm text-clinic-ink/45">
      {text}
    </div>
  )
}
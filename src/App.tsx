import type { ReactNode } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { AppointmentsPage } from './features/appointment/appointment'
import { PatientsPage } from './features/patients/PatientsPage'
import { TreatmentsPage } from './features/treatments/TreatmentsPage'
import { BillingPage } from './features/billing/BillingPage'
import { InventoryPage } from './features/inventory/InventoryPage'
import { ReportsPage } from './features/reports/ReportsPage'

function getGreeting() {
  const hour = new Date().getHours()

  if (hour >= 4 && hour < 12) return 'Good morning.'
  if (hour >= 12 && hour < 16) return 'Good afternoon.'
  if (hour >= 16 && hour < 20) return 'Good evening.'

  return 'Welcome back.'
}

function Dashboard() {
  const greeting = getGreeting()

  const today = new Date()
  const todayISO = `${today.getFullYear()}-${String(
    today.getMonth() + 1,
  ).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  type DashboardPatient = {
    id: string
    name: string
    phone: string
    createdAt: string
  }

  type DashboardAppointment = {
    id: string
    patientId: string
    patientName: string
    date: string
    time: string
    reason: string
    status: string
  }

  type DashboardInvoice = {
    id: string
    total: number
    amountPaid: number
    paymentStatus: string
  }

  type DashboardInventoryItem = {
    id: string
    name: string
    quantity: number
    minimumStock: number
    archivedAt?: string
  }

  function loadData<T>(key: string): T[] {
    try {
      const saved = localStorage.getItem(key)

      if (!saved) return []

      const parsed = JSON.parse(saved)

      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  const patients = loadData<DashboardPatient>(
    'joshi-dental-clinic-patients',
  )

  const appointments = loadData<DashboardAppointment>(
    'joshi-dental-clinic-appointments',
  )

  const invoices = loadData<DashboardInvoice>(
    'joshi-dental-clinic-invoices',
  )

  const inventory = loadData<DashboardInventoryItem>(
    'joshi-dental-clinic-inventory',
  )

  const todaysAppointments = appointments
    .filter(
      (appointment) =>
        appointment.date === todayISO &&
        appointment.status !== 'Cancelled',
    )
    .sort((a, b) => a.time.localeCompare(b.time))

  const outstandingPayments = invoices.reduce(
    (total, invoice) =>
      total +
      Math.max(
        0,
        Number(invoice.total || 0) -
          Number(invoice.amountPaid || 0),
      ),
    0,
  )

  const lowStockItems = inventory.filter(
    (item) =>
      !item.archivedAt &&
      item.quantity <= item.minimumStock,
  )

  const recentPatients = [...patients]
    .sort((a, b) =>
      (b.createdAt || '').localeCompare(
        a.createdAt || '',
      ),
    )
    .slice(0, 5)

  function formatCurrency(amount: number) {
    return `₹${Math.round(amount).toLocaleString('en-IN')}`
  }

  function formatTime(time: string) {
    if (!time) return '—'

    const [hourString, minute] = time.split(':')
    const hour = Number(hourString)

    if (Number.isNaN(hour)) return time

    const period = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour % 12 || 12

    return `${displayHour}:${minute} ${period}`
  }

  function getStatusClass(status: string) {
    switch (status) {
      case 'Completed':
        return 'bg-clinic-success/10 text-clinic-success'

      case 'Under treatment':
        return 'bg-clinic-teal/10 text-clinic-teal'

      case 'Cancelled':
        return 'bg-red-50 text-red-700'

      case 'No show':
        return 'bg-orange-50 text-orange-700'

      default:
        return 'bg-clinic-paper text-clinic-ink/60'
    }
  }

  return (
    <section>
      <p className="text-sm font-medium text-clinic-teal">
        JOSHI DENTAL CLINIC
      </p>

      <h1 className="mt-2 font-display text-4xl font-semibold text-clinic-ink">
        {greeting}
      </h1>

      <p className="mt-2 text-clinic-ink/55">
        Here is your clinic overview.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Today's appointments"
          value={String(todaysAppointments.length)}
        />

        <StatCard
          title="Total patients"
          value={String(patients.length)}
        />

        <StatCard
          title="Outstanding payments"
          value={formatCurrency(outstandingPayments)}
        />

        <StatCard
          title="Low stock items"
          value={String(lowStockItems.length)}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel title="Today's appointments">
          {todaysAppointments.length === 0 ? (
            <EmptyState message="No appointments scheduled for today." />
          ) : (
            <div className="space-y-3">
              {todaysAppointments.map((appointment) => (
                <div
                  key={appointment.id}
                  className="flex flex-col gap-3 rounded-xl border border-clinic-line bg-clinic-paper p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold">
                      {appointment.patientName}
                    </p>

                    <p className="mt-1 text-sm text-clinic-ink/50">
                      {formatTime(appointment.time)}
                      {appointment.reason
                        ? ` • ${appointment.reason}`
                        : ''}
                    </p>
                  </div>

                  <span
                    className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(
                      appointment.status,
                    )}`}
                  >
                    {appointment.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Recent patients">
          {recentPatients.length === 0 ? (
            <EmptyState message="No patients have been registered yet." />
          ) : (
            <div className="space-y-3">
              {recentPatients.map((patient) => (
                <div
                  key={patient.id}
                  className="flex items-center justify-between rounded-xl border border-clinic-line bg-clinic-paper p-4"
                >
                  <div>
                    <p className="font-semibold">
                      {patient.name}
                    </p>

                    <p className="mt-1 text-sm text-clinic-ink/50">
                      {patient.phone}
                    </p>
                  </div>

                  <span className="text-xs text-clinic-ink/40">
                    Patient
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-clinic-line bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-clinic-ink/40">
            Scheduled
          </p>

          <p className="mt-3 font-display text-3xl font-semibold">
            {
              todaysAppointments.filter(
                (item) => item.status === 'Scheduled',
              ).length
            }
          </p>
        </div>

        <div className="rounded-2xl border border-clinic-line bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-clinic-ink/40">
            Under treatment
          </p>

          <p className="mt-3 font-display text-3xl font-semibold">
            {
              todaysAppointments.filter(
                (item) =>
                  item.status === 'Under treatment',
              ).length
            }
          </p>
        </div>

        <div className="rounded-2xl border border-clinic-line bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-clinic-ink/40">
            Completed
          </p>

          <p className="mt-3 font-display text-3xl font-semibold">
            {
              todaysAppointments.filter(
                (item) => item.status === 'Completed',
              ).length
            }
          </p>
        </div>

        <div className="rounded-2xl border border-clinic-line bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-clinic-ink/40">
            Inventory alerts
          </p>

          <p className="mt-3 font-display text-3xl font-semibold">
            {lowStockItems.length}
          </p>
        </div>
      </div>
    </section>
  )
}

function App() {
  return (
    <div className="min-h-screen bg-clinic-paper text-clinic-ink">
      <Sidebar />

      <main className="lg:pl-64">
        <Header />

        <MobileNavigation />

        <div className="mx-auto max-w-7xl px-5 py-8 md:px-8">
          <Routes>
            <Route
              path="/"
              element={<Navigate to="/dashboard" replace />}
            />

            <Route
              path="/dashboard"
              element={<Dashboard />}
            />

            <Route
              path="/patients"
              element={<PatientsPage />}
            />

            <Route
              path="/appointments"
              element={<AppointmentsPage />}
            />

            <Route
              path="/treatments"
              element={<TreatmentsPage />}
            />

            <Route
              path="/billing"
              element={<BillingPage />}
            />

            <Route
              path="/inventory"
              element={<InventoryPage />}
            />

            <Route
              path="/reports"
              element={<ReportsPage />}
            />

            <Route
              path="*"
              element={<Navigate to="/dashboard" replace />}
            />
          </Routes>
        </div>
      </main>
    </div>
  )
}

function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-clinic-line bg-white px-5 py-7 lg:block">
      <div className="mb-10">
        <div className="font-display text-xl font-semibold text-clinic-teal">
          JOSHI DENTAL CLINIC
        </div>

        <div className="mt-1 text-xs text-clinic-ink/45">
          Clinic Manager
        </div>
      </div>

      <nav className="space-y-1">
        <NavigationItem
          to="/dashboard"
          label="Dashboard"
        />

        <NavigationItem
          to="/patients"
          label="Patients"
        />

        <NavigationItem
          to="/appointments"
          label="Appointments"
        />
      </nav>

      <div className="mb-2 mt-8 px-3 text-[10px] font-semibold uppercase tracking-widest text-clinic-ink/35">
        Planned
      </div>

      <nav className="space-y-1">
        <NavigationItem
          to="/treatments"
          label="Treatments"
        />

        <NavigationItem
          to="/billing"
          label="Billing"
        />

        <NavigationItem
          to="/inventory"
          label="Inventory"
        />

        <NavigationItem
          to="/reports"
          label="Reports"
        />
      </nav>
    </aside>
  )
}

function Header() {
  return (
    <header className="flex h-16 items-center justify-between border-b border-clinic-line bg-white px-5 md:px-8">
      <div>
        <div className="text-xs text-clinic-ink/40">
          Clinic
        </div>

        <div className="text-sm font-semibold">
          JOSHI DENTAL CLINIC
        </div>
      </div>

      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-clinic-teal text-xs font-semibold text-white">
        CA
      </div>
    </header>
  )
}

function MobileNavigation() {
  return (
    <nav
      aria-label="Mobile navigation"
      className="flex gap-2 overflow-x-auto border-b border-clinic-line bg-white px-5 py-3 lg:hidden"
    >
      <NavigationItem
        to="/dashboard"
        label="Dashboard"
      />

      <NavigationItem
        to="/patients"
        label="Patients"
      />

      <NavigationItem
        to="/appointments"
        label="Appointments"
      />

      <NavigationItem
        to="/treatments"
        label="Treatments"
      />

      <NavigationItem
        to="/billing"
        label="Billing"
      />

      <NavigationItem
        to="/inventory"
        label="Inventory"
      />

      <NavigationItem
        to="/reports"
        label="Reports"
      />
    </nav>
  )
}

function NavigationItem({
  to,
  label,
}: {
  to: string
  label: string
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `block shrink-0 whitespace-nowrap rounded-xl px-4 py-3 text-sm font-medium transition ${
          isActive
            ? 'bg-[#0B5148] !text-white'
            : 'text-clinic-ink/60 hover:bg-clinic-paper hover:text-clinic-ink'
        }`
      }
    >
      {label}
    </NavLink>
  )
}

function StatCard({
  title,
  value,
}: {
  title: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-clinic-line bg-white p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-clinic-ink/40">
        {title}
      </div>

      <div className="mt-3 font-display text-3xl font-semibold">
        {value}
      </div>

      <div className="mt-2 text-xs text-clinic-ink/40">
        Live clinic data
      </div>
    </div>
  )
}

function Panel({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-clinic-line bg-white p-6">
      <h2 className="font-display text-xl font-semibold">
        {title}
      </h2>

      <div className="mt-6">
        {children}
      </div>
    </div>
  )
}

function EmptyState({
  message,
}: {
  message: string
}) {
  return (
    <div className="rounded-xl border border-dashed border-clinic-line bg-clinic-paper p-8 text-center text-sm text-clinic-ink/45">
      {message}
    </div>
  )
}

export default App
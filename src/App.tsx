import type { ReactNode } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { AppointmentsPage } from './features/appointment/appointment'
import { PatientsPage } from './features/patients/PatientsPage'

function Dashboard() {
  return (
    <section>
      <p className="text-sm font-medium text-clinic-teal">
        JOSHI DENTAL CLINIC
      </p>

      <h1 className="mt-2 font-display text-4xl font-semibold text-clinic-ink">
        Good evening.
      </h1>

      <p className="mt-2 text-clinic-ink/55">
        Here is your clinic overview.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Today's appointments" value="—" />
        <StatCard title="Total patients" value="—" />
        <StatCard title="Outstanding payments" value="—" />
        <StatCard title="Low stock items" value="—" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel title="Today's appointments">
          <EmptyState message="Appointments will appear here." />
        </Panel>

        <Panel title="Recent patients">
          <EmptyState message="Recently added patients will appear here." />
        </Panel>
      </div>
    </section>
  )
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <Page
      title={title}
      subtitle="This module is planned for a later milestone."
    >
      <EmptyState message="This section isn't built yet." />
    </Page>
  )
}

function App() {
  return (
    <div className="min-h-screen bg-clinic-paper text-clinic-ink">
      <Sidebar />

      <main className="lg:pl-64">
        <Header />

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
              element={<PlaceholderPage title="Treatments" />}
            />

            <Route
              path="/billing"
              element={<PlaceholderPage title="Billing" />}
            />

            <Route
              path="/inventory"
              element={<PlaceholderPage title="Inventory" />}
            />

            <Route
              path="/reports"
              element={<PlaceholderPage title="Reports" />}
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
        `block rounded-xl px-4 py-3 text-sm font-medium transition ${
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
        Data will appear after backend integration.
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

function Page({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <section>
      <h1 className="font-display text-4xl font-semibold">
        {title}
      </h1>

      <p className="mt-2 text-sm text-clinic-ink/55">
        {subtitle}
      </p>

      <div className="mt-8">
        {children}
      </div>
    </section>
  )
}

export default App
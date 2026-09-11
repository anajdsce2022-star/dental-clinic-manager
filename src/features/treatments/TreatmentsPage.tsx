import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'

type Patient = {
  id: string
  name: string
}

type TreatmentStatus =
  | 'Planned'
  | 'In progress'
  | 'Completed'
  | 'On hold'
  | 'Cancelled'

type Treatment = {
  id: string
  patientId: string
  patientName: string
  treatmentName: string
  tooth: string
  diagnosis: string
  status: TreatmentStatus
  plannedVisits: number
  completedVisits: number
  cost: number
  startDate: string
  nextVisit: string
  notes: string
  createdAt: string
}

const PATIENTS_STORAGE_KEY = 'joshi-dental-clinic-patients'
const TREATMENTS_STORAGE_KEY = 'joshi-dental-clinic-treatments'
const MAX_TREATMENT_COST = 100000000
const MAX_PLANNED_VISITS = 50

const emptyForm = {
  patientId: '',
  treatmentName: '',
  tooth: '',
  diagnosis: '',
  status: 'Planned' as TreatmentStatus,
  plannedVisits: 1,
  completedVisits: 0,
  cost: 0,
  startDate: '',
  nextVisit: '',
  notes: '',
}

function loadPatients(): Patient[] {
  try {
    const stored = localStorage.getItem(PATIENTS_STORAGE_KEY)

    if (!stored) return []

    const parsed = JSON.parse(stored)

    if (!Array.isArray(parsed)) return []

    return parsed
      .filter(
        (patient): patient is Patient =>
          typeof patient?.id === 'string' &&
          typeof patient?.name === 'string',
      )
      .map((patient) => ({
        id: patient.id,
        name: patient.name,
      }))
  } catch {
    return []
  }
}

function isTreatmentStatus(value: unknown): value is TreatmentStatus {
  return (
    value === 'Planned' ||
    value === 'In progress' ||
    value === 'Completed' ||
    value === 'On hold' ||
    value === 'Cancelled'
  )
}

function isValidDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function isSafeInteger(value: unknown, minimum: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= minimum
  )
}

function isSafeAmount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_TREATMENT_COST
  )
}

function loadTreatments(): Treatment[] {
  try {
    const stored = localStorage.getItem(TREATMENTS_STORAGE_KEY)

    if (!stored) return []

    const parsed: unknown = JSON.parse(stored)

    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((record): record is Record<string, unknown> => {
        return (
          typeof record === 'object' &&
          record !== null &&
          typeof record.id === 'string' &&
          typeof record.patientId === 'string' &&
          typeof record.treatmentName === 'string'
        )
      })
      .map((record) => {
        const plannedVisits =
          isSafeInteger(record.plannedVisits, 1) &&
          record.plannedVisits <= MAX_PLANNED_VISITS
            ? record.plannedVisits
            : 1
        const completedVisits = isSafeInteger(record.completedVisits, 0)
          ? Math.min(record.completedVisits, plannedVisits)
          : 0

        return {
          id: record.id as string,
          patientId: record.patientId as string,
          patientName:
            typeof record.patientName === 'string'
              ? record.patientName
              : '',
          treatmentName: record.treatmentName as string,
          tooth: typeof record.tooth === 'string' ? record.tooth : '',
          diagnosis:
            typeof record.diagnosis === 'string'
              ? record.diagnosis
              : '',
          status: isTreatmentStatus(record.status)
            ? record.status
            : 'Planned',
          plannedVisits,
          completedVisits,
          cost: isSafeAmount(record.cost) ? record.cost : 0,
          startDate:
            typeof record.startDate === 'string' &&
            isValidDateString(record.startDate)
              ? record.startDate
              : '',
          nextVisit:
            typeof record.nextVisit === 'string' &&
            isValidDateString(record.nextVisit)
              ? record.nextVisit
              : '',
          notes: typeof record.notes === 'string' ? record.notes : '',
          createdAt:
            typeof record.createdAt === 'string'
              ? record.createdAt
              : new Date(0).toISOString(),
        }
      })
  } catch {
    return []
  }
}

function formatCurrency(amount: number) {
  return `₹${amount.toLocaleString('en-IN')}`
}

function getStatusClasses(status: TreatmentStatus) {
  switch (status) {
    case 'Completed':
      return 'bg-clinic-success/10 text-clinic-success'

    case 'In progress':
      return 'bg-clinic-teal/10 text-clinic-teal'

    case 'On hold':
      return 'bg-amber-50 text-amber-700'

    case 'Cancelled':
      return 'bg-red-50 text-red-700'

    default:
      return 'bg-clinic-paper text-clinic-ink/60'
  }
}

export function TreatmentsPage() {
  const [patients, setPatients] = useState<Patient[]>(loadPatients)
  const [treatments, setTreatments] = useState<Treatment[]>(loadTreatments)

  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    const refreshPatients = () => {
      setPatients(loadPatients())
    }

    window.addEventListener('storage', refreshPatients)

    return () => {
      window.removeEventListener('storage', refreshPatients)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(
      TREATMENTS_STORAGE_KEY,
      JSON.stringify(treatments),
    )
  }, [treatments])

  const filteredTreatments = useMemo(() => {
    const query = search.trim().toLowerCase()

    if (!query) return treatments

    return treatments.filter((treatment) =>
      [
        treatment.patientName,
        treatment.treatmentName,
        treatment.tooth,
        treatment.diagnosis,
        treatment.status,
      ]
        .join(' ')
        .toLowerCase()
        .includes(query),
    )
  }, [search, treatments])

  const summary = useMemo(() => {
    return {
      total: treatments.length,
      active: treatments.filter(
        (treatment) => treatment.status === 'In progress',
      ).length,
      completed: treatments.filter(
        (treatment) => treatment.status === 'Completed',
      ).length,
      value: treatments.reduce(
        (total, treatment) => total + treatment.cost,
        0,
      ),
    }
  }, [treatments])

  function openNewTreatment() {
    setEditingId(null)
    setForm({
      ...emptyForm,
      startDate: new Date().toISOString().slice(0, 10),
    })
    setFormError('')
    setShowForm(true)
  }

  function openEditTreatment(treatment: Treatment) {
    setEditingId(treatment.id)

    setForm({
      patientId: treatment.patientId,
      treatmentName: treatment.treatmentName,
      tooth: treatment.tooth,
      diagnosis: treatment.diagnosis,
      status: treatment.status,
      plannedVisits: treatment.plannedVisits,
      completedVisits: treatment.completedVisits,
      cost: treatment.cost,
      startDate: treatment.startDate,
      nextVisit: treatment.nextVisit,
      notes: treatment.notes,
    })

    setFormError('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
    setFormError('')
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!form.patientId) {
      setFormError('Please select a patient.')
      return
    }

    if (!form.treatmentName.trim()) {
      setFormError('Please enter the treatment name.')
      return
    }

    if (!isTreatmentStatus(form.status)) {
      setFormError('Please select a valid treatment status.')
      return
    }

    if (
      !Number.isSafeInteger(form.plannedVisits) ||
      form.plannedVisits < 1 ||
      form.plannedVisits > MAX_PLANNED_VISITS
    ) {
      setFormError(
        `Planned visits must be a whole number from 1 to ${MAX_PLANNED_VISITS}.`,
      )
      return
    }

    if (
      !Number.isSafeInteger(form.completedVisits) ||
      form.completedVisits < 0
    ) {
      setFormError('Completed visits must be a whole number of 0 or more.')
      return
    }

    if (form.completedVisits > form.plannedVisits) {
      setFormError(
        'Completed visits cannot be greater than planned visits.',
      )
      return
    }

    if (
      !Number.isSafeInteger(form.cost) ||
      form.cost < 0 ||
      form.cost > MAX_TREATMENT_COST
    ) {
      setFormError(
        `Treatment cost must be a whole number between 0 and ₹${MAX_TREATMENT_COST.toLocaleString('en-IN')}.`,
      )
      return
    }

    if (!form.startDate || !isValidDateString(form.startDate)) {
      setFormError('Please select a valid treatment start date.')
      return
    }

    if (
      form.nextVisit &&
      (!isValidDateString(form.nextVisit) ||
        form.nextVisit < form.startDate)
    ) {
      setFormError(
        'Next visit must be a valid date on or after the treatment start date.',
      )
      return
    }

    const selectedPatient = patients.find(
      (patient) => patient.id === form.patientId,
    )

    if (!selectedPatient) {
      setFormError('The selected patient could not be found.')
      return
    }

    if (editingId) {
      setTreatments((current) =>
        current.map((treatment) =>
          treatment.id === editingId
            ? {
                ...treatment,
                patientId: selectedPatient.id,
                patientName: selectedPatient.name,
                treatmentName: form.treatmentName.trim(),
                tooth: form.tooth.trim(),
                diagnosis: form.diagnosis.trim(),
                status: form.status,
                plannedVisits: form.plannedVisits,
                completedVisits: form.completedVisits,
                cost: form.cost,
                startDate: form.startDate,
                nextVisit: form.nextVisit,
                notes: form.notes.trim(),
              }
            : treatment,
        ),
      )
    } else {
      const newTreatment: Treatment = {
        id: crypto.randomUUID(),
        patientId: selectedPatient.id,
        patientName: selectedPatient.name,
        treatmentName: form.treatmentName.trim(),
        tooth: form.tooth.trim(),
        diagnosis: form.diagnosis.trim(),
        status: form.status,
        plannedVisits: form.plannedVisits,
        completedVisits: form.completedVisits,
        cost: form.cost,
        startDate: form.startDate,
        nextVisit: form.nextVisit,
        notes: form.notes.trim(),
        createdAt: new Date().toISOString(),
      }

      setTreatments((current) => [newTreatment, ...current])
    }

    closeForm()
  }

  function deleteTreatment(id: string) {
    const confirmed = window.confirm(
      'Delete this treatment record? This action cannot be undone.',
    )

    if (!confirmed) return

    setTreatments((current) =>
      current.filter((treatment) => treatment.id !== id),
    )
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-clinic-teal">
            Clinical
          </p>

          <h1 className="mt-1 font-display text-4xl font-semibold text-clinic-ink">
            Treatments
          </h1>

          <p className="mt-2 text-sm text-clinic-ink/60">
            Manage treatment plans and clinical progress for your patients.
          </p>
        </div>

        <button
          type="button"
          onClick={openNewTreatment}
          className="rounded-xl bg-clinic-teal px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
        >
          + New Treatment
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Total treatments"
          value={String(summary.total)}
        />

        <SummaryCard
          label="In progress"
          value={String(summary.active)}
        />

        <SummaryCard
          label="Completed"
          value={String(summary.completed)}
        />

        <SummaryCard
          label="Treatment value"
          value={formatCurrency(summary.value)}
        />
      </div>

      <div className="rounded-2xl border border-clinic-line bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold">
              Treatment records
            </h2>

            <p className="mt-1 text-sm text-clinic-ink/50">
              Search and manage your patients' treatment plans.
            </p>
          </div>

          <div className="relative w-full md:w-80">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search treatments..."
              className="w-full rounded-xl border border-clinic-line bg-clinic-paper px-4 py-3 text-sm outline-none transition focus:border-clinic-teal"
            />
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          {filteredTreatments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-clinic-line bg-clinic-paper p-10 text-center">
              <h3 className="font-semibold text-clinic-ink">
                {search
                  ? 'No treatments found'
                  : 'No treatment records yet'}
              </h3>

              <p className="mt-2 text-sm text-clinic-ink/50">
                {search
                  ? 'Try a different search term.'
                  : 'Create a treatment record to start tracking clinical care.'}
              </p>

              {!search && (
                <button
                  type="button"
                  onClick={openNewTreatment}
                  className="mt-5 rounded-xl bg-clinic-teal px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Create first treatment
                </button>
              )}
            </div>
          ) : (
            <table className="w-full min-w-[900px] text-left">
              <thead>
                <tr className="border-b border-clinic-line text-xs uppercase tracking-wide text-clinic-ink/40">
                  <th className="px-4 py-3 font-semibold">Patient</th>
                  <th className="px-4 py-3 font-semibold">Treatment</th>
                  <th className="px-4 py-3 font-semibold">Tooth</th>
                  <th className="px-4 py-3 font-semibold">Progress</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Cost</th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredTreatments.map((treatment) => (
                  <tr
                    key={treatment.id}
                    className="border-b border-clinic-line/70 last:border-0"
                  >
                    <td className="px-4 py-4">
                      <div className="font-medium text-clinic-ink">
                        {treatment.patientName}
                      </div>

                      {treatment.diagnosis && (
                        <div className="mt-1 max-w-[220px] truncate text-xs text-clinic-ink/45">
                          {treatment.diagnosis}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-4 text-sm">
                      {treatment.treatmentName}
                    </td>

                    <td className="px-4 py-4 text-sm text-clinic-ink/60">
                      {treatment.tooth || '—'}
                    </td>

                    <td className="px-4 py-4">
                      <div className="text-sm font-medium">
                        {treatment.completedVisits} /{' '}
                        {treatment.plannedVisits} visits
                      </div>

                      <div className="mt-2 h-1.5 w-28 overflow-hidden rounded-full bg-clinic-line">
                        <div
                          className="h-full rounded-full bg-clinic-teal"
                          style={{
                            width: `${Math.min(
                              100,
                              (treatment.completedVisits /
                                treatment.plannedVisits) *
                                100,
                            )}%`,
                          }}
                        />
                      </div>
                    </td>

                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                          treatment.status,
                        )}`}
                      >
                        {treatment.status}
                      </span>
                    </td>

                    <td className="px-4 py-4 text-sm font-medium">
                      {formatCurrency(treatment.cost)}
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditTreatment(treatment)}
                          className="rounded-lg border border-clinic-line px-3 py-2 text-xs font-semibold hover:bg-clinic-paper"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteTreatment(treatment.id)}
                          className="rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-clinic-line px-6 py-5">
              <div>
                <h2 className="font-display text-2xl font-semibold">
                  {editingId ? 'Edit Treatment' : 'New Treatment'}
                </h2>

                <p className="mt-1 text-sm text-clinic-ink/50">
                  Record the clinical treatment plan and progress.
                </p>
              </div>

              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg px-3 py-2 text-xl text-clinic-ink/50 hover:bg-clinic-paper"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 p-6">
              {formError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Patient" required>
                  <select
                    value={form.patientId}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        patientId: event.target.value,
                      }))
                    }
                    className="input-field"
                  >
                    <option value="">Select patient</option>

                    {patients.map((patient) => (
                      <option key={patient.id} value={patient.id}>
                        {patient.name}
                      </option>
                    ))}
                  </select>

                  {patients.length === 0 && (
                    <p className="mt-2 text-xs text-amber-700">
                      Add a patient first before creating a treatment.
                    </p>
                  )}
                </Field>

                <Field label="Treatment name" required>
                  <input
                    type="text"
                    value={form.treatmentName}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        treatmentName: event.target.value,
                      }))
                    }
                    placeholder="e.g. Root Canal Treatment"
                    maxLength={200}
                    className="input-field"
                  />
                </Field>

                <Field label="Tooth / teeth">
                  <input
                    type="text"
                    value={form.tooth}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        tooth: event.target.value,
                      }))
                    }
                    placeholder="e.g. 16, 17"
                    maxLength={100}
                    className="input-field"
                  />
                </Field>

                <Field label="Diagnosis">
                  <input
                    type="text"
                    value={form.diagnosis}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        diagnosis: event.target.value,
                      }))
                    }
                    placeholder="Clinical diagnosis"
                    maxLength={500}
                    className="input-field"
                  />
                </Field>

                <Field label="Status">
                  <select
                    value={form.status}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        status: event.target.value as TreatmentStatus,
                      }))
                    }
                    className="input-field"
                  >
                    <option value="Planned">Planned</option>
                    <option value="In progress">In progress</option>
                    <option value="Completed">Completed</option>
                    <option value="On hold">On hold</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </Field>

                <Field label="Treatment cost">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={form.cost}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        cost: Number(event.target.value),
                      }))
                    }
                    className="input-field"
                  />
                </Field>

                <Field label="Planned visits">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    max="50"
                    value={form.plannedVisits}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        plannedVisits: Number(event.target.value),
                      }))
                    }
                    className="input-field"
                  />
                </Field>

                <Field label="Completed visits">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    max={form.plannedVisits}
                    value={form.completedVisits}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        completedVisits: Number(event.target.value),
                      }))
                    }
                    className="input-field"
                  />
                </Field>

                <Field label="Start date">
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        startDate: event.target.value,
                      }))
                    }
                    className="input-field"
                  />
                </Field>

                <Field label="Next visit">
                  <input
                    type="date"
                    value={form.nextVisit}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        nextVisit: event.target.value,
                      }))
                    }
                    className="input-field"
                  />
                </Field>
              </div>

              <Field label="Clinical notes">
                <textarea
                  rows={4}
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Add relevant clinical notes..."
                  maxLength={5000}
                  className="input-field resize-none"
                />
              </Field>

              <div className="flex justify-end gap-3 border-t border-clinic-line pt-5">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-xl border border-clinic-line px-5 py-3 text-sm font-semibold hover:bg-clinic-paper"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="rounded-xl bg-clinic-teal px-5 py-3 text-sm font-semibold text-white hover:opacity-90"
                >
                  {editingId ? 'Save Changes' : 'Create Treatment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}

function SummaryCard({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-clinic-line bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-clinic-ink/40">
        {label}
      </p>

      <p className="mt-3 font-display text-3xl font-semibold text-clinic-ink">
        {value}
      </p>
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-clinic-ink">
        {label}
        {required && (
          <span className="ml-1 text-clinic-clay">*</span>
        )}
      </span>

      {children}
    </label>
  )
}